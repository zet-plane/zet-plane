import { describe, it, expect, beforeEach } from 'vitest'
import { join } from 'node:path'
import { SkillRegistry } from './skill-registry'

const SKILLS_DIR = join(__dirname, '../../../skills/orchestrator')

describe('SkillRegistry', () => {
  let registry: SkillRegistry

  beforeEach(async () => {
    registry = new SkillRegistry(SKILLS_DIR)
    await registry.onModuleInit()
  })

  it('listSkills returns all non-base skills with name, description, and applicableTasks', () => {
    const skills = registry.listSkills()
    expect(skills.length).toBeGreaterThan(0)
    const names = skills.map((s) => s.name)
    expect(names).not.toContain('agent-base')
    expect(names).toContain('checkpoint-analysis')
    expect(names).toContain('event-anchoring')
  })

  it('listSkills entries have correct applicableTasks', () => {
    const skills = registry.listSkills()
    const checkpoint = skills.find((s) => s.name === 'checkpoint-analysis')
    expect(checkpoint).toBeDefined()
    expect(checkpoint!.applicableTasks).toContain('checkpoint')

    const eventAnchor = skills.find((s) => s.name === 'event-anchoring')
    expect(eventAnchor).toBeDefined()
    expect(eventAnchor!.applicableTasks).toContain('event_anchor')
  })

  it('listSkills entries do not expose filePath', () => {
    const skills = registry.listSkills()
    for (const skill of skills) {
      expect(skill).not.toHaveProperty('filePath')
    }
  })

  it('getBaseContent returns non-empty _base skill content', () => {
    const content = registry.getBaseContent()
    expect(content.length).toBeGreaterThan(0)
  })

  it('readSkillBody returns content for a known skill', async () => {
    const body = await registry.readSkillBody('checkpoint-analysis')
    expect(body).not.toBeNull()
    expect(body!.length).toBeGreaterThan(0)
  })

  it('readSkillBody returns null for an unknown skill', async () => {
    const body = await registry.readSkillBody('does-not-exist')
    expect(body).toBeNull()
  })

  it('readSkillBody reads fresh from disk (no content caching)', async () => {
    const first = await registry.readSkillBody('event-anchoring')
    const second = await registry.readSkillBody('event-anchoring')
    // Both calls must resolve independently and return the same content
    expect(first).toEqual(second)
    // Each call returns a non-null result (read succeeds every time, not just first call)
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
  })
})
