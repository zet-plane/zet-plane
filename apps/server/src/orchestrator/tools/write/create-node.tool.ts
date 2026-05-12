import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { ConflictException } from '@nestjs/common'
import { NodeType, CreatedBy } from '@generated/client'
import { NodeService } from '../../../graph/node/node.service'

export class DomainServiceError extends Error {
  constructor(public readonly reason: string) {
    super(`DOMAIN_SERVICE_ERROR: ${reason}`)
  }
}

export const createNodeTool = (deps: { nodeService: NodeService; projectId: string }) =>
  tool(
    async ({ title, description }) => {
      try {
        const node = await deps.nodeService.createNode({
          projectId: deps.projectId,
          type: NodeType.growth,
          title,
          description,
          createdBy: CreatedBy.agent,
        })
        return JSON.stringify({ nodeId: node.id, title: node.title })
      } catch (err) {
        if (err instanceof ConflictException) {
          throw new DomainServiceError(err.message)
        }
        throw err
      }
    },
    {
      name: 'create_node',
      description: 'Create a new growth node. Only use when a new theme clearly warrants its own node.',
      schema: z.object({
        title: z.string().describe('Concise node title'),
        description: z.string().optional().describe('One-sentence description'),
      }),
    },
  )
