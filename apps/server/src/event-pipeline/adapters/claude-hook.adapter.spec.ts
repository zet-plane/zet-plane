import { describe, it, expect, beforeEach } from 'vitest'
import { BadRequestException } from '@nestjs/common'
import { ClaudeHookAdapter } from './claude-hook.adapter'

describe('ClaudeHookAdapter', () => {
  let adapter: ClaudeHookAdapter

  beforeEach(() => {
    adapter = new ClaudeHookAdapter()
  })

  it('normalizes session_end (Stop) event', () => {
    const payload = { hook_event_id: 'uuid-1', hook_type: 'Stop', session_id: 'sess-1', cwd: '/project/path' }
    const result = adapter.normalize(payload, {}, Buffer.from(JSON.stringify(payload)))
    expect(result.source).toBe('claude_hook')
    expect(result.eventType).toBe('claude_hook.session_end')
    expect(result.idempotencyKey).toBe('claude_hook:uuid-1')
    expect(result.sourceProjectHint).toBe('/project/path')
  })

  it('normalizes tool_use (PostToolUse) event', () => {
    const payload = { hook_event_id: 'uuid-2', hook_type: 'PostToolUse', session_id: 'sess-1', cwd: '/project' }
    const result = adapter.normalize(payload, {}, Buffer.from(JSON.stringify(payload)))
    expect(result.eventType).toBe('claude_hook.tool_use')
  })

  it('throws BadRequestException when hook_event_id is missing', () => {
    const payload = { hook_type: 'Stop', cwd: '/project' }
    expect(() => adapter.normalize(payload, {}, Buffer.from(JSON.stringify(payload))))
      .toThrow(BadRequestException)
  })

  it('throws BadRequestException when cwd is missing', () => {
    const payload = { hook_event_id: 'uuid-1', hook_type: 'Stop' }
    expect(() => adapter.normalize(payload, {}, Buffer.from(JSON.stringify(payload))))
      .toThrow(BadRequestException)
  })
})
