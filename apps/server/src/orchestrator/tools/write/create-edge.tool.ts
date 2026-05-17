import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import { ConflictException } from '@nestjs/common'
import { EdgeType, CreatedBy } from '@generated/client'
import { EdgeService } from '../../../graph/edge/edge.service'
import { DomainServiceError } from './create-node.tool'

export const createEdgeTool = (deps: { edgeService: EdgeService; projectId: string }): StructuredToolInterface =>
  tool(
    async ({ fromId, toId, type }) => {
      try {
        const edge = await deps.edgeService.createEdge({
          projectId: deps.projectId,
          fromId,
          toId,
          type: type === 'composition' ? EdgeType.composition : EdgeType.dependency,
          createdBy: CreatedBy.agent,
        })
        return JSON.stringify({ edgeId: edge.id })
      } catch (err) {
        if (err instanceof ConflictException) throw new DomainServiceError(err.message)
        throw err
      }
    },
    {
      name: 'create_edge',
      description: 'Create a composition or dependency edge between two nodes',
      schema: z.object({
        fromId: z.string(),
        toId: z.string(),
        type: z.enum(['composition', 'dependency']),
      }),
    },
  )
