import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OrchestratorTaskRepository } from './orchestrator-task.repository'
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

describe('OrchestratorTaskRepository', () => {
  let repo: OrchestratorTaskRepository
  let mockPrisma: any

  beforeEach(() => {
    mockPrisma = {
      orchestratorTask: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
      },
    }
    repo = new OrchestratorTaskRepository(mockPrisma)
  })

  it('creates a task', async () => {
    const task = makeTask()
    mockPrisma.orchestratorTask.create.mockResolvedValue(task)
    const result = await repo.create({
      projectId: 'p1',
      type: OrchestratorTaskType.event_anchor,
      sourceType: OrchestratorSourceType.graph_event,
      sourceId: 'src-1',
      idempotencyKey: 'key-1',
      input: {},
    })
    expect(result.id).toBe('task-1')
    expect(mockPrisma.orchestratorTask.create).toHaveBeenCalledOnce()
  })

  it('finds task by idempotency key', async () => {
    const task = makeTask()
    mockPrisma.orchestratorTask.findUnique.mockResolvedValue(task)
    const result = await repo.findByIdempotencyKey('key-1')
    expect(result?.id).toBe('task-1')
    expect(mockPrisma.orchestratorTask.findUnique).toHaveBeenCalledWith({
      where: { idempotencyKey: 'key-1' },
    })
  })

  it('returns null when idempotency key not found', async () => {
    mockPrisma.orchestratorTask.findUnique.mockResolvedValue(null)
    const result = await repo.findByIdempotencyKey('missing')
    expect(result).toBeNull()
  })

  it('updates status with modelResult', async () => {
    const task = makeTask({ status: OrchestratorTaskStatus.succeeded })
    mockPrisma.orchestratorTask.update.mockResolvedValue(task)
    await repo.updateStatus('task-1', OrchestratorTaskStatus.succeeded, {
      modelResult: { summary: 'done' },
    })
    expect(mockPrisma.orchestratorTask.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: expect.objectContaining({
        status: OrchestratorTaskStatus.succeeded,
        modelResult: { summary: 'done' },
      }),
    })
  })

  it('finds recent tasks by projectId', async () => {
    mockPrisma.orchestratorTask.findMany.mockResolvedValue([makeTask()])
    const results = await repo.findRecentByProject('p1', 10)
    expect(results).toHaveLength(1)
    expect(mockPrisma.orchestratorTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'p1' } }),
    )
  })
})
