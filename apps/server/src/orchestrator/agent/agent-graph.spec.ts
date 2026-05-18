// apps/server/src/orchestrator/agent/agent-graph.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { AIMessage, ToolMessage } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

const mockLlm = {
  bindTools: vi.fn().mockReturnValue({ invoke: vi.fn() }),
} as unknown as BaseChatModel

describe('buildAgentGraph', () => {
  it('compiles without error given empty tool list', async () => {
    const { buildAgentGraph } = await import('./agent-graph')
    const graph = buildAgentGraph({
      tools: [],
      systemPrompt: 'You are a test agent.',
      llm: mockLlm,
    })
    expect(graph).toBeDefined()
    expect(typeof graph.invoke).toBe('function')
  })

  it('continues back to the agent after a tool returns empty content', async () => {
    const { buildAgentGraph } = await import('./agent-graph')
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(
        new AIMessage({
          content: '',
          tool_calls: [{ id: 'call-1', name: 'empty_tool', args: {}, type: 'tool_call' }],
        }),
      )
      .mockResolvedValueOnce(
        new AIMessage({
          content: JSON.stringify({
            summary: 'tool finished, model followed up',
            signalType: 'progress',
            confidence: 0.8,
            evidence: [],
          }),
        }),
      )
    const llm = {
      bindTools: vi.fn().mockReturnValue({ invoke }),
    } as unknown as BaseChatModel
    const emptyTool = tool(async () => '', {
      name: 'empty_tool',
      description: 'Returns an empty string',
      schema: z.object({}),
    })

    const graph = buildAgentGraph({
      tools: [emptyTool],
      systemPrompt: 'You are a test agent.',
      llm,
    })

    const result = await graph.invoke({ messages: [] }) as { messages: unknown[] }
    const messages = result.messages

    expect(invoke).toHaveBeenCalledTimes(2)
    expect(messages).toHaveLength(3)
    expect(messages[1]).toBeInstanceOf(ToolMessage)
    expect((messages[1] as ToolMessage).content).toBe('')
    expect(messages[2]).toBeInstanceOf(AIMessage)
    expect(messages[2]).toMatchObject({
      content: JSON.stringify({
        summary: 'tool finished, model followed up',
        signalType: 'progress',
        confidence: 0.8,
        evidence: [],
      }),
    })
  })
})

describe('tool signal parsing', () => {
  it('returns SkipSignal when a tool message contains a terminal skip signal', async () => {
    const { extractSignalFromMessages, isTerminalSignalMessage, parseToolSignalMessage } = await import('./agent-graph')
    const { SkipSignal } = await import('../tools/write/skip.tool')
    const messages = [
      new ToolMessage({
        content: JSON.stringify({
          __zplane_signal: { kind: 'terminal', type: 'skip', payload: { reason: 'duplicate event' } },
        }),
        tool_call_id: 'call-1',
      }),
    ]
    expect(isTerminalSignalMessage(messages[0])).toBe(true)
    expect(parseToolSignalMessage(messages[0])).toEqual({
      kind: 'terminal',
      type: 'skip',
      payload: { reason: 'duplicate event' },
    })
    const signal = extractSignalFromMessages(messages)
    expect(signal).toBeInstanceOf(SkipSignal)
    expect((signal as InstanceType<typeof SkipSignal>).reason).toBe('duplicate event')
  })

  it('returns WaitingForApprovalSignal when a tool message contains a terminal notify_human signal', async () => {
    const { extractSignalFromMessages, isTerminalSignalMessage } = await import('./agent-graph')
    const { WaitingForApprovalSignal } = await import('../tools/write/notify-human.tool')
    const messages = [
      new ToolMessage({
        content: JSON.stringify({
          __zplane_signal: { kind: 'terminal', type: 'notify_human', payload: { reason: 'needs review', context: 'ctx' } },
        }),
        tool_call_id: 'call-1',
      }),
    ]
    expect(isTerminalSignalMessage(messages[0])).toBe(true)
    const signal = extractSignalFromMessages(messages)
    expect(signal).toBeInstanceOf(WaitingForApprovalSignal)
    expect((signal as InstanceType<typeof WaitingForApprovalSignal>).reason).toBe('needs review')
    expect((signal as InstanceType<typeof WaitingForApprovalSignal>).context).toBe('ctx')
  })

  it('returns null when no signal tool message is present', async () => {
    const { extractSignalFromMessages, isTerminalSignalMessage, parseToolSignalMessage } = await import('./agent-graph')
    const messages = [
      new ToolMessage({
        content: JSON.stringify({ entryId: 'e1', action: 'created' }),
        tool_call_id: 'call-1',
      }),
    ]
    expect(isTerminalSignalMessage(messages[0])).toBe(false)
    expect(parseToolSignalMessage(messages[0])).toBeNull()
    expect(extractSignalFromMessages(messages)).toBeNull()
  })

  it('picks the last terminal signal when multiple tool messages exist', async () => {
    const { extractSignalFromMessages } = await import('./agent-graph')
    const { SkipSignal } = await import('../tools/write/skip.tool')
    const messages = [
      new ToolMessage({
        content: JSON.stringify({ entryId: 'e1', action: 'created' }),
        tool_call_id: 'call-1',
      }),
      new ToolMessage({
        content: JSON.stringify({
          __zplane_signal: { kind: 'terminal', type: 'skip', payload: { reason: 'noise' } },
        }),
        tool_call_id: 'call-2',
      }),
    ]
    const signal = extractSignalFromMessages(messages)
    expect(signal).toBeInstanceOf(SkipSignal)
  })

  it('extracts conclude insight from a terminal conclude signal', async () => {
    const { extractConcludeInsight, isTerminalSignalMessage } = await import('./agent-graph')
    const messages = [
      new ToolMessage({
        content: JSON.stringify({
          __zplane_signal: {
            kind: 'terminal',
            type: 'conclude',
            payload: {
              summary: 'done',
              signalType: 'decision',
              confidence: 0.9,
              evidence: [],
            },
          },
        }),
        tool_call_id: 'call-1',
      }),
    ]
    expect(isTerminalSignalMessage(messages[0])).toBe(true)
    expect(extractConcludeInsight(messages)).toEqual({
      summary: 'done',
      signalType: 'decision',
      confidence: 0.9,
      evidence: [],
    })
  })
})

describe('trace flush gating', () => {
  it('enables trace flushing for any supported tracing env var', async () => {
    const { isTraceFlushEnabled } = await import('./agent-graph')

    expect(isTraceFlushEnabled({ LANGSMITH_TRACING: 'true' } as NodeJS.ProcessEnv)).toBe(true)
    expect(isTraceFlushEnabled({ LANGCHAIN_TRACING: 'true' } as NodeJS.ProcessEnv)).toBe(true)
    expect(isTraceFlushEnabled({ LANGSMITH_TRACING_V2: 'true' } as NodeJS.ProcessEnv)).toBe(true)
    expect(isTraceFlushEnabled({ LANGCHAIN_TRACING_V2: 'true' } as NodeJS.ProcessEnv)).toBe(true)
    expect(isTraceFlushEnabled({ LANGSMITH_TRACING: 'false' } as NodeJS.ProcessEnv)).toBe(false)
    expect(isTraceFlushEnabled({} as NodeJS.ProcessEnv)).toBe(false)
  })
})
