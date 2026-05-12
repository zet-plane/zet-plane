import { tool } from '@langchain/core/tools'
import { z } from 'zod'

export class SkipSignal extends Error {
  constructor(public readonly reason: string) {
    super('SKIP')
  }
}

export const skipTool = () =>
  tool(
    async ({ reason }) => {
      throw new SkipSignal(reason)
    },
    {
      name: 'skip',
      description: 'Call when the event is noise with no project relevance. Exits the loop cleanly.',
      schema: z.object({
        reason: z.string().describe('Why this event is noise and should be skipped'),
      }),
    },
  )
