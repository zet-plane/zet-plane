import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { ConflictException } from '@nestjs/common'
import { EdgeType, CreatedBy } from '@generated/client'
import { EdgeService } from '../../../graph/edge/edge.service'
import { DomainServiceError } from './create-node.tool'

export const moveNodeTool = (deps: { edgeService: EdgeService; projectId: string }) =>
  tool(
    async ({ nodeId, newParentId }) => {
      try {
        const edge = await deps.edgeService.createEdge({
          projectId: deps.projectId,
          fromId: newParentId,
          toId: nodeId,
          type: EdgeType.composition,
          createdBy: CreatedBy.agent,
        })
        return JSON.stringify({ edgeId: edge.id, nodeId, newParentId })
      } catch (err) {
        if (err instanceof ConflictException) throw new DomainServiceError(err.message)
        throw err
      }
    },
    {
      name: 'move_node',
      description: 'Move a node to a new parent by creating a composition edge',
      schema: z.object({
        nodeId: z.string().describe('The node to move'),
        newParentId: z.string().describe('The new parent node ID'),
      }),
    },
  )
