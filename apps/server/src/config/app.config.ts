import { z } from 'zod'

const llmModelConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'siliconflow', 'deepseek']),
  model: z.string().min(1),
  api_key: z.string().default(''),
  base_url: z.string().url().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  request_timeout_ms: z.number().int().positive().optional(),
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
      default: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', api_key: '', request_timeout_ms: 60_000 },
      checkpoint: { provider: 'anthropic', model: 'claude-sonnet-4-6', api_key: '', request_timeout_ms: 60_000 },
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
      llm: orchestratorLlmSchema.default(() => orchestratorLlmSchema.parse({})),
    })
    .default(() => ({ llm: orchestratorLlmSchema.parse({}) })),
})

export type Config = z.infer<typeof configSchema>
