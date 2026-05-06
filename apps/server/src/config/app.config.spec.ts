import { describe, it, expect } from 'vitest'
import { envSchema, type AppEnv } from './app.config'

const VALID_ENV: AppEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  PORT: 3000,
}

describe('envSchema', () => {
  it('accepts valid env with required fields', () => {
    const result = envSchema.safeParse(VALID_ENV)
    expect(result.success).toBe(true)
  })

  it('defaults PORT to 3000 when not provided', () => {
    const { PORT: _, ...withoutPort } = VALID_ENV
    const result = envSchema.safeParse(withoutPort)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.PORT).toBe(3000)
  })

  it('rejects missing DATABASE_URL', () => {
    const { DATABASE_URL: _, ...rest } = VALID_ENV
    const result = envSchema.safeParse(rest)
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0])
      expect(fields).toContain('DATABASE_URL')
    }
  })

  it('rejects missing REDIS_URL', () => {
    const { REDIS_URL: _, ...rest } = VALID_ENV
    const result = envSchema.safeParse(rest)
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0])
      expect(fields).toContain('REDIS_URL')
    }
  })

  it('rejects PORT outside valid range', () => {
    const result = envSchema.safeParse({ ...VALID_ENV, PORT: 99999 })
    expect(result.success).toBe(false)
  })

  it('accepts optional fields when provided', () => {
    const result = envSchema.safeParse({
      ...VALID_ENV,
      ANTHROPIC_API_KEY: 'sk-ant-123',
      GITHUB_WEBHOOK_SECRET: 'gh-secret',
      FEISHU_APP_ID: 'feishu-id',
      FEISHU_APP_SECRET: 'feishu-secret',
      JWT_SECRET: 'jwt-secret',
    })
    expect(result.success).toBe(true)
  })

  it('ignores unknown keys from process.env', () => {
    const result = envSchema.safeParse({ ...VALID_ENV, PATH: '/usr/bin', HOME: '/root' })
    expect(result.success).toBe(true)
  })
})
