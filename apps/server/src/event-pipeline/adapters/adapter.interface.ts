import type { EventSource, NormalizedEvent } from '../types'

export interface IWebhookAdapter<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly source: EventSource
  normalize(payload: unknown, headers: Record<string, string>, rawBody: Buffer): NormalizedEvent<TPayload>
}
