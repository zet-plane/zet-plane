import { describe, it, expect } from 'vitest'
import { configSchema } from './app.config'

const VALID_CONFIG = {
  database: { url: 'postgresql://user:pass@localhost:5432/db' },
  redis: { url: 'redis://localhost:6379' },
}

describe('configSchema', () => {
  it('accepts valid nested config', () => {
    const result = configSchema.safeParse(VALID_CONFIG)
    expect(result.success).toBe(true)
  })

  it('applies server.port default of 3000', () => {
    const result = configSchema.safeParse(VALID_CONFIG)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.server.port).toBe(3000)
  })

  it('rejects missing database.url', () => {
    const result = configSchema.safeParse({ redis: { url: 'redis://localhost:6379' } })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths.some((p) => p.includes('database'))).toBe(true)
    }
  })

  it('rejects missing redis.url', () => {
    const result = configSchema.safeParse({ database: { url: 'postgresql://user:pass@localhost:5432/db' } })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths.some((p) => p.includes('redis'))).toBe(true)
    }
  })

  it('rejects port out of range', () => {
    const result = configSchema.safeParse({ ...VALID_CONFIG, server: { port: 99999 } })
    expect(result.success).toBe(false)
  })

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

  it('applies orchestrator.llm defaults when omitted', () => {
    const result = configSchema.safeParse(VALID_CONFIG)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.orchestrator.llm.taskModels.default.provider).toBe('anthropic')
      expect(result.data.orchestrator.llm.taskModels.default.model).toBe('claude-haiku-4-5-20251001')
      expect(result.data.orchestrator.llm.taskModels.default.request_timeout_ms).toBe(60_000)
      expect(result.data.orchestrator.llm.taskModels.checkpoint.request_timeout_ms).toBe(60_000)
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

  it('coerces string port to number', () => {
    const result = configSchema.safeParse({ ...VALID_CONFIG, server: { port: '3000' } })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.server.port).toBe(3000)
  })
})
