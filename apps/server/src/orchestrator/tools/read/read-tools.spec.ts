import { describe, it, expect, vi } from 'vitest'
import { getNodeTool } from './get-node.tool'
import { searchNodesTool } from './search-nodes.tool'

describe('getNodeTool', () => {
  it('returns node JSON when found', async () => {
    const mockGraphRepo = {
      findNode: vi.fn().mockResolvedValue({ id: 'n1', title: 'My Node', status: 'active', projectId: 'p1', type: 'scaffold', description: null, isCheckpoint: false, checkpointResolution: null, createdBy: 'human', createdAt: new Date(), updatedAt: new Date() }),
    }
    const t = getNodeTool(mockGraphRepo as any)
    const result = await t.invoke({ nodeId: 'n1' })
    const parsed = JSON.parse(result)
    expect(parsed.id).toBe('n1')
  })

  it('returns error JSON when node not found', async () => {
    const mockGraphRepo = {
      findNode: vi.fn().mockResolvedValue(null),
    }
    const t = getNodeTool(mockGraphRepo as any)
    const result = await t.invoke({ nodeId: 'missing' })
    const parsed = JSON.parse(result)
    expect(parsed.error).toBeDefined()
  })
})

describe('searchNodesTool', () => {
  it('returns matching nodes filtered by keyword', async () => {
    const mockGraphReader = {
      getCandidateNodes: vi.fn().mockResolvedValue([
        { id: 'n1', title: 'Auth Service', status: 'active', projectId: 'p1', type: 'scaffold', description: null, isCheckpoint: false },
        { id: 'n2', title: 'Payment', status: 'blocked', projectId: 'p1', type: 'scaffold', description: null, isCheckpoint: false },
      ]),
    }
    const t = searchNodesTool(mockGraphReader as any)
    const result = await t.invoke({ projectId: 'p1', keyword: 'auth' })
    const parsed = JSON.parse(result)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe('n1')
  })
})
