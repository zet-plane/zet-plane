# Event Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Event Pipeline module that receives webhooks from GitHub, Feishu, Claude Code, and manual triggers, normalizes them, deduplicates, resolves project context, and routes to the Orchestrator.

**Architecture:** Unified `POST /webhooks/:source` endpoint → `AdapterRegistry` dispatches to the correct adapter → normalized event queued to BullMQ `incoming-events` → `EventPipelineWorker` runs a 4-step pipeline: dedup → enrich (resolve projectId) → route → dispatch to `OrchestratorTaskPublisher`. All events currently route to `orchestrate`; the `direct` path is wired but unused in MVP.

**Tech Stack:** NestJS, BullMQ (`@nestjs/bullmq`), Prisma, Fastify, Vitest

---

## File Map

| File | Role |
|------|------|
| `src/event-pipeline/types.ts` | `EventSource`, `NormalizedEvent<T>`, `RouteTarget`, queue constant |
| `src/event-pipeline/adapters/adapter.interface.ts` | `IWebhookAdapter<T>` interface |
| `src/event-pipeline/adapters/adapter.registry.ts` | Registry: source → adapter map |
| `src/event-pipeline/adapters/github.adapter.ts` | GitHub webhook → NormalizedEvent (HMAC verify) |
| `src/event-pipeline/adapters/feishu.adapter.ts` | Feishu webhook → NormalizedEvent |
| `src/event-pipeline/adapters/claude-hook.adapter.ts` | Claude Code hook → NormalizedEvent |
| `src/event-pipeline/adapters/manual.adapter.ts` | Manual trigger → NormalizedEvent |
| `src/event-pipeline/adapters/cli.adapter.ts` | Placeholder, not implemented |
| `src/event-pipeline/webhook/webhook.controller.ts` | HTTP entry, delegates to registry |
| `src/event-pipeline/repository/incoming-event.repository.ts` | Prisma CRUD for incoming_events + project_source_mappings |
| `src/event-pipeline/pipeline/deduplication.service.ts` | Idempotency check + insert |
| `src/event-pipeline/pipeline/enrichment.service.ts` | source+hint → projectId via mapping table |
| `src/event-pipeline/pipeline/routing-table.ts` | Static `eventType → RouteTarget` rules |
| `src/event-pipeline/pipeline/event-pipeline.worker.ts` | BullMQ worker, orchestrates 4 steps |
| `src/event-pipeline/event-pipeline.module.ts` | NestJS module wiring |
| `apps/server/prisma/schema.prisma` | Add `IncomingEvent`, `ProjectSourceMapping`, enums |
| `apps/server/src/app.module.ts` | Register `EventPipelineModule` |
| `apps/server/src/main.ts` | Configure Fastify raw body parser |

---

## Task 1: Types, Constants, Adapter Interface

**Files:**
- Create: `apps/server/src/event-pipeline/types.ts`
- Create: `apps/server/src/event-pipeline/adapters/adapter.interface.ts`

No tests — pure type definitions.

- [ ] **Step 1: Create types.ts**

```typescript
// apps/server/src/event-pipeline/types.ts

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
```

- [ ] **Step 2: Create adapter.interface.ts**

```typescript
// apps/server/src/event-pipeline/adapters/adapter.interface.ts

import type { EventSource, NormalizedEvent } from '../types'

export interface IWebhookAdapter<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly source: EventSource
  normalize(payload: unknown, headers: Record<string, string>, rawBody: Buffer): NormalizedEvent<TPayload>
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/event-pipeline/types.ts apps/server/src/event-pipeline/adapters/adapter.interface.ts
git commit -m "feat(event-pipeline): add types and adapter interface"
```

---

## Task 2: Prisma Schema Migration

**Files:**
- Modify: `apps/server/prisma/schema.prisma`

- [ ] **Step 1: Add enums and models to schema.prisma**

Add after the existing `OrchestratorSourceType` enum (extend it with `incoming_event`):

```prisma
// Extend existing enum — add incoming_event value
enum OrchestratorSourceType {
  graph_event
  knowledge_event
  schedule
  manual
  incoming_event   // ← add this

  @@map("orchestrator_source_type")
}
```

Add the two new enums and two new models at the end of schema.prisma:

```prisma
enum EventSource {
  github
  feishu
  claude_hook
  manual
  cli

  @@map("event_source")
}

enum IncomingEventStatus {
  pending
  processing
  routed
  deduplicated
  failed

  @@map("incoming_event_status")
}

model IncomingEvent {
  id             String              @id @default(uuid())
  source         EventSource
  idempotencyKey String              @unique @map("idempotency_key")
  projectId      String?             @map("project_id")
  eventType      String              @map("event_type")
  payload        Json
  status         IncomingEventStatus @default(pending)
  routedTo       String?             @map("routed_to")
  error          Json?
  createdAt      DateTime            @default(now()) @map("created_at")
  updatedAt      DateTime            @updatedAt @map("updated_at")

  @@index([projectId], map: "idx_incoming_events_project_id")
  @@index([status],    map: "idx_incoming_events_status")
  @@map("incoming_events")
}

model ProjectSourceMapping {
  id          String      @id @default(uuid())
  projectId   String      @map("project_id")
  source      EventSource
  sourceKey   String      @map("source_key")
  createdAt   DateTime    @default(now()) @map("created_at")

  @@unique([source, sourceKey], map: "uk_project_source_mappings_source_key")
  @@index([projectId],          map: "idx_project_source_mappings_project_id")
  @@map("project_source_mappings")
}
```

- [ ] **Step 2: Run migration**

```bash
cd apps/server
pnpm prisma migrate dev --name add-event-pipeline
```

Expected: migration file created, database updated.

- [ ] **Step 3: Regenerate Prisma client**

```bash
pnpm prisma generate
```

Expected: `src/prisma/gen/client/` updated with `IncomingEvent`, `ProjectSourceMapping`, `EventSource`, `IncomingEventStatus`, and `incoming_event` added to `OrchestratorSourceType`.

- [ ] **Step 4: Commit**

```bash
git add apps/server/prisma/ apps/server/src/prisma/gen/
git commit -m "feat(event-pipeline): add incoming_events and project_source_mappings schema"
```

---

## Task 3: AdapterRegistry

**Files:**
- Create: `apps/server/src/event-pipeline/adapters/adapter.registry.ts`
- Create: `apps/server/src/event-pipeline/adapters/adapter.registry.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/server/src/event-pipeline/adapters/adapter.registry.spec.ts

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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server
pnpm vitest run src/event-pipeline/adapters/adapter.registry.spec.ts
```

Expected: FAIL — `AdapterRegistry` not found.

- [ ] **Step 3: Implement AdapterRegistry**

```typescript
// apps/server/src/event-pipeline/adapters/adapter.registry.ts

import { Injectable } from '@nestjs/common'
import type { IWebhookAdapter } from './adapter.interface'
import type { EventSource } from '../types'

@Injectable()
export class AdapterRegistry {
  private readonly map = new Map<EventSource, IWebhookAdapter>()

  register(adapter: IWebhookAdapter): void {
    this.map.set(adapter.source, adapter)
  }

  get(source: string): IWebhookAdapter | undefined {
    return this.map.get(source as EventSource)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run src/event-pipeline/adapters/adapter.registry.spec.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/event-pipeline/adapters/adapter.registry.ts apps/server/src/event-pipeline/adapters/adapter.registry.spec.ts
git commit -m "feat(event-pipeline): add AdapterRegistry"
```

---

## Task 4: GithubAdapter

**Files:**
- Create: `apps/server/src/event-pipeline/adapters/github.adapter.ts`
- Create: `apps/server/src/event-pipeline/adapters/github.adapter.spec.ts`

GitHub sends `X-GitHub-Delivery` (idempotency key), `X-GitHub-Event` (event type), and `X-Hub-Signature-256` (HMAC). The adapter verifies the HMAC using `AppConfig.integrations.github.webhookSecret`.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/server/src/event-pipeline/adapters/github.adapter.spec.ts

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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/event-pipeline/adapters/github.adapter.spec.ts
```

Expected: FAIL — `GithubAdapter` not found.

- [ ] **Step 3: Implement GithubAdapter**

```typescript
// apps/server/src/event-pipeline/adapters/github.adapter.ts

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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run src/event-pipeline/adapters/github.adapter.spec.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/event-pipeline/adapters/github.adapter.ts apps/server/src/event-pipeline/adapters/github.adapter.spec.ts
git commit -m "feat(event-pipeline): add GithubAdapter with HMAC verification"
```

---

## Task 5: FeishuAdapter

**Files:**
- Create: `apps/server/src/event-pipeline/adapters/feishu.adapter.ts`
- Create: `apps/server/src/event-pipeline/adapters/feishu.adapter.spec.ts`

Feishu sends events with `message_id` as the natural idempotency key. The chat_id serves as `sourceProjectHint`. Signature verification is MVP-placeholder (config exists but verification logic deferred).

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/server/src/event-pipeline/adapters/feishu.adapter.spec.ts

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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/event-pipeline/adapters/feishu.adapter.spec.ts
```

Expected: FAIL — `FeishuAdapter` not found.

- [ ] **Step 3: Implement FeishuAdapter**

```typescript
// apps/server/src/event-pipeline/adapters/feishu.adapter.ts

import { Injectable, BadRequestException } from '@nestjs/common'
import { AppConfig } from '../../config/app-config'
import type { IWebhookAdapter } from './adapter.interface'
import type { EventSource, NormalizedEvent } from '../types'

@Injectable()
export class FeishuAdapter implements IWebhookAdapter {
  readonly source: EventSource = 'feishu'

  constructor(private readonly config: AppConfig) {}

  normalize(payload: unknown, headers: Record<string, string>, _rawBody: Buffer): NormalizedEvent {
    const body = payload as Record<string, unknown>
    const event = (body.event as Record<string, unknown> | undefined)
    const message = (event?.message as Record<string, unknown> | undefined)

    const messageId = message?.message_id as string | undefined
    const chatId = message?.chat_id as string | undefined

    if (!messageId) throw new BadRequestException('missing event.message.message_id')
    if (!chatId) throw new BadRequestException('missing event.message.chat_id')

    return {
      source: 'feishu',
      eventType: 'feishu.message',
      idempotencyKey: `feishu:${messageId}`,
      sourceProjectHint: chatId,
      occurredAt: new Date(),
      payload: body,
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run src/event-pipeline/adapters/feishu.adapter.spec.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/event-pipeline/adapters/feishu.adapter.ts apps/server/src/event-pipeline/adapters/feishu.adapter.spec.ts
git commit -m "feat(event-pipeline): add FeishuAdapter"
```

---

## Task 6: ClaudeHookAdapter + ManualAdapter + CLI Placeholder

**Files:**
- Create: `apps/server/src/event-pipeline/adapters/claude-hook.adapter.ts`
- Create: `apps/server/src/event-pipeline/adapters/claude-hook.adapter.spec.ts`
- Create: `apps/server/src/event-pipeline/adapters/manual.adapter.ts`
- Create: `apps/server/src/event-pipeline/adapters/manual.adapter.spec.ts`
- Create: `apps/server/src/event-pipeline/adapters/cli.adapter.ts` (placeholder, no test)

Claude Code hooks send `hook_event_id` (UUID, caller-generated), `hook_type` (`PostToolUse` | `Stop`), and `cwd` (working directory used as sourceProjectHint).

- [ ] **Step 1: Write failing tests for ClaudeHookAdapter**

```typescript
// apps/server/src/event-pipeline/adapters/claude-hook.adapter.spec.ts

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
```

- [ ] **Step 2: Write failing tests for ManualAdapter**

```typescript
// apps/server/src/event-pipeline/adapters/manual.adapter.spec.ts

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
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm vitest run src/event-pipeline/adapters/claude-hook.adapter.spec.ts src/event-pipeline/adapters/manual.adapter.spec.ts
```

Expected: FAIL — adapters not found.

- [ ] **Step 4: Implement ClaudeHookAdapter**

```typescript
// apps/server/src/event-pipeline/adapters/claude-hook.adapter.ts

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
```

- [ ] **Step 5: Implement ManualAdapter**

```typescript
// apps/server/src/event-pipeline/adapters/manual.adapter.ts

import { Injectable, BadRequestException } from '@nestjs/common'
import type { IWebhookAdapter } from './adapter.interface'
import type { EventSource, NormalizedEvent } from '../types'

@Injectable()
export class ManualAdapter implements IWebhookAdapter {
  readonly source: EventSource = 'manual'

  normalize(payload: unknown, _headers: Record<string, string>, _rawBody: Buffer): NormalizedEvent {
    const body = payload as Record<string, unknown>
    const uuid = body.uuid as string | undefined
    const projectHint = body.projectHint as string | undefined

    if (!uuid) throw new BadRequestException('missing uuid')
    if (!projectHint) throw new BadRequestException('missing projectHint')

    return {
      source: 'manual',
      eventType: 'manual',
      idempotencyKey: `manual:${uuid}`,
      sourceProjectHint: projectHint,
      occurredAt: new Date(),
      payload: body,
    }
  }
}
```

- [ ] **Step 6: Create CLI placeholder**

```typescript
// apps/server/src/event-pipeline/adapters/cli.adapter.ts

// TODO: implement when zet-plane CLI is built
// This file is a placeholder so the source value 'cli' is reserved.
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
pnpm vitest run src/event-pipeline/adapters/claude-hook.adapter.spec.ts src/event-pipeline/adapters/manual.adapter.spec.ts
```

Expected: 7 passed total.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/event-pipeline/adapters/
git commit -m "feat(event-pipeline): add ClaudeHookAdapter, ManualAdapter, CLI placeholder"
```

---

## Task 7: WebhookController

**Files:**
- Modify: `apps/server/src/main.ts` (add Fastify raw body parser)
- Create: `apps/server/src/event-pipeline/webhook/webhook.controller.ts`
- Create: `apps/server/src/event-pipeline/webhook/webhook.controller.spec.ts`

The controller needs access to the raw request body (bytes) for signature verification. Fastify doesn't expose this by default — we configure a custom content type parser in `main.ts` that stores the raw buffer on the request object before parsing JSON.

- [ ] **Step 1: Configure Fastify raw body in main.ts**

In `main.ts`, before `await app.listen(...)`, add:

```typescript
// After NestFactory.create and before app.listen:
app.getInstance().addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
  try {
    ;(req as any).rawBody = body
    done(null, JSON.parse((body as Buffer).toString()))
  } catch (err) {
    done(err as Error, undefined)
  }
})
```

Full updated `main.ts`:

```typescript
import { join } from "path";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { cleanupOpenApiDoc } from "nestjs-zod";
import { AppModule } from "./app.module";
import { AppConfig } from "./config/app-config";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  // Store raw body buffer on request for webhook signature verification
  app.getInstance().addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    try {
      ;(req as any).rawBody = body
      done(null, JSON.parse((body as Buffer).toString()))
    } catch (err) {
      done(err as Error, undefined)
    }
  })

  app.setGlobalPrefix("api");

  const config = new DocumentBuilder()
    .setTitle("Zet Plane API")
    .setVersion("1.0")
    .addTag("graph", "Scaffold Graph Engine")
    .addTag("knowledge", "Knowledge Engine")
    .build();

  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
  SwaggerModule.setup("api-docs", app, document);

  if (process.env.NODE_ENV === "production") {
    const webDistPath = join(__dirname, "..", "..", "web", "dist");
    await app.register(require("@fastify/static"), { root: webDistPath, prefix: "/", wildcard: false });
    app.getHttpAdapter().getInstance().setNotFoundHandler((_req: unknown, reply: any) => {
      reply.sendFile("index.html");
    });
  }

  const port = app.get(AppConfig).server.port;
  await app.listen(port, "0.0.0.0");
}
bootstrap();
```

- [ ] **Step 2: Write the failing tests**

```typescript
// apps/server/src/event-pipeline/webhook/webhook.controller.spec.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundException, BadRequestException } from '@nestjs/common'
import { WebhookController } from './webhook.controller'

describe('WebhookController', () => {
  let controller: WebhookController
  let mockRegistry: any
  let mockQueue: any
  let mockAdapter: any

  beforeEach(() => {
    mockAdapter = {
      source: 'github',
      normalize: vi.fn().mockReturnValue({
        source: 'github',
        eventType: 'github.push',
        idempotencyKey: 'github:del-1',
        sourceProjectHint: 'org/repo',
        occurredAt: new Date(),
        payload: {},
      }),
    }
    mockRegistry = { get: vi.fn().mockReturnValue(mockAdapter) }
    mockQueue = { add: vi.fn().mockResolvedValue(undefined) }
    controller = new WebhookController(mockRegistry, mockQueue)
  })

  it('returns { received: true } and enqueues event for known source', async () => {
    const req = { headers: { 'x-github-delivery': 'del-1' }, rawBody: Buffer.from('{}') } as any
    const result = await controller.receive('github', {}, req)
    expect(result).toEqual({ received: true })
    expect(mockQueue.add).toHaveBeenCalledOnce()
    expect(mockQueue.add).toHaveBeenCalledWith('process', expect.objectContaining({ eventType: 'github.push' }))
  })

  it('throws NotFoundException for unknown source', async () => {
    mockRegistry.get.mockReturnValue(undefined)
    const req = { headers: {}, rawBody: Buffer.from('{}') } as any
    await expect(controller.receive('unknown', {}, req)).rejects.toThrow(NotFoundException)
    expect(mockQueue.add).not.toHaveBeenCalled()
  })

  it('does not enqueue when adapter.normalize throws', async () => {
    mockAdapter.normalize.mockImplementation(() => { throw new BadRequestException('bad') })
    const req = { headers: {}, rawBody: Buffer.from('{}') } as any
    await expect(controller.receive('github', {}, req)).rejects.toThrow(BadRequestException)
    expect(mockQueue.add).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm vitest run src/event-pipeline/webhook/webhook.controller.spec.ts
```

Expected: FAIL — `WebhookController` not found.

- [ ] **Step 4: Implement WebhookController**

```typescript
// apps/server/src/event-pipeline/webhook/webhook.controller.ts

import { Controller, Post, Param, Body, Req, NotFoundException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import type { FastifyRequest } from 'fastify'
import { AdapterRegistry } from '../adapters/adapter.registry'
import { INCOMING_EVENTS_QUEUE } from '../types'

@Controller('webhooks')
export class WebhookController {
  constructor(
    private readonly registry: AdapterRegistry,
    @InjectQueue(INCOMING_EVENTS_QUEUE) private readonly queue: Queue,
  ) {}

  @Post(':source')
  async receive(
    @Param('source') source: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest & { rawBody?: Buffer },
  ): Promise<{ received: boolean }> {
    const adapter = this.registry.get(source)
    if (!adapter) throw new NotFoundException(`unknown webhook source: ${source}`)

    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0]! : (v ?? '')])
    )

    const event = adapter.normalize(body, headers, req.rawBody ?? Buffer.alloc(0))
    await this.queue.add('process', event)
    return { received: true }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm vitest run src/event-pipeline/webhook/webhook.controller.spec.ts
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/main.ts apps/server/src/event-pipeline/webhook/
git commit -m "feat(event-pipeline): add WebhookController with raw body forwarding"
```

---

## Task 8: IncomingEventRepository

**Files:**
- Create: `apps/server/src/event-pipeline/repository/incoming-event.repository.ts`

Per design spec, no unit test — covered by future E2E.

- [ ] **Step 1: Implement IncomingEventRepository**

```typescript
// apps/server/src/event-pipeline/repository/incoming-event.repository.ts

import { Injectable } from '@nestjs/common'
import { IncomingEventStatus, EventSource, Prisma } from '@generated/client'
import { PrismaService } from '../../prisma/prisma.service'
import type { NormalizedEvent } from '../types'

@Injectable()
export class IncomingEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByIdempotencyKey(key: string) {
    return this.prisma.incomingEvent.findUnique({ where: { idempotencyKey: key } })
  }

  async insert(event: NormalizedEvent) {
    return this.prisma.incomingEvent.create({
      data: {
        source: event.source as EventSource,
        idempotencyKey: event.idempotencyKey,
        eventType: event.eventType,
        payload: event.payload as Prisma.JsonValue,
        status: IncomingEventStatus.processing,
      },
    })
  }

  async updateStatus(
    id: string,
    status: IncomingEventStatus,
    extras: { projectId?: string; routedTo?: string; error?: Prisma.JsonValue } = {},
  ): Promise<void> {
    await this.prisma.incomingEvent.update({ where: { id }, data: { status, ...extras } })
  }

  async findSourceMapping(source: string, sourceKey: string) {
    return this.prisma.projectSourceMapping.findUnique({
      where: { uk_project_source_mappings_source_key: { source: source as EventSource, sourceKey } },
    })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/event-pipeline/repository/incoming-event.repository.ts
git commit -m "feat(event-pipeline): add IncomingEventRepository"
```

---

## Task 9: DeduplicationService

**Files:**
- Create: `apps/server/src/event-pipeline/pipeline/deduplication.service.ts`
- Create: `apps/server/src/event-pipeline/pipeline/deduplication.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/server/src/event-pipeline/pipeline/deduplication.service.spec.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DeduplicationService } from './deduplication.service'
import type { NormalizedEvent } from '../types'

const baseEvent: NormalizedEvent = {
  source: 'github',
  eventType: 'github.push',
  idempotencyKey: 'github:del-1',
  sourceProjectHint: 'org/repo',
  occurredAt: new Date(),
  payload: {},
}

describe('DeduplicationService', () => {
  let service: DeduplicationService
  let mockRepo: any

  beforeEach(() => {
    mockRepo = {
      findByIdempotencyKey: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    }
    service = new DeduplicationService(mockRepo)
  })

  it('returns new with recordId when key is unseen', async () => {
    mockRepo.findByIdempotencyKey.mockResolvedValue(null)
    mockRepo.insert.mockResolvedValue({ id: 'rec-1' })

    const result = await service.checkAndInsert(baseEvent)
    expect(result).toEqual({ status: 'new', recordId: 'rec-1' })
    expect(mockRepo.insert).toHaveBeenCalledOnce()
  })

  it('returns duplicate and marks existing record when key already exists', async () => {
    mockRepo.findByIdempotencyKey.mockResolvedValue({ id: 'rec-existing' })

    const result = await service.checkAndInsert(baseEvent)
    expect(result).toEqual({ status: 'duplicate' })
    expect(mockRepo.updateStatus).toHaveBeenCalledWith('rec-existing', 'deduplicated')
    expect(mockRepo.insert).not.toHaveBeenCalled()
  })

  it('propagates error when DB insert fails', async () => {
    mockRepo.findByIdempotencyKey.mockResolvedValue(null)
    mockRepo.insert.mockRejectedValue(new Error('DB error'))

    await expect(service.checkAndInsert(baseEvent)).rejects.toThrow('DB error')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/event-pipeline/pipeline/deduplication.service.spec.ts
```

Expected: FAIL — `DeduplicationService` not found.

- [ ] **Step 3: Implement DeduplicationService**

```typescript
// apps/server/src/event-pipeline/pipeline/deduplication.service.ts

import { Injectable } from '@nestjs/common'
import { IncomingEventStatus } from '@generated/client'
import { IncomingEventRepository } from '../repository/incoming-event.repository'
import type { NormalizedEvent } from '../types'

export type DedupResult = { status: 'new'; recordId: string } | { status: 'duplicate' }

@Injectable()
export class DeduplicationService {
  constructor(private readonly repo: IncomingEventRepository) {}

  async checkAndInsert(event: NormalizedEvent): Promise<DedupResult> {
    const existing = await this.repo.findByIdempotencyKey(event.idempotencyKey)
    if (existing) {
      await this.repo.updateStatus(existing.id, IncomingEventStatus.deduplicated)
      return { status: 'duplicate' }
    }
    const record = await this.repo.insert(event)
    return { status: 'new', recordId: record.id }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run src/event-pipeline/pipeline/deduplication.service.spec.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/event-pipeline/pipeline/deduplication.service.ts apps/server/src/event-pipeline/pipeline/deduplication.service.spec.ts
git commit -m "feat(event-pipeline): add DeduplicationService"
```

---

## Task 10: EnrichmentService

**Files:**
- Create: `apps/server/src/event-pipeline/pipeline/enrichment.service.ts`
- Create: `apps/server/src/event-pipeline/pipeline/enrichment.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/server/src/event-pipeline/pipeline/enrichment.service.spec.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EnrichmentService, NoProjectMappingError } from './enrichment.service'
import type { NormalizedEvent } from '../types'

const baseEvent: NormalizedEvent = {
  source: 'github',
  eventType: 'github.push',
  idempotencyKey: 'github:del-1',
  sourceProjectHint: 'org/repo',
  occurredAt: new Date(),
  payload: {},
}

describe('EnrichmentService', () => {
  let service: EnrichmentService
  let mockRepo: any

  beforeEach(() => {
    mockRepo = { findSourceMapping: vi.fn() }
    service = new EnrichmentService(mockRepo)
  })

  it('returns projectId when mapping exists', async () => {
    mockRepo.findSourceMapping.mockResolvedValue({ projectId: 'proj-1' })
    const result = await service.resolveProjectId(baseEvent)
    expect(result).toBe('proj-1')
    expect(mockRepo.findSourceMapping).toHaveBeenCalledWith('github', 'org/repo')
  })

  it('throws NoProjectMappingError when no mapping found', async () => {
    mockRepo.findSourceMapping.mockResolvedValue(null)
    await expect(service.resolveProjectId(baseEvent)).rejects.toThrow(NoProjectMappingError)
  })

  it('propagates error on DB failure', async () => {
    mockRepo.findSourceMapping.mockRejectedValue(new Error('DB timeout'))
    await expect(service.resolveProjectId(baseEvent)).rejects.toThrow('DB timeout')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/event-pipeline/pipeline/enrichment.service.spec.ts
```

Expected: FAIL — `EnrichmentService` not found.

- [ ] **Step 3: Implement EnrichmentService**

```typescript
// apps/server/src/event-pipeline/pipeline/enrichment.service.ts

import { Injectable } from '@nestjs/common'
import { IncomingEventRepository } from '../repository/incoming-event.repository'
import type { NormalizedEvent } from '../types'

export class NoProjectMappingError extends Error {
  constructor(source: string, hint: string) {
    super(`no project_source_mapping for ${source}:${hint}`)
    this.name = 'NoProjectMappingError'
  }
}

@Injectable()
export class EnrichmentService {
  constructor(private readonly repo: IncomingEventRepository) {}

  async resolveProjectId(event: NormalizedEvent): Promise<string> {
    const mapping = await this.repo.findSourceMapping(event.source, event.sourceProjectHint)
    if (!mapping) throw new NoProjectMappingError(event.source, event.sourceProjectHint)
    return mapping.projectId
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run src/event-pipeline/pipeline/enrichment.service.spec.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/event-pipeline/pipeline/enrichment.service.ts apps/server/src/event-pipeline/pipeline/enrichment.service.spec.ts
git commit -m "feat(event-pipeline): add EnrichmentService"
```

---

## Task 11: RoutingTable

**Files:**
- Create: `apps/server/src/event-pipeline/pipeline/routing-table.ts`
- Create: `apps/server/src/event-pipeline/pipeline/routing-table.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/server/src/event-pipeline/pipeline/routing-table.spec.ts

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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/event-pipeline/pipeline/routing-table.spec.ts
```

Expected: FAIL — `routing-table` not found.

- [ ] **Step 3: Implement routing-table.ts**

```typescript
// apps/server/src/event-pipeline/pipeline/routing-table.ts

import type { RouteTarget } from '../types'

export const ROUTING_RULES: Record<string, RouteTarget> = {
  'github.push':             'orchestrate',
  'github.pull_request':     'orchestrate',
  'github.issues':           'orchestrate',
  'feishu.message':          'orchestrate',
  'claude_hook.session_end': 'orchestrate',
  'claude_hook.tool_use':    'orchestrate',
  'manual':                  'orchestrate',
}

export const DEFAULT_ROUTE: RouteTarget = 'orchestrate'
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run src/event-pipeline/pipeline/routing-table.spec.ts
```

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/event-pipeline/pipeline/routing-table.ts apps/server/src/event-pipeline/pipeline/routing-table.spec.ts
git commit -m "feat(event-pipeline): add static RoutingTable"
```

---

## Task 12: EventPipelineWorker

**Files:**
- Create: `apps/server/src/event-pipeline/pipeline/event-pipeline.worker.ts`
- Create: `apps/server/src/event-pipeline/pipeline/event-pipeline.worker.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/server/src/event-pipeline/pipeline/event-pipeline.worker.spec.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventPipelineWorker } from './event-pipeline.worker'
import { NoProjectMappingError } from './enrichment.service'
import type { NormalizedEvent } from '../types'

const baseEvent: NormalizedEvent = {
  source: 'github',
  eventType: 'github.push',
  idempotencyKey: 'github:del-1',
  sourceProjectHint: 'org/repo',
  occurredAt: new Date(),
  payload: {},
}

function makeJob(data: NormalizedEvent) {
  return { data } as any
}

describe('EventPipelineWorker', () => {
  let worker: EventPipelineWorker
  let mockDedup: any
  let mockEnrichment: any
  let mockRepo: any
  let mockPublisher: any

  beforeEach(() => {
    mockDedup = { checkAndInsert: vi.fn() }
    mockEnrichment = { resolveProjectId: vi.fn() }
    mockRepo = { updateStatus: vi.fn().mockResolvedValue(undefined) }
    mockPublisher = { publish: vi.fn().mockResolvedValue({ taskId: 'task-1', created: true }) }
    worker = new EventPipelineWorker(mockDedup, mockEnrichment, mockRepo, mockPublisher)
  })

  it('happy path: dedup → enrich → route → orchestrate', async () => {
    mockDedup.checkAndInsert.mockResolvedValue({ status: 'new', recordId: 'rec-1' })
    mockEnrichment.resolveProjectId.mockResolvedValue('proj-1')

    await worker.process(makeJob(baseEvent))

    expect(mockPublisher.publish).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'proj-1',
      type: 'event_anchor',
      sourceType: 'incoming_event',
      sourceId: 'rec-1',
    }))
    expect(mockRepo.updateStatus).toHaveBeenCalledWith('rec-1', 'routed', expect.objectContaining({
      routedTo: 'orchestrate',
      projectId: 'proj-1',
    }))
  })

  it('short-circuits on duplicate idempotency key', async () => {
    mockDedup.checkAndInsert.mockResolvedValue({ status: 'duplicate' })

    await worker.process(makeJob(baseEvent))

    expect(mockEnrichment.resolveProjectId).not.toHaveBeenCalled()
    expect(mockPublisher.publish).not.toHaveBeenCalled()
  })

  it('marks record failed and does not rethrow when no project mapping', async () => {
    mockDedup.checkAndInsert.mockResolvedValue({ status: 'new', recordId: 'rec-1' })
    mockEnrichment.resolveProjectId.mockRejectedValue(new NoProjectMappingError('github', 'org/repo'))

    await worker.process(makeJob(baseEvent))

    expect(mockRepo.updateStatus).toHaveBeenCalledWith('rec-1', 'failed', {
      error: { reason: 'no_project_mapping' },
    })
    expect(mockPublisher.publish).not.toHaveBeenCalled()
  })

  it('rethrows transient errors so BullMQ can retry', async () => {
    mockDedup.checkAndInsert.mockResolvedValue({ status: 'new', recordId: 'rec-1' })
    mockEnrichment.resolveProjectId.mockRejectedValue(new Error('DB timeout'))

    await expect(worker.process(makeJob(baseEvent))).rejects.toThrow('DB timeout')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/event-pipeline/pipeline/event-pipeline.worker.spec.ts
```

Expected: FAIL — `EventPipelineWorker` not found.

- [ ] **Step 3: Implement EventPipelineWorker**

```typescript
// apps/server/src/event-pipeline/pipeline/event-pipeline.worker.ts

import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { OrchestratorTaskType, OrchestratorSourceType, IncomingEventStatus } from '@generated/client'
import { OrchestratorTaskPublisher } from '../../orchestrator/ingress/orchestrator-task.publisher'
import { IncomingEventRepository } from '../repository/incoming-event.repository'
import { DeduplicationService } from './deduplication.service'
import { EnrichmentService, NoProjectMappingError } from './enrichment.service'
import { ROUTING_RULES, DEFAULT_ROUTE } from './routing-table'
import { INCOMING_EVENTS_QUEUE, type NormalizedEvent, type RouteTarget } from '../types'

@Processor(INCOMING_EVENTS_QUEUE, {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
} as any)
export class EventPipelineWorker extends WorkerHost {
  constructor(
    private readonly dedup: DeduplicationService,
    private readonly enrichment: EnrichmentService,
    private readonly repo: IncomingEventRepository,
    private readonly publisher: OrchestratorTaskPublisher,
  ) {
    super()
  }

  async process(job: Job<NormalizedEvent>): Promise<void> {
    const event = job.data

    // Step 1: Deduplication
    const dedupResult = await this.dedup.checkAndInsert(event)
    if (dedupResult.status === 'duplicate') return

    const { recordId } = dedupResult

    // Step 2: Enrichment
    let projectId: string
    try {
      projectId = await this.enrichment.resolveProjectId(event)
    } catch (err) {
      if (err instanceof NoProjectMappingError) {
        await this.repo.updateStatus(recordId, IncomingEventStatus.failed, {
          error: { reason: 'no_project_mapping' },
        })
        return
      }
      throw err
    }

    // Step 3: Route
    const target: RouteTarget = ROUTING_RULES[event.eventType] ?? DEFAULT_ROUTE

    // Step 4: Dispatch
    await this.dispatch(event, recordId, projectId, target)
    await this.repo.updateStatus(recordId, IncomingEventStatus.routed, { routedTo: target, projectId })
  }

  private async dispatch(
    event: NormalizedEvent,
    recordId: string,
    projectId: string,
    target: RouteTarget,
  ): Promise<void> {
    if (target === 'orchestrate') {
      await this.publisher.publish({
        projectId,
        type: OrchestratorTaskType.event_anchor,
        sourceType: OrchestratorSourceType.incoming_event,
        sourceId: recordId,
        input: { event },
      })
    }
    // 'direct' path reserved for future use
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run src/event-pipeline/pipeline/event-pipeline.worker.spec.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/event-pipeline/pipeline/event-pipeline.worker.ts apps/server/src/event-pipeline/pipeline/event-pipeline.worker.spec.ts
git commit -m "feat(event-pipeline): add EventPipelineWorker with 4-step pipeline"
```

---

## Task 13: EventPipelineModule + App Registration

**Files:**
- Create: `apps/server/src/event-pipeline/event-pipeline.module.ts`
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: Create EventPipelineModule**

```typescript
// apps/server/src/event-pipeline/event-pipeline.module.ts

import { Module, forwardRef } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { OrchestratorModule } from '../orchestrator/orchestrator.module'
import { PrismaService } from '../prisma/prisma.service'
import { INCOMING_EVENTS_QUEUE } from './types'
import { AdapterRegistry } from './adapters/adapter.registry'
import { GithubAdapter } from './adapters/github.adapter'
import { FeishuAdapter } from './adapters/feishu.adapter'
import { ClaudeHookAdapter } from './adapters/claude-hook.adapter'
import { ManualAdapter } from './adapters/manual.adapter'
import { WebhookController } from './webhook/webhook.controller'
import { IncomingEventRepository } from './repository/incoming-event.repository'
import { DeduplicationService } from './pipeline/deduplication.service'
import { EnrichmentService } from './pipeline/enrichment.service'
import { EventPipelineWorker } from './pipeline/event-pipeline.worker'
import { AppConfig } from '../config/app-config'

@Module({
  imports: [
    BullModule.registerQueue({ name: INCOMING_EVENTS_QUEUE }),
    forwardRef(() => OrchestratorModule),
  ],
  controllers: [WebhookController],
  providers: [
    PrismaService,
    IncomingEventRepository,
    DeduplicationService,
    EnrichmentService,
    EventPipelineWorker,
    GithubAdapter,
    FeishuAdapter,
    ClaudeHookAdapter,
    ManualAdapter,
    {
      provide: AdapterRegistry,
      useFactory: (
        github: GithubAdapter,
        feishu: FeishuAdapter,
        claudeHook: ClaudeHookAdapter,
        manual: ManualAdapter,
      ) => {
        const registry = new AdapterRegistry()
        registry.register(github)
        registry.register(feishu)
        registry.register(claudeHook)
        registry.register(manual)
        return registry
      },
      inject: [GithubAdapter, FeishuAdapter, ClaudeHookAdapter, ManualAdapter],
    },
  ],
  exports: [],
})
export class EventPipelineModule {}
```

- [ ] **Step 2: Register EventPipelineModule in app.module.ts**

In `apps/server/src/app.module.ts`, add the import:

```typescript
import { EventPipelineModule } from './event-pipeline/event-pipeline.module'

// In @Module imports array, add:
EventPipelineModule,
```

Full updated imports array in `app.module.ts`:

```typescript
imports: [
  ConfigModule.forRoot({ isGlobal: true }),
  ScheduleModule.forRoot(),
  AppConfigModule,
  BullModule.forRootAsync({
    inject: [AppConfig],
    useFactory: (cfg: AppConfig) => {
      const { hostname, port } = new URL(cfg.redis.url)
      return { connection: { host: hostname, port: Number(port) || 6379 } }
    },
  }),
  GraphModule,
  KnowledgeModule,
  ProjectModule,
  OrchestratorModule,
  EventPipelineModule,
],
```

- [ ] **Step 3: Run full test suite**

```bash
cd apps/server
pnpm test
```

Expected: all tests pass. Fix any import or type errors before continuing.

- [ ] **Step 4: Smoke test server boot**

```bash
pnpm dev
```

Expected: server starts on port 3000, no errors in console. Ctrl+C to stop.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/event-pipeline/event-pipeline.module.ts apps/server/src/app.module.ts
git commit -m "feat(event-pipeline): wire EventPipelineModule and register in app"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] §1 HTTP layer — `POST /webhooks/:source`, AdapterRegistry, WebhookController (Tasks 3, 7)
- [x] §2 NormalizedEvent — types with generics (Task 1)
- [x] §2 idempotencyKey rules — all 4 adapters (Tasks 4–6)
- [x] §3 incoming_events table — schema + repository (Tasks 2, 8)
- [x] §3 project_source_mappings table — schema + repository (Tasks 2, 8)
- [x] §4 DeduplicationService — (Task 9)
- [x] §4 EnrichmentService — (Task 10)
- [x] §4 RoutingTable — (Task 11)
- [x] §4 dispatch to Orchestrator — (Task 12)
- [x] §5 File structure — matches plan
- [x] §6 BullMQ retry config — in Worker processor options (Task 12)
- [x] §6 Error handling table — all failure paths covered in tests (Tasks 9–12)
- [x] §7 Test strategy — all components tested (Tasks 3–12)
- [x] OrchestratorSourceType.incoming_event — added in schema migration (Task 2)
