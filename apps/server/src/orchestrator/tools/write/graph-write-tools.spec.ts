import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createNodeTool, DomainServiceError } from './create-node.tool'
import { updateNodeStatusTool } from './update-node-status.tool'
import { NodeStatus, NodeType, CreatedBy } from '@generated/client'

const makeNode = (overrides = {}) => ({
  id: 'n1', projectId: 'p1', type: NodeType.growth, title: 'T', description: null,
  status: NodeStatus.active, isCheckpoint: false, checkpointResolution: null,
  createdBy: CreatedBy.agent, createdAt: new Date(), updatedAt: new Date(),
  isProjectRoot: false,
  ...overrides,
})

describe('createNodeTool', () => {
  it('creates a growth node and returns its id', async () => {
    const mockNodeService = {
      listProjectNodes: vi.fn().mockResolvedValue([]),
      createNode: vi.fn().mockResolvedValue(makeNode()),
    }
    const t = createNodeTool({ nodeService: mockNodeService as any, projectId: 'p1' })
    const result = await t.invoke({ title: 'New Feature', description: 'desc' })
    const parsed = JSON.parse(result)
    expect(parsed.nodeId).toBe('n1')
    expect(parsed.alreadyExists).toBeUndefined()
  })

  it('returns existing node without creating when title already exists', async () => {
    const existing = makeNode({ id: 'existing-1', title: 'Existing Node' })
    const mockNodeService = {
      listProjectNodes: vi.fn().mockResolvedValue([existing]),
      createNode: vi.fn(),
    }
    const t = createNodeTool({ nodeService: mockNodeService as any, projectId: 'p1' })
    const result = await t.invoke({ title: 'Existing Node' })
    const parsed = JSON.parse(result)
    expect(parsed.nodeId).toBe('existing-1')
    expect(parsed.alreadyExists).toBe(true)
    expect(mockNodeService.createNode).not.toHaveBeenCalled()
  })

  it('throws DomainServiceError when ConflictException thrown', async () => {
    const { ConflictException } = await import('@nestjs/common')
    const mockNodeService = {
      listProjectNodes: vi.fn().mockResolvedValue([]),
      createNode: vi.fn().mockRejectedValue(new ConflictException('NODE_ARCHIVED')),
    }
    const t = createNodeTool({ nodeService: mockNodeService as any, projectId: 'p1' })
    await expect(t.invoke({ title: 'X' })).rejects.toBeInstanceOf(DomainServiceError)
  })
})

describe('updateNodeStatusTool', () => {
  it('calls updateStatus and returns updated node id', async () => {
    const mockNodeService = {
      updateStatus: vi.fn().mockResolvedValue(makeNode({ status: NodeStatus.completed })),
    }
    const t = updateNodeStatusTool({ nodeService: mockNodeService as any })
    const result = await t.invoke({ nodeId: 'n1', newStatus: 'completed' })
    const parsed = JSON.parse(result)
    expect(parsed.nodeId).toBe('n1')
    expect(mockNodeService.updateStatus).toHaveBeenCalledWith('n1', NodeStatus.completed)
  })

  it('throws DomainServiceError on ConflictException from domain service', async () => {
    const { ConflictException } = await import('@nestjs/common')
    const mockNodeService = {
      updateStatus: vi.fn().mockRejectedValue(new ConflictException('NODE_ARCHIVED')),
    }
    const t = updateNodeStatusTool({ nodeService: mockNodeService as any })
    await expect(t.invoke({ nodeId: 'n1', newStatus: 'active' })).rejects.toBeInstanceOf(DomainServiceError)
  })
})
