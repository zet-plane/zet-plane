import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { load as parseYaml } from 'js-yaml'
import { configSchema, type Config } from './app.config'

export class AppConfig {
  private constructor(private readonly cfg: Config) {}

  static load(yamlPath?: string): AppConfig {
    const path = yamlPath ?? join(process.cwd(), 'config.yaml')
    if (!existsSync(path)) {
      throw new Error(`Config file not found: ${path}`)
    }

    let raw: unknown
    try {
      raw = parseYaml(readFileSync(path, 'utf8'))
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to parse YAML at ${path}: ${reason}`)
    }

    if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`Invalid YAML at ${path}: root must be an object`)
    }

    const result = configSchema.safeParse(raw)
    if (!result.success) {
      const messages = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
      throw new Error(`Config validation failed:\n${messages.join('\n')}`)
    }

    return new AppConfig(result.data)
  }

  get server() { return this.cfg.server }
  get database() { return this.cfg.database }
  get redis() { return this.cfg.redis }
  get auth() { return this.cfg.auth }
  get integrations() { return this.cfg.integrations }
  get orchestrator() { return this.cfg.orchestrator }
}
