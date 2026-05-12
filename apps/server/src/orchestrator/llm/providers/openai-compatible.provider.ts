import { ChatOpenAI } from '@langchain/openai'
import { OpenAI } from 'openai'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { IChatProvider, IEmbeddingProvider } from '../interfaces'
import type { LlmModelConfig } from '../../../config/app.config'

export class OpenAiCompatibleProvider implements IChatProvider, IEmbeddingProvider {
  private readonly openaiClient: OpenAI

  constructor(private readonly config: LlmModelConfig) {
    this.openaiClient = new OpenAI({
      apiKey: config.api_key || undefined,
      baseURL: config.base_url,
    })
  }

  createChatModel(): BaseChatModel {
    return new ChatOpenAI({
      model: this.config.model,
      apiKey: this.config.api_key || undefined,
      ...(this.config.base_url && { configuration: { baseURL: this.config.base_url } }),
      ...(this.config.temperature !== undefined && { temperature: this.config.temperature }),
      ...(this.config.max_tokens !== undefined && { maxTokens: this.config.max_tokens }),
    })
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.openaiClient.embeddings.create({
      model: this.config.model,
      input: text,
    })
    return response.data[0].embedding
  }
}
