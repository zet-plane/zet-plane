import { Controller, Post, Param, Body, Req, NotFoundException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import type { FastifyRequest } from 'fastify'
import { AdapterRegistry } from '../adapters/adapter.registry'
import { INCOMING_EVENTS_QUEUE } from '../types'

@Controller('webhooks')
export class WebhookController {
  constructor(
    private readonly registry: AdapterRegistry,
    @InjectQueue(INCOMING_EVENTS_QUEUE) private readonly queue: Queue,
  ) {}

  @Post(':source')
  async receive(
    @Param('source') source: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest & { rawBody?: Buffer },
  ): Promise<{ received: boolean }> {
    const adapter = this.registry.get(source)
    if (!adapter) throw new NotFoundException(`unknown webhook source: ${source}`)

    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0]! : (v ?? '')])
    )

    const event = adapter.normalize(body, headers, req.rawBody ?? Buffer.alloc(0))
    await this.queue.add('process', event)
    return { received: true }
  }
}
