// apps/server/src/orchestrator/llm/agent-graph.spec.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@langchain/anthropic', () => {
  class ChatAnthropic {
    bindTools() { return this }
    invoke = vi.fn()
  }
  return { ChatAnthropic }
})

import { buildAgentGraph } from './agent-graph'

describe('buildAgentGraph', () => {
  it('compiles without error given empty tool list', () => {
    const graph = buildAgentGraph({
      tools: [],
      systemPrompt: 'You are a test agent.',
      model: 'claude-haiku-4-5-20251001',
    })
    expect(graph).toBeDefined()
    expect(typeof graph.invoke).toBe('function')
  })
})
