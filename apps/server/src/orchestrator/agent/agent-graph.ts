// apps/server/src/orchestrator/agent/agent-graph.ts
import { StateGraph, MessagesAnnotation, END } from '@langchain/langgraph'
import type { CompiledStateGraph } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import type { AIMessage, BaseMessage } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { StructuredToolInterface } from '@langchain/core/tools'
import type { RunnableConfig } from '@langchain/core/runnables'
import { awaitAllCallbacks } from '@langchain/core/callbacks/promises'
import { Client as LangSmithClient } from 'langsmith'
import type { AgentInsight } from '../types'
import { AgentInsightSchema, MAX_ITERATIONS } from '../types'
import { SkipSignal, SKIP_SIGNAL_KEY, SKIP_SIGNAL_VALUE } from '../tools/write/skip.tool'
import { WaitingForApprovalSignal, NOTIFY_HUMAN_SIGNAL_VALUE } from '../tools/write/notify-human.tool'
import { CONCLUDE_SIGNAL_VALUE } from '../tools/write/conclude.tool'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AgentGraph = CompiledStateGraph<any, any, any>

type BuildOptions = {
  tools: StructuredToolInterface[]
  systemPrompt: string
  llm: BaseChatModel
}

type ToolSignal =
  | { kind: 'terminal'; type: typeof SKIP_SIGNAL_VALUE; payload: { reason: string } }
  | { kind: 'terminal'; type: typeof NOTIFY_HUMAN_SIGNAL_VALUE; payload: { reason: string; context?: string } }
  | { kind: 'terminal'; type: typeof CONCLUDE_SIGNAL_VALUE; payload: { summary: string; signalType: string; confidence: number; evidence?: unknown[] } }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseToolSignalMessage(message: BaseMessage): ToolSignal | null {
  if (!(message instanceof ToolMessage)) return null
  const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
  try {
    const parsed = JSON.parse(content)
    if (!isRecord(parsed)) return null
    const signal = parsed[SKIP_SIGNAL_KEY]
    if (!isRecord(signal)) return null
    if (signal.kind !== 'terminal') return null
    if (typeof signal.type !== 'string') return null
    const payload = isRecord(signal.payload) ? signal.payload : {}
    if (
      signal.type !== SKIP_SIGNAL_VALUE &&
      signal.type !== NOTIFY_HUMAN_SIGNAL_VALUE &&
      signal.type !== CONCLUDE_SIGNAL_VALUE
    ) return null
    return {
      kind: 'terminal',
      type: signal.type,
      payload,
    } as ToolSignal
  } catch {
    return null
  }
}

export function isTerminalSignalMessage(message: BaseMessage): boolean {
  const signal = parseToolSignalMessage(message)
  return signal?.kind === 'terminal'
}

export function buildAgentGraph(options: BuildOptions): AgentGraph {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolNode = new ToolNode(options.tools as any[])
  if (!options.llm.bindTools) throw new Error('LLM provider does not support tool binding')
  const llm = options.llm.bindTools(options.tools)

  function shouldContinue(state: typeof MessagesAnnotation.State): 'tools' | typeof END {
    const last = state.messages.at(-1) as AIMessage
    if (last?.tool_calls?.length) return 'tools'
    return END
  }

  function shouldContinueAfterTools(state: typeof MessagesAnnotation.State): 'agent' | typeof END {
    const last = state.messages.at(-1)
    if (last && isTerminalSignalMessage(last)) return END
    return 'agent'
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
    .addConditionalEdges('tools', shouldContinueAfterTools)
    .compile() as AgentGraph
}

export function extractSignalFromMessages(
  messages: BaseMessage[],
): SkipSignal | WaitingForApprovalSignal | null {
  for (const msg of [...messages].reverse()) {
    const signal = parseToolSignalMessage(msg)
    if (!signal || signal.kind !== 'terminal') continue
    if (signal.type === SKIP_SIGNAL_VALUE) return new SkipSignal(String(signal.payload.reason ?? ''))
    if (signal.type === NOTIFY_HUMAN_SIGNAL_VALUE) return new WaitingForApprovalSignal(String(signal.payload.reason ?? ''))
  }
  return null
}

export function extractConcludeInsight(messages: BaseMessage[]): AgentInsight | null {
  for (const msg of [...messages].reverse()) {
    const signal = parseToolSignalMessage(msg)
    if (!signal || signal.kind !== 'terminal' || signal.type !== CONCLUDE_SIGNAL_VALUE) continue
    const result = AgentInsightSchema.safeParse({
      summary: signal.payload.summary,
      signalType: signal.payload.signalType,
      confidence: signal.payload.confidence,
      evidence: signal.payload.evidence ?? [],
    })
    if (result.success) return result.data
  }
  return null
}

// Flush both async trace layers so LangSmith marks the run as complete:
// 1. @langchain/core's p-queue of pending callback invocations (onChainEnd etc.)
// 2. langsmith Client's HTTP batch queue (the actual API requests)
// Timeout guard: if LangSmith is unreachable, don't block the agent loop.
async function flushTraces(): Promise<void> {
  if (process.env.LANGSMITH_TRACING !== 'true') return
  const flush = async () => {
    await awaitAllCallbacks()
    await new LangSmithClient().awaitPendingTraceBatches()
  }
  await Promise.race([
    flush(),
    new Promise<void>(resolve => setTimeout(resolve, 5_000)),
  ])
}

export function interpretMessages(messages: BaseMessage[]): AgentInsight {
  const conclude = extractConcludeInsight(messages)
  if (conclude) return conclude

  const signal = extractSignalFromMessages(messages)
  if (signal) throw signal

  const lastMessage = messages.at(-1) as AIMessage
  const content = typeof lastMessage.content === 'string'
    ? lastMessage.content
    : JSON.stringify(lastMessage.content)

  try {
    const parsed = AgentInsightSchema.safeParse(JSON.parse(content))
    if (parsed.success) return parsed.data
  } catch {
    // LLM returned free-form text — wrap it
  }

  return { summary: content, signalType: 'progress', confidence: 0.7, evidence: [] }
}

export async function runAgentLoop(
  graph: AgentGraph,
  userMessage: string,
  config?: RunnableConfig,
): Promise<AgentInsight> {
  const { messages } = await graph.invoke(
    { messages: [new HumanMessage(userMessage)] },
    { recursionLimit: MAX_ITERATIONS, ...config },
  ) as { messages: BaseMessage[] }

  await flushTraces()
  return interpretMessages(messages)
}
