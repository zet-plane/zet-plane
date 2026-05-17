import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KnowledgeRepository } from './knowledge.repository'
import { EntryCategory, EntryStatus, EmbeddingStatus, CreatedBy } from '@generated/client'
import type { KnowledgeEntry, KnowledgeRevision } from '@generated/client'

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'e1',
    projectId: 'p1',
    nodeId: 'n1',
    category: EntryCategory.decision,
    title: 'Test Entry',
    body: { summary: 'test' },
    status: EntryStatus.draft,
    embeddingStatus: EmbeddingStatus.unindexed,
    createdBy: CreatedBy.human,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeRevision(overrides: Partial<KnowledgeRevision> = {}): KnowledgeRevision {
  return {
    id: 'r1',
    entryId: 'e1',
    version: 1,
    body: { summary: 'test' },
    changeNote: null,
    createdBy: CreatedBy.human,
    createdAt: new Date(),
    ...overrides,
  }
}

describe('KnowledgeRepository', () => {
  let repo: KnowledgeRepository
  let mockPrisma: any

  beforeEach(() => {
    mockPrisma = {
      knowledgeEntry: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      knowledgeRevision: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        aggregate: vi.fn(),
      },
      $transaction: vi.fn(),
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
    }
    repo = new KnowledgeRepository(mockPrisma as any)
  })

  describe('createEntryWithRevision', () => {
    it('creates entry and revision v1 inside a transaction', async () => {
      const entry = makeEntry()
      const revision = makeRevision()
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
      mockPrisma.knowledgeEntry.create.mockResolvedValue(entry)
      mockPrisma.knowledgeRevision.create.mockResolvedValue(revision)

      const result = await repo.createEntryWithRevision({
        projectId: 'p1',
        nodeId: 'n1',
        category: EntryCategory.decision,
        title: 'Test Entry',
        body: { summary: 'test' },
        createdBy: CreatedBy.human,
      })

      expect(mockPrisma.$transaction).toHaveBeenCalled()
      expect(mockPrisma.knowledgeEntry.create).toHaveBeenCalledWith({
        data: {
          projectId: 'p1',
          nodeId: 'n1',
          category: EntryCategory.decision,
          title: 'Test Entry',
          body: { summary: 'test' },
          createdBy: CreatedBy.human,
        },
      })
      expect(mockPrisma.knowledgeRevision.create).toHaveBeenCalledWith({
        data: {
          entryId: entry.id,
          version: 1,
          body: { summary: 'test' },
          changeNote: undefined,
          createdBy: CreatedBy.human,
        },
      })
      expect(result).toEqual({ entry, revision })
    })

    it('persists explicit status when provided', async () => {
      const entry = makeEntry({ status: EntryStatus.published, createdBy: CreatedBy.agent })
      const revision = makeRevision({ createdBy: CreatedBy.agent })
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
      mockPrisma.knowledgeEntry.create.mockResolvedValue(entry)
      mockPrisma.knowledgeRevision.create.mockResolvedValue(revision)

      await repo.createEntryWithRevision({
        projectId: 'p1',
        nodeId: 'n1',
        category: EntryCategory.decision,
        title: 'Agent Entry',
        body: { summary: 'test' },
        createdBy: CreatedBy.agent,
        status: EntryStatus.published,
      })

      expect(mockPrisma.knowledgeEntry.create).toHaveBeenCalledWith({
        data: {
          projectId: 'p1',
          nodeId: 'n1',
          category: EntryCategory.decision,
          title: 'Agent Entry',
          body: { summary: 'test' },
          status: EntryStatus.published,
          createdBy: CreatedBy.agent,
        },
      })
    })
  })

  describe('findEntry', () => {
    it('returns entry when found', async () => {
      const entry = makeEntry()
      mockPrisma.knowledgeEntry.findUnique.mockResolvedValue(entry)
      const result = await repo.findEntry('e1')
      expect(mockPrisma.knowledgeEntry.findUnique).toHaveBeenCalledWith({ where: { id: 'e1' } })
      expect(result).toEqual(entry)
    })

    it('returns null when not found', async () => {
      mockPrisma.knowledgeEntry.findUnique.mockResolvedValue(null)
      const result = await repo.findEntry('missing')
      expect(result).toBeNull()
    })
  })

  describe('listEntries', () => {
    it('queries by projectId only when no filters', async () => {
      mockPrisma.knowledgeEntry.findMany.mockResolvedValue([])
      await repo.listEntries('p1', {})
      expect(mockPrisma.knowledgeEntry.findMany).toHaveBeenCalledWith({
        where: { projectId: 'p1' },
      })
    })

    it('applies category, status, nodeId filters', async () => {
      mockPrisma.knowledgeEntry.findMany.mockResolvedValue([])
      await repo.listEntries('p1', {
        category: EntryCategory.decision,
        status: EntryStatus.published,
        nodeId: 'n1',
      })
      expect(mockPrisma.knowledgeEntry.findMany).toHaveBeenCalledWith({
        where: { projectId: 'p1', category: EntryCategory.decision, status: EntryStatus.published, nodeId: 'n1' },
      })
    })
  })

  describe('updateEntry', () => {
    it('updates specified fields', async () => {
      const updated = makeEntry({ title: 'New Title' })
      mockPrisma.knowledgeEntry.update.mockResolvedValue(updated)
      await repo.updateEntry('e1', { title: 'New Title' })
      expect(mockPrisma.knowledgeEntry.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { title: 'New Title' },
      })
    })
  })

  describe('appendRevision', () => {
    it('gets max version then creates next revision', async () => {
      mockPrisma.knowledgeRevision.aggregate.mockResolvedValue({ _max: { version: 2 } })
      mockPrisma.knowledgeRevision.create.mockResolvedValue(makeRevision({ version: 3 }))

      const result = await repo.appendRevision({
        entryId: 'e1',
        body: { summary: 'v3' },
        changeNote: 'updated',
        createdBy: CreatedBy.agent,
      })

      expect(mockPrisma.knowledgeRevision.aggregate).toHaveBeenCalledWith({
        where: { entryId: 'e1' },
        _max: { version: true },
      })
      expect(mockPrisma.knowledgeRevision.create).toHaveBeenCalledWith({
        data: {
          entryId: 'e1',
          version: 3,
          body: { summary: 'v3' },
          changeNote: 'updated',
          createdBy: CreatedBy.agent,
        },
      })
      expect(result.version).toBe(3)
    })
  })

  describe('listRevisions', () => {
    it('returns revisions ordered by version asc', async () => {
      mockPrisma.knowledgeRevision.findMany.mockResolvedValue([])
      await repo.listRevisions('e1')
      expect(mockPrisma.knowledgeRevision.findMany).toHaveBeenCalledWith({
        where: { entryId: 'e1' },
        orderBy: { version: 'asc' },
      })
    })
  })

  describe('getRevision', () => {
    it('finds revision by entryId + version', async () => {
      const revision = makeRevision({ version: 2 })
      mockPrisma.knowledgeRevision.findUnique.mockResolvedValue(revision)
      const result = await repo.getRevision('e1', 2)
      expect(mockPrisma.knowledgeRevision.findUnique).toHaveBeenCalledWith({
        where: { entryId_version: { entryId: 'e1', version: 2 } },
      })
      expect(result).toEqual(revision)
    })
  })
})
