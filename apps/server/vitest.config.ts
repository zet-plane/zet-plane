import { defineConfig } from 'vitest/config'

const cliArgs = process.argv.slice(2)
const requestedE2ETest = cliArgs.some((arg) => /(^|\/)test\/.*\.e2e-spec\.ts$/.test(arg))

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    include: requestedE2ETest ? ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'] : ['src/**/*.spec.ts'],
    exclude: requestedE2ETest ? ['node_modules/**'] : ['test/**', 'node_modules/**'],
  },
})
