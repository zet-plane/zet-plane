import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { SkillRegistry } from '../skill/skill-registry'

export function useSkillTool(skillRegistry: SkillRegistry) {
  return tool(
    async ({ name }: { name: string }) => {
      let body: string | null
      try {
        body = await skillRegistry.readSkillBody(name)
      } catch (err) {
        return `Failed to load skill '${name}': ${(err as Error).message}`
      }
      if (body === null) {
        const available = skillRegistry.listSkills().map((s) => s.name).join(', ')
        return `Skill '${name}' not found. Available: [${available}]`
      }
      return body
    },
    {
      name: 'use_skill',
      description:
        'Load the operating instructions for a named skill. Call before taking any action to get task-specific guidance. Can be called multiple times to combine skills.',
      schema: z.object({
        name: z.string().describe('Name of the skill to load'),
      }),
    },
  )
}
