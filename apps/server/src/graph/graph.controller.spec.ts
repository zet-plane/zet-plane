import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpStatus } from '@nestjs/common'
import { HTTP_CODE_METADATA } from '@nestjs/common/constants'
import { DECORATORS } from '@nestjs/swagger/dist/constants'
import { GraphController } from './graph.controller'
import { NodeType, CreatedBy, NodeStatus, EdgeType } from '@generated/client'

describe('GraphController', () => {
  let controller: GraphController
  let mockGraphService: any

  beforeEach(() => {
    mockGraphService = {
      createNode: vi.fn(),
      updateNode: vi.fn(),
      updateStatus: vi.fn(),
      resolveCheckpoint: vi.fn(),
      listProjectNodes: vi.fn(),
      getSubgraph: vi.fn(),
      deleteNode: vi.fn(),
      createEdge: vi.fn(),
      deleteEdge: vi.fn(),
      listProjectEdges: vi.fn(),
      replaceNodeEdges: vi.fn(),
    }
    controller = new GraphController(mockGraphService)
  })

  it('createNode maps contracts request to service and returns NodeResponse shape', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const node = {
      id: 'n1', projectId: 'p1', title: 'Task A', status: NodeStatus.active,
      description: null, isProjectRoot: false, createdAt: now, updatedAt: now,
      type: NodeType.scaffold, createdBy: CreatedBy.human, isCheckpoint: false,
      checkpointResolution: null, role: 'regular',
    }
    mockGraphService.createNode.mockResolvedValue(node)
    const params = { id: 'p1' }
    const body = { title: 'Task A' }
    const result = await controller.createNode(params as any, body as any)
    expect(mockGraphService.createNode).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1', title: 'Task A', type: NodeType.scaffold, createdBy: CreatedBy.human }),
    )
    expect(result).toMatchObject({ id: 'n1', title: 'Task A', createdAt: now.toISOString() })
  })

  it('createNode documents the contract response schema in Swagger', () => {
    const status = Reflect.getMetadata(HTTP_CODE_METADATA, GraphController.prototype.createNode)
    const responses = Reflect.getMetadata(DECORATORS.API_RESPONSE, GraphController.prototype.createNode)

    expect(status).toBe(HttpStatus.CREATED)
    expect(responses).toMatchObject({
      201: {
        description: '',
        type: expect.objectContaining({ isZodDto: true }),
      },
    })
  })

  it('updateNode calls graphService.updateNode for non-status fields', async () => {
    const body = { title: 'New Title' }
    mockGraphService.updateNode.mockResolvedValue({ id: 'n1', title: 'New Title' })
    await controller.updateNode('n1', body)
    expect(mockGraphService.updateNode).toHaveBeenCalledWith('n1', body)
  })

  it('updateNode calls graphService.updateStatus when status is in body', async () => {
    const body = { status: NodeStatus.completed }
    mockGraphService.updateStatus.mockResolvedValue({ id: 'n1', status: NodeStatus.completed })
    await controller.updateNode('n1', body)
    expect(mockGraphService.updateStatus).toHaveBeenCalledWith('n1', NodeStatus.completed)
  })

  it('resolveCheckpoint delegates to graphService', async () => {
    mockGraphService.resolveCheckpoint.mockResolvedValue({ id: 'n1' })
    await controller.resolveCheckpoint('n1', { resolution: 'continue' })
    expect(mockGraphService.resolveCheckpoint).toHaveBeenCalledWith('n1', 'continue')
  })

  it('deleteNode passes strategy from body', async () => {
    mockGraphService.deleteNode.mockResolvedValue({ affectedNodeIds: [] })
    await controller.deleteNode('n1', { strategy: 'cascade' })
    expect(mockGraphService.deleteNode).toHaveBeenCalledWith('n1', 'cascade')
  })

  it('deleteNode uses default strategy when body is absent', async () => {
    mockGraphService.deleteNode.mockResolvedValue({ affectedNodeIds: [] })
    await controller.deleteNode('n1', undefined)
    expect(mockGraphService.deleteNode).toHaveBeenCalledWith('n1', undefined)
  })

  it('createEdge delegates to graphService', async () => {
    const body = { fromId: 'a', toId: 'b', type: EdgeType.composition, createdBy: CreatedBy.human }
    mockGraphService.createEdge.mockResolvedValue({ id: 'e1', ...body, projectId: 'p1' })
    await controller.createEdge('p1', body)
    expect(mockGraphService.createEdge).toHaveBeenCalledWith({ projectId: 'p1', ...body })
  })

  it('listNodes delegates to graphService.listProjectNodes', async () => {
    const nodes = [{ id: 'n1', projectId: 'p1' }]
    mockGraphService.listProjectNodes.mockResolvedValue(nodes)
    const result = await controller.listNodes('p1')
    expect(mockGraphService.listProjectNodes).toHaveBeenCalledWith('p1')
    expect(result).toEqual(nodes)
  })

  it('getSubgraph delegates to graphService.getSubgraph', async () => {
    const subgraph = { nodes: [{ id: 'n1' }], edges: [] }
    mockGraphService.getSubgraph.mockResolvedValue(subgraph)
    const result = await controller.getSubgraph('n1')
    expect(mockGraphService.getSubgraph).toHaveBeenCalledWith('n1')
    expect(result).toEqual(subgraph)
  })

  it('listEdges delegates to graphService.listProjectEdges', async () => {
    const edges = [{ id: 'e1', projectId: 'p1' }]
    mockGraphService.listProjectEdges.mockResolvedValue(edges)
    const result = await controller.listEdges('p1')
    expect(mockGraphService.listProjectEdges).toHaveBeenCalledWith('p1')
    expect(result).toEqual(edges)
  })

  it('deleteEdge delegates to graphService.deleteEdge', async () => {
    mockGraphService.deleteEdge.mockResolvedValue(undefined)
    await controller.deleteEdge('e1')
    expect(mockGraphService.deleteEdge).toHaveBeenCalledWith('e1')
  })

  it('deleteEdge returns 204 to match its API contract', () => {
    const status = Reflect.getMetadata(HTTP_CODE_METADATA, GraphController.prototype.deleteEdge)

    expect(status).toBe(HttpStatus.NO_CONTENT)
  })

  it('replaceEdges delegates with all body fields', async () => {
    const body = { type: EdgeType.composition, newFromId: 'newParent', projectId: 'p1', createdBy: CreatedBy.human }
    const edge = { id: 'e2', projectId: 'p1', fromId: 'newParent', toId: 'n1', type: EdgeType.composition }
    mockGraphService.replaceNodeEdges.mockResolvedValue(edge)
    const result = await controller.replaceEdges('n1', body)
    expect(mockGraphService.replaceNodeEdges).toHaveBeenCalledWith('n1', EdgeType.composition, 'newParent', 'p1', CreatedBy.human)
    expect(result).toEqual(edge)
  })
})
