import { Injectable, BadRequestException } from '@nestjs/common'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { AppConfig } from '../../config/app-config'
import type { IWebhookAdapter } from './adapter.interface'
import type { EventSource, NormalizedEvent } from '../types'

@Injectable()
export class GithubAdapter implements IWebhookAdapter {
  readonly source: EventSource = 'github'
  private readonly secret?: string

  constructor(private readonly config: AppConfig) {
    this.secret = config.integrations.github.webhookSecret
  }

  normalize(payload: unknown, headers: Record<string, string>, rawBody: Buffer): NormalizedEvent {
    this.verifySignature(rawBody, headers)

    const delivery = headers['x-github-delivery']
    const event = headers['x-github-event']
    if (!delivery) throw new BadRequestException('missing X-GitHub-Delivery')
    if (!event) throw new BadRequestException('missing X-GitHub-Event')

    const body = payload as Record<string, unknown>
    const repo = (body.repository as Record<string, unknown> | undefined)?.full_name as string | undefined
    if (!repo) throw new BadRequestException('missing repository.full_name')

    return {
      source: 'github',
      eventType: `github.${event}`,
      idempotencyKey: `github:${delivery}`,
      sourceProjectHint: repo,
      occurredAt: new Date(),
      payload: body,
    }
  }

  private verifySignature(rawBody: Buffer, headers: Record<string, string>): void {
    if (!this.secret) return
    const signature = headers['x-hub-signature-256']
    if (!signature) throw new BadRequestException('missing X-Hub-Signature-256')
    const expected = 'sha256=' + createHmac('sha256', this.secret).update(rawBody).digest('hex')
    const sigBuf = Buffer.from(signature)
    const expBuf = Buffer.from(expected)
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new BadRequestException('invalid GitHub signature')
    }
  }
}
