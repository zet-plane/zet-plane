import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AdapterRegistry } from './adapter.registry'
import type { IWebhookAdapter } from './adapter.interface'

function makeAdapter(source: string): IWebhookAdapter {
  return { source: source as any, normalize: vi.fn() }
}

describe('AdapterRegistry', () => {
  let registry: AdapterRegistry

  beforeEach(() => {
    registry = new AdapterRegistry()
  })

  it('returns registered adapter by source', () => {
    const adapter = makeAdapter('github')
    registry.register(adapter)
    expect(registry.get('github')).toBe(adapter)
  })

  it('returns undefined for unregistered source', () => {
    expect(registry.get('github')).toBeUndefined()
  })

  it('last registration wins for same source', () => {
    const a1 = makeAdapter('github')
    const a2 = makeAdapter('github')
    registry.register(a1)
    registry.register(a2)
    expect(registry.get('github')).toBe(a2)
  })
})
