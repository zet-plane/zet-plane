import { tool } from '@langchain/core/tools'
import { z } from 'zod'

export class WaitingForApprovalSignal extends Error {
  constructor(public readonly reason: string) {
    super('WAITING_FOR_APPROVAL')
  }
}

export const notifyHumanTool = () =>
  tool(
    async ({ reason }) => {
      throw new WaitingForApprovalSignal(reason)
    },
    {
      name: 'notify_human',
      description: 'Call when human judgment is required. Exits the loop and marks task waiting_for_approval.',
      schema: z.object({
        reason: z.string().describe('Why human judgment is needed'),
        context: z.string().describe('Summary of the situation for the human reviewer'),
      }),
    },
  )
