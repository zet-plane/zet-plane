import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Default run: only unit tests (excludes e2e)
    include: ['src/**/*.spec.ts'],
    exclude: ['test/**', 'node_modules/**'],
  },
})
