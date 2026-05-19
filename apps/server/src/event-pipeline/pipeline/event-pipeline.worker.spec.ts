import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventPipelineWorker } from './event-pipeline.worker'
import { NoProjectMappingError } from './enrichment.service'
import type { NormalizedEvent } from '../types'

const baseEvent: NormalizedEvent = {
  source: 'github',
  eventType: 'github.push',
  idempotencyKey: 'github:del-1',
  sourceProjectHint: 'org/repo',
  occurredAt: new Date(),
  payload: {},
}

function makeJob(data: NormalizedEvent) {
  return { data } as any
}

describe('EventPipelineWorker', () => {
  let worker: EventPipelineWorker
  let mockDedup: any
  let mockEnrichment: any
  let mockRepo: any
  let mockPublisher: any

  beforeEach(() => {
    mockDedup = { checkAndInsert: vi.fn() }
    mockEnrichment = { resolveProjectId: vi.fn() }
    mockRepo = { updateStatus: vi.fn().mockResolvedValue(undefined) }
    mockPublisher = { publish: vi.fn().mockResolvedValue({ taskId: 'task-1', created: true }) }
    worker = new EventPipelineWorker(mockDedup, mockEnrichment, mockRepo, mockPublisher)
  })

  it('happy path: dedup → enrich → route → orchestrate', async () => {
    mockDedup.checkAndInsert.mockResolvedValue({ status: 'new', recordId: 'rec-1' })
    mockEnrichment.resolveProjectId.mockResolvedValue('proj-1')

    await worker.process(makeJob(baseEvent))

    expect(mockPublisher.publish).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'proj-1',
      type: 'event_anchor',
      sourceType: 'incoming_event',
      sourceId: 'rec-1',
    }))
    expect(mockRepo.updateStatus).toHaveBeenCalledWith('rec-1', 'routed', expect.objectContaining({
      routedTo: 'orchestrate',
      projectId: 'proj-1',
    }))
  })

  it('short-circuits on duplicate idempotency key', async () => {
    mockDedup.checkAndInsert.mockResolvedValue({ status: 'duplicate' })

    await worker.process(makeJob(baseEvent))

    expect(mockEnrichment.resolveProjectId).not.toHaveBeenCalled()
    expect(mockPublisher.publish).not.toHaveBeenCalled()
  })

  it('marks record failed and does not rethrow when no project mapping', async () => {
    mockDedup.checkAndInsert.mockResolvedValue({ status: 'new', recordId: 'rec-1' })
    mockEnrichment.resolveProjectId.mockRejectedValue(new NoProjectMappingError('github', 'org/repo'))

    await worker.process(makeJob(baseEvent))

    expect(mockRepo.updateStatus).toHaveBeenCalledWith('rec-1', 'failed', {
      error: { reason: 'no_project_mapping' },
    })
    expect(mockPublisher.publish).not.toHaveBeenCalled()
  })

  it('rethrows transient errors so BullMQ can retry', async () => {
    mockDedup.checkAndInsert.mockResolvedValue({ status: 'new', recordId: 'rec-1' })
    mockEnrichment.resolveProjectId.mockRejectedValue(new Error('DB timeout'))

    await expect(worker.process(makeJob(baseEvent))).rejects.toThrow('DB timeout')
  })
})
