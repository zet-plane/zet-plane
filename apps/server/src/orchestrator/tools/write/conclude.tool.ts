import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import { SKIP_SIGNAL_KEY } from './skip.tool'
import { SignalTypeSchema } from '../../types'

export const CONCLUDE_SIGNAL_VALUE = 'conclude'

export const concludeTool = (): StructuredToolInterface =>
  tool(
    async ({ summary, signalType, confidence, evidence }) => {
      return JSON.stringify({
        [SKIP_SIGNAL_KEY]: {
          kind: 'terminal',
          type: CONCLUDE_SIGNAL_VALUE,
          payload: {
            summary,
            signalType,
            confidence,
            evidence: evidence ?? [],
          },
        },
      })
    },
    {
      name: 'conclude',
      description: 'Call when all actions are complete. Exits the loop and records your structured insight.',
      schema: z.object({
        summary: z.string().describe('One sentence describing what you did'),
        signalType: SignalTypeSchema.describe('progress | blocker | decision | risk | learning | noise'),
        confidence: z.number().min(0).max(1).describe('Confidence in the outcome, 0–1'),
        evidence: z
          .array(
            z.object({
              sourceType: z.enum(['node', 'knowledge_entry', 'task']),
              sourceId: z.string(),
              note: z.string(),
            }),
          )
          .optional()
          .describe('Supporting evidence for the insight'),
      }),
    },
  )
