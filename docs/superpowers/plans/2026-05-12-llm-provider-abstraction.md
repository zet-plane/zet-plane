# LLM Provider Abstraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded model selection and `ChatAnthropic`/`OpenAI` SDK calls with a config-driven provider abstraction that supports Anthropic, OpenAI, and any OpenAI-compatible endpoint.

**Architecture:** Each task type maps to a self-contained `LlmModelConfig` in `config.yaml`. `LlmProviderRegistry` reads that config at boot, creates one `IChatProvider` instance per task type entry, and one `IEmbeddingProvider` for the embedding model. `TaskRunnerService` delegates to the registry rather than hardcoding any model or SDK.

**Tech Stack:** `@langchain/core` (BaseChatModel), `@langchain/anthropic` (ChatAnthropic), `@langchain/openai` (ChatOpenAI — to be added), `openai` SDK (embeddings), NestJS DI, Zod, js-yaml.

---

## File Map

| Action | File |
|--------|------|
| Modify | `apps/server/src/config/app.config.ts` |
| Modify | `apps/server/src/config/app-config.ts` |
| Modify | `apps/server/src/config/app.config.spec.ts` |
| Modify | `apps/server/config.yaml` |
| Modify | `apps/server/config.yaml.example` |
| Create | `apps/server/src/orchestrator/llm/interfaces.ts` |
| Create | `apps/server/src/orchestrator/llm/providers/anthropic.provider.ts` |
| Create | `apps/server/src/orchestrator/llm/providers/anthropic.provider.spec.ts` |
| Create | `apps/server/src/orchestrator/llm/providers/openai-compatible.provider.ts` |
| Create | `apps/server/src/orchestrator/llm/providers/openai-compatible.provider.spec.ts` |
| Create | `apps/server/src/orchestrator/llm/llm-provider.registry.ts` |
| Create | `apps/server/src/orchestrator/llm/llm-provider.registry.spec.ts` |
| Modify | `apps/server/src/orchestrator/agent/agent-graph.ts` |
| Modify | `apps/server/src/orchestrator/agent/agent-graph.spec.ts` |
| Modify | `apps/server/src/orchestrator/runtime/task-runner.service.ts` |
| Modify | `apps/server/src/orchestrator/runtime/task-runner.service.spec.ts` |
| Modify | `apps/server/src/orchestrator/orchestrator.module.ts` |

---

## Task 1: Config schema — add `orchestrator.llm`, remove `integrations.anthropic`

**Files:**
- Modify: `apps/server/src/config/app.config.ts`
- Modify: `apps/server/src/config/app-config.ts`
- Modify: `apps/server/src/config/app.config.spec.ts`
- Modify: `apps/server/config.yaml`
- Modify: `apps/server/config.yaml.example`

- [ ] **Step 1: Write failing tests for the new schema**

Add these cases to `apps/server/src/config/app.config.spec.ts` (keep all existing tests, just add/change what's listed):

```typescript
// Replace the 'accepts optional integrations' test with:
it('accepts integrations without anthropic key', () => {
  const result = configSchema.safeParse({
    ...VALID_CONFIG,
    integrations: {
      github: { webhookSecret: 'gh-secret' },
      feishu: { appId: 'feishu-id', appSecret: 'feishu-secret' },
    },
  })
  expect(result.success).toBe(true)
})

// Add these new tests:
it('applies orchestrator.llm defaults when omitted', () => {
  const result = configSchema.safeParse(VALID_CONFIG)
  expect(result.success).toBe(true)
  if (result.success) {
    expect(result.data.orchestrator.llm.taskModels.default.provider).toBe('anthropic')
    expect(result.data.orchestrator.llm.taskModels.default.model).toBe('claude-haiku-4-5-20251001')
    expect(result.data.orchestrator.llm.embeddingModel.provider).toBe('openai')
  }
})

it('accepts explicit orchestrator.llm config', () => {
  const result = configSchema.safeParse({
    ...VALID_CONFIG,
    orchestrator: {
      llm: {
        taskModels: {
          default: { provider: 'anthropic', model: 'claude-sonnet-4-6', api_key: 'sk-ant-123' },
        },
        embeddingModel: { provider: 'openai', model: 'text-embedding-3-small', api_key: 'sk-oai-123' },
      },
    },
  })
  expect(result.success).toBe(true)
})

it('rejects orchestrator.llm.taskModels without a default entry', () => {
  const result = configSchema.safeParse({
    ...VALID_CONFIG,
    orchestrator: {
      llm: {
        taskModels: {
          checkpoint: { provider: 'anthropic', model: 'claude-sonnet-4-6', api_key: '' },
        },
        embeddingModel: { provider: 'openai', model: 'text-embedding-3-small', api_key: '' },
      },
    },
  })
  expect(result.success).toBe(false)
})

it('rejects unknown provider value', () => {
  const result = configSchema.safeParse({
    ...VALID_CONFIG,
    orchestrator: {
      llm: {
        taskModels: {
          default: { provider: 'unknown-llm', model: 'some-model', api_key: '' },
        },
        embeddingModel: { provider: 'openai', model: 'text-embedding-3-small', api_key: '' },
      },
    },
  })
  expect(result.success).toBe(false)
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/server && pnpm vitest run src/config/app.config.spec.ts
```

Expected: new tests fail ("property does not exist" or validation errors).

- [ ] **Step 3: Update `app.config.ts`**

Replace the entire file content:

```typescript
import { z } from 'zod'

const llmModelConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'siliconflow']),
  model: z.string().min(1),
  api_key: z.string().default(''),
  base_url: z.string().url().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
})

export type LlmModelConfig = z.infer<typeof llmModelConfigSchema>
export type ProviderType = LlmModelConfig['provider']

const orchestratorLlmSchema = z.object({
  taskModels: z
    .record(z.string(), llmModelConfigSchema)
    .refine((v) => 'default' in v, {
      message: 'orchestrator.llm.taskModels must contain a "default" entry',
    })
    .default({
      default: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', api_key: '' },
      checkpoint: { provider: 'anthropic', model: 'claude-sonnet-4-6', api_key: '' },
    }),
  embeddingModel: llmModelConfigSchema.default({
    provider: 'openai',
    model: 'text-embedding-3-small',
    api_key: '',
  }),
})

export const configSchema = z.object({
  server: z
    .object({
      port: z.coerce.number().int().min(1).max(65535).default(3000),
    })
    .default(() => ({ port: 3000 })),
  database: z.object({
    url: z.string().min(1),
  }),
  redis: z.object({
    url: z.string().min(1),
  }),
  auth: z
    .object({
      jwtSecret: z.string().optional(),
    })
    .default(() => ({})),
  integrations: z
    .object({
      github: z.object({ webhookSecret: z.string().optional() }).default(() => ({})),
      feishu: z
        .object({
          appId: z.string().optional(),
          appSecret: z.string().optional(),
        })
        .default(() => ({})),
    })
    .default(() => ({ github: {}, feishu: {} })),
  orchestrator: z
    .object({
      llm: orchestratorLlmSchema.default(() => ({})),
    })
    .default(() => ({ llm: {} as any })),
})

export type Config = z.infer<typeof configSchema>
```

- [ ] **Step 4: Add `orchestrator` getter to `app-config.ts`**

Add one line after `get integrations()`:

```typescript
get orchestrator() { return this.cfg.orchestrator }
```

- [ ] **Step 5: Update `config.yaml`**

Replace file content:

```yaml
server:
  port: 3000
database:
  url: postgresql://user:password@localhost:5432/zet_plane
redis:
  url: redis://localhost:6379
auth:
  jwtSecret: ""
integrations:
  github:
    webhookSecret: ""
  feishu:
    appId: ""
    appSecret: ""
orchestrator:
  llm:
    taskModels:
      default:
        provider: anthropic
        model: claude-haiku-4-5-20251001
        api_key: ""
      checkpoint:
        provider: anthropic
        model: claude-sonnet-4-6
        api_key: ""
    embeddingModel:
      provider: openai
      model: text-embedding-3-small
      api_key: ""
```

- [ ] **Step 6: Update `config.yaml.example`**

Replace file content (same structure, add comment for OpenAI-compatible):

```yaml
server:
  port: 3000
database:
  url: postgresql://postgres:postgres@localhost:5432/zet_plane_dev
redis:
  url: redis://localhost:6379
auth:
  jwtSecret: ""
integrations:
  github:
    webhookSecret: ""
  feishu:
    appId: ""
    appSecret: ""
orchestrator:
  llm:
    # provider: one of anthropic | openai | siliconflow
    # For OpenAI-compatible endpoints (siliconflow, groq, etc.) add base_url.
    taskModels:
      default:
        provider: anthropic
        model: claude-haiku-4-5-20251001
        api_key: ""
      checkpoint:
        provider: anthropic
        model: claude-sonnet-4-6
        api_key: ""
    embeddingModel:
      provider: openai
      model: text-embedding-3-small
      api_key: ""
```

- [ ] **Step 7: Run tests to confirm they pass**

```bash
cd apps/server && pnpm vitest run src/config/app.config.spec.ts
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/config/app.config.ts \
        apps/server/src/config/app-config.ts \
        apps/server/src/config/app.config.spec.ts \
        apps/server/config.yaml \
        apps/server/config.yaml.example
git commit -m "feat(config): add orchestrator.llm config schema, remove integrations.anthropic"
```

---

## Task 2: Add `@langchain/openai` + LLM interfaces

**Files:**
- Modify: `apps/server/package.json` (via pnpm add)
- Create: `apps/server/src/orchestrator/llm/interfaces.ts`

- [ ] **Step 1: Resolve latest `@langchain/openai` version**

```bash
cd apps/server && pnpm view @langchain/openai dist-tags
```

Note the `latest` version. Also check peer dependency on `@langchain/core`:

```bash
pnpm view @langchain/openai@latest peerDependencies
```

Confirm it is compatible with the installed `@langchain/core@1.1.45`.

- [ ] **Step 2: Install the package**

```bash
cd apps/server && pnpm add @langchain/openai@latest
```

- [ ] **Step 3: Create `llm/interfaces.ts`**

```typescript
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'

export interface IChatProvider {
  createChatModel(): BaseChatModel
}

export interface IEmbeddingProvider {
  embed(text: string): Promise<number[]>
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/package.json apps/server/pnpm-lock.yaml \
        apps/server/src/orchestrator/llm/interfaces.ts
git commit -m "feat(orchestrator/llm): add @langchain/openai, define IChatProvider/IEmbeddingProvider"
```

---

## Task 3: `AnthropicProvider`

**Files:**
- Create: `apps/server/src/orchestrator/llm/providers/anthropic.provider.ts`
- Create: `apps/server/src/orchestrator/llm/providers/anthropic.provider.spec.ts`

- [ ] **Step 1: Write the failing spec**

```typescript
// apps/server/src/orchestrator/llm/providers/anthropic.provider.spec.ts
import { describe, it, expect, vi } from 'vitest'

const mockChatAnthropic = vi.fn()
vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: mockChatAnthropic,
}))

import { AnthropicProvider } from './anthropic.provider'

describe('AnthropicProvider', () => {
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
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/server && pnpm vitest run src/orchestrator/llm/providers/anthropic.provider.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `anthropic.provider.ts`**

```typescript
// apps/server/src/orchestrator/llm/providers/anthropic.provider.ts
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
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd apps/server && pnpm vitest run src/orchestrator/llm/providers/anthropic.provider.spec.ts
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/orchestrator/llm/providers/anthropic.provider.ts \
        apps/server/src/orchestrator/llm/providers/anthropic.provider.spec.ts
git commit -m "feat(orchestrator/llm): AnthropicProvider wrapping ChatAnthropic"
```

---

## Task 4: `OpenAiCompatibleProvider`

**Files:**
- Create: `apps/server/src/orchestrator/llm/providers/openai-compatible.provider.ts`
- Create: `apps/server/src/orchestrator/llm/providers/openai-compatible.provider.spec.ts`

- [ ] **Step 1: Write the failing spec**

```typescript
// apps/server/src/orchestrator/llm/providers/openai-compatible.provider.spec.ts
import { describe, it, expect, vi } from 'vitest'

const mockChatOpenAI = vi.fn()
vi.mock('@langchain/openai', () => ({ ChatOpenAI: mockChatOpenAI }))

const { mockEmbeddingsCreate } = vi.hoisted(() => ({
  mockEmbeddingsCreate: vi.fn().mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
}))
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
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/server && pnpm vitest run src/orchestrator/llm/providers/openai-compatible.provider.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `openai-compatible.provider.ts`**

```typescript
// apps/server/src/orchestrator/llm/providers/openai-compatible.provider.ts
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
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd apps/server && pnpm vitest run src/orchestrator/llm/providers/openai-compatible.provider.spec.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/orchestrator/llm/providers/openai-compatible.provider.ts \
        apps/server/src/orchestrator/llm/providers/openai-compatible.provider.spec.ts
git commit -m "feat(orchestrator/llm): OpenAiCompatibleProvider for chat + embeddings"
```

---

## Task 5: `LlmProviderRegistry`

**Files:**
- Create: `apps/server/src/orchestrator/llm/llm-provider.registry.ts`
- Create: `apps/server/src/orchestrator/llm/llm-provider.registry.spec.ts`

- [ ] **Step 1: Write the failing spec**

```typescript
// apps/server/src/orchestrator/llm/llm-provider.registry.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./providers/anthropic.provider', () => ({
  AnthropicProvider: vi.fn().mockImplementation((cfg) => ({
    _cfg: cfg,
    createChatModel: vi.fn().mockReturnValue({ _type: 'anthropic-model' }),
  })),
}))
vi.mock('./providers/openai-compatible.provider', () => ({
  OpenAiCompatibleProvider: vi.fn().mockImplementation((cfg) => ({
    _cfg: cfg,
    createChatModel: vi.fn().mockReturnValue({ _type: 'openai-model' }),
    embed: vi.fn().mockResolvedValue([0.1, 0.2]),
  })),
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
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/server && pnpm vitest run src/orchestrator/llm/llm-provider.registry.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `llm-provider.registry.ts`**

```typescript
// apps/server/src/orchestrator/llm/llm-provider.registry.ts
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
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd apps/server && pnpm vitest run src/orchestrator/llm/llm-provider.registry.spec.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/orchestrator/llm/llm-provider.registry.ts \
        apps/server/src/orchestrator/llm/llm-provider.registry.spec.ts
git commit -m "feat(orchestrator/llm): LlmProviderRegistry — config-driven provider routing"
```

---

## Task 6: Update `agent-graph.ts` — accept `BaseChatModel` instead of model string

**Files:**
- Modify: `apps/server/src/orchestrator/agent/agent-graph.ts`
- Modify: `apps/server/src/orchestrator/agent/agent-graph.spec.ts`

- [ ] **Step 1: Update the spec first**

Replace the entire `apps/server/src/orchestrator/agent/agent-graph.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Run spec to confirm it fails**

```bash
cd apps/server && pnpm vitest run src/orchestrator/agent/agent-graph.spec.ts
```

Expected: FAIL — `llm` is not a valid BuildOptions field.

- [ ] **Step 3: Update `agent-graph.ts`**

Replace the entire file:

```typescript
// apps/server/src/orchestrator/agent/agent-graph.ts
import { StateGraph, MessagesAnnotation, END } from '@langchain/langgraph'
import type { CompiledStateGraph } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { AIMessage, BaseMessage } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { StructuredToolInterface } from '@langchain/core/tools'
import type { AgentInsight } from '../types'
import { AgentInsightSchema, MAX_ITERATIONS } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AgentGraph = CompiledStateGraph<any, any, any>

type BuildOptions = {
  tools: StructuredToolInterface[]
  systemPrompt: string
  llm: BaseChatModel
}

export function buildAgentGraph(options: BuildOptions): AgentGraph {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolNode = new ToolNode(options.tools as any[])
  const llm = options.llm.bindTools(options.tools)

  function shouldContinue(state: typeof MessagesAnnotation.State): 'tools' | typeof END {
    const last = state.messages.at(-1) as AIMessage
    if (last?.tool_calls?.length) return 'tools'
    return END
  }

  async function callModel(state: typeof MessagesAnnotation.State) {
    const messages: BaseMessage[] = [new SystemMessage(options.systemPrompt), ...state.messages]
    const response = await llm.invoke(messages)
    return { messages: [response] }
  }

  return new StateGraph(MessagesAnnotation)
    .addNode('agent', callModel)
    .addNode('tools', toolNode)
    .addEdge('__start__', 'agent')
    .addConditionalEdges('agent', shouldContinue)
    .addEdge('tools', 'agent')
    .compile() as AgentGraph
}

export async function runAgentLoop(
  graph: AgentGraph,
  userMessage: string,
): Promise<AgentInsight> {
  const result = await graph.invoke(
    { messages: [new HumanMessage(userMessage)] },
    { recursionLimit: MAX_ITERATIONS },
  ) as { messages: BaseMessage[] }

  const lastMessage = result.messages.at(-1) as AIMessage
  const content = typeof lastMessage.content === 'string'
    ? lastMessage.content
    : JSON.stringify(lastMessage.content)

  try {
    const parsed = AgentInsightSchema.safeParse(JSON.parse(content))
    if (parsed.success) return parsed.data
  } catch {
    // LLM returned free-form text — wrap it
  }

  return {
    summary: content,
    signalType: 'progress',
    confidence: 0.7,
    evidence: [],
  }
}
```

- [ ] **Step 4: Run spec to confirm it passes**

```bash
cd apps/server && pnpm vitest run src/orchestrator/agent/agent-graph.spec.ts
```

Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/orchestrator/agent/agent-graph.ts \
        apps/server/src/orchestrator/agent/agent-graph.spec.ts
git commit -m "feat(orchestrator/agent): BuildOptions.llm: BaseChatModel replaces model string"
```

---

## Task 7: Wire up `TaskRunnerService` + `OrchestratorModule`

**Files:**
- Modify: `apps/server/src/orchestrator/runtime/task-runner.service.ts`
- Modify: `apps/server/src/orchestrator/runtime/task-runner.service.spec.ts`
- Modify: `apps/server/src/orchestrator/orchestrator.module.ts`

- [ ] **Step 1: Update `task-runner.service.spec.ts`**

Replace the entire file:

```typescript
// apps/server/src/orchestrator/runtime/task-runner.service.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { OrchestratorTaskType, OrchestratorTaskStatus, OrchestratorSourceType } from '@generated/client'
import { TaskRunnerService } from './task-runner.service'

vi.mock('../agent/agent-graph', () => ({
  buildAgentGraph: vi.fn().mockReturnValue({}),
  runAgentLoop: vi.fn().mockResolvedValue({
    summary: 'agent done',
    signalType: 'progress',
    confidence: 0.8,
    evidence: [],
  }),
}))

const makeTask = (overrides: Record<string, unknown> = {}) => ({
  id: 'task-1',
  projectId: 'proj-1',
  type: OrchestratorTaskType.event_anchor,
  sourceType: OrchestratorSourceType.graph_event,
  sourceId: 'src-1',
  status: OrchestratorTaskStatus.pending,
  idempotencyKey: 'key-1',
  input: {},
  modelResult: null,
  error: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const fakeRoot = { id: 'root-node-id', projectId: 'proj-1', isProjectRoot: true }
const fakeLlm = { bindTools: vi.fn().mockReturnValue({ invoke: vi.fn() }) }

describe('TaskRunnerService', () => {
  let service: TaskRunnerService
  let mockContextBuilder: any
  let mockSkillRegistry: any
  let mockGraphReader: any
  let mockGraphRepo: any
  let mockNodeService: any
  let mockEdgeService: any
  let mockEntryService: any
  let mockRevisionService: any
  let mockSearchService: any
  let mockTaskRepo: any
  let mockPublisher: any
  let mockLlmRegistry: any

  beforeEach(() => {
    mockContextBuilder = {
      build: vi.fn().mockResolvedValue({
        project: { id: 'proj-1', name: 'Test Project', status: 'active' },
        trigger: { sourceType: 'graph_event', sourceId: 'src-1', raw: {} },
        candidateNodes: [],
        relatedEntries: [],
        recentTaskHistory: [],
        constraints: { mayWriteGraph: true, mayWriteKnowledge: true, requiresHumanApproval: false },
      }),
    }
    mockSkillRegistry = { getSystemPrompt: vi.fn().mockReturnValue('You are a helpful agent.') }
    mockGraphReader = {}
    mockGraphRepo = { findProjectRoot: vi.fn().mockResolvedValue(fakeRoot) }
    mockNodeService = {}
    mockEdgeService = {}
    mockEntryService = {
      getEntry: vi.fn().mockResolvedValue({ body: 'some text', id: 'entry-1' }),
    }
    mockRevisionService = {}
    mockSearchService = { storeEmbedding: vi.fn().mockResolvedValue(undefined) }
    mockTaskRepo = {}
    mockPublisher = {}
    mockLlmRegistry = {
      getChatModelForTask: vi.fn().mockReturnValue(fakeLlm),
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    }

    service = new TaskRunnerService(
      mockContextBuilder,
      mockSkillRegistry,
      mockGraphReader,
      mockGraphRepo,
      mockNodeService,
      mockEdgeService,
      mockEntryService,
      mockRevisionService,
      mockSearchService,
      mockTaskRepo,
      mockPublisher,
      mockLlmRegistry,
    )
  })

  // ── routing ────────────────────────────────────────────────────────────────

  describe('run() routing', () => {
    it('routes embedding tasks to runEmbedding — calls storeEmbedding, skips contextBuilder', async () => {
      const task = makeTask({ type: OrchestratorTaskType.embedding, input: { entryId: 'entry-1' } })
      const insight = await service.run(task)

      expect(mockLlmRegistry.embed).toHaveBeenCalledWith('some text')
      expect(mockSearchService.storeEmbedding).toHaveBeenCalledWith('entry-1', [0.1, 0.2, 0.3])
      expect(mockContextBuilder.build).not.toHaveBeenCalled()
      expect(insight.summary).toContain('entry-1')
      expect(insight.signalType).toBe('progress')
    })

    it('routes non-embedding tasks to runAgenticLoop — calls contextBuilder and agent graph', async () => {
      const { buildAgentGraph, runAgentLoop } = await import('../agent/agent-graph')
      const task = makeTask({ type: OrchestratorTaskType.event_anchor })

      await service.run(task)

      expect(mockContextBuilder.build).toHaveBeenCalledWith(task)
      expect(buildAgentGraph).toHaveBeenCalled()
      expect(runAgentLoop).toHaveBeenCalled()
    })
  })

  // ── model selection ────────────────────────────────────────────────────────

  describe('model selection', () => {
    it('calls getChatModelForTask with the task type', async () => {
      const task = makeTask({ type: OrchestratorTaskType.checkpoint })
      await service.run(task)
      expect(mockLlmRegistry.getChatModelForTask).toHaveBeenCalledWith(OrchestratorTaskType.checkpoint)
    })

    it('calls getChatModelForTask for non-checkpoint tasks too', async () => {
      const task = makeTask({ type: OrchestratorTaskType.event_anchor })
      await service.run(task)
      expect(mockLlmRegistry.getChatModelForTask).toHaveBeenCalledWith(OrchestratorTaskType.event_anchor)
    })
  })

  // ── staging node resolution ────────────────────────────────────────────────

  describe('staging node resolution', () => {
    it('throws NotFoundException when project root is not found', async () => {
      mockGraphRepo.findProjectRoot.mockResolvedValue(null)
      const task = makeTask({ type: OrchestratorTaskType.event_anchor })
      await expect(service.run(task)).rejects.toThrow(NotFoundException)
    })

    it('passes the real root node id to toStagingTool', async () => {
      const task = makeTask({ type: OrchestratorTaskType.event_anchor })
      await service.run(task)
      expect(mockGraphRepo.findProjectRoot).toHaveBeenCalledWith('proj-1')
    })
  })

  // ── embed delegation ───────────────────────────────────────────────────────

  describe('embedding task', () => {
    it('delegates to registry.embed, not a local openai client', async () => {
      const task = makeTask({ type: OrchestratorTaskType.embedding, input: { entryId: 'entry-1' } })
      await service.run(task)
      expect(mockLlmRegistry.embed).toHaveBeenCalledWith('some text')
    })
  })
})
```

- [ ] **Step 2: Run spec to confirm it fails**

```bash
cd apps/server && pnpm vitest run src/orchestrator/runtime/task-runner.service.spec.ts
```

Expected: FAIL — constructor arity mismatch / import path.

- [ ] **Step 3: Update `task-runner.service.ts`**

Replace the entire file:

```typescript
// apps/server/src/orchestrator/runtime/task-runner.service.ts
import { Injectable, NotFoundException } from '@nestjs/common'
import { OrchestratorTaskType } from '@generated/client'
import type { OrchestratorTask, OrchestratorContext, AgentInsight } from '../types'
import { ContextBuilderService } from '../context/context-builder.service'
import { SkillRegistry } from '../skill/skill-registry'
import { buildAgentGraph, runAgentLoop } from '../agent/agent-graph'
import { LlmProviderRegistry } from '../llm/llm-provider.registry'
import { GraphContextReader } from '../context/graph-context.reader'
import { GraphRepository } from '../../graph/repository/graph.repository'
import { NodeService } from '../../graph/node/node.service'
import { EdgeService } from '../../graph/edge/edge.service'
import { EntryService } from '../../knowledge/entry/entry.service'
import { RevisionService } from '../../knowledge/revision/revision.service'
import { SearchService } from '../../knowledge/search/search.service'
import { OrchestratorTaskRepository } from '../repository/orchestrator-task.repository'
import { OrchestratorTaskPublisher } from '../ingress/orchestrator-task.publisher'
// read tools
import { getNodeTool } from '../tools/read/get-node.tool'
import { getSubgraphTool } from '../tools/read/get-subgraph.tool'
import { searchNodesTool } from '../tools/read/search-nodes.tool'
import { searchKnowledgeTool } from '../tools/read/search-knowledge.tool'
import { getTaskHistoryTool } from '../tools/read/get-task-history.tool'
// write tools
import { createNodeTool } from '../tools/write/create-node.tool'
import { createEdgeTool } from '../tools/write/create-edge.tool'
import { moveNodeTool } from '../tools/write/move-node.tool'
import { updateNodeStatusTool } from '../tools/write/update-node-status.tool'
import { createKnowledgeEntryTool } from '../tools/write/create-knowledge-entry.tool'
import { reviseKnowledgeEntryTool } from '../tools/write/revise-knowledge-entry.tool'
import { writeEmbeddingTool } from '../tools/write/write-embedding.tool'
import { skipTool } from '../tools/write/skip.tool'
import { notifyHumanTool } from '../tools/write/notify-human.tool'
import { toStagingTool } from '../tools/write/to-staging.tool'

@Injectable()
export class TaskRunnerService {
  constructor(
    private readonly contextBuilder: ContextBuilderService,
    private readonly skillRegistry: SkillRegistry,
    private readonly graphReader: GraphContextReader,
    private readonly graphRepo: GraphRepository,
    private readonly nodeService: NodeService,
    private readonly edgeService: EdgeService,
    private readonly entryService: EntryService,
    private readonly revisionService: RevisionService,
    private readonly searchService: SearchService,
    private readonly taskRepo: OrchestratorTaskRepository,
    private readonly publisher: OrchestratorTaskPublisher,
    private readonly llmRegistry: LlmProviderRegistry,
  ) {}

  async run(task: OrchestratorTask): Promise<AgentInsight> {
    if (task.type === OrchestratorTaskType.embedding) {
      return this.runEmbedding(task)
    }
    const ctx = await this.contextBuilder.build(task)
    return this.runAgenticLoop(task, ctx)
  }

  private async runEmbedding(task: OrchestratorTask): Promise<AgentInsight> {
    const input = task.input as { entryId: string }
    const entry = await this.entryService.getEntry(input.entryId)
    const text = typeof entry.body === 'object' && entry.body !== null
      ? JSON.stringify(entry.body)
      : String(entry.body)

    const vector = await this.llmRegistry.embed(text)
    await this.searchService.storeEmbedding(input.entryId, vector)

    return {
      summary: `Embedding indexed for entry ${input.entryId}`,
      signalType: 'progress',
      confidence: 1,
      evidence: [{ sourceType: 'knowledge_entry', sourceId: input.entryId, note: 'embedding stored' }],
    }
  }

  private async runAgenticLoop(
    task: OrchestratorTask,
    ctx: OrchestratorContext,
  ): Promise<AgentInsight> {
    const llm = this.llmRegistry.getChatModelForTask(task.type)
    const systemPrompt = this.skillRegistry.getSystemPrompt(task.type)

    const root = await this.graphRepo.findProjectRoot(task.projectId)
    if (!root) throw new NotFoundException(`Project root not found for projectId=${task.projectId}`)

    const tools = [
      getNodeTool(this.graphRepo),
      getSubgraphTool(this.graphReader),
      searchNodesTool(this.graphReader),
      searchKnowledgeTool(this.searchService, (text) => this.llmRegistry.embed(text)),
      getTaskHistoryTool(this.taskRepo),
      createNodeTool({ nodeService: this.nodeService, projectId: task.projectId }),
      createEdgeTool({ edgeService: this.edgeService, projectId: task.projectId }),
      moveNodeTool({ edgeService: this.edgeService, projectId: task.projectId }),
      updateNodeStatusTool({ nodeService: this.nodeService }),
      createKnowledgeEntryTool({
        entryService: this.entryService,
        publisher: this.publisher,
        projectId: task.projectId,
      }),
      reviseKnowledgeEntryTool({ revisionService: this.revisionService }),
      writeEmbeddingTool({ searchService: this.searchService }),
      skipTool(),
      notifyHumanTool(),
      toStagingTool({
        entryService: this.entryService,
        projectId: task.projectId,
        stagingNodeId: root.id,
      }),
    ]

    const userMessage = [
      `Task type: ${task.type}`,
      `Project: ${ctx.project.id}`,
      `Trigger: ${JSON.stringify(ctx.trigger)}`,
      `Candidate nodes: ${JSON.stringify(ctx.candidateNodes)}`,
      `Related knowledge: ${JSON.stringify(ctx.relatedEntries)}`,
      `Recent task history: ${JSON.stringify(ctx.recentTaskHistory)}`,
      '',
      'Analyze the trigger event and take appropriate actions using the available tools.',
      'When done, respond with a JSON object: { "summary": "...", "signalType": "...", "confidence": 0.0-1.0, "evidence": [] }',
    ].join('\n')

    const graph = buildAgentGraph({ tools, systemPrompt, llm })
    return runAgentLoop(graph, userMessage)
  }
}
```

- [ ] **Step 4: Update `orchestrator.module.ts` — register `LlmProviderRegistry`**

Add `LlmProviderRegistry` to the imports and providers:

```typescript
import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { join } from 'node:path'
import { PrismaService } from '../prisma/prisma.service'
import { GraphRepository } from '../graph/repository/graph.repository'
import { NodeService } from '../graph/node/node.service'
import { EdgeService } from '../graph/edge/edge.service'
import { GraphEventPublisher, GRAPH_EVENTS_QUEUE } from '../graph/events/graph-event.publisher'
import { CycleDetectorService } from '../graph/cycle/cycle-detector.service'
import { EntryService } from '../knowledge/entry/entry.service'
import { RevisionService } from '../knowledge/revision/revision.service'
import { SearchService } from '../knowledge/search/search.service'
import { KnowledgeRepository } from '../knowledge/repository/knowledge.repository'
import { KnowledgeEventPublisher, KNOWLEDGE_EVENTS_QUEUE } from '../knowledge/events/knowledge-event.publisher'
import { ORCHESTRATOR_TASKS_QUEUE } from './types'
import { OrchestratorTaskRepository } from './repository/orchestrator-task.repository'
import { OrchestratorTaskPublisher } from './ingress/orchestrator-task.publisher'
import {
  OrchestratorRouterService,
  OrchestratorGraphEventWorker,
  OrchestratorKnowledgeEventWorker,
} from './ingress/orchestrator-router.service'
import { TaskSchedulerService } from './ingress/task-scheduler.service'
import { AgentRuntimeService } from './runtime/agent-runtime.service'
import { TaskRunnerService } from './runtime/task-runner.service'
import { OrchestratorTaskWorker } from './runtime/orchestrator-task.worker'
import { ContextBuilderService } from './context/context-builder.service'
import { GraphContextReader } from './context/graph-context.reader'
import { KnowledgeContextReader } from './context/knowledge-context.reader'
import { SkillRegistry } from './skill/skill-registry'
import { LlmProviderRegistry } from './llm/llm-provider.registry'

const SKILLS_DIR = join(__dirname, '../../skills/orchestrator')

@Module({
  imports: [
    BullModule.registerQueue(
      { name: ORCHESTRATOR_TASKS_QUEUE },
      { name: GRAPH_EVENTS_QUEUE },
      { name: KNOWLEDGE_EVENTS_QUEUE },
    ),
  ],
  providers: [
    PrismaService,
    // graph domain
    GraphRepository,
    CycleDetectorService,
    GraphEventPublisher,
    NodeService,
    EdgeService,
    // knowledge domain
    KnowledgeRepository,
    KnowledgeEventPublisher,
    EntryService,
    RevisionService,
    SearchService,
    // orchestrator
    OrchestratorTaskRepository,
    OrchestratorTaskPublisher,
    OrchestratorRouterService,
    OrchestratorGraphEventWorker,
    OrchestratorKnowledgeEventWorker,
    TaskSchedulerService,
    AgentRuntimeService,
    TaskRunnerService,
    OrchestratorTaskWorker,
    ContextBuilderService,
    GraphContextReader,
    KnowledgeContextReader,
    LlmProviderRegistry,
    {
      provide: SkillRegistry,
      useFactory: () => new SkillRegistry(SKILLS_DIR),
    },
  ],
  exports: [OrchestratorTaskRepository, OrchestratorTaskPublisher],
})
export class OrchestratorModule {}
```

- [ ] **Step 5: Run all orchestrator tests**

```bash
cd apps/server && pnpm vitest run src/orchestrator/
```

Expected: all tests pass. Pay attention to:
- `task-runner.service.spec.ts` — mock path fixed, model selection tests updated
- `agent-graph.spec.ts` — uses `llm` param
- All registry/provider specs from previous tasks

- [ ] **Step 6: Run the full test suite**

```bash
cd apps/server && pnpm test
```

Expected: all tests pass with no regressions.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/orchestrator/runtime/task-runner.service.ts \
        apps/server/src/orchestrator/runtime/task-runner.service.spec.ts \
        apps/server/src/orchestrator/orchestrator.module.ts
git commit -m "feat(orchestrator): wire LlmProviderRegistry into TaskRunnerService and OrchestratorModule"
```
