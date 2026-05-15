import { Injectable, NotFoundException, ConflictException, BadRequestException, forwardRef, Inject } from '@nestjs/common'
import { ConflictDomainException, NotFoundDomainException } from '../common/exceptions/domain-exception'
import { NodeStatus, CheckpointResolution, EdgeType, CreatedBy, NodeType } from '@generated/client'
import type { Node, Edge } from '@generated/client'
import type { PrismaTx } from '../prisma/prisma.service'
import { GraphRepository, HasCompositionChildrenError, AmbiguousParentError } from './repository/graph.repository'
import type { NodeCreateData, EdgeCreateData, DeleteStrategy } from './repository/graph.repository'
import { CycleDetectorService } from './cycle/cycle-detector.service'
import { GraphEventPublisher } from './events/graph-event.publisher'
import { ProjectService } from '../project/project.service'

@Injectable()
export class GraphService {
  constructor(
    private readonly repo: GraphRepository,
    private readonly detector: CycleDetectorService,
    private readonly publisher: GraphEventPublisher,
    @Inject(forwardRef(() => ProjectService)) private readonly projectService: ProjectService,
  ) {}

  // ── Internal ────────────────────────────────────────────────────────────

  async initProjectGraphInternal(projectId: string, tx: PrismaTx): Promise<{ rootNode: Node; stagingNode: Node }> {
    return this.repo.initProjectGraphTx(projectId, tx)
  }

  // ── Nodes ────────────────────────────────────────────────────────────────

  /** Creates a node and atomically attaches it to a structural parent via a composition edge.
   *  Pass `parentNodeId` to specify the attachment point; omit it to fall back
   *  to project root. Non-structural dependency edges must be created separately. */
  async createNode(data: NodeCreateData): Promise<Node> {
    await this.projectService.assertExists(data.projectId)
    if ((data as any).isStagingRoot) throw new ConflictException('STAGING_NODE_SYSTEM_MANAGED')
    if (data.edgeType !== undefined && data.edgeType !== EdgeType.composition) {
      throw new BadRequestException('NODE_PARENT_EDGE_MUST_BE_COMPOSITION')
    }
    if (data.parentNodeId) {
      const parent = await this.repo.findNode(data.parentNodeId)
      if (!parent || parent.projectId !== data.projectId) {
        throw new NotFoundDomainException('PARENT_NODE_NOT_FOUND', `Parent node ${data.parentNodeId} not found`)
      }
      if (parent.isStagingRoot) {
        throw new ConflictDomainException('STAGING_NODE_PROTECTED', 'Staging node is protected')
      }
      if (parent.status === NodeStatus.archived) throw new ConflictDomainException('PARENT_NODE_ARCHIVED', 'Parent node is archived')
      if (parent.status === NodeStatus.completed) throw new ConflictDomainException('PARENT_NODE_COMPLETED', 'Parent node is completed')
    }
    return this.repo.createNode(data)
  }

  async findStagingNode(projectId: string): Promise<Node | null> {
    await this.projectService.assertExists(projectId)
    return this.repo.findStagingNode(projectId)
  }

  async listProjectNodes(projectId: string): Promise<Node[]> {
    await this.projectService.assertExists(projectId)
    return this.repo.listProjectNodes(projectId)
  }

  async getSubgraph(nodeId: string): Promise<{ nodes: Node[]; edges: Edge[] }> {
    const node = await this.repo.findNode(nodeId)
    if (!node) throw new NotFoundException(`Node ${nodeId} not found`)
    return this.repo.getSubgraph(nodeId)
  }

  async updateNode(id: string, data: Partial<Pick<Node, 'title' | 'description' | 'isCheckpoint'>>): Promise<Node> {
    const node = await this.requireNode(id)
    this.assertNotProjectRoot(node)
    this.assertNotStagingRoot(node)
    await this.projectService.assertExists(node.projectId)
    if (node.status === NodeStatus.archived) throw new ConflictException('NODE_ARCHIVED')
    return this.repo.updateNode(id, data)
  }

  async updateStatus(nodeId: string, newStatus: NodeStatus): Promise<Node> {
    const node = await this.requireNode(nodeId)
    this.assertNotProjectRoot(node)
    await this.projectService.assertExists(node.projectId)
    if (node.isStagingRoot && (newStatus === NodeStatus.completed || newStatus === NodeStatus.archived)) {
      throw new ConflictException('STAGING_NODE_PROTECTED')
    }
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
    this.assertNotProjectRoot(node)
    await this.projectService.assertExists(node.projectId)
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
    await this.projectService.assertExists(node.projectId)
    this.assertNotProjectRoot(node)
    this.assertNotStagingRoot(node)
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

  // ── Edges ────────────────────────────────────────────────────────────────

  async createEdge(data: EdgeCreateData): Promise<Edge> {
    if (data.fromId === data.toId) throw new BadRequestException('SELF_LOOP_NOT_ALLOWED')
    await this.projectService.assertExists(data.projectId)
    const root = await this.repo.findProjectRoot(data.projectId)
    if (!root) throw new ConflictException('PROJECT_NOT_INITIALIZED')

    const [fromNode, toNode] = await Promise.all([
      this.repo.findNode(data.fromId),
      this.repo.findNode(data.toId),
    ])
    if (!fromNode || fromNode.projectId !== data.projectId) throw new NotFoundException(`Node ${data.fromId} not found`)
    if (!toNode || toNode.projectId !== data.projectId) throw new NotFoundException(`Node ${data.toId} not found`)
    if (fromNode.status === NodeStatus.archived) throw new ConflictException('NODE_ARCHIVED')
    if (toNode.status === NodeStatus.archived) throw new ConflictException('NODE_ARCHIVED')
    if (fromNode.status === NodeStatus.completed) throw new ConflictException('COMPLETED_NODE_IMMUTABLE')
    this.assertStagingAreaStructureUnchanged(fromNode)
    this.assertStagingAreaStructureUnchanged(toNode)

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

  async listProjectEdges(projectId: string): Promise<Edge[]> {
    await this.projectService.assertExists(projectId)
    return this.repo.listProjectEdges(projectId)
  }

  async deleteEdge(edgeId: string): Promise<void> {
    const edge = await this.repo.findEdge(edgeId)
    if (!edge) throw new NotFoundException(`Edge ${edgeId} not found`)
    await this.projectService.assertExists(edge.projectId)
    await this.repo.deleteEdge(edgeId)
  }

  async replaceNodeEdges(
    nodeId: string,
    type: EdgeType,
    newFromId: string,
    projectId: string,
    createdBy: CreatedBy,
  ): Promise<Edge> {
    await this.projectService.assertExists(projectId)
    const root = await this.repo.findProjectRoot(projectId)
    if (!root) throw new ConflictException('PROJECT_NOT_INITIALIZED')

    const [node, newParent] = await Promise.all([
      this.repo.findNode(nodeId),
      this.repo.findNode(newFromId),
    ])
    if (!node || node.projectId !== projectId) throw new NotFoundException(`Node ${nodeId} not found`)
    if (!newParent || newParent.projectId !== projectId) throw new NotFoundException(`Node ${newFromId} not found`)
    if (node.status === NodeStatus.archived) throw new ConflictException('NODE_ARCHIVED')
    if (newParent.status === NodeStatus.archived) throw new ConflictException('NODE_ARCHIVED')
    this.assertStagingAreaStructureUnchanged(node)
    this.assertStagingAreaStructureUnchanged(newParent)

    const { edge, cyclePath, checkpointNodeId } = await this.repo.replaceNodeEdges(
      nodeId, type, newFromId, projectId, createdBy,
      (allEdges) => {
        const path = this.detector.detect(newFromId, nodeId, allEdges)
        if (!path) return { cyclePath: null, checkpointNodeId: null }
        const cpId = this.detector.findHighestInDegreeNode(path, allEdges)
        return { cyclePath: path, checkpointNodeId: cpId }
      },
    )

    if (cyclePath) {
      if (checkpointNodeId) {
        await this.publisher.publish({
          type: 'graph.node.checkpoint_elevated',
          payload: { nodeId: checkpointNodeId, cyclePath, projectId },
        })
      }
    } else {
      await this.publisher.publish({
        type: 'graph.edge.created',
        payload: { edgeId: edge.id, fromId: newFromId, toId: nodeId, edgeType: type, projectId },
      })
    }
    return edge
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async requireNode(id: string): Promise<Node> {
    const node = await this.repo.findNode(id)
    if (!node) throw new NotFoundException(`Node ${id} not found`)
    return node
  }

  private assertNotProjectRoot(node: Node): void {
    if (node.isProjectRoot) throw new ConflictException('Cannot modify project root node')
  }

  private assertNotStagingRoot(node: Node): void {
    if (node.isStagingRoot) throw new ConflictException('STAGING_NODE_PROTECTED')
  }

  private assertStagingAreaStructureUnchanged(node: Node): void {
    if (node.isStagingRoot) throw new ConflictException('STAGING_NODE_STRUCTURE_PROTECTED')
  }

  private async validateStatusTransition(node: Node, newStatus: NodeStatus): Promise<void> {
    if (node.status === NodeStatus.archived) throw new ConflictException('NODE_ARCHIVED')
    if (newStatus === NodeStatus.active && node.status === NodeStatus.blocked) {
      throw new ConflictException('USE_RESOLUTION_API')
    }
    if (node.status === NodeStatus.completed && newStatus !== NodeStatus.archived) {
      throw new ConflictException('NODE_COMPLETED')
    }
    if (newStatus === NodeStatus.completed) {
      if (node.status === NodeStatus.blocked) throw new ConflictException('UNRESOLVED_CHECKPOINT')
      const children = await this.repo.findCompositionChildren(node.id)
      const incomplete = children.filter(c => c.status !== NodeStatus.completed && c.status !== NodeStatus.archived)
      if (incomplete.length > 0) throw new ConflictException('INCOMPLETE_CHILDREN')
    }
    if (newStatus === NodeStatus.active) {
      const deps = await this.repo.findDependencyTargets(node.id)
      const unresolved = deps.filter(d => d.status !== NodeStatus.completed && d.status !== NodeStatus.archived)
      if (unresolved.length > 0) throw new ConflictException('UNRESOLVED_DEPENDENCY')
    }
  }
}
