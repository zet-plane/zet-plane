import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { CreatedBy } from '@generated/client'
import { RevisionService } from '../../../knowledge/revision/revision.service'

export const reviseKnowledgeEntryTool = (deps: { revisionService: RevisionService }) =>
  tool(
    async ({ entryId, body, changeNote }) => {
      const revision = await deps.revisionService.appendRevision(entryId, {
        body: { text: body },
        changeNote,
        createdBy: CreatedBy.agent,
      })
      return JSON.stringify({ entryId, revisionVersion: revision.version, action: 'revised' })
    },
    {
      name: 'revise_knowledge_entry',
      description: 'Append a new revision to an existing KnowledgeEntry',
      schema: z.object({
        entryId: z.string(),
        body: z.string().describe('Updated full content'),
        changeNote: z.string().optional().describe('Brief note about what changed'),
      }),
    },
  )
