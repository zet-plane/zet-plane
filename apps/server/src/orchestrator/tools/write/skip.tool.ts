import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'

export class SkipSignal extends Error {
  constructor(public readonly reason: string) {
    super('SKIP')
  }
}

export const SKIP_SIGNAL_KEY = '__zplane_signal'
export const SKIP_SIGNAL_VALUE = 'skip'

export const skipTool = (): StructuredToolInterface =>
  tool(
    async ({ reason }) => {
      // Return a sentinel instead of throwing — LangGraph's ToolNode swallows exceptions.
      // runAgentLoop detects this sentinel after graph.invoke() and throws SkipSignal.
      return JSON.stringify({
        [SKIP_SIGNAL_KEY]: {
          kind: 'terminal',
          type: SKIP_SIGNAL_VALUE,
          payload: { reason },
        },
      })
    },
    {
      name: 'skip',
      description: 'Call when the event is noise with no project relevance. Exits the loop cleanly.',
      schema: z.object({
        reason: z.string().describe('Why this event is noise and should be skipped'),
      }),
    },
  )
