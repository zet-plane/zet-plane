import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { SkillRegistry } from './skill-registry'

const SKILLS_DIR = join(__dirname, '../../../skills/orchestrator')

describe('SkillRegistry', () => {
  it('loads skills on boot and returns prompt for event_anchor', async () => {
    const registry = new SkillRegistry(SKILLS_DIR)
    await registry.onModuleInit()
    const prompt = registry.getSystemPrompt('event_anchor')
    expect(prompt).toContain('event-anchoring')
    expect(prompt).toContain('knowledge-sedimentation')
  })

  it('returns checkpoint skill only for checkpoint task type', async () => {
    const registry = new SkillRegistry(SKILLS_DIR)
    await registry.onModuleInit()
    const prompt = registry.getSystemPrompt('checkpoint')
    expect(prompt).toContain('checkpoint-analysis')
    expect(prompt).not.toContain('event-anchoring')
  })

  it('returns empty string for task type with no skills', async () => {
    const registry = new SkillRegistry(SKILLS_DIR)
    await registry.onModuleInit()
    const prompt = registry.getSystemPrompt('embedding')
    expect(prompt).toBe('')
  })
})
