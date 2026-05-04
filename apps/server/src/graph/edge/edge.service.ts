import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { EdgeType, NodeStatus, CreatedBy } from '@prisma/client'
import type { Edge } from '@prisma/client'
import type { GraphRepository, EdgeCreateData } from '../repository/graph.repository'
import type { CycleDetectorService } from '../cycle/cycle-detector.service'
import type { GraphEventPublisher } from '../events/graph-event.publisher'

@Injectable()
export class EdgeService {
  constructor(
    private readonly repo: GraphRepository,
    private readonly detector: CycleDetectorService,
    private readonly publisher: GraphEventPublisher,
  ) {}

  async createEdge(data: EdgeCreateData): Promise<Edge> {
    const [fromNode, toNode] = await Promise.all([
      this.repo.findNode(data.fromId),
      this.repo.findNode(data.toId),
    ])
    if (!fromNode) throw new NotFoundException(`Node ${data.fromId} not found`)
    if (!toNode) throw new NotFoundException(`Node ${data.toId} not found`)
    if (fromNode.status === NodeStatus.archived) throw new ConflictException('NODE_ARCHIVED')
    if (toNode.status === NodeStatus.archived) throw new ConflictException('NODE_ARCHIVED')
    if (data.type !== EdgeType.reference && fromNode.status === NodeStatus.completed) {
      throw new ConflictException('COMPLETED_NODE_IMMUTABLE')
    }

    const { edge, cyclePath, checkpointNodeId } = await this.repo.createEdge(data, (allEdges) => {
      const path = this.detector.detect(data.fromId, data.toId, allEdges)
      if (!path) return { cyclePath: null, checkpointNodeId: null }
      const nodeId = this.detector.findHighestInDegreeNode(path, allEdges)
      return { cyclePath: path, checkpointNodeId: nodeId }
    })

    if (cyclePath) {
      if (checkpointNodeId) {
        await this.publisher.publish({
          type: 'graph.node.checkpoint_elevated',
          payload: { nodeId: checkpointNodeId, cyclePath, projectId: data.projectId },
        })
      }
    } else {
      await this.publisher.publish({
        type: 'graph.edge.created',
        payload: { edgeId: edge.id, fromId: data.fromId, toId: data.toId, edgeType: data.type, projectId: data.projectId },
      })
    }
    return edge
  }

  async deleteEdge(edgeId: string): Promise<void> {
    const edge = await this.repo.findEdge(edgeId)
    if (!edge) throw new NotFoundException(`Edge ${edgeId} not found`)
    await this.repo.deleteEdge(edgeId)
  }

  async listProjectEdges(projectId: string): Promise<Edge[]> {
    return this.repo.listProjectEdges(projectId)
  }

  async replaceNodeEdges(
    nodeId: string,
    type: EdgeType,
    newFromId: string,
    projectId: string,
    createdBy: CreatedBy,
  ): Promise<Edge> {
    const [node, newParent] = await Promise.all([
      this.repo.findNode(nodeId),
      this.repo.findNode(newFromId),
    ])
    if (!node) throw new NotFoundException(`Node ${nodeId} not found`)
    if (!newParent) throw new NotFoundException(`Node ${newFromId} not found`)
    if (node.status === NodeStatus.archived) throw new ConflictException('NODE_ARCHIVED')
    if (newParent.status === NodeStatus.archived) throw new ConflictException('NODE_ARCHIVED')

    const edge = await this.repo.replaceNodeEdges(nodeId, type, newFromId, projectId, createdBy)
    await this.publisher.publish({
      type: 'graph.edge.created',
      payload: { edgeId: edge.id, fromId: newFromId, toId: nodeId, edgeType: type, projectId },
    })
    return edge
  }
}
