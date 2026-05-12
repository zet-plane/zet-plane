import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import { SearchService } from '../../../knowledge/search/search.service'

export const searchKnowledgeTool = (
  searchService: SearchService,
  queryEmbedding: (text: string) => Promise<number[]>,
): StructuredToolInterface =>
  tool(
    async ({ projectId, query, limit }) => {
      const vector = await queryEmbedding(query)
      const results = await searchService.search(projectId, vector, { limit: limit ?? 5 })
      return JSON.stringify(results)
    },
    {
      name: 'search_knowledge',
      description: 'Vector search for relevant KnowledgeEntries',
      schema: z.object({
        projectId: z.string(),
        query: z.string().describe('Natural language search query'),
        limit: z.number().int().min(1).max(20).optional(),
      }),
    },
  )
