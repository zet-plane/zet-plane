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

  it('accepts optional integrations', () => {
    const result = configSchema.safeParse({
      ...VALID_CONFIG,
      integrations: {
        anthropic: { apiKey: 'sk-ant-123' },
        github: { webhookSecret: 'gh-secret' },
        feishu: { appId: 'feishu-id', appSecret: 'feishu-secret' },
      },
    })
    expect(result.success).toBe(true)
  })

  it('coerces string port to number', () => {
    const result = configSchema.safeParse({ ...VALID_CONFIG, server: { port: '3000' } })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.server.port).toBe(3000)
  })
})
