import { z } from 'zod'

export const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    ANTHROPIC_API_KEY: z.string().optional(),
    GITHUB_WEBHOOK_SECRET: z.string().optional(),
    FEISHU_APP_ID: z.string().optional(),
    FEISHU_APP_SECRET: z.string().optional(),
    JWT_SECRET: z.string().optional(),
  })

export type AppEnv = z.infer<typeof envSchema>

export function validateConfig(config: Record<string, unknown>): AppEnv {
  const result = envSchema.safeParse(config)
  if (!result.success) {
    const messages = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    throw new Error(`Config validation failed:\n${messages.join('\n')}`)
  }
  return result.data
}
