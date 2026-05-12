import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    // Default run: only unit tests (excludes e2e)
    include: ['src/**/*.spec.ts'],
    exclude: ['test/**', 'node_modules/**'],
  },
})
