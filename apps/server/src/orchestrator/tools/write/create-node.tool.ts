import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import { ConflictException } from '@nestjs/common'
import { NodeType, CreatedBy } from '@generated/client'
import { NodeService } from '../../../graph/node/node.service'

export class DomainServiceError extends Error {
  constructor(public readonly reason: string) {
    super(`DOMAIN_SERVICE_ERROR: ${reason}`)
  }
}

export const createNodeTool = (deps: { nodeService: NodeService; projectId: string }): StructuredToolInterface =>
  tool(
    async ({ title, description }) => {
      // Idempotent by title: if a node with the same title already exists in this project,
      // return it instead of creating a duplicate (prevents agent loop double-creation).
      const existing = await deps.nodeService.listProjectNodes(deps.projectId)
      const match = existing.find(n => n.title === title)
      if (match) {
        return JSON.stringify({ nodeId: match.id, title: match.title, alreadyExists: true })
      }

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
