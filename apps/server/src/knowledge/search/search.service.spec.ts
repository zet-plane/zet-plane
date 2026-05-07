import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundException, ConflictException } from '@nestjs/common'
import { SearchService } from './search.service'
import { EntryStatus, EmbeddingStatus, EntryCategory, CreatedBy } from '@generated/client'
import type { KnowledgeEntry } from '@generated/client'

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'e1', projectId: 'p1', nodeId: 'n1',
    category: EntryCategory.decision, title: 'Test', body: {},
    status: EntryStatus.published, embeddingStatus: EmbeddingStatus.unindexed,
    createdBy: CreatedBy.human, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
}

describe('SearchService', () => {
  let service: SearchService
  let mockRepo: any
  let mockPublisher: any

  beforeEach(() => {
    mockRepo = {
      findEntry: vi.fn(),
      updateEntry: vi.fn(),
      updateEmbedding: vi.fn(),
      searchByVector: vi.fn(),
    }
    mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    service = new SearchService(mockRepo, mockPublisher)
  })

  describe('storeEmbedding', () => {
    it('throws NotFoundException when entry not found', async () => {
      mockRepo.findEntry.mockResolvedValue(null)
      await expect(service.storeEmbedding('missing', [0.1, 0.2])).rejects.toThrow(NotFoundException)
    })

    it('throws ConflictException when entry is deprecated', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry({ status: EntryStatus.deprecated }))
      await expect(service.storeEmbedding('e1', [0.1])).rejects.toThrow(ConflictException)
    })

    it('stores embedding and publishes indexed event', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry())
      mockRepo.updateEmbedding.mockResolvedValue(undefined)

      await service.storeEmbedding('e1', [0.1, 0.2, 0.3])

      expect(mockRepo.updateEmbedding).toHaveBeenCalledWith('e1', [0.1, 0.2, 0.3])
      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'knowledge.entry.indexed',
        payload: { entryId: 'e1', projectId: 'p1' },
      })
    })
  })

  describe('search', () => {
    it('uses default values when no options provided', async () => {
      mockRepo.searchByVector.mockResolvedValue([])
      await service.search('p1', [0.1, 0.2], {})
      expect(mockRepo.searchByVector).toHaveBeenCalledWith('p1', [0.1, 0.2], {}, 10, 0)
    })

    it('passes limit and threshold to repository', async () => {
      mockRepo.searchByVector.mockResolvedValue([])
      await service.search('p1', [0.1], { limit: 5, threshold: 0.7 })
      expect(mockRepo.searchByVector).toHaveBeenCalledWith('p1', [0.1], {}, 5, 0.7)
    })

    it('passes filters to repository', async () => {
      mockRepo.searchByVector.mockResolvedValue([])
      const filters = { category: [EntryCategory.decision], status: [EntryStatus.published] }
      await service.search('p1', [0.1], { filters })
      expect(mockRepo.searchByVector).toHaveBeenCalledWith('p1', [0.1], filters, 10, 0)
    })

    it('returns repository search results', async () => {
      const results = [{ id: 'e1', score: 0.9 }]
      mockRepo.searchByVector.mockResolvedValue(results)
      const output = await service.search('p1', [0.1], {})
      expect(output).toEqual(results)
    })
  })
})
