import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { NodeService } from './node.service'
import { NodeStatus, NodeType, CreatedBy, CheckpointResolution } from '@generated/client'
import type { Node } from '@generated/client'
import { HasCompositionChildrenError, AmbiguousParentError } from '../repository/graph.repository'

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: 'n1',
    projectId: 'p1',
    isProjectRoot: false,
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

describe('NodeService', () => {
  let service: NodeService
  let mockRepo: any
  let mockPublisher: any

  beforeEach(() => {
    mockRepo = {
      findNode: vi.fn(),
      createNode: vi.fn(),
      updateNode: vi.fn(),
      listProjectNodes: vi.fn(),
      getSubgraph: vi.fn(),
      initProjectRoot: vi.fn(),
      findCompositionChildren: vi.fn(),
      findDependencyTargets: vi.fn(),
      deleteNodeWithStrategy: vi.fn(),
    }
    mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    const mockProjectService = { assertExists: vi.fn().mockResolvedValue(undefined) }
    service = new NodeService(mockRepo, mockPublisher, mockProjectService)
  })

  describe('updateStatus', () => {
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
      mockRepo.findCompositionChildren.mockResolvedValue([
        makeNode({ id: 'child1', status: NodeStatus.active }),
      ])
      await expect(service.updateStatus('n1', NodeStatus.completed)).rejects.toThrow(ConflictException)
    })

    it('allows completed when all composition children are completed', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.active }))
      mockRepo.findCompositionChildren.mockResolvedValue([
        makeNode({ id: 'child1', status: NodeStatus.completed }),
      ])
      mockRepo.updateNode.mockResolvedValue(makeNode({ status: NodeStatus.completed }))
      await service.updateStatus('n1', NodeStatus.completed)
      expect(mockRepo.updateNode).toHaveBeenCalledWith('n1', { status: NodeStatus.completed })
      expect(mockPublisher.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'graph.node.status_changed' }))
    })

    it('throws 409 when setting active with unresolved dependency', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.active }))
      mockRepo.findDependencyTargets.mockResolvedValue([
        makeNode({ id: 'dep1', status: NodeStatus.active }),
      ])
      await expect(service.updateStatus('n1', NodeStatus.active)).rejects.toThrow(ConflictException)
    })

    it('does NOT block activation when dependency is archived', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.active }))
      mockRepo.findDependencyTargets.mockResolvedValue([
        makeNode({ id: 'dep1', status: NodeStatus.archived }),
      ])
      mockRepo.updateNode.mockResolvedValue(makeNode({ status: NodeStatus.active }))
      await expect(service.updateStatus('n1', NodeStatus.active)).resolves.not.toThrow()
      expect(mockRepo.updateNode).toHaveBeenCalledWith('n1', { status: NodeStatus.active })
    })

    it('throws 409 when setting active directly on blocked node (must use resolution API)', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.blocked, isCheckpoint: true }))
      mockRepo.findDependencyTargets.mockResolvedValue([])
      await expect(service.updateStatus('n1', NodeStatus.active)).rejects.toThrow(ConflictException)
    })

    it('publishes status_changed job on successful update', async () => {
      const node = makeNode({ status: NodeStatus.active })
      mockRepo.findNode.mockResolvedValue(node)
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
  })

  describe('createNode', () => {
    it('delegates to repo.createNode with the data passed through', async () => {
      const data = { projectId: 'p1', type: NodeType.scaffold, title: 'New Node', createdBy: CreatedBy.human }
      const created = makeNode({ id: 'n2', title: 'New Node' })
      mockRepo.createNode.mockResolvedValue(created)
      const result = await service.createNode(data)
      expect(mockRepo.createNode).toHaveBeenCalledWith(data)
      expect(result).toEqual(created)
    })
  })

  describe('deleteNode', () => {
    it('throws 409 when node is project root', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ isProjectRoot: true }))
      await expect(service.deleteNode('n1', 'cascade')).rejects.toThrow(ConflictException)
    })

    it('successful cascade delete publishes graph.node.deleted with affectedNodeIds', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ id: 'n1', projectId: 'p1' }))
      mockRepo.deleteNodeWithStrategy.mockResolvedValue(['child1', 'child2'])
      const result = await service.deleteNode('n1', 'cascade')
      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'graph.node.deleted',
        payload: { nodeId: 'n1', strategy: 'cascade', affectedNodeIds: ['child1', 'child2'], projectId: 'p1' },
      })
      expect(result).toEqual({ affectedNodeIds: ['child1', 'child2'] })
    })

    it('wraps HAS_COMPOSITION_CHILDREN repo error as HAS_ACTIVE_CHILDREN ConflictException with affectedNodes', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ id: 'n1', projectId: 'p1' }))
      mockRepo.deleteNodeWithStrategy.mockRejectedValue(new HasCompositionChildrenError(['child1', 'child2']))
      const err: any = await service.deleteNode('n1', 'block').catch(e => e)
      expect(err).toBeInstanceOf(ConflictException)
      expect(err.response).toMatchObject({ error: 'HAS_ACTIVE_CHILDREN', affectedNodes: ['child1', 'child2'] })
    })

    it('wraps AMBIGUOUS_PARENT repo error as ConflictException with parents payload', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ id: 'n1', projectId: 'p1' }))
      mockRepo.deleteNodeWithStrategy.mockRejectedValue(new AmbiguousParentError(['p1', 'p2']))
      const err: any = await service.deleteNode('n1', 'reparent-to-parent').catch(e => e)
      expect(err).toBeInstanceOf(ConflictException)
      expect(err.response).toMatchObject({ error: 'AMBIGUOUS_PARENT', parents: ['p1', 'p2'] })
    })
  })

  describe('listProjectNodes', () => {
    it('delegates to repo.listProjectNodes', async () => {
      const nodes = [makeNode({ id: 'n2' }), makeNode({ id: 'n3' })]
      mockRepo.listProjectNodes.mockResolvedValue(nodes)
      const result = await service.listProjectNodes('p1')
      expect(mockRepo.listProjectNodes).toHaveBeenCalledWith('p1')
      expect(result).toEqual(nodes)
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
      const result = await service.getSubgraph('n1')
      expect(mockRepo.getSubgraph).toHaveBeenCalledWith('n1')
      expect(result).toEqual(subgraph)
    })
  })

  describe('resolveCheckpoint', () => {
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

  describe('when project does not exist', () => {
    let mockProjectService: any

    beforeEach(() => {
      mockProjectService = {
        assertExists: vi.fn().mockRejectedValue(new NotFoundException('PROJECT_NOT_FOUND')),
      }
      service = new NodeService(mockRepo, mockPublisher, mockProjectService)
    })

    it('createNode throws 404', async () => {
      await expect(
        service.createNode({ projectId: 'bad', type: NodeType.scaffold, title: 'T', createdBy: CreatedBy.human }),
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
  })
})
