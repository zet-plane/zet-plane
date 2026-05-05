import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GraphEventWorker } from './graph-event.worker'
import { Logger } from '@nestjs/common'
import type { Job } from 'bullmq'

function makeJob(name: string, data: Record<string, unknown>): Job {
  return { name, data } as unknown as Job
}

describe('GraphEventWorker', () => {
  let worker: GraphEventWorker
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    worker = new GraphEventWorker()
    logSpy = vi.spyOn(Logger, 'log').mockImplementation(() => undefined)
  })

  it('logs graph.edge.created', async () => {
    const payload = { edgeId: 'e1', fromId: 'a', toId: 'b', edgeType: 'composition', projectId: 'p1' }
    await worker.process(makeJob('graph.edge.created', payload))
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('graph.edge.created'),
    )
  })

  it('logs graph.node.checkpoint_elevated', async () => {
    const payload = { nodeId: 'n1', cyclePath: ['n1', 'n2'], projectId: 'p1' }
    await worker.process(makeJob('graph.node.checkpoint_elevated', payload))
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('graph.node.checkpoint_elevated'),
    )
  })

  it('logs graph.node.status_changed', async () => {
    const payload = { nodeId: 'n1', status: 'completed', previousStatus: 'active', projectId: 'p1' }
    await worker.process(makeJob('graph.node.status_changed', payload))
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('graph.node.status_changed'),
    )
  })

  it('logs graph.checkpoint.resolved', async () => {
    const payload = { nodeId: 'n1', resolution: 'continue', projectId: 'p1' }
    await worker.process(makeJob('graph.checkpoint.resolved', payload))
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('graph.checkpoint.resolved'),
    )
  })

  it('logs graph.node.deleted', async () => {
    const payload = { nodeId: 'n1', strategy: 'cascade', affectedNodeIds: ['n2'], projectId: 'p1' }
    await worker.process(makeJob('graph.node.deleted', payload))
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('graph.node.deleted'),
    )
  })
})
