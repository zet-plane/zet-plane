import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { EntryService } from './entry.service'
import { EntryCategory, EntryStatus, EmbeddingStatus, CreatedBy } from '@generated/client'
import type { KnowledgeEntry } from '@generated/client'

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'e1',
    projectId: 'p1',
    nodeId: 'n1',
    category: EntryCategory.decision,
    title: 'Test',
    body: {},
    status: EntryStatus.draft,
    embeddingStatus: EmbeddingStatus.unindexed,
    createdBy: CreatedBy.human,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('EntryService', () => {
  let service: EntryService
  let mockRepo: any
  let mockPublisher: any

  beforeEach(() => {
    mockRepo = {
      createEntryWithRevision: vi.fn(),
      findEntry: vi.fn(),
      listEntries: vi.fn(),
      updateEntry: vi.fn(),
    }
    mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    const mockProjectService: any = { assertExists: vi.fn().mockResolvedValue(undefined) }
    service = new EntryService(mockRepo, mockPublisher, mockProjectService)
  })

  describe('createEntry', () => {
    it('creates entry and publishes created event', async () => {
      const entry = makeEntry()
      const revision = { id: 'r1', entryId: 'e1', version: 1, body: {}, changeNote: null, createdBy: CreatedBy.human, createdAt: new Date() }
      mockRepo.createEntryWithRevision.mockResolvedValue({ entry, revision })

      await service.createEntry({
        projectId: 'p1', nodeId: 'n1', category: EntryCategory.decision,
        title: 'Test', body: {}, createdBy: CreatedBy.human,
      })

      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'knowledge.entry.created',
        payload: { entryId: 'e1', projectId: 'p1', nodeId: 'n1', category: EntryCategory.decision },
      })
    })
  })

  describe('updateFields', () => {
    it('throws NotFoundException when entry not found', async () => {
      mockRepo.findEntry.mockResolvedValue(null)
      await expect(service.updateFields('missing', { title: 'X' })).rejects.toThrow(NotFoundException)
    })

    it('throws ConflictException when entry is deprecated', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry({ status: EntryStatus.deprecated }))
      await expect(service.updateFields('e1', { title: 'X' })).rejects.toThrow(ConflictException)
    })

    it('updates non-status fields without publishing status event', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry())
      mockRepo.updateEntry.mockResolvedValue(makeEntry({ title: 'New' }))
      await service.updateFields('e1', { title: 'New' })
      expect(mockRepo.updateEntry).toHaveBeenCalledWith('e1', { title: 'New' })
      expect(mockPublisher.publish).not.toHaveBeenCalled()
    })
  })

  describe('updateStatus', () => {
    it('throws ConflictException for published → draft', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry({ status: EntryStatus.published }))
      await expect(service.updateStatus('e1', EntryStatus.draft)).rejects.toThrow(ConflictException)
    })

    it('throws ConflictException when entry is deprecated', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry({ status: EntryStatus.deprecated }))
      await expect(service.updateStatus('e1', EntryStatus.published)).rejects.toThrow(ConflictException)
    })

    it('publishes status_changed event on valid transition', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry({ status: EntryStatus.draft }))
      mockRepo.updateEntry.mockResolvedValue(makeEntry({ status: EntryStatus.published }))
      await service.updateStatus('e1', EntryStatus.published)
      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'knowledge.entry.status_changed',
        payload: { entryId: 'e1', projectId: 'p1', status: EntryStatus.published, previousStatus: EntryStatus.draft },
      })
    })

    it('allows draft → deprecated', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry({ status: EntryStatus.draft }))
      mockRepo.updateEntry.mockResolvedValue(makeEntry({ status: EntryStatus.deprecated }))
      await service.updateStatus('e1', EntryStatus.deprecated)
      expect(mockRepo.updateEntry).toHaveBeenCalledWith('e1', { status: EntryStatus.deprecated })
    })

    it('allows published → deprecated', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry({ status: EntryStatus.published }))
      mockRepo.updateEntry.mockResolvedValue(makeEntry({ status: EntryStatus.deprecated }))
      await service.updateStatus('e1', EntryStatus.deprecated)
      expect(mockRepo.updateEntry).toHaveBeenCalledWith('e1', { status: EntryStatus.deprecated })
    })
  })

  describe('reanchor', () => {
    it('throws ConflictException for deprecated entry', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry({ status: EntryStatus.deprecated }))
      await expect(service.reanchor('e1', 'n2')).rejects.toThrow(ConflictException)
    })

    it('updates nodeId and publishes reanchored event', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry({ nodeId: 'n1' }))
      mockRepo.updateEntry.mockResolvedValue(makeEntry({ nodeId: 'n2' }))
      await service.reanchor('e1', 'n2')
      expect(mockRepo.updateEntry).toHaveBeenCalledWith('e1', { nodeId: 'n2' })
      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'knowledge.entry.reanchored',
        payload: { entryId: 'e1', projectId: 'p1', previousNodeId: 'n1', newNodeId: 'n2' },
      })
    })
  })

  describe('softDelete', () => {
    it('sets status to deprecated', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry())
      mockRepo.updateEntry.mockResolvedValue(makeEntry({ status: EntryStatus.deprecated }))
      await service.softDelete('e1')
      expect(mockRepo.updateEntry).toHaveBeenCalledWith('e1', { status: EntryStatus.deprecated })
    })

    it('throws NotFoundException when entry not found', async () => {
      mockRepo.findEntry.mockResolvedValue(null)
      await expect(service.softDelete('missing')).rejects.toThrow(NotFoundException)
    })
  })

  describe('when project does not exist', () => {
    let mockProjectService: any

    beforeEach(() => {
      mockProjectService = {
        assertExists: vi.fn().mockRejectedValue(new NotFoundException('PROJECT_NOT_FOUND')),
      }
      service = new EntryService(mockRepo, mockPublisher, mockProjectService)
    })

    it('createEntry throws 404', async () => {
      await expect(
        service.createEntry({
          projectId: 'bad', nodeId: 'n1', category: EntryCategory.decision,
          title: 'T', body: {}, createdBy: CreatedBy.human,
        }),
      ).rejects.toThrow(NotFoundException)
    })

    it('updateFields throws 404', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry())
      await expect(service.updateFields('e1', { title: 'X' })).rejects.toThrow(NotFoundException)
    })

    it('updateStatus throws 404', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry())
      await expect(service.updateStatus('e1', EntryStatus.published)).rejects.toThrow(NotFoundException)
    })

    it('reanchor throws 404', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry())
      await expect(service.reanchor('e1', 'n2')).rejects.toThrow(NotFoundException)
    })

    it('softDelete throws 404', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry())
      await expect(service.softDelete('e1')).rejects.toThrow(NotFoundException)
    })
  })
})
