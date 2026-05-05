import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Fallback placeholder so `prisma generate` (codegen, no DB needed)
    // can run during postinstall in environments without DATABASE_URL set.
    // Migrate / runtime paths still require a real value via .env.
    url: process.env.DATABASE_URL ?? 'postgresql://placeholder',
  },
})
