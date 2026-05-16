// apps/server/src/orchestrator/runtime/task-runner.service.ts
import { Injectable, NotFoundException } from '@nestjs/common'
import { OrchestratorTaskType } from '@generated/client'
import type { OrchestratorTask, OrchestratorContext, AgentInsight } from '../types'
import type { RunnableConfig } from '@langchain/core/runnables'
import { ContextBuilderService } from '../context/context-builder.service'
import { buildAgentGraph, runAgentLoop } from '../agent/agent-graph'
import { LlmProviderRegistry } from '../llm/llm-provider.registry'
import { PromptBuilderService } from '../prompt/prompt-builder.service'
import { GraphContextReader } from '../context/graph-context.reader'
import { GraphRepository } from '../../graph/repository/graph.repository'
import { NodeService } from '../../graph/node/node.service'
import { EdgeService } from '../../graph/edge/edge.service'
import { EntryService } from '../../knowledge/entry/entry.service'
import { RevisionService } from '../../knowledge/revision/revision.service'
import { SearchService } from '../../knowledge/search/search.service'
import { OrchestratorTaskRepository } from '../repository/orchestrator-task.repository'
import { OrchestratorTaskPublisher } from '../ingress/orchestrator-task.publisher'
// read tools
import { getNodeTool } from '../tools/read/get-node.tool'
import { getSubgraphTool } from '../tools/read/get-subgraph.tool'
import { searchNodesTool } from '../tools/read/search-nodes.tool'
import { searchKnowledgeTool } from '../tools/read/search-knowledge.tool'
import { getTaskHistoryTool } from '../tools/read/get-task-history.tool'
// write tools
import { createNodeTool } from '../tools/write/create-node.tool'
import { createEdgeTool } from '../tools/write/create-edge.tool'
import { moveNodeTool } from '../tools/write/move-node.tool'
import { updateNodeStatusTool } from '../tools/write/update-node-status.tool'
import { createKnowledgeEntryTool } from '../tools/write/create-knowledge-entry.tool'
import { reviseKnowledgeEntryTool } from '../tools/write/revise-knowledge-entry.tool'
import { writeEmbeddingTool } from '../tools/write/write-embedding.tool'
import { skipTool } from '../tools/write/skip.tool'
import { notifyHumanTool } from '../tools/write/notify-human.tool'
import { concludeTool } from '../tools/write/conclude.tool'
import { toStagingTool } from '../tools/write/to-staging.tool'

@Injectable()
export class TaskRunnerService {
  constructor(
    private readonly contextBuilder: ContextBuilderService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly graphReader: GraphContextReader,
    private readonly graphRepo: GraphRepository,
    private readonly nodeService: NodeService,
    private readonly edgeService: EdgeService,
    private readonly entryService: EntryService,
    private readonly revisionService: RevisionService,
    private readonly searchService: SearchService,
    private readonly taskRepo: OrchestratorTaskRepository,
    private readonly publisher: OrchestratorTaskPublisher,
    private readonly llmRegistry: LlmProviderRegistry,
  ) {}

  async run(task: OrchestratorTask): Promise<AgentInsight> {
    if (task.type === OrchestratorTaskType.embedding) {
      return this.runEmbedding(task)
    }
    const ctx = await this.contextBuilder.build(task)
    return this.runAgenticLoop(task, ctx)
  }

  private async runEmbedding(task: OrchestratorTask): Promise<AgentInsight> {
    const input = task.input as { entryId: string }
    const entry = await this.entryService.getEntry(input.entryId)
    const text = typeof entry.body === 'object' && entry.body !== null
      ? JSON.stringify(entry.body)
      : String(entry.body)

    const vector = await this.llmRegistry.embed(text)
    await this.searchService.storeEmbedding(input.entryId, vector)

    return {
      summary: `Embedding indexed for entry ${input.entryId}`,
      signalType: 'progress',
      confidence: 1,
      evidence: [{ sourceType: 'knowledge_entry', sourceId: input.entryId, note: 'embedding stored' }],
    }
  }

  private async runAgenticLoop(
    task: OrchestratorTask,
    ctx: OrchestratorContext,
  ): Promise<AgentInsight> {
    const llm = this.llmRegistry.getChatModelForTask(task.type)
    const { systemPrompt, userMessage } = this.promptBuilder.build(task, ctx)
    const tools = await this.buildTools(task)
    const graph = buildAgentGraph({ tools, systemPrompt, llm })
    return runAgentLoop(graph, userMessage, this.getTraceConfig(task))
  }

  private async buildTools(task: OrchestratorTask) {
    const root = await this.graphRepo.findProjectRoot(task.projectId)
    if (!root) throw new NotFoundException(`Project root not found for projectId=${task.projectId}`)

    return [
      getNodeTool(this.graphRepo),
      getSubgraphTool(this.graphReader),
      searchNodesTool(this.graphReader),
      searchKnowledgeTool(this.searchService, (text) => this.llmRegistry.embed(text)),
      getTaskHistoryTool(this.taskRepo),
      createNodeTool({ nodeService: this.nodeService, projectId: task.projectId }),
      createEdgeTool({ edgeService: this.edgeService, projectId: task.projectId }),
      moveNodeTool({ edgeService: this.edgeService, projectId: task.projectId }),
      updateNodeStatusTool({ nodeService: this.nodeService }),
      createKnowledgeEntryTool({ entryService: this.entryService, projectId: task.projectId }),
      reviseKnowledgeEntryTool({ revisionService: this.revisionService }),
      writeEmbeddingTool({ searchService: this.searchService }),
      skipTool(),
      notifyHumanTool(),
      concludeTool(),
      toStagingTool({ entryService: this.entryService, projectId: task.projectId, stagingNodeId: root.id }),
    ]
  }

  private getTraceConfig(task: OrchestratorTask): RunnableConfig | undefined {
    if (!task.input || typeof task.input !== 'object' || Array.isArray(task.input)) return undefined

    const trace = (task.input as Record<string, unknown>).__trace
    if (!trace || typeof trace !== 'object' || Array.isArray(trace)) return undefined

    const runName = typeof trace.runName === 'string' ? trace.runName : undefined
    const tags = Array.isArray(trace.tags) ? trace.tags.filter((tag): tag is string => typeof tag === 'string') : undefined
    const metadata = trace.metadata && typeof trace.metadata === 'object' && !Array.isArray(trace.metadata)
      ? trace.metadata as Record<string, unknown>
      : undefined

    if (!runName && !tags?.length && !metadata) return undefined

    return {
      ...(runName && { runName }),
      ...(tags?.length && { tags }),
      ...(metadata && { metadata }),
    }
  }

}
