import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    include: ['test/eval/**/*.eval.spec.ts'],
    exclude: ['node_modules/**'],
    testTimeout: 120_000,     // 2 min per test — LLM calls can be slow
    hookTimeout: 60_000,
    sequence: { concurrent: false },   // scenarios must run sequentially
  },
  oxc: {
    decorator: { legacy: true, emitDecoratorMetadata: true },
  },
})
