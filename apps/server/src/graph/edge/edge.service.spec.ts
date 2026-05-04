import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { EdgeService } from './edge.service'
import { EdgeType, NodeStatus, NodeType, CreatedBy } from '@prisma/client'
import type { Node, Edge } from '@prisma/client'

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: 'n1', projectId: 'p1', isProjectRoot: false,
    type: NodeType.scaffold, title: 'Node', description: null,
    status: NodeStatus.active, isCheckpoint: false, checkpointResolution: null,
    createdBy: CreatedBy.human, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
}

describe('EdgeService', () => {
  let service: EdgeService
  let mockRepo: any
  let mockDetector: any
  let mockPublisher: any

  beforeEach(() => {
    mockRepo = {
      findNode: vi.fn(),
      findEdge: vi.fn(),
      listProjectEdges: vi.fn(),
      createEdge: vi.fn(),
      deleteEdge: vi.fn(),
      replaceNodeEdges: vi.fn(),
    }
    mockDetector = {
      detect: vi.fn().mockReturnValue(null),
      findHighestInDegreeNode: vi.fn(),
    }
    mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    service = new EdgeService(mockRepo, mockDetector, mockPublisher)
  })

  describe('createEdge', () => {
    it('throws 404 when fromNode does not exist', async () => {
      mockRepo.findNode.mockResolvedValue(null)
      await expect(
        service.createEdge({ projectId: 'p1', fromId: 'a', toId: 'b', type: EdgeType.composition, createdBy: CreatedBy.human })
      ).rejects.toThrow(NotFoundException)
    })

    it('throws 409 when fromNode is completed and type is composition', async () => {
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'a', status: NodeStatus.completed }))
        .mockResolvedValueOnce(makeNode({ id: 'b' }))
      await expect(
        service.createEdge({ projectId: 'p1', fromId: 'a', toId: 'b', type: EdgeType.composition, createdBy: CreatedBy.human })
      ).rejects.toThrow(ConflictException)
    })

    it('allows reference edge even when fromNode is completed', async () => {
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'a', status: NodeStatus.completed }))
        .mockResolvedValueOnce(makeNode({ id: 'b' }))
      const mockEdge = { id: 'e1', projectId: 'p1', fromId: 'a', toId: 'b', type: EdgeType.reference, createdBy: CreatedBy.human, createdAt: new Date() }
      mockRepo.createEdge.mockResolvedValue({ edge: mockEdge, cyclePath: null, checkpointNodeId: null })
      await service.createEdge({ projectId: 'p1', fromId: 'a', toId: 'b', type: EdgeType.reference, createdBy: CreatedBy.human })
      expect(mockRepo.createEdge).toHaveBeenCalled()
    })

    it('publishes graph.edge.created when no cycle', async () => {
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'a' }))
        .mockResolvedValueOnce(makeNode({ id: 'b' }))
      const mockEdge = { id: 'e1', projectId: 'p1', fromId: 'a', toId: 'b', type: EdgeType.composition, createdBy: CreatedBy.human, createdAt: new Date() }
      mockRepo.createEdge.mockResolvedValue({ edge: mockEdge, cyclePath: null, checkpointNodeId: null })
      await service.createEdge({ projectId: 'p1', fromId: 'a', toId: 'b', type: EdgeType.composition, createdBy: CreatedBy.human })
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'graph.edge.created' })
      )
    })

    it('publishes graph.node.checkpoint_elevated when cycle detected', async () => {
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'a' }))
        .mockResolvedValueOnce(makeNode({ id: 'b' }))
      const mockEdge = { id: 'e1', projectId: 'p1', fromId: 'b', toId: 'a', type: EdgeType.composition, createdBy: CreatedBy.human, createdAt: new Date() }
      mockRepo.createEdge.mockResolvedValue({ edge: mockEdge, cyclePath: ['b', 'a'], checkpointNodeId: 'a' })
      await service.createEdge({ projectId: 'p1', fromId: 'b', toId: 'a', type: EdgeType.composition, createdBy: CreatedBy.human })
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'graph.node.checkpoint_elevated' })
      )
    })
  })
})
