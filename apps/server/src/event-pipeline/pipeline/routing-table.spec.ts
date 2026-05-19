import { describe, it, expect } from 'vitest'
import { ROUTING_RULES, DEFAULT_ROUTE } from './routing-table'

describe('routing-table', () => {
  const knownRoutes: Array<[string, string]> = [
    ['github.push', 'orchestrate'],
    ['github.pull_request', 'orchestrate'],
    ['github.issues', 'orchestrate'],
    ['feishu.message', 'orchestrate'],
    ['claude_hook.session_end', 'orchestrate'],
    ['claude_hook.tool_use', 'orchestrate'],
    ['manual', 'orchestrate'],
  ]

  it.each(knownRoutes)('routes %s → %s', (eventType, expected) => {
    expect(ROUTING_RULES[eventType]).toBe(expected)
  })

  it('default route is orchestrate for unknown eventType', () => {
    expect(DEFAULT_ROUTE).toBe('orchestrate')
    expect(ROUTING_RULES['unknown.event']).toBeUndefined()
  })
})
