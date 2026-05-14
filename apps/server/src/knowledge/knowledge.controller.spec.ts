import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BadRequestException } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import {
  createEntryEndpoint,
  updateEntryBodyEndpoint,
  updateEntryEndpoint,
} from '@zet-plane/contracts'
import { KnowledgeController } from './knowledge.controller'
import { GlobalValidationPipe } from '../common/validation/global-validation.pipe'
import { EntryCategory, EntryStatus, EmbeddingStatus, CreatedBy } from '@generated/client'
import type { KnowledgeEntry } from '@generated/client'

class CreateEntryDto extends createZodDto(createEntryEndpoint.request) {}
class UpdateEntryDto extends createZodDto(updateEntryEndpoint.request) {}
class UpdateBodyDto extends createZodDto(updateEntryBodyEndpoint.request) {}

const projectId = '11111111-1111-4111-8111-111111111111'
const entryId = '22222222-2222-4222-8222-222222222222'
const nodeId = '33333333-3333-4333-8333-333333333333'
const otherNodeId = '44444444-4444-4444-8444-444444444444'
const revisionId = '55555555-5555-4555-8555-555555555555'
const now = new Date('2026-01-01T00:00:00.000Z')

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: entryId, projectId, nodeId,
    category: EntryCategory.decision, title: 'Test', body: {},
    status: EntryStatus.draft, embeddingStatus: EmbeddingStatus.unindexed,
    createdBy: CreatedBy.human, createdAt: now, updatedAt: now,
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
    const body = { nodeId, category: EntryCategory.decision, title: 'Test', body: {}, createdBy: CreatedBy.human }
    const result = await controller.createEntry({ id: projectId }, body)
    expect(mockEntryService.createEntry).toHaveBeenCalledWith({ projectId, ...body })
    expect(result).toEqual(expect.objectContaining({ id: entryId, createdAt: now.toISOString() }))
  })

  it('createEntry allows omitted nodeId and delegates to entryService', async () => {
    const entry = makeEntry()
    mockEntryService.createEntry.mockResolvedValue(entry)

    await controller.createEntry({ id: projectId }, {
      category: EntryCategory.context,
      title: 'Loose note',
      body: {},
      createdBy: CreatedBy.human,
    })

    expect(mockEntryService.createEntry).toHaveBeenCalledWith({
      projectId,
      category: EntryCategory.context,
      title: 'Loose note',
      body: {},
      createdBy: CreatedBy.human,
    })
  })

  it('validates create entry enum fields before service logic', async () => {
    const pipe = new GlobalValidationPipe()

    expect(pipe.transform({
      category: EntryCategory.decision,
      title: 'Test',
      body: {},
      createdBy: CreatedBy.human,
    }, { type: 'body', metatype: CreateEntryDto })).toMatchObject({
      category: EntryCategory.decision,
      createdBy: CreatedBy.human,
    })
    expect(() => pipe.transform({
      category: 'invalid',
      title: 'Test',
      body: {},
      createdBy: CreatedBy.human,
    }, { type: 'body', metatype: CreateEntryDto })).toThrow()
    expect(() => pipe.transform({
      category: EntryCategory.decision,
      title: 'Test',
      body: {},
      createdBy: 'invalid',
    }, { type: 'body', metatype: CreateEntryDto })).toThrow()
  })

  it('listEntries passes projectId and filters', async () => {
    mockEntryService.listEntries.mockResolvedValue([makeEntry()])
    const result = await controller.listEntries({ id: projectId }, {
      category: EntryCategory.decision, nodeId, status: EntryStatus.published,
    })
    expect(mockEntryService.listEntries).toHaveBeenCalledWith(projectId, {
      category: EntryCategory.decision, nodeId, status: EntryStatus.published,
    })
    expect(result).toEqual([expect.objectContaining({ id: entryId, createdAt: now.toISOString() })])
  })

  it('getEntry delegates to entryService', async () => {
    const entry = makeEntry()
    mockEntryService.getEntry.mockResolvedValue(entry)
    const result = await controller.getEntry({ id: entryId })
    expect(mockEntryService.getEntry).toHaveBeenCalledWith(entryId)
    expect(result).toEqual(expect.objectContaining({ id: entryId, createdAt: now.toISOString() }))
  })

  it('updateEntry calls updateFields for non-status fields', async () => {
    mockEntryService.updateFields.mockResolvedValue(makeEntry({ title: 'New' }))
    await controller.updateEntry({ id: entryId }, { title: 'New' })
    expect(mockEntryService.updateFields).toHaveBeenCalledWith(entryId, { title: 'New' })
  })

  it('updateEntry calls updateStatus when status is provided', async () => {
    mockEntryService.updateStatus.mockResolvedValue(makeEntry({ status: EntryStatus.published }))
    await controller.updateEntry({ id: entryId }, { status: EntryStatus.published })
    expect(mockEntryService.updateStatus).toHaveBeenCalledWith(entryId, EntryStatus.published)
  })

  it('updateEntry calls reanchor when nodeId is provided', async () => {
    mockEntryService.reanchor.mockResolvedValue(makeEntry({ nodeId: otherNodeId }))
    await controller.updateEntry({ id: entryId }, { nodeId: otherNodeId })
    expect(mockEntryService.reanchor).toHaveBeenCalledWith(entryId, otherNodeId)
  })

  it('validates update entry enum fields before service logic', async () => {
    const pipe = new GlobalValidationPipe()

    expect(pipe.transform({
      category: EntryCategory.context,
      status: EntryStatus.published,
    }, { type: 'body', metatype: UpdateEntryDto })).toMatchObject({
      category: EntryCategory.context,
      status: EntryStatus.published,
    })
    expect(() => pipe.transform({ category: 'invalid' }, { type: 'body', metatype: UpdateEntryDto })).toThrow()
    expect(() => pipe.transform({ status: 'invalid' }, { type: 'body', metatype: UpdateEntryDto })).toThrow()
  })

  it('deleteEntry calls softDelete', async () => {
    mockEntryService.softDelete.mockResolvedValue(makeEntry({ status: EntryStatus.deprecated }))
    await controller.deleteEntry({ id: entryId })
    expect(mockEntryService.softDelete).toHaveBeenCalledWith(entryId)
  })

  it('updateBody calls revisionService.appendRevision', async () => {
    const revision = { id: revisionId, entryId, version: 2, body: {}, changeNote: null, createdBy: CreatedBy.human, createdAt: now }
    mockRevisionService.appendRevision.mockResolvedValue(revision)
    const result = await controller.updateBody({ id: entryId }, { body: { v: 2 }, createdBy: CreatedBy.agent })
    expect(mockRevisionService.appendRevision).toHaveBeenCalledWith(entryId, { body: { v: 2 }, createdBy: CreatedBy.agent })
    expect(result).toEqual(expect.objectContaining({ id: revisionId, createdAt: now.toISOString() }))
  })

  it('validates update body createdBy before service logic', async () => {
    const pipe = new GlobalValidationPipe()

    expect(pipe.transform({ body: {}, createdBy: CreatedBy.agent }, { type: 'body', metatype: UpdateBodyDto })).toMatchObject({
      createdBy: CreatedBy.agent,
    })
    expect(() => pipe.transform({ body: {}, createdBy: 'invalid' }, { type: 'body', metatype: UpdateBodyDto })).toThrow()
  })

  it('listRevisions delegates to revisionService', async () => {
    mockRevisionService.listRevisions.mockResolvedValue([])
    await controller.listRevisions({ id: entryId })
    expect(mockRevisionService.listRevisions).toHaveBeenCalledWith(entryId)
  })

  it('getRevision parses version as number', async () => {
    const revision = { id: revisionId, entryId, version: 1, body: {}, changeNote: null, createdBy: CreatedBy.human, createdAt: now }
    mockRevisionService.getRevision.mockResolvedValue(revision)
    await controller.getRevision({ id: entryId, version: 1 })
    expect(mockRevisionService.getRevision).toHaveBeenCalledWith(entryId, 1)
  })

  it('storeEmbedding delegates to searchService', async () => {
    mockSearchService.storeEmbedding.mockResolvedValue(undefined)
    await controller.storeEmbedding({ id: entryId }, { vector: [0.1, 0.2] })
    expect(mockSearchService.storeEmbedding).toHaveBeenCalledWith(entryId, [0.1, 0.2])
  })

  it('search passes projectId to searchService', async () => {
    mockSearchService.search.mockResolvedValue([makeEntry({ embeddingStatus: EmbeddingStatus.indexed })].map(entry => ({ ...entry, score: 0.9 })))
    const result = await controller.search({ id: projectId }, { vector: [0.1], limit: 5, threshold: 0.8, filters: {} })
    expect(mockSearchService.search).toHaveBeenCalledWith(projectId, [0.1], { limit: 5, threshold: 0.8, filters: {} })
    expect(result).toEqual([expect.objectContaining({ id: entryId, score: 0.9, createdAt: now.toISOString() })])
  })
})
