import { describe, it, expect, vi } from 'vitest'
import { OrchestratorTaskType, OrchestratorTaskStatus, OrchestratorSourceType } from '@generated/client'
import { PromptBuilderService } from './prompt-builder.service'

const makeTask = (type = OrchestratorTaskType.event_anchor) => ({
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
  constraints: { mayWriteGraph: true, mayWriteKnowledge: true, requiresHumanApproval: false },
})

describe('PromptBuilderService', () => {
  const mockSkillRegistry = {
    getSystemPrompt: vi.fn().mockReturnValue('system prompt content'),
  }
  const service = new PromptBuilderService(mockSkillRegistry as any)

  it('delegates systemPrompt to SkillRegistry with task type', () => {
    const { systemPrompt } = service.build(makeTask(), makeCtx() as any)
    expect(mockSkillRegistry.getSystemPrompt).toHaveBeenCalledWith(OrchestratorTaskType.event_anchor)
    expect(systemPrompt).toBe('system prompt content')
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
})
