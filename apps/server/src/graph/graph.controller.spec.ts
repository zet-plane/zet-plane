import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GraphController } from './graph.controller'
import { NodeType, CreatedBy, NodeStatus, EdgeType } from '../generated/client/client'

describe('GraphController', () => {
  let controller: GraphController
  let mockNodeService: any
  let mockEdgeService: any

  beforeEach(() => {
    mockNodeService = {
      initProjectRoot: vi.fn(),
      createNode: vi.fn(),
      updateNode: vi.fn(),
      updateStatus: vi.fn(),
      resolveCheckpoint: vi.fn(),
      listProjectNodes: vi.fn(),
      getSubgraph: vi.fn(),
      deleteNode: vi.fn(),
    }
    mockEdgeService = {
      createEdge: vi.fn(),
      deleteEdge: vi.fn(),
      listProjectEdges: vi.fn(),
      replaceNodeEdges: vi.fn(),
    }
    controller = new GraphController(mockNodeService, mockEdgeService)
  })

  it('initProject calls nodeService.initProjectRoot', async () => {
    const node = { id: 'root', projectId: 'p1', isProjectRoot: true }
    mockNodeService.initProjectRoot.mockResolvedValue(node)
    const result = await controller.initProject('p1')
    expect(mockNodeService.initProjectRoot).toHaveBeenCalledWith('p1')
    expect(result).toEqual(node)
  })

  it('createNode calls nodeService.createNode with body', async () => {
    const body = { type: NodeType.scaffold, title: 'Task A', createdBy: CreatedBy.human }
    const node = { id: 'n1', projectId: 'p1', ...body }
    mockNodeService.createNode.mockResolvedValue(node)
    const result = await controller.createNode('p1', body)
    expect(mockNodeService.createNode).toHaveBeenCalledWith({ projectId: 'p1', ...body })
    expect(result).toEqual(node)
  })

  it('updateNode calls nodeService.updateNode for non-status fields', async () => {
    const body = { title: 'New Title' }
    mockNodeService.updateNode.mockResolvedValue({ id: 'n1', title: 'New Title' })
    await controller.updateNode('n1', body)
    expect(mockNodeService.updateNode).toHaveBeenCalledWith('n1', body)
  })

  it('updateNode calls nodeService.updateStatus when status is in body', async () => {
    const body = { status: NodeStatus.completed }
    mockNodeService.updateStatus.mockResolvedValue({ id: 'n1', status: NodeStatus.completed })
    await controller.updateNode('n1', body)
    expect(mockNodeService.updateStatus).toHaveBeenCalledWith('n1', NodeStatus.completed)
  })

  it('resolveCheckpoint delegates to nodeService', async () => {
    mockNodeService.resolveCheckpoint.mockResolvedValue({ id: 'n1' })
    await controller.resolveCheckpoint('n1', { resolution: 'continue' })
    expect(mockNodeService.resolveCheckpoint).toHaveBeenCalledWith('n1', 'continue')
  })

  it('deleteNode passes strategy from body', async () => {
    mockNodeService.deleteNode.mockResolvedValue({ affectedNodeIds: [] })
    await controller.deleteNode('n1', { strategy: 'cascade' })
    expect(mockNodeService.deleteNode).toHaveBeenCalledWith('n1', 'cascade')
  })

  it('deleteNode uses default strategy when body is absent', async () => {
    mockNodeService.deleteNode.mockResolvedValue({ affectedNodeIds: [] })
    await controller.deleteNode('n1', undefined)
    expect(mockNodeService.deleteNode).toHaveBeenCalledWith('n1', undefined)
  })

  it('createEdge delegates to edgeService', async () => {
    const body = { fromId: 'a', toId: 'b', type: EdgeType.composition, createdBy: CreatedBy.human }
    mockEdgeService.createEdge.mockResolvedValue({ id: 'e1', ...body, projectId: 'p1' })
    await controller.createEdge('p1', body)
    expect(mockEdgeService.createEdge).toHaveBeenCalledWith({ projectId: 'p1', ...body })
  })

  it('listNodes delegates to nodeService.listProjectNodes(projectId)', async () => {
    const nodes = [{ id: 'n1', projectId: 'p1' }]
    mockNodeService.listProjectNodes.mockResolvedValue(nodes)
    const result = await controller.listNodes('p1')
    expect(mockNodeService.listProjectNodes).toHaveBeenCalledWith('p1')
    expect(result).toEqual(nodes)
  })

  it('getSubgraph delegates to nodeService.getSubgraph(nodeId)', async () => {
    const subgraph = { nodes: [{ id: 'n1' }], edges: [] }
    mockNodeService.getSubgraph.mockResolvedValue(subgraph)
    const result = await controller.getSubgraph('n1')
    expect(mockNodeService.getSubgraph).toHaveBeenCalledWith('n1')
    expect(result).toEqual(subgraph)
  })

  it('listEdges delegates to edgeService.listProjectEdges(projectId)', async () => {
    const edges = [{ id: 'e1', projectId: 'p1' }]
    mockEdgeService.listProjectEdges.mockResolvedValue(edges)
    const result = await controller.listEdges('p1')
    expect(mockEdgeService.listProjectEdges).toHaveBeenCalledWith('p1')
    expect(result).toEqual(edges)
  })

  it('deleteEdge route delegates to edgeService.deleteEdge(edgeId)', async () => {
    mockEdgeService.deleteEdge.mockResolvedValue(undefined)
    await controller.deleteEdge('e1')
    expect(mockEdgeService.deleteEdge).toHaveBeenCalledWith('e1')
  })

  it('replaceEdges PATCH /nodes/:id/edges delegates with all body fields', async () => {
    const body = { type: EdgeType.composition, newFromId: 'newParent', projectId: 'p1', createdBy: CreatedBy.human }
    const edge = { id: 'e2', projectId: 'p1', fromId: 'newParent', toId: 'n1', type: EdgeType.composition }
    mockEdgeService.replaceNodeEdges.mockResolvedValue(edge)
    const result = await controller.replaceEdges('n1', body)
    expect(mockEdgeService.replaceNodeEdges).toHaveBeenCalledWith('n1', EdgeType.composition, 'newParent', 'p1', CreatedBy.human)
    expect(result).toEqual(edge)
  })
})
