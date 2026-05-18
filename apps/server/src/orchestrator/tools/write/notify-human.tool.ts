import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'

// DEPRECATED: notify_human / WaitingForApprovalSignal is no longer used by checkpoint tasks.
// Checkpoint wait semantics belong to the gate layer (blocked node with isCheckpoint=true),
// not the task. If a genuine task-level pause/resume is needed in the future, model it
// separately (e.g. pause_for_input) rather than reusing this mechanism.
export class WaitingForApprovalSignal extends Error {
  constructor(
    public readonly reason: string,
    public readonly context?: string,
  ) {
    super('WAITING_FOR_APPROVAL')
  }
}

export const NOTIFY_HUMAN_SIGNAL_VALUE = 'notify_human'

export const notifyHumanTool = (): StructuredToolInterface =>
  tool(
    async ({ reason, context }) => {
      // Return a sentinel instead of throwing — LangGraph's ToolNode swallows exceptions.
      // runAgentLoop detects this sentinel after graph.invoke() and throws WaitingForApprovalSignal.
      return JSON.stringify({
        __zplane_signal: {
          kind: 'terminal',
          type: NOTIFY_HUMAN_SIGNAL_VALUE,
          payload: { reason, context },
        },
      })
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
