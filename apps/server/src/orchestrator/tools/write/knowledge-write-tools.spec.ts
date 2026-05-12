import { describe, it, expect, vi } from 'vitest'
import { createKnowledgeEntryTool } from './create-knowledge-entry.tool'
import { EntryStatus, EntryCategory, CreatedBy, EmbeddingStatus } from '@generated/client'

const makeEntry = (overrides = {}) => ({
  id: 'e1', projectId: 'p1', nodeId: 'n1', category: EntryCategory.finding,
  title: 'T', body: {}, status: EntryStatus.draft,
  embeddingStatus: EmbeddingStatus.unindexed, embedding: null,
  createdBy: CreatedBy.agent, createdAt: new Date(), updatedAt: new Date(),
  ...overrides,
})

describe('createKnowledgeEntryTool', () => {
  it('creates entry and returns entryId', async () => {
    const mockEntryService = {
      createEntry: vi.fn().mockResolvedValue(makeEntry()),
      listEntries: vi.fn().mockResolvedValue([]),
    }
    const mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    const t = createKnowledgeEntryTool({
      entryService: mockEntryService as any,
      publisher: mockPublisher as any,
      projectId: 'p1',
    })
    const result = await t.invoke({
      nodeId: 'n1', category: 'finding', title: 'Test', body: 'content',
    })
    const parsed = JSON.parse(result)
    expect(parsed.entryId).toBe('e1')
    expect(parsed.action).toBe('created')
  })

  it('returns duplicate_found when entry with same title exists', async () => {
    const mockEntryService = {
      createEntry: vi.fn(),
      listEntries: vi.fn().mockResolvedValue([makeEntry({ title: 'Test Finding' })]),
    }
    const mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    const t = createKnowledgeEntryTool({
      entryService: mockEntryService as any,
      publisher: mockPublisher as any,
      projectId: 'p1',
    })
    const result = await t.invoke({
      nodeId: 'n1', category: 'finding', title: 'Test Finding', body: 'content',
    })
    const parsed = JSON.parse(result)
    expect(parsed.action).toBe('duplicate_found')
    expect(parsed.existingId).toBe('e1')
    expect(mockEntryService.createEntry).not.toHaveBeenCalled()
  })
})
