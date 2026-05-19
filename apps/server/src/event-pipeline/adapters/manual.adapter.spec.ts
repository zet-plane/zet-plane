import { describe, it, expect, beforeEach } from 'vitest'
import { BadRequestException } from '@nestjs/common'
import { ManualAdapter } from './manual.adapter'

describe('ManualAdapter', () => {
  let adapter: ManualAdapter

  beforeEach(() => {
    adapter = new ManualAdapter()
  })

  it('normalizes manual event', () => {
    const payload = { uuid: 'uuid-1', projectHint: 'my-project', data: { foo: 'bar' } }
    const result = adapter.normalize(payload, {}, Buffer.from(JSON.stringify(payload)))
    expect(result.source).toBe('manual')
    expect(result.eventType).toBe('manual')
    expect(result.idempotencyKey).toBe('manual:uuid-1')
    expect(result.sourceProjectHint).toBe('my-project')
  })

  it('throws BadRequestException when uuid is missing', () => {
    const payload = { projectHint: 'proj' }
    expect(() => adapter.normalize(payload, {}, Buffer.from(JSON.stringify(payload))))
      .toThrow(BadRequestException)
  })

  it('throws BadRequestException when projectHint is missing', () => {
    const payload = { uuid: 'uuid-1' }
    expect(() => adapter.normalize(payload, {}, Buffer.from(JSON.stringify(payload))))
      .toThrow(BadRequestException)
  })
})
