import { Injectable, BadRequestException } from '@nestjs/common'
import { AppConfig } from '../../config/app-config'
import type { IWebhookAdapter } from './adapter.interface'
import type { EventSource, NormalizedEvent } from '../types'

@Injectable()
export class FeishuAdapter implements IWebhookAdapter {
  readonly source: EventSource = 'feishu'

  constructor(private readonly config: AppConfig) {}

  normalize(payload: unknown, _headers: Record<string, string>, _rawBody: Buffer): NormalizedEvent {
    const body = payload as Record<string, unknown>
    const event = (body.event as Record<string, unknown> | undefined)
    const message = (event?.message as Record<string, unknown> | undefined)

    const messageId = message?.message_id as string | undefined
    const chatId = message?.chat_id as string | undefined

    if (!messageId) throw new BadRequestException('missing event.message.message_id')
    if (!chatId) throw new BadRequestException('missing event.message.chat_id')

    return {
      source: 'feishu',
      eventType: 'feishu.message',
      idempotencyKey: `feishu:${messageId}`,
      sourceProjectHint: chatId,
      occurredAt: new Date(),
      payload: body,
    }
  }
}
