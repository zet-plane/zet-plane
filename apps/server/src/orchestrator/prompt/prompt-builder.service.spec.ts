import { describe, it, expect, vi } from 'vitest'
import {
  OrchestratorTaskType,
  OrchestratorTaskStatus,
  OrchestratorSourceType,
} from '@generated/client'
import { PromptBuilderService } from './prompt-builder.service'

const makeTask = (type: OrchestratorTaskType = OrchestratorTaskType.event_anchor) => ({
  id: 'task-1',
  projectId: 'proj-1',
  type,
  sourceType: OrchestratorSourceType.graph_event,
  sourceId: 'src-1',
  status: OrchestratorTaskStatus.pending,
  idempotencyKey: 'key-1',
  input: {},
  modelResult: null,
  error: null,
  createdAt: new Date(),
  updatedAt: new Date(),
})

const makeCtx = () => ({
  project: { id: 'proj-1', name: 'Test', status: 'active' },
  trigger: { sourceType: 'graph_event', sourceId: 'src-1', raw: { foo: 'bar' } },
  candidateNodes: [{ id: 'node-1' }],
  relatedEntries: [{ id: 'entry-1' }],
  recentTaskHistory: [],
  availableSkills: [
    { name: 'event-anchoring', description: 'Anchors events', applicableTasks: ['event_anchor'] },
  ],
  constraints: { mayWriteGraph: true, mayWriteKnowledge: true },
})

describe('PromptBuilderService', () => {
  const mockSkillRegistry = {
    getBaseContent: vi.fn().mockReturnValue('base system prompt content'),
  }
  const service = new PromptBuilderService(mockSkillRegistry as any)

  it('system prompt comes from skillRegistry.getBaseContent()', () => {
    const { systemPrompt } = service.build(makeTask(), makeCtx() as any)
    expect(mockSkillRegistry.getBaseContent).toHaveBeenCalled()
    expect(systemPrompt).toBe('base system prompt content')
  })

  it('userMessage contains task type, project id, and trigger', () => {
    const { userMessage } = service.build(makeTask(), makeCtx() as any)
    expect(userMessage).toContain('Task type: event_anchor')
    expect(userMessage).toContain('Project: proj-1')
    expect(userMessage).toContain('"foo":"bar"')
  })

  it('userMessage includes candidate nodes and related entries', () => {
    const { userMessage } = service.build(makeTask(), makeCtx() as any)
    expect(userMessage).toContain('node-1')
    expect(userMessage).toContain('entry-1')
  })

  it('userMessage includes availableSkills as JSON', () => {
    const { userMessage } = service.build(makeTask(), makeCtx() as any)
    expect(userMessage).toContain('event-anchoring')
    expect(userMessage).toContain('Available skills')
  })

  it('userMessage instructs agent to call use_skill before acting', () => {
    const { userMessage } = service.build(makeTask(), makeCtx() as any)
    expect(userMessage).toContain('use_skill')
  })

  it('instructs non-checkpoint tasks to conclude when work is done', () => {
    const { userMessage } = service.build(makeTask(), makeCtx() as any)
    expect(userMessage).toContain('call the `conclude` tool')
  })

  it('instructs checkpoint tasks to conclude with decision signalType and evidence', () => {
    const { userMessage } = service.build(
      makeTask(OrchestratorTaskType.checkpoint),
      makeCtx() as any,
    )
    expect(userMessage).toContain('signalType: decision')
    expect(userMessage).toContain('Do NOT call `notify_human`')
  })
})
