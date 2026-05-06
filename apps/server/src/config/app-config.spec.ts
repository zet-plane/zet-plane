import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { AppConfig } from './app-config'

function tmpYaml(content: string): string {
  const path = join(tmpdir(), `test-config-${randomUUID()}.yaml`)
  writeFileSync(path, content)
  return path
}

describe('AppConfig', () => {
  const created: string[] = []

  function track(path: string): string {
    created.push(path)
    return path
  }

  afterEach(() => {
    for (const p of created.splice(0)) {
      if (existsSync(p)) unlinkSync(p)
    }
  })

  it('load() parses YAML file and exposes section getters', () => {
    const path = track(
      tmpYaml(`
server:
  port: 4000
database:
  url: postgresql://u:p@localhost:5432/db
redis:
  url: redis://localhost:6379
auth:
  jwtSecret: jwt-123
integrations:
  anthropic:
    apiKey: sk-ant-x
  github:
    webhookSecret: gh-x
  feishu:
    appId: fs-id
    appSecret: fs-secret
`),
    )

    const cfg = AppConfig.load(path)

    expect(cfg.server.port).toBe(4000)
    expect(cfg.database.url).toBe('postgresql://u:p@localhost:5432/db')
    expect(cfg.redis.url).toBe('redis://localhost:6379')
    expect(cfg.auth.jwtSecret).toBe('jwt-123')
    expect(cfg.integrations.anthropic.apiKey).toBe('sk-ant-x')
    expect(cfg.integrations.github.webhookSecret).toBe('gh-x')
    expect(cfg.integrations.feishu.appId).toBe('fs-id')
    expect(cfg.integrations.feishu.appSecret).toBe('fs-secret')
  })

  it('load() applies defaults when optional sections are omitted', () => {
    const path = track(
      tmpYaml(`
database:
  url: postgresql://u:p@localhost:5432/db
redis:
  url: redis://localhost:6379
`),
    )

    const cfg = AppConfig.load(path)

    expect(cfg.server.port).toBe(3000)
    expect(cfg.auth.jwtSecret).toBeUndefined()
    expect(cfg.integrations.anthropic.apiKey).toBeUndefined()
    expect(cfg.integrations.github.webhookSecret).toBeUndefined()
    expect(cfg.integrations.feishu.appId).toBeUndefined()
  })

  it('load() throws when file does not exist', () => {
    const missing = join(tmpdir(), `does-not-exist-${randomUUID()}.yaml`)
    expect(() => AppConfig.load(missing)).toThrow(/not found/i)
  })

  it('load() throws when database.url is missing', () => {
    const path = track(
      tmpYaml(`
database: {}
redis:
  url: redis://localhost:6379
`),
    )

    expect(() => AppConfig.load(path)).toThrow(/database\.url/)
  })

  it('load() throws when redis.url is missing', () => {
    const path = track(
      tmpYaml(`
database:
  url: postgresql://u:p@localhost:5432/db
redis: {}
`),
    )

    expect(() => AppConfig.load(path)).toThrow(/redis\.url/)
  })

  it('load() throws when database section is entirely absent', () => {
    const path = track(
      tmpYaml(`
redis:
  url: redis://localhost:6379
`),
    )

    expect(() => AppConfig.load(path)).toThrow(/database/)
  })

  it('load() throws on malformed YAML', () => {
    const path = track(tmpYaml('::: not valid yaml :::\n  - [unbalanced'))
    expect(() => AppConfig.load(path)).toThrow()
  })

  it('load() throws when YAML root is not an object', () => {
    const path = track(tmpYaml('just-a-scalar-string'))
    expect(() => AppConfig.load(path)).toThrow(/invalid|object/i)
  })
})
