import { Injectable } from '@nestjs/common'
import { OrchestratorTaskType } from '@generated/client'
import type { OrchestratorTask, OrchestratorContext, TaskHistorySnapshot } from '../types'
import { GraphContextReader } from './graph-context.reader'
import { KnowledgeContextReader } from './knowledge-context.reader'
import { OrchestratorTaskRepository } from '../repository/orchestrator-task.repository'
import { SkillRegistry } from '../skill/skill-registry'

@Injectable()
export class ContextBuilderService {
  constructor(
    private readonly graphReader: GraphContextReader,
    private readonly knowledgeReader: KnowledgeContextReader,
    private readonly taskRepo: OrchestratorTaskRepository,
    private readonly skillRegistry: SkillRegistry,
  ) {}

  async build(task: OrchestratorTask): Promise<OrchestratorContext> {
    const projectId = task.projectId
    const isEmbedding = task.type === OrchestratorTaskType.embedding

    const [candidateNodes, recentHistory] = await Promise.all([
      isEmbedding ? Promise.resolve([]) : this.graphReader.getCandidateNodes(projectId),
      this.taskRepo.findRecentByProject(projectId, 10),
    ])

    const nodeIds = candidateNodes.map((n) => n.id)
    const relatedEntries = isEmbedding
      ? []
      : await this.knowledgeReader.getRelatedEntries(projectId, nodeIds)

    const taskHistory: TaskHistorySnapshot[] = recentHistory.map((t) => ({
      id: t.id,
      type: t.type,
      status: t.status,
      sourceType: t.sourceType,
      sourceId: t.sourceId,
      modelResult: t.modelResult,
      createdAt: t.createdAt,
    }))

    return {
      project: { id: projectId, name: projectId, status: 'active' },
      trigger: {
        sourceType: task.sourceType,
        sourceId: task.sourceId,
        raw: task.input,
      },
      candidateNodes,
      relatedEntries,
      recentTaskHistory: taskHistory,
      availableSkills: this.skillRegistry.listSkills(),
      constraints: {
        mayWriteGraph: true,
        mayWriteKnowledge: true,
      },
    }
  }
}
