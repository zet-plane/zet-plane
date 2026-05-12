import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { GraphContextReader } from '../../context/graph-context.reader'

export const searchNodesTool = (graphReader: GraphContextReader) =>
  tool(
    async ({ keyword, status, projectId }) => {
      const nodes = await graphReader.getCandidateNodes(projectId)
      const kw = keyword?.toLowerCase()
      const filtered = nodes.filter((n) => {
        const matchesKw = !kw || n.title.toLowerCase().includes(kw) || n.description?.toLowerCase().includes(kw)
        const matchesStatus = !status || n.status === status
        return matchesKw && matchesStatus
      })
      return JSON.stringify(filtered.slice(0, 20))
    },
    {
      name: 'search_nodes',
      description: 'Search candidate nodes by keyword and/or status',
      schema: z.object({
        projectId: z.string(),
        keyword: z.string().optional().describe('Text to match in title or description'),
        status: z.enum(['active', 'blocked', 'completed', 'archived']).optional(),
      }),
    },
  )
