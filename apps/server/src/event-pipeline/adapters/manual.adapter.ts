import { Injectable, BadRequestException } from '@nestjs/common'
import type { IWebhookAdapter } from './adapter.interface'
import type { EventSource, NormalizedEvent } from '../types'

@Injectable()
export class ManualAdapter implements IWebhookAdapter {
  readonly source: EventSource = 'manual'

  normalize(payload: unknown, _headers: Record<string, string>, _rawBody: Buffer): NormalizedEvent {
    const body = payload as Record<string, unknown>
    const uuid = body.uuid as string | undefined
    const projectHint = body.projectHint as string | undefined

    if (!uuid) throw new BadRequestException('missing uuid')
    if (!projectHint) throw new BadRequestException('missing projectHint')

    return {
      source: 'manual',
      eventType: 'manual',
      idempotencyKey: `manual:${uuid}`,
      sourceProjectHint: projectHint,
      occurredAt: new Date(),
      payload: body,
    }
  }
}
