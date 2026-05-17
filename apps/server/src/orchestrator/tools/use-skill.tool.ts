import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { SkillRegistry } from '../skill/skill-registry'

export function useSkillTool(skillRegistry: SkillRegistry) {
  return tool(
    async ({ name }: { name: string }) => {
      const body = await skillRegistry.readSkillBody(name)
      if (body === null) {
        const available = skillRegistry.listSkills().map((s) => s.name).join(', ')
        return `Skill '${name}' not found. Available: [${available}]`
      }
      return body
    },
    {
      name: 'use_skill',
      description:
        '加载指定 skill 的操作指南。在执行任何实质动作之前调用，获取当前任务的行动规范。可多次调用以组合多个 skill。',
      schema: z.object({
        name: z.string().describe('Name of the skill to load'),
      }),
    },
  )
}
