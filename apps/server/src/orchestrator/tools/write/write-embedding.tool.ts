import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { SearchService } from '../../../knowledge/search/search.service'

export const writeEmbeddingTool = (deps: { searchService: SearchService }) =>
  tool(
    async ({ entryId, vector }) => {
      await deps.searchService.storeEmbedding(entryId, vector)
      return JSON.stringify({ entryId, indexed: true })
    },
    {
      name: 'write_embedding',
      description: 'Store a computed embedding vector for a KnowledgeEntry',
      schema: z.object({
        entryId: z.string(),
        vector: z.array(z.number()).length(1536),
      }),
    },
  )
