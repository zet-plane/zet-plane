import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    tsconfig: './tsconfig.test.json',
  },
  test: {
    globals: true,
    include: ['test/eval/**/*.eval.spec.ts'],
    exclude: ['node_modules/**'],
    testTimeout: 120_000,     // 2 min per test — LLM calls can be slow
    hookTimeout: 60_000,
    fileParallelism: false,              // all spec files share one worker → singleton NestJS instance
    sequence: { concurrent: false },   // scenarios must run sequentially
  },
  oxc: {
    decorator: { legacy: true, emitDecoratorMetadata: true },
  },
})
