import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GraphEventPublisher } from './graph-event.publisher'
import { EdgeType, NodeStatus } from '@prisma/client'

describe('GraphEventPublisher', () => {
  let publisher: GraphEventPublisher
  const mockAdd = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    mockAdd.mockClear()
    publisher = new GraphEventPublisher({ add: mockAdd } as any)
  })

  it('publishes graph.edge.created with correct payload', async () => {
    await publisher.publish({
      type: 'graph.edge.created',
      payload: { edgeId: 'e1', fromId: 'a', toId: 'b', edgeType: EdgeType.composition, projectId: 'p1' },
    })
    expect(mockAdd).toHaveBeenCalledWith('graph.edge.created', {
      edgeId: 'e1', fromId: 'a', toId: 'b', edgeType: EdgeType.composition, projectId: 'p1',
    })
  })

  it('publishes graph.node.checkpoint_elevated with cyclePath', async () => {
    await publisher.publish({
      type: 'graph.node.checkpoint_elevated',
      payload: { nodeId: 'n1', cyclePath: ['n1', 'n2', 'n3'], projectId: 'p1' },
    })
    expect(mockAdd).toHaveBeenCalledWith('graph.node.checkpoint_elevated', {
      nodeId: 'n1', cyclePath: ['n1', 'n2', 'n3'], projectId: 'p1',
    })
  })

  it('publishes graph.node.status_changed with previous status', async () => {
    await publisher.publish({
      type: 'graph.node.status_changed',
      payload: { nodeId: 'n1', status: NodeStatus.completed, previousStatus: NodeStatus.active, projectId: 'p1' },
    })
    expect(mockAdd).toHaveBeenCalledWith('graph.node.status_changed', {
      nodeId: 'n1', status: NodeStatus.completed, previousStatus: NodeStatus.active, projectId: 'p1',
    })
  })

  it('publishes graph.checkpoint.resolved', async () => {
    await publisher.publish({
      type: 'graph.checkpoint.resolved',
      payload: { nodeId: 'n1', resolution: 'continue', projectId: 'p1' },
    })
    expect(mockAdd).toHaveBeenCalledWith('graph.checkpoint.resolved', {
      nodeId: 'n1', resolution: 'continue', projectId: 'p1',
    })
  })

  it('publishes graph.node.deleted with strategy and affected nodes', async () => {
    await publisher.publish({
      type: 'graph.node.deleted',
      payload: { nodeId: 'n1', strategy: 'cascade', affectedNodeIds: ['n2', 'n3'], projectId: 'p1' },
    })
    expect(mockAdd).toHaveBeenCalledWith('graph.node.deleted', {
      nodeId: 'n1', strategy: 'cascade', affectedNodeIds: ['n2', 'n3'], projectId: 'p1',
    })
  })
})
