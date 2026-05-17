import { ChatAnthropic } from '@langchain/anthropic'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { IChatProvider } from '../interfaces'
import type { LlmModelConfig } from '../../../config/app.config'

export class AnthropicProvider implements IChatProvider {
  constructor(private readonly config: LlmModelConfig) {}

  createChatModel(): BaseChatModel {
    return new ChatAnthropic({
      model: this.config.model,
      apiKey: this.config.api_key || undefined,
      ...(this.config.temperature !== undefined && { temperature: this.config.temperature }),
      ...(this.config.max_tokens !== undefined && { maxTokens: this.config.max_tokens }),
    })
  }
}
