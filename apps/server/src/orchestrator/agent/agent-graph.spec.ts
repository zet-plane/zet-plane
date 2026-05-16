// apps/server/src/orchestrator/agent/agent-graph.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { ToolMessage } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'

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
    expect((signal as SkipSignal).reason).toBe('duplicate event')
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
