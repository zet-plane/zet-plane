import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { EdgeService } from './edge.service'
import { EdgeType, NodeStatus, NodeType, CreatedBy } from '@generated/client'
import type { Node, Edge } from '@generated/client'

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
      findProjectRoot: vi.fn().mockResolvedValue(makeNode({ id: 'root', isProjectRoot: true })),
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
    const mockProjectService: any = { assertExists: vi.fn().mockResolvedValue(undefined) }
    service = new EdgeService(mockRepo, mockDetector, mockPublisher, mockProjectService)
  })

  describe('deleteEdge', () => {
    it('throws 404 when edge does not exist', async () => {
      mockRepo.findEdge.mockResolvedValue(null)
      await expect(service.deleteEdge('missing')).rejects.toThrow(NotFoundException)
    })

    it('calls repo.deleteEdge on successful delete', async () => {
      const edge = { id: 'e1', projectId: 'p1', fromId: 'n1', toId: 'n2', type: EdgeType.composition, createdBy: CreatedBy.human, createdAt: new Date() }
      mockRepo.findEdge.mockResolvedValue(edge)
      mockRepo.deleteEdge.mockResolvedValue(undefined)
      await service.deleteEdge('e1')
      expect(mockRepo.deleteEdge).toHaveBeenCalledWith('e1')
    })

    it('does NOT publish any job on successful delete', async () => {
      const edge = { id: 'e1', projectId: 'p1', fromId: 'n1', toId: 'n2', type: EdgeType.composition, createdBy: CreatedBy.human, createdAt: new Date() }
      mockRepo.findEdge.mockResolvedValue(edge)
      mockRepo.deleteEdge.mockResolvedValue(undefined)
      await service.deleteEdge('e1')
      expect(mockPublisher.publish).not.toHaveBeenCalled()
    })
  })

  describe('listProjectEdges', () => {
    it('delegates to repo.listProjectEdges', async () => {
      const edges = [
        { id: 'e1', projectId: 'p1', fromId: 'n1', toId: 'n2', type: EdgeType.composition, createdBy: CreatedBy.human, createdAt: new Date() },
      ]
      mockRepo.listProjectEdges.mockResolvedValue(edges)
      const result = await service.listProjectEdges('p1')
      expect(mockRepo.listProjectEdges).toHaveBeenCalledWith('p1')
      expect(result).toEqual(edges)
    })
  })

  describe('replaceNodeEdges', () => {
    it('throws 409 PROJECT_NOT_INITIALIZED when project has no root node', async () => {
      mockRepo.findProjectRoot.mockResolvedValue(null)
      await expect(
        service.replaceNodeEdges('child', EdgeType.composition, 'newParent', 'p1', CreatedBy.human)
      ).rejects.toThrow(ConflictException)
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
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'child' }))
        .mockResolvedValueOnce(null)
      await expect(
        service.replaceNodeEdges('child', EdgeType.composition, 'missingParent', 'p1', CreatedBy.human)
      ).rejects.toThrow(NotFoundException)
    })

    it('throws 409 when newParent is archived', async () => {
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'child' }))
        .mockResolvedValueOnce(makeNode({ id: 'newParent', status: NodeStatus.archived }))
      await expect(
        service.replaceNodeEdges('child', EdgeType.composition, 'newParent', 'p1', CreatedBy.human)
      ).rejects.toThrow(ConflictException)
    })

    it('publishes graph.edge.created when no cycle on replace', async () => {
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'child' }))
        .mockResolvedValueOnce(makeNode({ id: 'newParent' }))
      const mockEdge = { id: 'e2', projectId: 'p1', fromId: 'newParent', toId: 'child', type: EdgeType.composition, createdBy: CreatedBy.human, createdAt: new Date() }
      mockRepo.replaceNodeEdges.mockResolvedValue({ edge: mockEdge, cyclePath: null, checkpointNodeId: null })
      await service.replaceNodeEdges('child', EdgeType.composition, 'newParent', 'p1', CreatedBy.human)
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'graph.edge.created' })
      )
    })

    it('publishes graph.node.checkpoint_elevated when cycle detected on replace', async () => {
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'child' }))
        .mockResolvedValueOnce(makeNode({ id: 'newParent' }))
      const mockEdge = { id: 'e2', projectId: 'p1', fromId: 'newParent', toId: 'child', type: EdgeType.composition, createdBy: CreatedBy.human, createdAt: new Date() }
      mockRepo.replaceNodeEdges.mockResolvedValue({ edge: mockEdge, cyclePath: ['newParent', 'child'], checkpointNodeId: 'newParent' })
      await service.replaceNodeEdges('child', EdgeType.composition, 'newParent', 'p1', CreatedBy.human)
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'graph.node.checkpoint_elevated' })
      )
    })
  })

  describe('when project does not exist', () => {
    let mockProjectService: any

    beforeEach(() => {
      mockProjectService = {
        assertExists: vi.fn().mockRejectedValue(new NotFoundException('PROJECT_NOT_FOUND')),
      }
      service = new EdgeService(mockRepo, mockDetector, mockPublisher, mockProjectService)
    })

    it('createEdge throws 404', async () => {
      await expect(
        service.createEdge({ projectId: 'bad', fromId: 'n1', toId: 'n2', type: EdgeType.composition, createdBy: CreatedBy.human }),
      ).rejects.toThrow(NotFoundException)
    })

    it('deleteEdge throws 404', async () => {
      mockRepo.findEdge.mockResolvedValue({ id: 'e1', projectId: 'bad' })
      await expect(service.deleteEdge('e1')).rejects.toThrow(NotFoundException)
    })

    it('replaceNodeEdges throws 404', async () => {
      await expect(
        service.replaceNodeEdges('n1', EdgeType.composition, 'n2', 'bad', CreatedBy.human),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('createEdge', () => {
    it('throws 409 PROJECT_NOT_INITIALIZED when project has no root node', async () => {
      mockRepo.findProjectRoot.mockResolvedValue(null)
      await expect(
        service.createEdge({ projectId: 'p1', fromId: 'a', toId: 'b', type: EdgeType.composition, createdBy: CreatedBy.human })
      ).rejects.toThrow(ConflictException)
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

    it('throws 409 when fromNode is completed — all edge types rejected', async () => {
      for (const type of [EdgeType.composition, EdgeType.dependency]) {
        mockRepo.findNode
          .mockResolvedValueOnce(makeNode({ id: 'a', status: NodeStatus.completed }))
          .mockResolvedValueOnce(makeNode({ id: 'b' }))
        await expect(
          service.createEdge({ projectId: 'p1', fromId: 'a', toId: 'b', type, createdBy: CreatedBy.human })
        ).rejects.toThrow(ConflictException)
      }
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
