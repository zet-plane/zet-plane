import { describe, it, expect, vi, beforeEach } from 'vitest'
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

  it('createNode calls graphService.createNode with body', async () => {
    const body = { type: NodeType.scaffold, title: 'Task A', createdBy: CreatedBy.human }
    const node = { id: 'n1', projectId: 'p1', ...body }
    mockGraphService.createNode.mockResolvedValue(node)
    const result = await controller.createNode('p1', body)
    expect(mockGraphService.createNode).toHaveBeenCalledWith({ projectId: 'p1', ...body })
    expect(result).toEqual(node)
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

  it('replaceEdges delegates with all body fields', async () => {
    const body = { type: EdgeType.composition, newFromId: 'newParent', projectId: 'p1', createdBy: CreatedBy.human }
    const edge = { id: 'e2', projectId: 'p1', fromId: 'newParent', toId: 'n1', type: EdgeType.composition }
    mockGraphService.replaceNodeEdges.mockResolvedValue(edge)
    const result = await controller.replaceEdges('n1', body)
    expect(mockGraphService.replaceNodeEdges).toHaveBeenCalledWith('n1', EdgeType.composition, 'newParent', 'p1', CreatedBy.human)
    expect(result).toEqual(edge)
  })
})
