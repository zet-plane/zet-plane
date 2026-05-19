import { Injectable, BadRequestException } from '@nestjs/common'
import type { IWebhookAdapter } from './adapter.interface'
import type { EventSource, NormalizedEvent } from '../types'

const HOOK_TYPE_TO_EVENT: Record<string, string> = {
  Stop: 'claude_hook.session_end',
  PostToolUse: 'claude_hook.tool_use',
}

@Injectable()
export class ClaudeHookAdapter implements IWebhookAdapter {
  readonly source: EventSource = 'claude_hook'

  normalize(payload: unknown, _headers: Record<string, string>, _rawBody: Buffer): NormalizedEvent {
    const body = payload as Record<string, unknown>
    const hookEventId = body.hook_event_id as string | undefined
    const hookType = body.hook_type as string | undefined
    const cwd = body.cwd as string | undefined

    if (!hookEventId) throw new BadRequestException('missing hook_event_id')
    if (!cwd) throw new BadRequestException('missing cwd')

    const eventType = hookType ? (HOOK_TYPE_TO_EVENT[hookType] ?? `claude_hook.${hookType.toLowerCase()}`) : 'claude_hook.unknown'

    return {
      source: 'claude_hook',
      eventType,
      idempotencyKey: `claude_hook:${hookEventId}`,
      sourceProjectHint: cwd,
      occurredAt: new Date(),
      payload: body,
    }
  }
}
