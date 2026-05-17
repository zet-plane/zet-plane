import { describe, it, expect, vi, beforeEach } from 'vitest'

type MockAnthropicProvider = {
  _cfg?: unknown
  createChatModel: ReturnType<typeof vi.fn>
}

type MockOpenAiCompatibleProvider = MockAnthropicProvider & {
  embed: ReturnType<typeof vi.fn>
}

vi.mock('./providers/anthropic.provider', () => ({
  AnthropicProvider: vi.fn().mockImplementation(function (this: MockAnthropicProvider, cfg: unknown) {
    this._cfg = cfg
    this.createChatModel = vi.fn().mockReturnValue({ _type: 'anthropic-model' })
  }),
}))
vi.mock('./providers/openai-compatible.provider', () => ({
  OpenAiCompatibleProvider: vi.fn().mockImplementation(function (this: MockOpenAiCompatibleProvider, cfg: unknown) {
    this._cfg = cfg
    this.createChatModel = vi.fn().mockReturnValue({ _type: 'openai-model' })
    this.embed = vi.fn().mockResolvedValue([0.1, 0.2])
  }),
}))

import { LlmProviderRegistry } from './llm-provider.registry'
import { AnthropicProvider } from './providers/anthropic.provider'
import { OpenAiCompatibleProvider } from './providers/openai-compatible.provider'

const makeConfig = (overrides = {}) => ({
  orchestrator: {
    llm: {
      taskModels: {
        default: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', api_key: '' },
        checkpoint: { provider: 'anthropic', model: 'claude-sonnet-4-6', api_key: '' },
      },
      embeddingModel: { provider: 'openai', model: 'text-embedding-3-small', api_key: '' },
      ...overrides,
    },
  },
} as any)

describe('LlmProviderRegistry', () => {
  beforeEach(() => {
    vi.mocked(AnthropicProvider).mockClear()
    vi.mocked(OpenAiCompatibleProvider).mockClear()
  })

  it('creates AnthropicProvider for each anthropic task model entry', () => {
    new LlmProviderRegistry(makeConfig())
    expect(AnthropicProvider).toHaveBeenCalledTimes(2) // default + checkpoint
  })

  it('creates OpenAiCompatibleProvider for the embedding model', () => {
    new LlmProviderRegistry(makeConfig())
    expect(OpenAiCompatibleProvider).toHaveBeenCalledTimes(1)
  })

  it('getChatModelForTask returns model for the matching task type', () => {
    const registry = new LlmProviderRegistry(makeConfig())
    const model = registry.getChatModelForTask('checkpoint')
    expect(model).toEqual({ _type: 'anthropic-model' })
  })

  it('getChatModelForTask falls back to default when task type not configured', () => {
    const registry = new LlmProviderRegistry(makeConfig())
    const model = registry.getChatModelForTask('graph_growth')
    expect(model).toEqual({ _type: 'anthropic-model' })
  })

  it('throws when no default task model is configured', () => {
    const cfg = makeConfig()
    delete cfg.orchestrator.llm.taskModels.default
    expect(() => new LlmProviderRegistry(cfg)).toThrow('default')
  })

  it('embed delegates to the embedding provider', async () => {
    const registry = new LlmProviderRegistry(makeConfig())
    const result = await registry.embed('hello')
    expect(result).toEqual([0.1, 0.2])
  })

  it('throws when embedding provider is not openai-compatible', () => {
    const cfg = makeConfig()
    cfg.orchestrator.llm.embeddingModel = { provider: 'anthropic', model: 'some-model', api_key: '' }
    expect(() => new LlmProviderRegistry(cfg)).toThrow(/does not support embeddings/)
  })
})
