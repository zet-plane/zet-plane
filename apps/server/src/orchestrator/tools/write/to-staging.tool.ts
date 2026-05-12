import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { EntryCategory, CreatedBy } from '@generated/client'
import { EntryService } from '../../../knowledge/entry/entry.service'

export const toStagingTool = (deps: { entryService: EntryService; projectId: string; stagingNodeId: string }) =>
  tool(
    async ({ summary, rationale }) => {
      const entry = await deps.entryService.createEntry({
        projectId: deps.projectId,
        nodeId: deps.stagingNodeId,
        category: EntryCategory.context,
        title: `Staging: ${summary.slice(0, 80)}`,
        body: { text: rationale, isStagingEntry: true },
        createdBy: CreatedBy.agent,
      })
      return JSON.stringify({ stagingEntryId: entry.id, action: 'to_staging' })
    },
    {
      name: 'to_staging',
      description: 'Route a meaningful but unanchored event to the Staging Graph for later review',
      schema: z.object({
        summary: z.string().describe('One-line summary of the event'),
        rationale: z.string().describe('Why this event matters and what anchor might exist later'),
      }),
    },
  )
