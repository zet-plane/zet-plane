import { describe, it, expect, vi } from 'vitest'

const { mockChatOpenAI, mockEmbeddingsCreate } = vi.hoisted(() => ({
  mockChatOpenAI: vi.fn(),
  mockEmbeddingsCreate: vi.fn().mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
}))

vi.mock('@langchain/openai', () => ({ ChatOpenAI: mockChatOpenAI }))
vi.mock('openai', () => {
  class MockOpenAI {
    embeddings = { create: mockEmbeddingsCreate }
  }
  return { OpenAI: MockOpenAI }
})

import { OpenAiCompatibleProvider } from './openai-compatible.provider'

describe('OpenAiCompatibleProvider', () => {
  describe('createChatModel', () => {
    it('passes model and apiKey to ChatOpenAI', () => {
      const provider = new OpenAiCompatibleProvider({
        provider: 'openai',
        model: 'gpt-4o',
        api_key: 'sk-oai-123',
      })
      provider.createChatModel()
      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4o', apiKey: 'sk-oai-123' }),
      )
    })

    it('passes configuration.baseURL when base_url is set', () => {
      const provider = new OpenAiCompatibleProvider({
        provider: 'siliconflow',
        model: 'Pro/zai-org/GLM-5.1',
        api_key: 'sk-sf-123',
        base_url: 'https://api.siliconflow.cn/v1',
      })
      provider.createChatModel()
      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: { baseURL: 'https://api.siliconflow.cn/v1' },
        }),
      )
    })

    it('omits configuration when base_url is absent', () => {
      const provider = new OpenAiCompatibleProvider({
        provider: 'openai',
        model: 'gpt-4o-mini',
        api_key: '',
      })
      provider.createChatModel()
      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.not.objectContaining({ configuration: expect.anything() }),
      )
    })

    it('passes temperature and maxTokens when set', () => {
      const provider = new OpenAiCompatibleProvider({
        provider: 'openai',
        model: 'gpt-4o',
        api_key: '',
        temperature: 0.7,
        max_tokens: 1024,
      })
      provider.createChatModel()
      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.7, maxTokens: 1024 }),
      )
    })

    it('passes timeout when request_timeout_ms is set', () => {
      const provider = new OpenAiCompatibleProvider({
        provider: 'openai',
        model: 'gpt-4o',
        api_key: '',
        request_timeout_ms: 30_000,
      })
      provider.createChatModel()
      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: 30_000 }),
      )
    })

    it('defaults timeout to 60s when request_timeout_ms is absent', () => {
      const provider = new OpenAiCompatibleProvider({
        provider: 'openai',
        model: 'gpt-4o',
        api_key: '',
      })
      provider.createChatModel()
      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: 60_000 }),
      )
    })

    it('disables DeepSeek thinking mode for chat models used in tool loops', () => {
      const provider = new OpenAiCompatibleProvider({
        provider: 'deepseek',
        model: 'deepseek-v4-pro',
        api_key: 'sk-ds-123',
        base_url: 'https://api.deepseek.com/v1',
      })
      provider.createChatModel()
      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          modelKwargs: { thinking: { type: 'disabled' } },
        }),
      )
    })
  })

  describe('embed', () => {
    it('calls openai embeddings.create with the configured model and input text', async () => {
      const provider = new OpenAiCompatibleProvider({
        provider: 'openai',
        model: 'text-embedding-3-small',
        api_key: 'sk-oai-123',
      })
      const result = await provider.embed('hello world')
      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'hello world',
      })
      expect(result).toEqual([0.1, 0.2, 0.3])
    })
  })
})
