// Integration smoke test — hits the real DeepSeek API.
// Run with: pnpm vitest run src/orchestrator/llm/deepseek-connectivity.integration.spec.ts
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { AppConfig } from '../../config/app-config'
import type { LlmModelConfig } from '../../config/app.config'
import { OpenAiCompatibleProvider } from './providers/openai-compatible.provider'
import { HumanMessage } from '@langchain/core/messages'

const configPath = join(process.cwd(), 'config.yaml')
let taskCfg: LlmModelConfig | undefined
let hasKey = false

if (existsSync(configPath)) {
  try {
    const config = AppConfig.load(configPath)
    taskCfg = config.orchestrator.llm.taskModels['default']
    hasKey = !!taskCfg?.api_key
  } catch {
    // config.yaml exists but is invalid — treat as no key
  }
}

describe.skipIf(!hasKey)('DeepSeek connectivity', () => {
  it('gets a chat response from deepseek-v4-pro', async () => {
    const provider = new OpenAiCompatibleProvider(taskCfg!)
    const llm = provider.createChatModel()
    const response = await llm.invoke([new HumanMessage('Reply with the single word: pong')])
    expect(typeof response.content).toBe('string')
    expect((response.content as string).trim().length).toBeGreaterThan(0)
    console.log('DeepSeek response:', response.content)
  }, 30_000)
})
