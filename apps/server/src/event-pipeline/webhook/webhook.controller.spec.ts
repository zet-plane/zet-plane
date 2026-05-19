import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundException, BadRequestException } from '@nestjs/common'
import { WebhookController } from './webhook.controller'

describe('WebhookController', () => {
  let controller: WebhookController
  let mockRegistry: any
  let mockQueue: any
  let mockAdapter: any

  beforeEach(() => {
    mockAdapter = {
      source: 'github',
      normalize: vi.fn().mockReturnValue({
        source: 'github',
        eventType: 'github.push',
        idempotencyKey: 'github:del-1',
        sourceProjectHint: 'org/repo',
        occurredAt: new Date(),
        payload: {},
      }),
    }
    mockRegistry = { get: vi.fn().mockReturnValue(mockAdapter) }
    mockQueue = { add: vi.fn().mockResolvedValue(undefined) }
    controller = new WebhookController(mockRegistry, mockQueue)
  })

  it('returns { received: true } and enqueues event for known source', async () => {
    const req = { headers: { 'x-github-delivery': 'del-1' }, rawBody: Buffer.from('{}') } as any
    const result = await controller.receive('github', {}, req)
    expect(result).toEqual({ received: true })
    expect(mockQueue.add).toHaveBeenCalledOnce()
    expect(mockQueue.add).toHaveBeenCalledWith('process', expect.objectContaining({ eventType: 'github.push' }))
  })

  it('throws NotFoundException for unknown source', async () => {
    mockRegistry.get.mockReturnValue(undefined)
    const req = { headers: {}, rawBody: Buffer.from('{}') } as any
    await expect(controller.receive('unknown', {}, req)).rejects.toThrow(NotFoundException)
    expect(mockQueue.add).not.toHaveBeenCalled()
  })

  it('does not enqueue when adapter.normalize throws', async () => {
    mockAdapter.normalize.mockImplementation(() => { throw new BadRequestException('bad') })
    const req = { headers: {}, rawBody: Buffer.from('{}') } as any
    await expect(controller.receive('github', {}, req)).rejects.toThrow(BadRequestException)
    expect(mockQueue.add).not.toHaveBeenCalled()
  })
})
