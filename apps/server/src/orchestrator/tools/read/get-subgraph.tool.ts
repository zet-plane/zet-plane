import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { GraphContextReader } from '../../context/graph-context.reader'

export const getSubgraphTool = (graphReader: GraphContextReader) =>
  tool(
    async ({ nodeId }) => {
      const subgraph = await graphReader.getSubgraph(nodeId)
      return JSON.stringify(subgraph)
    },
    {
      name: 'get_subgraph',
      description: 'Get a node and all its composition descendants',
      schema: z.object({ nodeId: z.string().describe('Root node ID') }),
    },
  )
