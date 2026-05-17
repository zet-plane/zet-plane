import { describe, it, expect, vi } from 'vitest'
import { useSkillTool } from './use-skill.tool'

const makeRegistry = (body: string | null, skills = ['event-anchoring', 'checkpoint-analysis']) => ({
  readSkillBody: vi.fn().mockResolvedValue(body),
  listSkills: vi.fn().mockReturnValue(skills.map((name) => ({ name, description: '', applicableTasks: [] }))),
})

describe('useSkillTool', () => {
  it('has the name "use_skill"', () => {
    const t = useSkillTool(makeRegistry(null) as any)
    expect(t.name).toBe('use_skill')
  })

  it('returns skill body when skill is found', async () => {
    const registry = makeRegistry('# Checkpoint Analysis\n\nDo these steps...')
    const t = useSkillTool(registry as any)
    const result = await t.invoke({ name: 'checkpoint-analysis' })
    expect(result).toContain('Checkpoint Analysis')
    expect(registry.readSkillBody).toHaveBeenCalledWith('checkpoint-analysis')
  })

  it('returns error message listing available skills when skill is not found', async () => {
    const registry = makeRegistry(null)
    const t = useSkillTool(registry as any)
    const result = await t.invoke({ name: 'unknown-skill' })
    expect(result).toContain("Skill 'unknown-skill' not found")
    expect(result).toContain('event-anchoring')
    expect(result).toContain('checkpoint-analysis')
  })

  it('does not throw when skill is not found', async () => {
    const registry = makeRegistry(null)
    const t = useSkillTool(registry as any)
    await expect(t.invoke({ name: 'ghost' })).resolves.not.toThrow()
  })
})
