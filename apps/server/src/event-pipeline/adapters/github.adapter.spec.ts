import { describe, it, expect, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'
import { GithubAdapter } from './github.adapter'

function sign(secret: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
}

function makeConfig(secret?: string) {
  return { integrations: { github: { webhookSecret: secret } } } as any
}

describe('GithubAdapter', () => {
  const secret = 'test-secret'
  let adapter: GithubAdapter

  beforeEach(() => {
    adapter = new GithubAdapter(makeConfig(secret))
  })

  it('normalizes push event with valid signature', () => {
    const payload = { ref: 'refs/heads/main', repository: { full_name: 'org/repo' }, commits: [] }
    const body = JSON.stringify(payload)
    const result = adapter.normalize(payload, {
      'x-github-delivery': 'del-1',
      'x-github-event': 'push',
      'x-hub-signature-256': sign(secret, body),
    }, Buffer.from(body))

    expect(result.source).toBe('github')
    expect(result.eventType).toBe('github.push')
    expect(result.idempotencyKey).toBe('github:del-1')
    expect(result.sourceProjectHint).toBe('org/repo')
    expect(result.payload).toEqual(payload)
  })

  it('throws BadRequestException on invalid signature', () => {
    const payload = { repository: { full_name: 'org/repo' } }
    const body = JSON.stringify(payload)
    expect(() => adapter.normalize(payload, {
      'x-github-delivery': 'del-1',
      'x-github-event': 'push',
      'x-hub-signature-256': 'sha256=invalid',
    }, Buffer.from(body))).toThrow(BadRequestException)
  })

  it('throws BadRequestException when X-GitHub-Delivery is missing', () => {
    const payload = { repository: { full_name: 'org/repo' } }
    const body = JSON.stringify(payload)
    expect(() => adapter.normalize(payload, {
      'x-github-event': 'push',
      'x-hub-signature-256': sign(secret, body),
    }, Buffer.from(body))).toThrow(BadRequestException)
  })

  it('throws BadRequestException when repository.full_name is missing', () => {
    const payload = { ref: 'refs/heads/main' }
    const body = JSON.stringify(payload)
    expect(() => adapter.normalize(payload, {
      'x-github-delivery': 'del-1',
      'x-github-event': 'push',
      'x-hub-signature-256': sign(secret, body),
    }, Buffer.from(body))).toThrow(BadRequestException)
  })

  it('skips signature check when no secret configured', () => {
    const noSecretAdapter = new GithubAdapter(makeConfig(undefined))
    const payload = { repository: { full_name: 'org/repo' } }
    const body = JSON.stringify(payload)
    const result = noSecretAdapter.normalize(payload, {
      'x-github-delivery': 'del-1',
      'x-github-event': 'issues',
    }, Buffer.from(body))
    expect(result.eventType).toBe('github.issues')
  })
})
