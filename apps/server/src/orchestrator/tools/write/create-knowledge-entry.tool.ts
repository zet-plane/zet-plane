import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import { EntryCategory, CreatedBy, OrchestratorSourceType, OrchestratorTaskType } from '@generated/client'
import { EntryService } from '../../../knowledge/entry/entry.service'
import { OrchestratorTaskPublisher } from '../../ingress/orchestrator-task.publisher'

export const createKnowledgeEntryTool = (deps: {
  entryService: EntryService
  publisher: OrchestratorTaskPublisher
  projectId: string
}): StructuredToolInterface =>
  tool(
    async ({ nodeId, category, title, body }) => {
      // Dedup: check for existing entry with same title on this node
      const existing = await deps.entryService.listEntries(deps.projectId, { nodeId })
      const duplicate = existing.find((e) => e.title.toLowerCase() === title.toLowerCase())
      if (duplicate) {
        return JSON.stringify({
          action: 'duplicate_found',
          existingId: duplicate.id,
          suggestion: 'Use revise_knowledge_entry to update the existing entry instead',
        })
      }

      const entry = await deps.entryService.createEntry({
        projectId: deps.projectId,
        nodeId,
        category: category as EntryCategory,
        title,
        body: { text: body },
        createdBy: CreatedBy.agent,
      })

      // Cascade: trigger embedding task
      await deps.publisher.publish({
        projectId: deps.projectId,
        type: OrchestratorTaskType.embedding,
        sourceType: OrchestratorSourceType.knowledge_event,
        sourceId: entry.id,
        input: { entryId: entry.id },
      })

      return JSON.stringify({ entryId: entry.id, action: 'created' })
    },
    {
      name: 'create_knowledge_entry',
      description: 'Create a new KnowledgeEntry anchored to a node. Automatically triggers embedding.',
      schema: z.object({
        nodeId: z.string(),
        category: z.enum(['decision', 'pitfall', 'finding', 'context']),
        title: z.string().describe('Concise, unique title'),
        body: z.string().describe('Full content of the entry'),
      }),
    },
  )
