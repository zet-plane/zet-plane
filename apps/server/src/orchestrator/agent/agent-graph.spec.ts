// apps/server/src/orchestrator/agent/agent-graph.spec.ts
import { describe, it, expect, vi } from 'vitest'
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
