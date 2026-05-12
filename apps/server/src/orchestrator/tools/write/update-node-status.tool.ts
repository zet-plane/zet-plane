import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { ConflictException } from '@nestjs/common'
import { NodeStatus } from '@generated/client'
import { NodeService } from '../../../graph/node/node.service'
import { DomainServiceError } from './create-node.tool'

export const updateNodeStatusTool = (deps: { nodeService: NodeService }) =>
  tool(
    async ({ nodeId, newStatus }) => {
      try {
        const updated = await deps.nodeService.updateStatus(nodeId, newStatus as NodeStatus)
        return JSON.stringify({ nodeId: updated.id, status: updated.status })
      } catch (err) {
        if (err instanceof ConflictException) throw new DomainServiceError(err.message)
        throw err
      }
    },
    {
      name: 'update_node_status',
      description:
        'Update a node status. Cannot be used to set resolution on checkpoints — use notify_human instead.',
      schema: z.object({
        nodeId: z.string(),
        newStatus: z
          .enum(['active', 'blocked', 'completed'])
          .describe('Target status — archived not permitted'),
      }),
    },
  )
