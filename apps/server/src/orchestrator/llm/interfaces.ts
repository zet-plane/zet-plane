import type { BaseChatModel } from '@langchain/core/language_models/chat_models'

export interface IChatProvider {
  createChatModel(): BaseChatModel
}

export interface IEmbeddingProvider {
  embed(text: string): Promise<number[]>
}
