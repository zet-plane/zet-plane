import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { KnowledgeController } from './knowledge.controller'
import { EntryCategory, EntryStatus, EmbeddingStatus, CreatedBy } from '@generated/client'
import type { KnowledgeEntry } from '@generated/client'
import { UpdateEntryDto } from './dto/entry.dto'

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'e1', projectId: 'p1', nodeId: 'n1',
    category: EntryCategory.decision, title: 'Test', body: {},
    status: EntryStatus.draft, embeddingStatus: EmbeddingStatus.unindexed,
    createdBy: CreatedBy.human, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
}

describe('KnowledgeController', () => {
  let controller: KnowledgeController
  let mockEntryService: any
  let mockRevisionService: any
  let mockSearchService: any

  beforeEach(() => {
    mockEntryService = {
      createEntry: vi.fn(),
      getEntry: vi.fn(),
      listEntries: vi.fn(),
      updateFields: vi.fn(),
      updateStatus: vi.fn(),
      reanchor: vi.fn(),
      softDelete: vi.fn(),
    }
    mockRevisionService = {
      appendRevision: vi.fn(),
      listRevisions: vi.fn(),
      getRevision: vi.fn(),
    }
    mockSearchService = {
      storeEmbedding: vi.fn(),
      search: vi.fn(),
    }
    controller = new KnowledgeController(mockEntryService, mockRevisionService, mockSearchService)
  })

  it('createEntry delegates to entryService', async () => {
    const entry = makeEntry()
    mockEntryService.createEntry.mockResolvedValue(entry)
    const body = { nodeId: 'n1', category: EntryCategory.decision, title: 'Test', body: {}, createdBy: CreatedBy.human }
    const result = await controller.createEntry('p1', body)
    expect(mockEntryService.createEntry).toHaveBeenCalledWith({ projectId: 'p1', ...body })
    expect(result).toEqual(entry)
  })

  it('createEntry allows omitted nodeId and delegates to entryService', async () => {
    const entry = makeEntry({ nodeId: 'staging' })
    mockEntryService.createEntry.mockResolvedValue(entry)

    await controller.createEntry('p1', {
      category: EntryCategory.context,
      title: 'Loose note',
      body: {},
      createdBy: CreatedBy.human,
    })

    expect(mockEntryService.createEntry).toHaveBeenCalledWith({
      projectId: 'p1',
      category: EntryCategory.context,
      title: 'Loose note',
      body: {},
      createdBy: CreatedBy.human,
    })
  })

  it('listEntries passes projectId and filters', async () => {
    mockEntryService.listEntries.mockResolvedValue([])
    await controller.listEntries('p1', EntryCategory.decision, 'n1', EntryStatus.published)
    expect(mockEntryService.listEntries).toHaveBeenCalledWith('p1', {
      category: EntryCategory.decision, nodeId: 'n1', status: EntryStatus.published,
    })
  })

  it('getEntry delegates to entryService', async () => {
    const entry = makeEntry()
    mockEntryService.getEntry.mockResolvedValue(entry)
    const result = await controller.getEntry('e1')
    expect(mockEntryService.getEntry).toHaveBeenCalledWith('e1')
    expect(result).toEqual(entry)
  })

  it('updateEntry calls updateFields for non-status fields', async () => {
    mockEntryService.updateFields.mockResolvedValue(makeEntry({ title: 'New' }))
    await controller.updateEntry('e1', { title: 'New' })
    expect(mockEntryService.updateFields).toHaveBeenCalledWith('e1', { title: 'New' })
  })

  it('rejects invalid category with BadRequestException through validation pipe', async () => {
    const pipe = new ValidationPipe({ transform: true })

    await expect(
      pipe.transform(
        { category: 'wrong_category' },
        { type: 'body', metatype: UpdateEntryDto, data: '' },
      ),
    ).rejects.toThrow(BadRequestException)
  })

  it('updateEntry calls updateStatus when status is provided', async () => {
    mockEntryService.updateStatus.mockResolvedValue(makeEntry({ status: EntryStatus.published }))
    await controller.updateEntry('e1', { status: EntryStatus.published })
    expect(mockEntryService.updateStatus).toHaveBeenCalledWith('e1', EntryStatus.published)
  })

  it('updateEntry calls reanchor when nodeId is provided', async () => {
    mockEntryService.reanchor.mockResolvedValue(makeEntry({ nodeId: 'n2' }))
    await controller.updateEntry('e1', { nodeId: 'n2' })
    expect(mockEntryService.reanchor).toHaveBeenCalledWith('e1', 'n2')
  })

  it('deleteEntry calls softDelete', async () => {
    mockEntryService.softDelete.mockResolvedValue(makeEntry({ status: EntryStatus.deprecated }))
    await controller.deleteEntry('e1')
    expect(mockEntryService.softDelete).toHaveBeenCalledWith('e1')
  })

  it('updateBody calls revisionService.appendRevision', async () => {
    const revision = { id: 'r1', entryId: 'e1', version: 2, body: {}, changeNote: null, createdBy: CreatedBy.human, createdAt: new Date() }
    mockRevisionService.appendRevision.mockResolvedValue(revision)
    await controller.updateBody('e1', { body: { v: 2 }, createdBy: CreatedBy.agent })
    expect(mockRevisionService.appendRevision).toHaveBeenCalledWith('e1', { body: { v: 2 }, createdBy: CreatedBy.agent })
  })

  it('listRevisions delegates to revisionService', async () => {
    mockRevisionService.listRevisions.mockResolvedValue([])
    await controller.listRevisions('e1')
    expect(mockRevisionService.listRevisions).toHaveBeenCalledWith('e1')
  })

  it('getRevision parses version as number', async () => {
    const revision = { id: 'r1', entryId: 'e1', version: 1, body: {}, changeNote: null, createdBy: CreatedBy.human, createdAt: new Date() }
    mockRevisionService.getRevision.mockResolvedValue(revision)
    await controller.getRevision('e1', '1')
    expect(mockRevisionService.getRevision).toHaveBeenCalledWith('e1', 1)
  })

  it('storeEmbedding delegates to searchService', async () => {
    mockSearchService.storeEmbedding.mockResolvedValue(undefined)
    await controller.storeEmbedding('e1', { vector: [0.1, 0.2] })
    expect(mockSearchService.storeEmbedding).toHaveBeenCalledWith('e1', [0.1, 0.2])
  })

  it('search passes projectId to searchService', async () => {
    mockSearchService.search.mockResolvedValue([])
    await controller.search('p1', { vector: [0.1], limit: 5, threshold: 0.8, filters: {} })
    expect(mockSearchService.search).toHaveBeenCalledWith('p1', [0.1], { limit: 5, threshold: 0.8, filters: {} })
  })
})
