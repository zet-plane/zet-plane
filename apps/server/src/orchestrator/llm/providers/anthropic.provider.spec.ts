import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockChatAnthropic } = vi.hoisted(() => {
  return {
    mockChatAnthropic: vi.fn(),
  }
})

vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: mockChatAnthropic,
}))

import { AnthropicProvider } from './anthropic.provider'

describe('AnthropicProvider', () => {
  beforeEach(() => {
    mockChatAnthropic.mockClear()
  })

  it('passes model and apiKey to ChatAnthropic', () => {
    const provider = new AnthropicProvider({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      api_key: 'sk-ant-123',
    })
    provider.createChatModel()
    expect(mockChatAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6', apiKey: 'sk-ant-123' }),
    )
  })

  it('passes temperature and maxTokens when set', () => {
    const provider = new AnthropicProvider({
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      api_key: '',
      temperature: 0.5,
      max_tokens: 512,
    })
    provider.createChatModel()
    expect(mockChatAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.5, maxTokens: 512 }),
    )
  })

  it('omits apiKey when api_key is empty string', () => {
    const provider = new AnthropicProvider({
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      api_key: '',
    })
    provider.createChatModel()
    expect(mockChatAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: undefined }),
    )
  })
})
