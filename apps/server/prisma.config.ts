import { defineConfig } from "prisma/config";
import { readFileSync } from "fs";
import { resolve } from "path";
import yaml from "js-yaml";

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const config = yaml.load(
      readFileSync(resolve(__dirname, "config.yaml"), "utf8"),
    ) as { database?: { url?: string } };
    if (config?.database?.url) return config.database.url;
  } catch {
    // config.yaml not found or malformed — fall through to placeholder
  }
  // Placeholder allows `prisma generate` (codegen only, no DB) to run in CI
  return "postgresql://placeholder";
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: getDatabaseUrl(),
  },
});
