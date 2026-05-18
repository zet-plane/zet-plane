import { Injectable } from '@nestjs/common'
import { OrchestratorTaskType } from '@generated/client'
import type { OrchestratorTask, OrchestratorContext } from '../types'
import { SkillRegistry } from '../skill/skill-registry'

export interface AgentPrompt {
  systemPrompt: string
  userMessage: string
}

@Injectable()
export class PromptBuilderService {
  constructor(private readonly skillRegistry: SkillRegistry) {}

  build(task: OrchestratorTask, ctx: OrchestratorContext): AgentPrompt {
    return {
      systemPrompt: this.skillRegistry.getBaseContent(),
      userMessage: this.buildUserMessage(task, ctx),
    }
  }

  private buildUserMessage(task: OrchestratorTask, ctx: OrchestratorContext): string {
    const completionInstruction =
      task.type === OrchestratorTaskType.checkpoint
        ? 'When done, call the `conclude` tool with signalType: decision and evidence referencing the knowledge entry you created. Do NOT call `notify_human`.'
        : 'When done, call the `conclude` tool with your structured summary.'

    const sections: string[] = []

    sections.push(`## Task\nTask type: ${task.type}\nProject: ${ctx.project.id}`)

    const raw = ctx.trigger.raw as Record<string, unknown> | undefined
    const rawText = raw?.text
    const sourceDesc = `${ctx.trigger.sourceType}/${ctx.trigger.sourceId}`
    const eventContent = rawText ? `Content: ${rawText}` : `Raw: ${JSON.stringify(ctx.trigger.raw)}`
    sections.push(`## Event\nSource: ${sourceDesc}\n${eventContent}`)

    if (ctx.candidateNodes.length) {
      const nodeLines = ctx.candidateNodes.map(
        n => `- [${n.title ?? n.id}] id=${n.id} type=${n.type} status=${n.status}`,
      )
      sections.push(`## Candidate nodes\n${nodeLines.join('\n')}`)
    }

    if (ctx.relatedEntries.length) {
      const entryLines = ctx.relatedEntries.map(
        e => `- [${e.title ?? e.id}] id=${e.id} nodeId=${e.nodeId} category=${e.category} status=${e.status}`,
      )
      sections.push(`## Related knowledge\n${entryLines.join('\n')}`)
    }

    if (ctx.recentTaskHistory.length) {
      const historyLines = ctx.recentTaskHistory.map(
        h => `- ${h.type} ${h.status} (${h.createdAt})`,
      )
      sections.push(`## Recent tasks\n${historyLines.join('\n')}`)
    }

    if (ctx.availableSkills.length) {
      const skillLines = ctx.availableSkills.map(
        s => `- ${s.name}: ${s.description} [tasks: ${s.applicableTasks.join(', ')}]`,
      )
      sections.push(`## Available skills\n${skillLines.join('\n')}`)
    }

    sections.push(`Call use_skill first to load your operating instructions, then act.\n${completionInstruction}`)

    return sections.join('\n\n')
  }
}
