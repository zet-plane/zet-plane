import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EnrichmentService, NoProjectMappingError } from './enrichment.service'
import type { NormalizedEvent } from '../types'

const baseEvent: NormalizedEvent = {
  source: 'github',
  eventType: 'github.push',
  idempotencyKey: 'github:del-1',
  sourceProjectHint: 'org/repo',
  occurredAt: new Date(),
  payload: {},
}

describe('EnrichmentService', () => {
  let service: EnrichmentService
  let mockRepo: any

  beforeEach(() => {
    mockRepo = { findSourceMapping: vi.fn() }
    service = new EnrichmentService(mockRepo)
  })

  it('returns projectId when mapping exists', async () => {
    mockRepo.findSourceMapping.mockResolvedValue({ projectId: 'proj-1' })
    const result = await service.resolveProjectId(baseEvent)
    expect(result).toBe('proj-1')
    expect(mockRepo.findSourceMapping).toHaveBeenCalledWith('github', 'org/repo')
  })

  it('throws NoProjectMappingError when no mapping found', async () => {
    mockRepo.findSourceMapping.mockResolvedValue(null)
    await expect(service.resolveProjectId(baseEvent)).rejects.toThrow(NoProjectMappingError)
  })

  it('propagates error on DB failure', async () => {
    mockRepo.findSourceMapping.mockRejectedValue(new Error('DB timeout'))
    await expect(service.resolveProjectId(baseEvent)).rejects.toThrow('DB timeout')
  })
})
