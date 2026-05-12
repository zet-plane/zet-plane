import { Injectable } from '@nestjs/common'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AppConfig } from '../../config/app-config'
import type { LlmModelConfig, ProviderType } from '../../config/app.config'
import type { IChatProvider, IEmbeddingProvider } from './interfaces'
import { AnthropicProvider } from './providers/anthropic.provider'
import { OpenAiCompatibleProvider } from './providers/openai-compatible.provider'

const PROVIDER_SDK_MAP = {
  anthropic: 'anthropic',
  openai: 'openai-compatible',
  siliconflow: 'openai-compatible',
} as const satisfies Record<ProviderType, 'anthropic' | 'openai-compatible'>

@Injectable()
export class LlmProviderRegistry {
  private readonly chatProviders = new Map<string, IChatProvider>()
  private embeddingProvider: IEmbeddingProvider | null = null

  constructor(private readonly config: AppConfig) {
    this.initProviders()
  }

  private initProviders(): void {
    const { taskModels, embeddingModel } = this.config.orchestrator.llm

    if (!('default' in taskModels)) {
      throw new Error('orchestrator.llm.taskModels must contain a "default" entry')
    }

    for (const [taskType, cfg] of Object.entries(taskModels)) {
      this.chatProviders.set(taskType, this.buildChatProvider(cfg))
    }

    this.embeddingProvider = this.buildEmbeddingProvider(embeddingModel)
  }

  private buildChatProvider(cfg: LlmModelConfig): IChatProvider {
    const sdkType = PROVIDER_SDK_MAP[cfg.provider]
    if (sdkType === 'anthropic') return new AnthropicProvider(cfg)
    return new OpenAiCompatibleProvider(cfg)
  }

  private buildEmbeddingProvider(cfg: LlmModelConfig): IEmbeddingProvider {
    const sdkType = PROVIDER_SDK_MAP[cfg.provider]
    if (sdkType === 'openai-compatible') return new OpenAiCompatibleProvider(cfg)
    throw new Error(`Provider "${cfg.provider}" does not support embeddings`)
  }

  getChatModelForTask(taskType: string): BaseChatModel {
    const provider = this.chatProviders.get(taskType) ?? this.chatProviders.get('default')
    if (!provider) throw new Error('No default chat provider configured')
    return provider.createChatModel()
  }

  async embed(text: string): Promise<number[]> {
    return this.embeddingProvider!.embed(text)
  }
}
