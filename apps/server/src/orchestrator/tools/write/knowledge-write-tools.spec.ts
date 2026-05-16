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
  it('creates entry and returns entryId without publishing embedding task directly', async () => {
    const mockEntryService = {
      createEntry: vi.fn().mockResolvedValue(makeEntry()),
      listEntries: vi.fn().mockResolvedValue([]),
    }
    const mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    const t = createKnowledgeEntryTool({
      entryService: mockEntryService as any,
      projectId: 'p1',
    })
    const result = await t.invoke({
      nodeId: 'n1', category: 'finding', title: 'Test', body: 'content',
    })
    const parsed = JSON.parse(result)
    expect(parsed.entryId).toBe('e1')
    expect(parsed.action).toBe('created')
    expect(mockPublisher.publish).not.toHaveBeenCalled()
  })

  it('returns duplicate_found when entry with a CJK-similar title exists', async () => {
    const mockEntryService = {
      createEntry: vi.fn(),
      listEntries: vi.fn().mockResolvedValue([
        makeEntry({ title: '支付网关集成三模块拆解方案确认' }),
      ]),
    }
    const mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    const t = createKnowledgeEntryTool({
      entryService: mockEntryService as any,
      projectId: 'p1',
    })
    // Similar but not identical title (differs by one char: 三模块 vs 三子模块)
    const result = await t.invoke({
      nodeId: 'n1', category: 'decision', title: '支付网关集成三子模块拆解方案', body: 'content',
    })
    const parsed = JSON.parse(result)
    expect(parsed.action).toBe('duplicate_found')
    expect(mockEntryService.createEntry).not.toHaveBeenCalled()
  })

  it('returns duplicate_found when entry with same title exists', async () => {
    const mockEntryService = {
      createEntry: vi.fn(),
      listEntries: vi.fn().mockResolvedValue([makeEntry({ title: 'Test Finding' })]),
    }
    const mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    const t = createKnowledgeEntryTool({
      entryService: mockEntryService as any,
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
