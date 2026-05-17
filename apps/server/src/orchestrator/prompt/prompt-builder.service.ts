import { Injectable } from '@nestjs/common'
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
      systemPrompt: this.skillRegistry.getSystemPrompt(task.type),
      userMessage: this.buildUserMessage(task, ctx),
    }
  }

  private buildUserMessage(task: OrchestratorTask, ctx: OrchestratorContext): string {
    return [
      `Task type: ${task.type}`,
      `Project: ${ctx.project.id}`,
      `Trigger: ${JSON.stringify(ctx.trigger)}`,
      `Candidate nodes: ${JSON.stringify(ctx.candidateNodes)}`,
      `Related knowledge: ${JSON.stringify(ctx.relatedEntries)}`,
      `Recent task history: ${JSON.stringify(ctx.recentTaskHistory)}`,
      '',
      'Analyze the trigger event and take appropriate actions using the available tools.',
      'When done, call the `conclude` tool with your structured summary.',
    ].join('\n')
  }
}
