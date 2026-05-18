import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import { EntryCategory, CreatedBy } from '@generated/client'
import { EntryService } from '../../../knowledge/entry/entry.service'

function charBigrams(s: string): Set<string> {
  const result = new Set<string>()
  const n = s.toLowerCase().replace(/\s/g, '')
  for (let i = 0; i < n.length - 1; i++) result.add(n.slice(i, i + 2))
  return result
}

function titleSimilarity(a: string, b: string): number {
  const ba = charBigrams(a)
  const bb = charBigrams(b)
  if (ba.size === 0 && bb.size === 0) return 1
  const intersection = [...ba].filter((x) => bb.has(x)).length
  const union = new Set([...ba, ...bb]).size
  return union === 0 ? 1 : intersection / union
}

const TITLE_SIMILARITY_THRESHOLD = 0.65

export const createKnowledgeEntryTool = (deps: {
  entryService: EntryService
  projectId: string
}): StructuredToolInterface =>
  tool(
    async ({ nodeId, category, title, body }) => {
      // Dedup: exact title match or high bigram similarity (catches CJK paraphrases of same entry)
      const existing = await deps.entryService.listEntries(deps.projectId, { nodeId })
      const duplicate = existing.find(
        (e) =>
          e.title.toLowerCase() === title.toLowerCase() ||
          titleSimilarity(e.title, title) >= TITLE_SIMILARITY_THRESHOLD,
      )
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

      return JSON.stringify({ entryId: entry.id, action: 'created' })
    },
    {
      name: 'create_knowledge_entry',
      description: 'Create a new KnowledgeEntry anchored to a node. On success, immediately call conclude with the entryId as evidence.',
      schema: z.object({
        nodeId: z.string(),
        category: z.enum(['decision', 'pitfall', 'finding', 'context']),
        title: z.string().describe('Concise, unique title'),
        body: z.string().describe('Full content of the entry'),
      }),
    },
  )
