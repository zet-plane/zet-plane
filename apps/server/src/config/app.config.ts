import { z } from 'zod'

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
      anthropic: z.object({ apiKey: z.string().optional() }).default(() => ({})),
      github: z.object({ webhookSecret: z.string().optional() }).default(() => ({})),
      feishu: z
        .object({
          appId: z.string().optional(),
          appSecret: z.string().optional(),
        })
        .default(() => ({})),
    })
    .default(() => ({ anthropic: {}, github: {}, feishu: {} })),
})

export type Config = z.infer<typeof configSchema>
