import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConflictException } from '@nestjs/common'
import { NodeService } from './node.service'
import { NodeStatus, NodeType, CreatedBy, CheckpointResolution } from '@prisma/client'
import type { Node } from '@prisma/client'

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
    }
    mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    service = new NodeService(mockRepo, mockPublisher)
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
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.blocked }))
      mockRepo.findDependencyTargets.mockResolvedValue([
        makeNode({ id: 'dep1', status: NodeStatus.active }),
      ])
      await expect(service.updateStatus('n1', NodeStatus.active)).rejects.toThrow(ConflictException)
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
})
