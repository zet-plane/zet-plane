// apps/server/src/orchestrator/llm/agent-graph.ts
import { StateGraph, MessagesAnnotation, END } from '@langchain/langgraph'
import type { CompiledStateGraph } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { ChatAnthropic } from '@langchain/anthropic'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { AIMessage, BaseMessage } from '@langchain/core/messages'
import type { StructuredToolInterface } from '@langchain/core/tools'
import type { AgentInsight } from '../types'
import { AgentInsightSchema, MAX_ITERATIONS } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AgentGraph = CompiledStateGraph<any, any, any>

type BuildOptions = {
  tools: StructuredToolInterface[]
  systemPrompt: string
  model: string
}

export function buildAgentGraph(options: BuildOptions): AgentGraph {
  // ToolNode accepts StructuredToolInterface at runtime; the union in its type
  // definition is overly strict — cast to satisfy the compiler.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolNode = new ToolNode(options.tools as any[])
  const llm = new ChatAnthropic({ model: options.model }).bindTools(options.tools)

  function shouldContinue(state: typeof MessagesAnnotation.State): 'tools' | typeof END {
    const last = state.messages.at(-1) as AIMessage
    if (last?.tool_calls?.length) return 'tools'
    return END
  }

  async function callModel(state: typeof MessagesAnnotation.State) {
    const messages: BaseMessage[] = [new SystemMessage(options.systemPrompt), ...state.messages]
    const response = await llm.invoke(messages)
    return { messages: [response] }
  }

  return new StateGraph(MessagesAnnotation)
    .addNode('agent', callModel)
    .addNode('tools', toolNode)
    .addEdge('__start__', 'agent')
    .addConditionalEdges('agent', shouldContinue)
    .addEdge('tools', 'agent')
    .compile() as AgentGraph
}

export async function runAgentLoop(
  graph: AgentGraph,
  userMessage: string,
): Promise<AgentInsight> {
  const result = await graph.invoke(
    { messages: [new HumanMessage(userMessage)] },
    { recursionLimit: MAX_ITERATIONS },
  ) as { messages: BaseMessage[] }

  const lastMessage = result.messages.at(-1) as AIMessage
  const content = typeof lastMessage.content === 'string'
    ? lastMessage.content
    : JSON.stringify(lastMessage.content)

  try {
    const result = AgentInsightSchema.safeParse(JSON.parse(content))
    if (result.success) return result.data
  } catch {
    // LLM returned free-form text — wrap it
  }

  return {
    summary: content,
    signalType: 'progress',
    confidence: 0.7,
    evidence: [],
  }
}
