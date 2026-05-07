import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KnowledgeEventPublisher } from './knowledge-event.publisher'
import { EntryCategory, EntryStatus } from '@generated/client'

describe('KnowledgeEventPublisher', () => {
  let publisher: KnowledgeEventPublisher
  const mockAdd = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    mockAdd.mockClear()
    publisher = new KnowledgeEventPublisher({ add: mockAdd } as any)
  })

  it('publishes knowledge.entry.created', async () => {
    await publisher.publish({
      type: 'knowledge.entry.created',
      payload: { entryId: 'e1', projectId: 'p1', nodeId: 'n1', category: EntryCategory.decision },
    })
    expect(mockAdd).toHaveBeenCalledWith('knowledge.entry.created', {
      entryId: 'e1', projectId: 'p1', nodeId: 'n1', category: EntryCategory.decision,
    })
  })

  it('publishes knowledge.entry.body_revised', async () => {
    await publisher.publish({
      type: 'knowledge.entry.body_revised',
      payload: { entryId: 'e1', projectId: 'p1', version: 2 },
    })
    expect(mockAdd).toHaveBeenCalledWith('knowledge.entry.body_revised', {
      entryId: 'e1', projectId: 'p1', version: 2,
    })
  })

  it('publishes knowledge.entry.status_changed', async () => {
    await publisher.publish({
      type: 'knowledge.entry.status_changed',
      payload: { entryId: 'e1', projectId: 'p1', status: EntryStatus.published, previousStatus: EntryStatus.draft },
    })
    expect(mockAdd).toHaveBeenCalledWith('knowledge.entry.status_changed', {
      entryId: 'e1', projectId: 'p1', status: EntryStatus.published, previousStatus: EntryStatus.draft,
    })
  })

  it('publishes knowledge.entry.reanchored', async () => {
    await publisher.publish({
      type: 'knowledge.entry.reanchored',
      payload: { entryId: 'e1', projectId: 'p1', previousNodeId: 'n1', newNodeId: 'n2' },
    })
    expect(mockAdd).toHaveBeenCalledWith('knowledge.entry.reanchored', {
      entryId: 'e1', projectId: 'p1', previousNodeId: 'n1', newNodeId: 'n2',
    })
  })

  it('publishes knowledge.entry.indexed', async () => {
    await publisher.publish({
      type: 'knowledge.entry.indexed',
      payload: { entryId: 'e1', projectId: 'p1' },
    })
    expect(mockAdd).toHaveBeenCalledWith('knowledge.entry.indexed', {
      entryId: 'e1', projectId: 'p1',
    })
  })
})
