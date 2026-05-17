import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentRuntimeService } from './agent-runtime.service'
import { OrchestratorTaskStatus, OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'

const makeTask = (overrides = {}) => ({
  id: 'task-1',
  projectId: 'p1',
  type: OrchestratorTaskType.event_anchor,
  sourceType: OrchestratorSourceType.graph_event,
  sourceId: 'src-1',
  status: OrchestratorTaskStatus.pending,
  idempotencyKey: 'key-1',
  input: {},
  modelResult: null,
  error: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('AgentRuntimeService', () => {
  let runtime: AgentRuntimeService
  let mockRepo: any
  let mockRunner: any

  beforeEach(() => {
    mockRepo = {
      findById: vi.fn().mockResolvedValue(makeTask()),
      updateStatus: vi.fn().mockResolvedValue(makeTask()),
    }
    mockRunner = {
      run: vi.fn().mockResolvedValue({ summary: 'done', signalType: 'progress', confidence: 0.9, evidence: [] }),
    }
    runtime = new AgentRuntimeService(mockRepo, mockRunner)
  })

  it('transitions task pending → running → succeeded on success', async () => {
    await runtime.execute('task-1')
    expect(mockRepo.updateStatus).toHaveBeenCalledWith('task-1', OrchestratorTaskStatus.running)
    expect(mockRepo.updateStatus).toHaveBeenCalledWith(
      'task-1',
      OrchestratorTaskStatus.succeeded,
      expect.objectContaining({ modelResult: expect.any(Object) }),
    )
  })

  it('transitions to waiting_for_approval on WaitingForApprovalSignal', async () => {
    const { WaitingForApprovalSignal } = await import('../tools/write/notify-human.tool')
    mockRunner.run.mockRejectedValue(new WaitingForApprovalSignal('needs review'))
    await runtime.execute('task-1')
    expect(mockRepo.updateStatus).toHaveBeenCalledWith('task-1', OrchestratorTaskStatus.waiting_for_approval)
  })

  it('marks failed and re-throws on unexpected error', async () => {
    mockRunner.run.mockRejectedValue(new Error('llm timeout'))
    await expect(runtime.execute('task-1')).rejects.toThrow('llm timeout')
    expect(mockRepo.updateStatus).toHaveBeenCalledWith(
      'task-1',
      OrchestratorTaskStatus.failed,
      expect.objectContaining({ error: expect.any(Object) }),
    )
  })

  it('does not retry on domain service failure (DomainServiceError)', async () => {
    const { DomainServiceError } = await import('../tools/write/create-node.tool')
    mockRunner.run.mockRejectedValue(new DomainServiceError('NODE_ARCHIVED'))
    await runtime.execute('task-1') // no throw — no BullMQ retry
    expect(mockRepo.updateStatus).toHaveBeenCalledWith(
      'task-1',
      OrchestratorTaskStatus.failed,
      expect.objectContaining({ error: { reason: 'NODE_ARCHIVED' } }),
    )
  })

  it('marks succeeded with noise signalType on SkipSignal', async () => {
    const { SkipSignal } = await import('../tools/write/skip.tool')
    mockRunner.run.mockRejectedValue(new SkipSignal('already anchored'))
    await runtime.execute('task-1')
    expect(mockRepo.updateStatus).toHaveBeenCalledWith(
      'task-1',
      OrchestratorTaskStatus.succeeded,
      expect.objectContaining({
        modelResult: expect.objectContaining({ signalType: 'noise' }),
      }),
    )
  })

  it('skips execution without touching status when task is already succeeded', async () => {
    mockRepo.findById.mockResolvedValue(makeTask({ status: OrchestratorTaskStatus.succeeded }))
    await runtime.execute('task-1')
    expect(mockRepo.updateStatus).not.toHaveBeenCalled()
    expect(mockRunner.run).not.toHaveBeenCalled()
  })

  it('skips execution without touching status when task is already waiting_for_approval', async () => {
    mockRepo.findById.mockResolvedValue(makeTask({ status: OrchestratorTaskStatus.waiting_for_approval }))
    await runtime.execute('task-1')
    expect(mockRepo.updateStatus).not.toHaveBeenCalled()
    expect(mockRunner.run).not.toHaveBeenCalled()
  })
})
