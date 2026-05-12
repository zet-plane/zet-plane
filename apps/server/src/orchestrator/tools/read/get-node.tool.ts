import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { GraphRepository } from '../../../graph/repository/graph.repository'

export const getNodeTool = (graphRepo: GraphRepository) =>
  tool(
    async ({ nodeId }) => {
      const node = await graphRepo.findNode(nodeId)
      if (!node) return JSON.stringify({ error: `Node ${nodeId} not found` })
      return JSON.stringify({
        id: node.id,
        projectId: node.projectId,
        type: node.type,
        title: node.title,
        description: node.description,
        status: node.status,
        isCheckpoint: node.isCheckpoint,
        checkpointResolution: node.checkpointResolution,
      })
    },
    {
      name: 'get_node',
      description: 'Get details of a specific node by ID',
      schema: z.object({ nodeId: z.string().describe('The node ID to look up') }),
    },
  )
