import { describe, it, expect, beforeEach } from 'vitest'
import { BadRequestException } from '@nestjs/common'
import { FeishuAdapter } from './feishu.adapter'

function makeConfig() {
  return { integrations: { feishu: { appId: 'app-1', appSecret: 'secret' } } } as any
}

describe('FeishuAdapter', () => {
  let adapter: FeishuAdapter

  beforeEach(() => {
    adapter = new FeishuAdapter(makeConfig())
  })

  it('normalizes im.message.receive_v1 event', () => {
    const payload = {
      schema: '2.0',
      header: { event_id: 'ev-1', event_type: 'im.message.receive_v1' },
      event: {
        message: { message_id: 'om_abc123', chat_id: 'oc_chat1', content: '{"text":"hello"}' },
      },
    }
    const result = adapter.normalize(payload, {}, Buffer.from(JSON.stringify(payload)))
    expect(result.source).toBe('feishu')
    expect(result.eventType).toBe('feishu.message')
    expect(result.idempotencyKey).toBe('feishu:om_abc123')
    expect(result.sourceProjectHint).toBe('oc_chat1')
  })

  it('throws BadRequestException when message_id is missing', () => {
    const payload = {
      schema: '2.0',
      header: { event_id: 'ev-1', event_type: 'im.message.receive_v1' },
      event: { message: { chat_id: 'oc_chat1' } },
    }
    expect(() => adapter.normalize(payload, {}, Buffer.from(JSON.stringify(payload))))
      .toThrow(BadRequestException)
  })

  it('throws BadRequestException when chat_id is missing', () => {
    const payload = {
      schema: '2.0',
      header: { event_id: 'ev-1', event_type: 'im.message.receive_v1' },
      event: { message: { message_id: 'om_abc' } },
    }
    expect(() => adapter.normalize(payload, {}, Buffer.from(JSON.stringify(payload))))
      .toThrow(BadRequestException)
  })
})
