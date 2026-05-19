export type EventSource = 'github' | 'feishu' | 'claude_hook' | 'manual' | 'cli'

export interface NormalizedEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  source: EventSource
  eventType: string        // e.g. 'github.push', 'feishu.message', 'claude_hook.session_end'
  idempotencyKey: string
  sourceProjectHint: string // e.g. 'org/repo', feishu chat_id, project path
  occurredAt: Date
  payload: TPayload
}

export type RouteTarget = 'direct' | 'orchestrate'

export const INCOMING_EVENTS_QUEUE = 'incoming-events'
