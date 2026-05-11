import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { ConflictDomainException, NotFoundDomainException } from '../common/exceptions'
import { GraphService } from './graph.service'
import { EdgeType, NodeStatus, NodeType, CreatedBy, CheckpointResolution, NodeRole } from '@generated/client'
import type { Node } from '@generated/client'
import { HasCompositionChildrenError, AmbiguousParentError } from './repository/graph.repository'

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: 'n1',
    projectId: 'p1',
    isProjectRoot: false,
    role: NodeRole.regular,
    type: NodeType.scaffold,
    title: 'Test Node',
    description: null,
    status: NodeStatus.active,
    isCheckpoint: false,
    checkpointResolution: null,
    createdBy: CreatedBy.human,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('GraphService', () => {
  let service: GraphService
  let mockRepo: any
  let mockDetector: any
  let mockPublisher: any
  let mockProjectService: any

  beforeEach(() => {
    mockRepo = {
      findNode: vi.fn(),
      findEdge: vi.fn(),
      findProjectRoot: vi.fn().mockResolvedValue(makeNode({ id: 'root', isProjectRoot: true })),
      createNode: vi.fn(),
      updateNode: vi.fn(),
      listProjectNodes: vi.fn(),
      getSubgraph: vi.fn(),
      findCompositionChildren: vi.fn(),
      findDependencyTargets: vi.fn(),
      deleteNodeWithStrategy: vi.fn(),
      initProjectGraphTx: vi.fn(),
      listProjectEdges: vi.fn(),
      findStagingNode: vi.fn(),
      createEdge: vi.fn(),
      deleteEdge: vi.fn(),
      replaceNodeEdges: vi.fn(),
    }
    mockDetector = {
      detect: vi.fn().mockReturnValue(null),
      findHighestInDegreeNode: vi.fn(),
    }
    mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    mockProjectService = { assertExists: vi.fn().mockResolvedValue(undefined) }
    service = new GraphService(mockRepo, mockDetector, mockPublisher, mockProjectService as any)
  })

  // ── createNode ────────────────────────────────────────────────────────

  describe('createNode', () => {
    it('throws 409 when trying to create staging node through public createNode', async () => {
      await expect(
        service.createNode({ projectId: 'p1', type: NodeType.staging, title: '[Staging Area]', createdBy: CreatedBy.human })
      ).rejects.toThrow(ConflictException)

      expect(mockRepo.createNode).not.toHaveBeenCalled()
    })

    it('delegates to repo.createNode', async () => {
      const data = { projectId: 'p1', type: NodeType.scaffold, title: 'New Node', createdBy: CreatedBy.human }
      const created = makeNode({ id: 'n2', title: 'New Node' })
      mockRepo.createNode.mockResolvedValue(created)
      const result = await service.createNode(data)
      expect(mockRepo.createNode).toHaveBeenCalledWith(data)
      expect(result).toEqual(created)
    })

    it('throws 400 when parent attachment edgeType is dependency', async () => {
      await expect(
        service.createNode({ projectId: 'p1', type: NodeType.scaffold, title: 'x', createdBy: CreatedBy.human, edgeType: EdgeType.dependency })
      ).rejects.toThrow(BadRequestException)

      expect(mockRepo.createNode).not.toHaveBeenCalled()
    })

    it('throws 404 when parentNodeId does not exist', async () => {
      mockRepo.findNode.mockResolvedValue(null)
      await expect(
        service.createNode({ projectId: 'p1', type: NodeType.scaffold, title: 'x', createdBy: CreatedBy.human, parentNodeId: 'missing' })
      ).rejects.toThrow(NotFoundDomainException)
    })

    it('throws 404 when parentNodeId belongs to a different project', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ id: 'other', projectId: 'p2' }))
      await expect(
        service.createNode({ projectId: 'p1', type: NodeType.scaffold, title: 'x', createdBy: CreatedBy.human, parentNodeId: 'other' })
      ).rejects.toThrow(NotFoundDomainException)
    })

    it('allows parentNodeId to explicitly target the project root', async () => {
      const data = { projectId: 'p1', type: NodeType.scaffold, title: 'x', createdBy: CreatedBy.human, parentNodeId: 'root' }
      const created = makeNode({ id: 'n2', title: 'x' })
      mockRepo.findNode.mockResolvedValue(makeNode({ id: 'root', isProjectRoot: true, role: NodeRole.project_root, projectId: 'p1' }))
      mockRepo.createNode.mockResolvedValue(created)

      await expect(service.createNode(data)).resolves.toEqual(created)

      expect(mockRepo.createNode).toHaveBeenCalledWith(data)
    })

    it('throws 409 when parent is staging root', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ id: 'staging', role: NodeRole.staging_root, type: NodeType.staging, projectId: 'p1' }))
      await expect(
        service.createNode({ projectId: 'p1', type: NodeType.scaffold, title: 'x', createdBy: CreatedBy.human, parentNodeId: 'staging' })
      ).rejects.toThrow(ConflictException)
    })

    it('throws PARENT_NODE_ARCHIVED when parent is archived', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.archived, projectId: 'p1' }))
      await expect(
        service.createNode({ projectId: 'p1', type: NodeType.scaffold, title: 'x', createdBy: CreatedBy.human, parentNodeId: 'n1' })
      ).rejects.toThrow(ConflictDomainException)
    })

    it('throws PARENT_NODE_COMPLETED when parent is completed', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.completed, projectId: 'p1' }))
      await expect(
        service.createNode({ projectId: 'p1', type: NodeType.scaffold, title: 'x', createdBy: CreatedBy.human, parentNodeId: 'n1' })
      ).rejects.toThrow(ConflictDomainException)
    })
  })

  // ── updateStatus ──────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('throws 409 when completing or archiving a staging root node', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ role: NodeRole.staging_root }))

      await expect(service.updateStatus('staging', NodeStatus.completed)).rejects.toThrow(ConflictException)
      await expect(service.updateStatus('staging', NodeStatus.archived)).rejects.toThrow(ConflictException)
    })

    it('throws 409 when node is archived', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.archived }))
      await expect(service.updateStatus('n1', NodeStatus.active)).rejects.toThrow(ConflictException)
    })

    it('throws 409 when setting completed on blocked node', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.blocked, isCheckpoint: true }))
      await expect(service.updateStatus('n1', NodeStatus.completed)).rejects.toThrow(ConflictException)
    })

    it('throws 409 when setting completed with incomplete composition children', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.active }))
      mockRepo.findCompositionChildren.mockResolvedValue([makeNode({ id: 'child1', status: NodeStatus.active })])
      await expect(service.updateStatus('n1', NodeStatus.completed)).rejects.toThrow(ConflictException)
    })

    it('allows completed when all composition children are completed', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.active }))
      mockRepo.findCompositionChildren.mockResolvedValue([makeNode({ id: 'child1', status: NodeStatus.completed })])
      mockRepo.updateNode.mockResolvedValue(makeNode({ status: NodeStatus.completed }))
      await service.updateStatus('n1', NodeStatus.completed)
      expect(mockRepo.updateNode).toHaveBeenCalledWith('n1', { status: NodeStatus.completed })
      expect(mockPublisher.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'graph.node.status_changed' }))
    })

    it('throws 409 when setting active with unresolved dependency', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.active }))
      mockRepo.findDependencyTargets.mockResolvedValue([makeNode({ id: 'dep1', status: NodeStatus.active })])
      await expect(service.updateStatus('n1', NodeStatus.active)).rejects.toThrow(ConflictException)
    })

    it('does NOT block activation when dependency is archived', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.active }))
      mockRepo.findDependencyTargets.mockResolvedValue([makeNode({ id: 'dep1', status: NodeStatus.archived })])
      mockRepo.updateNode.mockResolvedValue(makeNode({ status: NodeStatus.active }))
      await expect(service.updateStatus('n1', NodeStatus.active)).resolves.not.toThrow()
    })

    it('throws 409 when setting active directly on blocked node', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.blocked, isCheckpoint: true }))
      mockRepo.findDependencyTargets.mockResolvedValue([])
      await expect(service.updateStatus('n1', NodeStatus.active)).rejects.toThrow(ConflictException)
    })

    it('publishes status_changed job on successful update', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.active }))
      mockRepo.findCompositionChildren.mockResolvedValue([])
      mockRepo.updateNode.mockResolvedValue(makeNode({ status: NodeStatus.completed }))
      await service.updateStatus('n1', NodeStatus.completed)
      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'graph.node.status_changed',
        payload: { nodeId: 'n1', status: NodeStatus.completed, previousStatus: NodeStatus.active, projectId: 'p1' },
      })
    })

    it('throws 409 when reverting completed node to active', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.completed }))
      await expect(service.updateStatus('n1', NodeStatus.active)).rejects.toThrow(ConflictException)
    })

    it('throws 409 when node is project root', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ isProjectRoot: true }))
      await expect(service.updateStatus('n1', NodeStatus.active)).rejects.toThrow(ConflictException)
    })
  })

  // ── updateNode ────────────────────────────────────────────────────────

  describe('updateNode', () => {
    it('throws 409 when node is project root', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ isProjectRoot: true }))
      await expect(service.updateNode('n1', { title: 'x' })).rejects.toThrow(ConflictException)
    })
  })

  // ── resolveCheckpoint ─────────────────────────────────────────────────

  describe('resolveCheckpoint', () => {
    it('throws 409 when node is project root', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ isProjectRoot: true }))
      await expect(service.resolveCheckpoint('n1', 'continue')).rejects.toThrow(ConflictException)
    })

    it('throws 409 when node is not blocked', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.active, isCheckpoint: true }))
      await expect(service.resolveCheckpoint('n1', 'continue')).rejects.toThrow(ConflictException)
    })

    it('throws 409 when node is not a checkpoint', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.blocked, isCheckpoint: false }))
      await expect(service.resolveCheckpoint('n1', 'loop')).rejects.toThrow(ConflictException)
    })

    it('sets status to active and publishes resolved job', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.blocked, isCheckpoint: true }))
      mockRepo.updateNode.mockResolvedValue(makeNode({ status: NodeStatus.active }))
      await service.resolveCheckpoint('n1', 'continue')
      expect(mockRepo.updateNode).toHaveBeenCalledWith('n1', {
        checkpointResolution: CheckpointResolution.continue,
        status: NodeStatus.active,
      })
      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'graph.checkpoint.resolved',
        payload: { nodeId: 'n1', resolution: 'continue', projectId: 'p1' },
      })
    })
  })

  // ── deleteNode ────────────────────────────────────────────────────────

  describe('deleteNode', () => {
    it('throws 409 when node is staging root', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ role: NodeRole.staging_root }))

      await expect(service.deleteNode('staging', 'cascade')).rejects.toThrow(ConflictException)

      expect(mockRepo.deleteNodeWithStrategy).not.toHaveBeenCalled()
    })

    it('throws 409 when node is project root', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ isProjectRoot: true }))
      await expect(service.deleteNode('n1', 'cascade')).rejects.toThrow(ConflictException)
    })

    it('publishes graph.node.deleted with affectedNodeIds', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ id: 'n1', projectId: 'p1' }))
      mockRepo.deleteNodeWithStrategy.mockResolvedValue(['child1', 'child2'])
      const result = await service.deleteNode('n1', 'cascade')
      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'graph.node.deleted',
        payload: { nodeId: 'n1', strategy: 'cascade', affectedNodeIds: ['child1', 'child2'], projectId: 'p1' },
      })
      expect(result).toEqual({ affectedNodeIds: ['child1', 'child2'] })
    })

    it('wraps HAS_COMPOSITION_CHILDREN as HAS_ACTIVE_CHILDREN ConflictException', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ id: 'n1', projectId: 'p1' }))
      mockRepo.deleteNodeWithStrategy.mockRejectedValue(new HasCompositionChildrenError(['child1', 'child2']))
      const err: any = await service.deleteNode('n1', 'block').catch(e => e)
      expect(err).toBeInstanceOf(ConflictException)
      expect(err.response).toMatchObject({ error: 'HAS_ACTIVE_CHILDREN', affectedNodes: ['child1', 'child2'] })
    })

    it('wraps AMBIGUOUS_PARENT as ConflictException with parents payload', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ id: 'n1', projectId: 'p1' }))
      mockRepo.deleteNodeWithStrategy.mockRejectedValue(new AmbiguousParentError(['p1', 'p2']))
      const err: any = await service.deleteNode('n1', 'reparent-to-parent').catch(e => e)
      expect(err).toBeInstanceOf(ConflictException)
      expect(err.response).toMatchObject({ error: 'AMBIGUOUS_PARENT', parents: ['p1', 'p2'] })
    })
  })

  // ── listProjectNodes / getSubgraph ────────────────────────────────────

  describe('findStagingNode', () => {
    it('asserts project exists and delegates to repository', async () => {
      const staging = makeNode({ id: 'staging', type: NodeType.staging, role: NodeRole.staging_root, title: '[Staging Area]' })
      mockRepo.findStagingNode.mockResolvedValue(staging)

      await expect(service.findStagingNode('p1')).resolves.toEqual(staging)

      expect(mockProjectService.assertExists).toHaveBeenCalledWith('p1')
      expect(mockRepo.findStagingNode).toHaveBeenCalledWith('p1')
    })
  })

  describe('listProjectNodes', () => {
    it('delegates to repo', async () => {
      const nodes = [makeNode({ id: 'n2' }), makeNode({ id: 'n3' })]
      mockRepo.listProjectNodes.mockResolvedValue(nodes)
      await expect(service.listProjectNodes('p1')).resolves.toEqual(nodes)
    })
  })

  describe('getSubgraph', () => {
    it('throws 404 when node does not exist', async () => {
      mockRepo.findNode.mockResolvedValue(null)
      await expect(service.getSubgraph('missing')).rejects.toThrow(NotFoundException)
    })

    it('returns repo.getSubgraph result when node exists', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ id: 'n1' }))
      const subgraph = { nodes: [makeNode({ id: 'n1' })], edges: [] }
      mockRepo.getSubgraph.mockResolvedValue(subgraph)
      await expect(service.getSubgraph('n1')).resolves.toEqual(subgraph)
    })
  })

  // ── createEdge ────────────────────────────────────────────────────────

  describe('createEdge', () => {
    it('throws 400 when fromId equals toId', async () => {
      await expect(
        service.createEdge({ projectId: 'p1', fromId: 'n1', toId: 'n1', type: EdgeType.composition, createdBy: CreatedBy.human })
      ).rejects.toThrow(BadRequestException)
    })

    it('throws 409 PROJECT_NOT_INITIALIZED when project has no root node', async () => {
      mockRepo.findProjectRoot.mockResolvedValue(null)
      await expect(
        service.createEdge({ projectId: 'p1', fromId: 'a', toId: 'b', type: EdgeType.composition, createdBy: CreatedBy.human })
      ).rejects.toMatchObject({ message: 'PROJECT_NOT_INITIALIZED' })
    })

    it('throws 404 when fromNode does not exist', async () => {
      mockRepo.findNode.mockResolvedValue(null)
      await expect(
        service.createEdge({ projectId: 'p1', fromId: 'a', toId: 'b', type: EdgeType.composition, createdBy: CreatedBy.human })
      ).rejects.toThrow(NotFoundException)
    })

    it('throws 404 when fromNode belongs to a different project', async () => {
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'a', projectId: 'p2' }))
        .mockResolvedValueOnce(makeNode({ id: 'b', projectId: 'p1' }))

      await expect(
        service.createEdge({ projectId: 'p1', fromId: 'a', toId: 'b', type: EdgeType.composition, createdBy: CreatedBy.human })
      ).rejects.toThrow(NotFoundException)

      expect(mockRepo.createEdge).not.toHaveBeenCalled()
    })

    it('throws 404 when toNode belongs to a different project', async () => {
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'a', projectId: 'p1' }))
        .mockResolvedValueOnce(makeNode({ id: 'b', projectId: 'p2' }))

      await expect(
        service.createEdge({ projectId: 'p1', fromId: 'a', toId: 'b', type: EdgeType.composition, createdBy: CreatedBy.human })
      ).rejects.toThrow(NotFoundException)

      expect(mockRepo.createEdge).not.toHaveBeenCalled()
    })

    it('throws 409 when fromNode is completed', async () => {
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'a', status: NodeStatus.completed }))
        .mockResolvedValueOnce(makeNode({ id: 'b' }))
      await expect(
        service.createEdge({ projectId: 'p1', fromId: 'a', toId: 'b', type: EdgeType.composition, createdBy: CreatedBy.human })
      ).rejects.toThrow(ConflictException)
    })

    it('throws 409 when edge would mutate staging area structure', async () => {
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'staging', role: NodeRole.staging_root, type: NodeType.staging }))
        .mockResolvedValueOnce(makeNode({ id: 'b' }))

      await expect(
        service.createEdge({ projectId: 'p1', fromId: 'staging', toId: 'b', type: EdgeType.composition, createdBy: CreatedBy.human })
      ).rejects.toThrow(ConflictException)

      expect(mockRepo.createEdge).not.toHaveBeenCalled()
    })

    it('publishes graph.edge.created when no cycle', async () => {
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'a' }))
        .mockResolvedValueOnce(makeNode({ id: 'b' }))
      const mockEdge = { id: 'e1', projectId: 'p1', fromId: 'a', toId: 'b', type: EdgeType.composition, createdBy: CreatedBy.human, createdAt: new Date() }
      mockRepo.createEdge.mockResolvedValue({ edge: mockEdge, cyclePath: null, checkpointNodeId: null })
      await service.createEdge({ projectId: 'p1', fromId: 'a', toId: 'b', type: EdgeType.composition, createdBy: CreatedBy.human })
      expect(mockPublisher.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'graph.edge.created' }))
    })

    it('publishes graph.node.checkpoint_elevated when cycle detected', async () => {
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'a' }))
        .mockResolvedValueOnce(makeNode({ id: 'b' }))
      const mockEdge = { id: 'e1', projectId: 'p1', fromId: 'b', toId: 'a', type: EdgeType.composition, createdBy: CreatedBy.human, createdAt: new Date() }
      mockRepo.createEdge.mockResolvedValue({ edge: mockEdge, cyclePath: ['b', 'a'], checkpointNodeId: 'a' })
      await service.createEdge({ projectId: 'p1', fromId: 'b', toId: 'a', type: EdgeType.composition, createdBy: CreatedBy.human })
      expect(mockPublisher.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'graph.node.checkpoint_elevated' }))
    })
  })

  // ── deleteEdge ────────────────────────────────────────────────────────

  describe('deleteEdge', () => {
    it('throws 404 when edge does not exist', async () => {
      mockRepo.findEdge.mockResolvedValue(null)
      await expect(service.deleteEdge('missing')).rejects.toThrow(NotFoundException)
    })

    it('calls repo.deleteEdge on success', async () => {
      const edge = { id: 'e1', projectId: 'p1', fromId: 'n1', toId: 'n2', type: EdgeType.composition, createdBy: CreatedBy.human, createdAt: new Date() }
      mockRepo.findEdge.mockResolvedValue(edge)
      mockRepo.deleteEdge.mockResolvedValue(undefined)
      await service.deleteEdge('e1')
      expect(mockRepo.deleteEdge).toHaveBeenCalledWith('e1')
    })
  })

  // ── listProjectEdges ──────────────────────────────────────────────────

  describe('listProjectEdges', () => {
    it('delegates to repo', async () => {
      const edges = [{ id: 'e1', projectId: 'p1', fromId: 'n1', toId: 'n2', type: EdgeType.composition, createdBy: CreatedBy.human, createdAt: new Date() }]
      mockRepo.listProjectEdges.mockResolvedValue(edges)
      await expect(service.listProjectEdges('p1')).resolves.toEqual(edges)
    })
  })

  // ── replaceNodeEdges ──────────────────────────────────────────────────

  describe('replaceNodeEdges', () => {
    it('throws 409 PROJECT_NOT_INITIALIZED when project has no root node', async () => {
      mockRepo.findProjectRoot.mockResolvedValue(null)
      await expect(
        service.replaceNodeEdges('child', EdgeType.composition, 'newParent', 'p1', CreatedBy.human)
      ).rejects.toMatchObject({ message: 'PROJECT_NOT_INITIALIZED' })
    })

    it('throws 404 when node does not exist', async () => {
      mockRepo.findNode.mockResolvedValueOnce(null)
      await expect(
        service.replaceNodeEdges('missing', EdgeType.composition, 'newParent', 'p1', CreatedBy.human)
      ).rejects.toThrow(NotFoundException)
    })

    it('throws 404 when newParent does not exist', async () => {
      mockRepo.findNode.mockResolvedValueOnce(makeNode({ id: 'child' })).mockResolvedValueOnce(null)
      await expect(
        service.replaceNodeEdges('child', EdgeType.composition, 'missingParent', 'p1', CreatedBy.human)
      ).rejects.toThrow(NotFoundException)
    })

    it('throws 404 when node belongs to a different project', async () => {
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'child', projectId: 'p2' }))
        .mockResolvedValueOnce(makeNode({ id: 'newParent', projectId: 'p1' }))

      await expect(
        service.replaceNodeEdges('child', EdgeType.composition, 'newParent', 'p1', CreatedBy.human)
      ).rejects.toThrow(NotFoundException)

      expect(mockRepo.replaceNodeEdges).not.toHaveBeenCalled()
    })

    it('throws 404 when newParent belongs to a different project', async () => {
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'child', projectId: 'p1' }))
        .mockResolvedValueOnce(makeNode({ id: 'newParent', projectId: 'p2' }))

      await expect(
        service.replaceNodeEdges('child', EdgeType.composition, 'newParent', 'p1', CreatedBy.human)
      ).rejects.toThrow(NotFoundException)

      expect(mockRepo.replaceNodeEdges).not.toHaveBeenCalled()
    })

    it('throws 409 when newParent is archived', async () => {
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'child' }))
        .mockResolvedValueOnce(makeNode({ id: 'newParent', status: NodeStatus.archived }))
      await expect(
        service.replaceNodeEdges('child', EdgeType.composition, 'newParent', 'p1', CreatedBy.human)
      ).rejects.toThrow(ConflictException)
    })

    it('throws 409 when replacement would mutate staging area structure', async () => {
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'child' }))
        .mockResolvedValueOnce(makeNode({ id: 'staging', role: NodeRole.staging_root, type: NodeType.staging }))

      await expect(
        service.replaceNodeEdges('child', EdgeType.composition, 'staging', 'p1', CreatedBy.human)
      ).rejects.toThrow(ConflictException)

      expect(mockRepo.replaceNodeEdges).not.toHaveBeenCalled()
    })

    it('publishes graph.edge.created when no cycle', async () => {
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'child' }))
        .mockResolvedValueOnce(makeNode({ id: 'newParent' }))
      const mockEdge = { id: 'e2', projectId: 'p1', fromId: 'newParent', toId: 'child', type: EdgeType.composition, createdBy: CreatedBy.human, createdAt: new Date() }
      mockRepo.replaceNodeEdges.mockResolvedValue({ edge: mockEdge, cyclePath: null, checkpointNodeId: null })
      await service.replaceNodeEdges('child', EdgeType.composition, 'newParent', 'p1', CreatedBy.human)
      expect(mockPublisher.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'graph.edge.created' }))
    })

    it('publishes graph.node.checkpoint_elevated when cycle detected', async () => {
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'child' }))
        .mockResolvedValueOnce(makeNode({ id: 'newParent' }))
      const mockEdge = { id: 'e2', projectId: 'p1', fromId: 'newParent', toId: 'child', type: EdgeType.composition, createdBy: CreatedBy.human, createdAt: new Date() }
      mockRepo.replaceNodeEdges.mockResolvedValue({ edge: mockEdge, cyclePath: ['newParent', 'child'], checkpointNodeId: 'newParent' })
      await service.replaceNodeEdges('child', EdgeType.composition, 'newParent', 'p1', CreatedBy.human)
      expect(mockPublisher.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'graph.node.checkpoint_elevated' }))
    })
  })

  // ── project does not exist ────────────────────────────────────────────

  describe('when project does not exist', () => {
    beforeEach(() => {
      mockProjectService = { assertExists: vi.fn().mockRejectedValue(new NotFoundException('PROJECT_NOT_FOUND')) }
      service = new GraphService(mockRepo, mockDetector, mockPublisher, mockProjectService as any)
    })

    it('createNode throws 404', async () => {
      await expect(
        service.createNode({ projectId: 'bad', type: NodeType.scaffold, title: 'T', createdBy: CreatedBy.human })
      ).rejects.toThrow(NotFoundException)
    })

    it('updateNode throws 404', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode())
      await expect(service.updateNode('n1', { title: 'X' })).rejects.toThrow(NotFoundException)
    })

    it('updateStatus throws 404', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.active }))
      await expect(service.updateStatus('n1', NodeStatus.completed)).rejects.toThrow(NotFoundException)
    })

    it('resolveCheckpoint throws 404', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.blocked, isCheckpoint: true }))
      await expect(service.resolveCheckpoint('n1', 'continue')).rejects.toThrow(NotFoundException)
    })

    it('deleteNode throws 404', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode())
      await expect(service.deleteNode('n1')).rejects.toThrow(NotFoundException)
    })

    it('createEdge throws 404', async () => {
      await expect(
        service.createEdge({ projectId: 'bad', fromId: 'n1', toId: 'n2', type: EdgeType.composition, createdBy: CreatedBy.human })
      ).rejects.toThrow(NotFoundException)
    })

    it('deleteEdge throws 404', async () => {
      mockRepo.findEdge.mockResolvedValue({ id: 'e1', projectId: 'bad' })
      await expect(service.deleteEdge('e1')).rejects.toThrow(NotFoundException)
    })

    it('replaceNodeEdges throws 404', async () => {
      await expect(
        service.replaceNodeEdges('n1', EdgeType.composition, 'n2', 'bad', CreatedBy.human)
      ).rejects.toThrow(NotFoundException)
    })
  })
})
