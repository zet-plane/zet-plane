import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContextBuilderService } from './context-builder.service'
import {
  OrchestratorTaskType,
  OrchestratorSourceType,
  OrchestratorTaskStatus,
  type Prisma,
} from '@generated/client'

const makeTask = (type: OrchestratorTaskType, input: Prisma.JsonValue = {}) => ({
  id: 'task-1',
  projectId: 'p1',
  type,
  sourceType: OrchestratorSourceType.graph_event,
  sourceId: 'src-1',
  status: OrchestratorTaskStatus.pending,
  idempotencyKey: 'k',
  input,
  modelResult: null,
  error: null,
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe('ContextBuilderService', () => {
  let builder: ContextBuilderService
  let mockGraphReader: any
  let mockKnowledgeReader: any
  let mockTaskRepo: any
  let mockSkillRegistry: any

  beforeEach(() => {
    mockGraphReader = {
      getCandidateNodes: vi.fn().mockResolvedValue([]),
      getSubgraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
    }
    mockKnowledgeReader = {
      getRelatedEntries: vi.fn().mockResolvedValue([]),
    }
    mockTaskRepo = {
      findRecentByProject: vi.fn().mockResolvedValue([]),
    }
    mockSkillRegistry = {
      listSkills: vi.fn().mockReturnValue([
        { name: 'event-anchoring', description: 'Anchors events', applicableTasks: ['event_anchor'] },
      ]),
    }
    builder = new ContextBuilderService(
      mockGraphReader,
      mockKnowledgeReader,
      mockTaskRepo,
      mockSkillRegistry,
    )
  })

  it('builds context with project and trigger fields', async () => {
    const ctx = await builder.build(makeTask(OrchestratorTaskType.event_anchor, { projectId: 'p1' }))
    expect(ctx.project.id).toBe('p1')
    expect(ctx.trigger.sourceType).toBe('graph_event')
    expect(ctx.trigger.sourceId).toBe('src-1')
  })

  it('sets requiresHumanApproval=true for checkpoint tasks', async () => {
    const ctx = await builder.build(makeTask(OrchestratorTaskType.checkpoint))
    expect(ctx.constraints.requiresHumanApproval).toBe(true)
  })

  it('sets requiresHumanApproval=false for non-checkpoint tasks', async () => {
    const ctx = await builder.build(makeTask(OrchestratorTaskType.event_anchor))
    expect(ctx.constraints.requiresHumanApproval).toBe(false)
  })

  it('calls graph reader for event_anchor tasks', async () => {
    await builder.build(makeTask(OrchestratorTaskType.event_anchor))
    expect(mockGraphReader.getCandidateNodes).toHaveBeenCalledWith('p1')
  })

  it('skips graph reader for embedding tasks', async () => {
    await builder.build(makeTask(OrchestratorTaskType.embedding))
    expect(mockGraphReader.getCandidateNodes).not.toHaveBeenCalled()
  })

  it('populates availableSkills from skillRegistry.listSkills', async () => {
    const ctx = await builder.build(makeTask(OrchestratorTaskType.event_anchor))
    expect(mockSkillRegistry.listSkills).toHaveBeenCalled()
    expect(ctx.availableSkills).toEqual([
      { name: 'event-anchoring', description: 'Anchors events', applicableTasks: ['event_anchor'] },
    ])
  })
})
