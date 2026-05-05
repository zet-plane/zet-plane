import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { NodeStatus, CheckpointResolution } from '@generated/client'
import type { Node, Edge } from '@generated/client'
import { GraphRepository, HasCompositionChildrenError, AmbiguousParentError } from '../repository/graph.repository'
import type { NodeCreateData, DeleteStrategy } from '../repository/graph.repository'
import { GraphEventPublisher } from '../events/graph-event.publisher'

@Injectable()
export class NodeService {
  constructor(
    private readonly repo: GraphRepository,
    private readonly publisher: GraphEventPublisher,
  ) {}

  async initProjectRoot(projectId: string): Promise<Node> {
    return this.repo.initProjectRoot(projectId)
  }

  async createNode(data: NodeCreateData): Promise<Node> {
    return this.repo.createNode(data)
  }

  async listProjectNodes(projectId: string): Promise<Node[]> {
    return this.repo.listProjectNodes(projectId)
  }

  async getSubgraph(nodeId: string): Promise<{ nodes: Node[]; edges: Edge[] }> {
    const node = await this.repo.findNode(nodeId)
    if (!node) throw new NotFoundException(`Node ${nodeId} not found`)
    return this.repo.getSubgraph(nodeId)
  }

  async updateNode(id: string, data: Partial<Pick<Node, 'title' | 'description' | 'isCheckpoint'>>): Promise<Node> {
    const node = await this.requireNode(id)
    if (node.status === NodeStatus.archived) {
      throw new ConflictException('NODE_ARCHIVED')
    }
    return this.repo.updateNode(id, data)
  }

  async updateStatus(nodeId: string, newStatus: NodeStatus): Promise<Node> {
    const node = await this.requireNode(nodeId)
    await this.validateStatusTransition(node, newStatus)
    const updated = await this.repo.updateNode(nodeId, { status: newStatus })
    await this.publisher.publish({
      type: 'graph.node.status_changed',
      payload: { nodeId, status: newStatus, previousStatus: node.status, projectId: node.projectId },
    })
    return updated
  }

  async resolveCheckpoint(nodeId: string, resolution: 'continue' | 'loop'): Promise<Node> {
    const node = await this.requireNode(nodeId)
    if (node.status !== NodeStatus.blocked || !node.isCheckpoint) {
      throw new ConflictException('Node must be blocked and isCheckpoint=true to resolve')
    }
    const updated = await this.repo.updateNode(nodeId, {
      checkpointResolution: resolution === 'continue' ? CheckpointResolution.continue : CheckpointResolution.loop,
      status: NodeStatus.active,
    })
    await this.publisher.publish({
      type: 'graph.checkpoint.resolved',
      payload: { nodeId, resolution, projectId: node.projectId },
    })
    return updated
  }

  async deleteNode(nodeId: string, strategy: DeleteStrategy = 'block'): Promise<{ affectedNodeIds: string[] }> {
    const node = await this.requireNode(nodeId)
    if (node.isProjectRoot) throw new ConflictException('Cannot delete project root node')
    try {
      const affectedNodeIds = await this.repo.deleteNodeWithStrategy(nodeId, node.projectId, strategy)
      await this.publisher.publish({
        type: 'graph.node.deleted',
        payload: { nodeId, strategy, affectedNodeIds, projectId: node.projectId },
      })
      return { affectedNodeIds }
    } catch (err) {
      if (err instanceof HasCompositionChildrenError) {
        throw new ConflictException({ error: 'HAS_ACTIVE_CHILDREN', affectedNodes: err.affectedNodes })
      }
      if (err instanceof AmbiguousParentError) {
        throw new ConflictException({ error: 'AMBIGUOUS_PARENT', parents: err.parents })
      }
      throw err
    }
  }

  private async requireNode(id: string): Promise<Node> {
    const node = await this.repo.findNode(id)
    if (!node) throw new NotFoundException(`Node ${id} not found`)
    return node
  }

  private async validateStatusTransition(node: Node, newStatus: NodeStatus): Promise<void> {
    if (node.status === NodeStatus.archived) {
      throw new ConflictException('NODE_ARCHIVED')
    }
    if (newStatus === NodeStatus.active && node.status === NodeStatus.blocked) {
      throw new ConflictException('USE_RESOLUTION_API')
    }
    // Spec §4 rule 6: completed nodes are near-immutable — the only allowed
    // transition out of completed is to archived (explicit retirement).
    // All other status changes are rejected to preserve audit integrity.
    if (node.status === NodeStatus.completed && newStatus !== NodeStatus.archived) {
      throw new ConflictException('NODE_COMPLETED')
    }
    if (newStatus === NodeStatus.completed) {
      if (node.status === NodeStatus.blocked) {
        throw new ConflictException('UNRESOLVED_CHECKPOINT')
      }
      const children = await this.repo.findCompositionChildren(node.id)
      const incomplete = children.filter(c => c.status !== NodeStatus.completed && c.status !== NodeStatus.archived)
      if (incomplete.length > 0) {
        throw new ConflictException('INCOMPLETE_CHILDREN')
      }
    }
    if (newStatus === NodeStatus.active) {
      const deps = await this.repo.findDependencyTargets(node.id)
      // Mirror the children-completion check: archived deps are retired and
      // no longer block activation, just like archived composition children
      // do not block a parent from completing.
      const unresolved = deps.filter(d => d.status !== NodeStatus.completed && d.status !== NodeStatus.archived)
      if (unresolved.length > 0) {
        throw new ConflictException('UNRESOLVED_DEPENDENCY')
      }
    }
  }
}
