import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundException, ConflictException } from '@nestjs/common'
import { RevisionService } from './revision.service'
import { EntryStatus, EmbeddingStatus, EntryCategory, CreatedBy } from '@generated/client'
import type { KnowledgeEntry, KnowledgeRevision } from '@generated/client'

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'e1', projectId: 'p1', nodeId: 'n1',
    category: EntryCategory.decision, title: 'Test', body: {},
    status: EntryStatus.draft, embeddingStatus: EmbeddingStatus.unindexed,
    createdBy: CreatedBy.human, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
}

function makeRevision(overrides: Partial<KnowledgeRevision> = {}): KnowledgeRevision {
  return {
    id: 'r1', entryId: 'e1', version: 1, body: {},
    changeNote: null, createdBy: CreatedBy.human, createdAt: new Date(),
    ...overrides,
  }
}

describe('RevisionService', () => {
  let service: RevisionService
  let mockRepo: any
  let mockPublisher: any

  beforeEach(() => {
    mockRepo = {
      findEntry: vi.fn(),
      appendRevision: vi.fn(),
      listRevisions: vi.fn(),
      getRevision: vi.fn(),
    }
    mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    service = new RevisionService(mockRepo, mockPublisher)
  })

  describe('appendRevision', () => {
    it('throws NotFoundException when entry not found', async () => {
      mockRepo.findEntry.mockResolvedValue(null)
      await expect(
        service.appendRevision('missing', { body: {}, createdBy: CreatedBy.human }),
      ).rejects.toThrow(NotFoundException)
    })

    it('throws ConflictException when entry is deprecated', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry({ status: EntryStatus.deprecated }))
      await expect(
        service.appendRevision('e1', { body: {}, createdBy: CreatedBy.human }),
      ).rejects.toThrow(ConflictException)
    })

    it('appends revision and publishes body_revised event', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry())
      const revision = makeRevision({ version: 2 })
      mockRepo.appendRevision.mockResolvedValue(revision)

      await service.appendRevision('e1', { body: { v: 2 }, changeNote: 'update', createdBy: CreatedBy.agent })

      expect(mockRepo.appendRevision).toHaveBeenCalledWith({
        entryId: 'e1',
        body: { v: 2 },
        changeNote: 'update',
        createdBy: CreatedBy.agent,
      })
      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'knowledge.entry.body_revised',
        payload: { entryId: 'e1', projectId: 'p1', version: 2 },
      })
    })
  })

  describe('listRevisions', () => {
    it('throws NotFoundException when entry not found', async () => {
      mockRepo.findEntry.mockResolvedValue(null)
      await expect(service.listRevisions('missing')).rejects.toThrow(NotFoundException)
    })

    it('returns revisions for valid entry', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry())
      mockRepo.listRevisions.mockResolvedValue([makeRevision()])
      const result = await service.listRevisions('e1')
      expect(result).toHaveLength(1)
    })
  })

  describe('getRevision', () => {
    it('throws NotFoundException when revision not found', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry())
      mockRepo.getRevision.mockResolvedValue(null)
      await expect(service.getRevision('e1', 99)).rejects.toThrow(NotFoundException)
    })

    it('returns revision when found', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry())
      const revision = makeRevision({ version: 1 })
      mockRepo.getRevision.mockResolvedValue(revision)
      const result = await service.getRevision('e1', 1)
      expect(result).toEqual(revision)
    })
  })
})
