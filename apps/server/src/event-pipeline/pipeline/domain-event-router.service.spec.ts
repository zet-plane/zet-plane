import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DomainEventRouterService } from './domain-event-router.service'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'

describe('DomainEventRouterService', () => {
  let router: DomainEventRouterService
  let mockPublisher: any

  beforeEach(() => {
    mockPublisher = { publish: vi.fn().mockResolvedValue({ taskId: 't1', created: true }) }
    router = new DomainEventRouterService(mockPublisher)
  })

  it('routes graph.node.checkpoint_elevated to checkpoint task', async () => {
    await router.handleGraphEvent({
      type: 'graph.node.checkpoint_elevated',
      payload: { nodeId: 'n1', cyclePath: ['n1', 'n2'], projectId: 'p1' },
    })
    expect(mockPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: OrchestratorTaskType.checkpoint,
        sourceType: OrchestratorSourceType.graph_event,
      }),
    )
  })

  it('routes knowledge.entry.created to embedding task', async () => {
    await router.handleKnowledgeEvent({
      type: 'knowledge.entry.created',
      payload: { entryId: 'e1', projectId: 'p1', nodeId: 'n1', category: 'finding' },
    })
    expect(mockPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: OrchestratorTaskType.embedding,
        sourceType: OrchestratorSourceType.knowledge_event,
      }),
    )
  })

  it('routes knowledge.entry.body_revised to embedding task', async () => {
    await router.handleKnowledgeEvent({
      type: 'knowledge.entry.body_revised',
      payload: { entryId: 'e2', projectId: 'p1', version: 2 },
    })
    expect(mockPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: OrchestratorTaskType.embedding,
        sourceType: OrchestratorSourceType.knowledge_event,
        sourceId: 'e2:v2',
      }),
    )
  })

  it('ignores irrelevant graph events', async () => {
    await router.handleGraphEvent({
      type: 'graph.node.deleted',
      payload: { nodeId: 'n1', strategy: 'cascade', affectedNodeIds: [], projectId: 'p1' },
    })
    expect(mockPublisher.publish).not.toHaveBeenCalled()
  })
})
