import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OrchestratorTaskPublisher } from './orchestrator-task.publisher'
import { OrchestratorTaskStatus, OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'

describe('OrchestratorTaskPublisher', () => {
  let publisher: OrchestratorTaskPublisher
  let mockRepo: any
  let mockQueue: any

  const baseInput = {
    projectId: 'p1',
    type: OrchestratorTaskType.event_anchor,
    sourceType: OrchestratorSourceType.graph_event,
    sourceId: 'src-1',
    input: { nodeId: 'n1' },
  }

  beforeEach(() => {
    mockRepo = {
      findByIdempotencyKey: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'task-1', status: OrchestratorTaskStatus.pending }),
    }
    mockQueue = { add: vi.fn().mockResolvedValue(undefined) }
    publisher = new OrchestratorTaskPublisher(mockRepo, mockQueue)
  })

  it('creates task and enqueues job on first call', async () => {
    const result = await publisher.publish(baseInput)
    expect(result.created).toBe(true)
    expect(result.taskId).toBe('task-1')
    expect(mockRepo.create).toHaveBeenCalledOnce()
    expect(mockQueue.add).toHaveBeenCalledOnce()
  })

  it('creates task without enqueue when sync execution is requested', async () => {
    const result = await publisher.publish(baseInput, { enqueue: false })
    expect(result.created).toBe(true)
    expect(result.taskId).toBe('task-1')
    expect(mockRepo.create).toHaveBeenCalledOnce()
    expect(mockQueue.add).not.toHaveBeenCalled()
  })

  it('returns existing task without creating on duplicate key', async () => {
    mockRepo.findByIdempotencyKey.mockResolvedValue({
      id: 'task-existing',
      status: OrchestratorTaskStatus.pending,
    })
    const result = await publisher.publish(baseInput)
    expect(result.created).toBe(false)
    expect(result.taskId).toBe('task-existing')
    expect(mockRepo.create).not.toHaveBeenCalled()
    expect(mockQueue.add).not.toHaveBeenCalled()
  })

  it('generates same idempotency key for same inputs', async () => {
    await publisher.publish(baseInput)
    await publisher.publish(baseInput)
    const key1 = mockRepo.findByIdempotencyKey.mock.calls[0][0]
    const key2 = mockRepo.findByIdempotencyKey.mock.calls[1][0]
    expect(key1).toBe(key2)
    expect(key1).toHaveLength(64) // sha256 hex
  })

  it('generates different keys for different sourceIds', async () => {
    await publisher.publish(baseInput)
    await publisher.publish({ ...baseInput, sourceId: 'src-2' })
    const key1 = mockRepo.findByIdempotencyKey.mock.calls[0][0]
    const key2 = mockRepo.findByIdempotencyKey.mock.calls[1][0]
    expect(key1).not.toBe(key2)
  })
})
