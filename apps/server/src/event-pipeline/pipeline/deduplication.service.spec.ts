import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DeduplicationService } from './deduplication.service'
import type { NormalizedEvent } from '../types'

const baseEvent: NormalizedEvent = {
  source: 'github',
  eventType: 'github.push',
  idempotencyKey: 'github:del-1',
  sourceProjectHint: 'org/repo',
  occurredAt: new Date(),
  payload: {},
}

describe('DeduplicationService', () => {
  let service: DeduplicationService
  let mockRepo: any

  beforeEach(() => {
    mockRepo = {
      findByIdempotencyKey: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    }
    service = new DeduplicationService(mockRepo)
  })

  it('returns new with recordId when key is unseen', async () => {
    mockRepo.findByIdempotencyKey.mockResolvedValue(null)
    mockRepo.insert.mockResolvedValue({ id: 'rec-1' })

    const result = await service.checkAndInsert(baseEvent)
    expect(result).toEqual({ status: 'new', recordId: 'rec-1' })
    expect(mockRepo.insert).toHaveBeenCalledOnce()
  })

  it('returns duplicate and marks existing record when key already exists', async () => {
    mockRepo.findByIdempotencyKey.mockResolvedValue({ id: 'rec-existing' })

    const result = await service.checkAndInsert(baseEvent)
    expect(result).toEqual({ status: 'duplicate' })
    expect(mockRepo.updateStatus).toHaveBeenCalledWith('rec-existing', 'deduplicated')
    expect(mockRepo.insert).not.toHaveBeenCalled()
  })

  it('propagates error when DB insert fails', async () => {
    mockRepo.findByIdempotencyKey.mockResolvedValue(null)
    mockRepo.insert.mockRejectedValue(new Error('DB error'))

    await expect(service.checkAndInsert(baseEvent)).rejects.toThrow('DB error')
  })
})
