# Agent Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Agent Orchestrator — the server-side agentic layer that consumes events via BullMQ, runs LangGraph-based agentic loops, and writes back to Graph/Knowledge engines through typed tool calls.

**Architecture:** Events from `graph-events`/`knowledge-events` queues enter Ingress, which creates idempotent `OrchestratorTask` records and publishes to `orchestrator-tasks`. A BullMQ Worker drives `AgentRuntimeService`, which builds context, runs a LangGraph `StateGraph`, and persists results. All Graph/Knowledge writes happen only through Tool Layer functions that enforce domain rules internally.

**Tech Stack:** NestJS 11, BullMQ 5, Prisma 7, LangGraph 1.3.0 (`@langchain/langgraph`), `@langchain/anthropic` 1.3.29, `@langchain/core` 1.1.45, `openai` (embeddings), Zod 4, Vitest 4.

---

## File Map

```
apps/server/
├── prisma/schema.prisma                              # MODIFY: add OrchestratorTask model + 3 enums
├── skills/orchestrator/                              # CREATE: skill markdown files
│   ├── event-anchoring/index.md
│   ├── knowledge-sedimentation/index.md
│   ├── node-lifecycle/index.md
│   ├── graph-growth/index.md
│   ├── checkpoint-analysis/index.md
│   └── github-pr-reading/index.md
└── src/
    ├── app.module.ts                                  # MODIFY: add OrchestratorModule
    └── orchestrator/
        ├── types.ts                                   # CREATE: all shared types
        ├── orchestrator.module.ts                     # CREATE: NestJS module wiring
        ├── ingress/
        │   ├── orchestrator-router.service.ts         # CREATE: subscribes graph/knowledge events
        │   ├── task-scheduler.service.ts              # CREATE: cron for graph_growth
        │   └── orchestrator-task.publisher.ts         # CREATE: idempotency + create + enqueue
        ├── runtime/
        │   ├── orchestrator-task.worker.ts            # CREATE: BullMQ @Processor
        │   ├── agent-runtime.service.ts               # CREATE: main loop coordinator
        │   └── task-runner.service.ts                 # CREATE: dispatch by task type
        ├── context/
        │   ├── context-builder.service.ts             # CREATE: assemble OrchestratorContext
        │   ├── graph-context.reader.ts                # CREATE: read Graph Engine
        │   └── knowledge-context.reader.ts            # CREATE: read Knowledge Engine
        ├── llm/
        │   ├── agent-graph.ts                         # CREATE: LangGraph StateGraph
        │   └── skill-registry.ts                      # CREATE: scan skills/, return prompts
        ├── tools/
        │   ├── read/
        │   │   ├── get-node.tool.ts
        │   │   ├── get-subgraph.tool.ts
        │   │   ├── search-nodes.tool.ts
        │   │   ├── search-knowledge.tool.ts
        │   │   └── get-task-history.tool.ts
        │   └── write/
        │       ├── skip.tool.ts
        │       ├── notify-human.tool.ts
        │       ├── to-staging.tool.ts
        │       ├── create-node.tool.ts
        │       ├── create-edge.tool.ts
        │       ├── move-node.tool.ts
        │       ├── update-node-status.tool.ts
        │       ├── write-embedding.tool.ts
        │       ├── create-knowledge-entry.tool.ts
        │       └── revise-knowledge-entry.tool.ts
        ├── tasks/
        │   ├── embedding.task.ts
        │   ├── event-anchor.task.ts
        │   ├── checkpoint.task.ts
        │   └── graph-growth.task.ts
        └── repository/
            └── orchestrator-task.repository.ts
```

---

## Task 1: Prisma Model + Migration

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- Run: `pnpm prisma migrate dev --name add_orchestrator_task`

- [ ] **Step 1: Add enums and model to schema.prisma**

Append after the existing enums (after `enum EmbeddingStatus`):

```prisma
enum OrchestratorTaskType {
  event_anchor
  graph_growth
  checkpoint
  embedding
}

enum OrchestratorTaskStatus {
  pending
  running
  succeeded
  failed
  skipped
  waiting_for_approval
}

enum OrchestratorSourceType {
  graph_event
  knowledge_event
  schedule
  manual
}

model OrchestratorTask {
  id             String                 @id @default(uuid())
  projectId      String
  type           OrchestratorTaskType
  sourceType     OrchestratorSourceType
  sourceId       String
  status         OrchestratorTaskStatus @default(pending)
  idempotencyKey String                 @unique
  input          Json
  modelResult    Json?
  error          Json?
  createdAt      DateTime               @default(now())
  updatedAt      DateTime               @updatedAt

  @@index([projectId])
  @@index([status])
}
```

- [ ] **Step 2: Run migration**

```bash
cd apps/server
pnpm prisma migrate dev --name add_orchestrator_task
```

Expected: new migration file created, `pnpm prisma generate` runs automatically.

- [ ] **Step 3: Verify generated types exist**

```bash
grep -r "OrchestratorTask" src/prisma/gen/client/models/ | head -5
```

Expected: output shows the generated model file.

- [ ] **Step 4: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations/
git commit -m "feat(orchestrator): add OrchestratorTask prisma model"
```

---

## Task 2: Types + Module Skeleton

**Files:**
- Create: `apps/server/src/orchestrator/types.ts`
- Create: `apps/server/src/orchestrator/orchestrator.module.ts`
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: Create types.ts**

```typescript
// apps/server/src/orchestrator/types.ts
import type { JsonValue } from '@prisma/client/runtime/library'
import type { OrchestratorTask as PrismaTask } from '@generated/client'

export type { OrchestratorTaskType, OrchestratorTaskStatus, OrchestratorSourceType } from '@generated/client'

export type OrchestratorTask = PrismaTask

export type SignalType =
  | 'progress'
  | 'blocker'
  | 'decision'
  | 'risk'
  | 'learning'
  | 'noise'

export interface AgentInsight {
  summary: string
  signalType: SignalType
  confidence: number
  evidence: Array<{
    sourceType: 'node' | 'knowledge_entry' | 'task'
    sourceId: string
    note: string
  }>
}

export interface NodeSnapshot {
  id: string
  projectId: string
  type: string
  title: string
  description: string | null
  status: string
  isCheckpoint: boolean
}

export interface KnowledgeEntrySnapshot {
  id: string
  projectId: string
  nodeId: string
  category: string
  title: string
  body: JsonValue
  status: string
}

export interface TaskHistorySnapshot {
  id: string
  type: string
  status: string
  sourceType: string
  sourceId: string
  modelResult: JsonValue | null
  createdAt: Date
}

export interface GraphSnapshot {
  nodes: NodeSnapshot[]
  edges: Array<{ id: string; fromId: string; toId: string; type: string }>
}

export interface OrchestratorContext {
  project: { id: string; name: string; status: string }
  trigger: { sourceType: string; sourceId: string; raw: JsonValue }
  candidateNodes: NodeSnapshot[]
  relatedEntries: KnowledgeEntrySnapshot[]
  recentTaskHistory: TaskHistorySnapshot[]
  subgraph?: GraphSnapshot
  constraints: {
    mayWriteGraph: boolean
    mayWriteKnowledge: boolean
    requiresHumanApproval: boolean
  }
}

export const MAX_ITERATIONS = 20
export const ORCHESTRATOR_TASKS_QUEUE = 'orchestrator-tasks'
```

- [ ] **Step 2: Create orchestrator.module.ts (empty shell)**

```typescript
// apps/server/src/orchestrator/orchestrator.module.ts
import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ORCHESTRATOR_TASKS_QUEUE } from './types'

@Module({
  imports: [
    BullModule.registerQueue({ name: ORCHESTRATOR_TASKS_QUEUE }),
  ],
  providers: [],
})
export class OrchestratorModule {}
```

- [ ] **Step 3: Add OrchestratorModule to AppModule**

In `apps/server/src/app.module.ts`, add the import:

```typescript
import { OrchestratorModule } from './orchestrator/orchestrator.module'

// in @Module imports array, add:
OrchestratorModule,
```

- [ ] **Step 4: Verify server starts**

```bash
cd apps/server && pnpm dev
```

Expected: server starts on port 3000 with no errors. Ctrl-C to stop.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/orchestrator/ apps/server/src/app.module.ts
git commit -m "feat(orchestrator): types + module skeleton"
```

---

## Task 3: OrchestratorTaskRepository + Tests

**Files:**
- Create: `apps/server/src/orchestrator/repository/orchestrator-task.repository.ts`
- Create: `apps/server/src/orchestrator/repository/orchestrator-task.repository.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/server/src/orchestrator/repository/orchestrator-task.repository.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OrchestratorTaskRepository } from './orchestrator-task.repository'
import { OrchestratorTaskStatus, OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'

const makeTask = (overrides = {}) => ({
  id: 'task-1',
  projectId: 'p1',
  type: OrchestratorTaskType.event_anchor,
  sourceType: OrchestratorSourceType.graph_event,
  sourceId: 'src-1',
  status: OrchestratorTaskStatus.pending,
  idempotencyKey: 'key-1',
  input: {},
  modelResult: null,
  error: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('OrchestratorTaskRepository', () => {
  let repo: OrchestratorTaskRepository
  let mockPrisma: any

  beforeEach(() => {
    mockPrisma = {
      orchestratorTask: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
      },
    }
    repo = new OrchestratorTaskRepository(mockPrisma)
  })

  it('creates a task', async () => {
    const task = makeTask()
    mockPrisma.orchestratorTask.create.mockResolvedValue(task)
    const result = await repo.create({
      projectId: 'p1',
      type: OrchestratorTaskType.event_anchor,
      sourceType: OrchestratorSourceType.graph_event,
      sourceId: 'src-1',
      idempotencyKey: 'key-1',
      input: {},
    })
    expect(result.id).toBe('task-1')
    expect(mockPrisma.orchestratorTask.create).toHaveBeenCalledOnce()
  })

  it('finds task by idempotency key', async () => {
    const task = makeTask()
    mockPrisma.orchestratorTask.findUnique.mockResolvedValue(task)
    const result = await repo.findByIdempotencyKey('key-1')
    expect(result?.id).toBe('task-1')
    expect(mockPrisma.orchestratorTask.findUnique).toHaveBeenCalledWith({
      where: { idempotencyKey: 'key-1' },
    })
  })

  it('returns null when idempotency key not found', async () => {
    mockPrisma.orchestratorTask.findUnique.mockResolvedValue(null)
    const result = await repo.findByIdempotencyKey('missing')
    expect(result).toBeNull()
  })

  it('updates status with modelResult', async () => {
    const task = makeTask({ status: OrchestratorTaskStatus.succeeded })
    mockPrisma.orchestratorTask.update.mockResolvedValue(task)
    await repo.updateStatus('task-1', OrchestratorTaskStatus.succeeded, {
      modelResult: { summary: 'done' },
    })
    expect(mockPrisma.orchestratorTask.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: expect.objectContaining({
        status: OrchestratorTaskStatus.succeeded,
        modelResult: { summary: 'done' },
      }),
    })
  })

  it('finds recent tasks by projectId', async () => {
    mockPrisma.orchestratorTask.findMany.mockResolvedValue([makeTask()])
    const results = await repo.findRecentByProject('p1', 10)
    expect(results).toHaveLength(1)
    expect(mockPrisma.orchestratorTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'p1' } }),
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/server && pnpm vitest run src/orchestrator/repository/orchestrator-task.repository.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the repository**

```typescript
// apps/server/src/orchestrator/repository/orchestrator-task.repository.ts
import { Injectable } from '@nestjs/common'
import { OrchestratorTaskStatus, OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import type { OrchestratorTask } from '@generated/client'
import type { JsonValue } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'

export type CreateTaskData = {
  projectId: string
  type: OrchestratorTaskType
  sourceType: OrchestratorSourceType
  sourceId: string
  idempotencyKey: string
  input: JsonValue
}

export type UpdateStatusExtra = {
  modelResult?: JsonValue
  error?: JsonValue
}

@Injectable()
export class OrchestratorTaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateTaskData): Promise<OrchestratorTask> {
    return this.prisma.orchestratorTask.create({
      data: {
        projectId: data.projectId,
        type: data.type,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        idempotencyKey: data.idempotencyKey,
        input: data.input,
        status: OrchestratorTaskStatus.pending,
      },
    })
  }

  async findById(id: string): Promise<OrchestratorTask | null> {
    return this.prisma.orchestratorTask.findUnique({ where: { id } })
  }

  async findByIdempotencyKey(key: string): Promise<OrchestratorTask | null> {
    return this.prisma.orchestratorTask.findUnique({ where: { idempotencyKey: key } })
  }

  async updateStatus(
    id: string,
    status: OrchestratorTaskStatus,
    extra: UpdateStatusExtra = {},
  ): Promise<OrchestratorTask> {
    return this.prisma.orchestratorTask.update({
      where: { id },
      data: {
        status,
        ...(extra.modelResult !== undefined && { modelResult: extra.modelResult }),
        ...(extra.error !== undefined && { error: extra.error }),
      },
    })
  }

  async findRecentByProject(projectId: string, limit: number): Promise<OrchestratorTask[]> {
    return this.prisma.orchestratorTask.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/server && pnpm vitest run src/orchestrator/repository/orchestrator-task.repository.spec.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/orchestrator/repository/
git commit -m "feat(orchestrator): task repository"
```

---

## Task 4: OrchestratorTaskPublisher + Tests

**Files:**
- Create: `apps/server/src/orchestrator/ingress/orchestrator-task.publisher.ts`
- Create: `apps/server/src/orchestrator/ingress/orchestrator-task.publisher.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/server/src/orchestrator/ingress/orchestrator-task.publisher.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OrchestratorTaskPublisher } from './orchestrator-task.publisher'
import { OrchestratorTaskStatus, OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'

describe('OrchestratorTaskPublisher', () => {
  let publisher: OrchestratorTaskPublisher
  let mockRepo: any
  let mockQueue: any

  const baseInput = {
    projectId: 'p1',
    type: OrchestratorTaskType.event_anchor,
    sourceType: OrchestratorSourceType.graph_event,
    sourceId: 'src-1',
    input: { nodeId: 'n1' },
  }

  beforeEach(() => {
    mockRepo = {
      findByIdempotencyKey: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'task-1', status: OrchestratorTaskStatus.pending }),
    }
    mockQueue = { add: vi.fn().mockResolvedValue(undefined) }
    publisher = new OrchestratorTaskPublisher(mockRepo, mockQueue)
  })

  it('creates task and enqueues job on first call', async () => {
    const result = await publisher.publish(baseInput)
    expect(result.created).toBe(true)
    expect(result.taskId).toBe('task-1')
    expect(mockRepo.create).toHaveBeenCalledOnce()
    expect(mockQueue.add).toHaveBeenCalledOnce()
  })

  it('returns existing task without creating on duplicate key', async () => {
    mockRepo.findByIdempotencyKey.mockResolvedValue({
      id: 'task-existing',
      status: OrchestratorTaskStatus.pending,
    })
    const result = await publisher.publish(baseInput)
    expect(result.created).toBe(false)
    expect(result.taskId).toBe('task-existing')
    expect(mockRepo.create).not.toHaveBeenCalled()
    expect(mockQueue.add).not.toHaveBeenCalled()
  })

  it('generates same idempotency key for same inputs', async () => {
    await publisher.publish(baseInput)
    await publisher.publish(baseInput)
    const key1 = mockRepo.findByIdempotencyKey.mock.calls[0][0]
    const key2 = mockRepo.findByIdempotencyKey.mock.calls[1][0]
    expect(key1).toBe(key2)
    expect(key1).toHaveLength(64) // sha256 hex
  })

  it('generates different keys for different sourceIds', async () => {
    await publisher.publish(baseInput)
    await publisher.publish({ ...baseInput, sourceId: 'src-2' })
    const key1 = mockRepo.findByIdempotencyKey.mock.calls[0][0]
    const key2 = mockRepo.findByIdempotencyKey.mock.calls[1][0]
    expect(key1).not.toBe(key2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/server && pnpm vitest run src/orchestrator/ingress/orchestrator-task.publisher.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the publisher**

```typescript
// apps/server/src/orchestrator/ingress/orchestrator-task.publisher.ts
import { Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { createHash } from 'node:crypto'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import type { JsonValue } from '@prisma/client/runtime/library'
import { OrchestratorTaskRepository } from '../repository/orchestrator-task.repository'
import { ORCHESTRATOR_TASKS_QUEUE } from '../types'

export type PublishInput = {
  projectId: string
  type: OrchestratorTaskType
  sourceType: OrchestratorSourceType
  sourceId: string
  input: JsonValue
}

export type PublishResult = {
  taskId: string
  created: boolean
}

@Injectable()
export class OrchestratorTaskPublisher {
  constructor(
    private readonly repo: OrchestratorTaskRepository,
    @InjectQueue(ORCHESTRATOR_TASKS_QUEUE) private readonly queue: Queue,
  ) {}

  async publish(input: PublishInput): Promise<PublishResult> {
    const idempotencyKey = this.buildKey(input.sourceType, input.sourceId, input.type)

    const existing = await this.repo.findByIdempotencyKey(idempotencyKey)
    if (existing) {
      return { taskId: existing.id, created: false }
    }

    const task = await this.repo.create({
      projectId: input.projectId,
      type: input.type,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      idempotencyKey,
      input: input.input,
    })

    // Enqueue after DB commit — never inside a transaction
    await this.queue.add('run', { taskId: task.id })

    return { taskId: task.id, created: true }
  }

  private buildKey(
    sourceType: OrchestratorSourceType,
    sourceId: string,
    taskType: OrchestratorTaskType,
  ): string {
    return createHash('sha256')
      .update(`${sourceType}:${sourceId}:${taskType}`)
      .digest('hex')
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/server && pnpm vitest run src/orchestrator/ingress/orchestrator-task.publisher.spec.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/orchestrator/ingress/orchestrator-task.publisher.ts \
        apps/server/src/orchestrator/ingress/orchestrator-task.publisher.spec.ts
git commit -m "feat(orchestrator): task publisher with idempotency"
```

---

## Task 5: BullMQ Worker + AgentRuntimeService Skeleton + Tests

**Files:**
- Create: `apps/server/src/orchestrator/runtime/orchestrator-task.worker.ts`
- Create: `apps/server/src/orchestrator/runtime/agent-runtime.service.ts`
- Create: `apps/server/src/orchestrator/runtime/agent-runtime.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/server/src/orchestrator/runtime/agent-runtime.service.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentRuntimeService } from './agent-runtime.service'
import { OrchestratorTaskStatus, OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'

const makeTask = (overrides = {}) => ({
  id: 'task-1',
  projectId: 'p1',
  type: OrchestratorTaskType.event_anchor,
  sourceType: OrchestratorSourceType.graph_event,
  sourceId: 'src-1',
  status: OrchestratorTaskStatus.pending,
  idempotencyKey: 'key-1',
  input: {},
  modelResult: null,
  error: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('AgentRuntimeService', () => {
  let runtime: AgentRuntimeService
  let mockRepo: any
  let mockRunner: any

  beforeEach(() => {
    mockRepo = {
      findById: vi.fn().mockResolvedValue(makeTask()),
      updateStatus: vi.fn().mockResolvedValue(makeTask()),
    }
    mockRunner = {
      run: vi.fn().mockResolvedValue({ summary: 'done', signalType: 'progress', confidence: 0.9, evidence: [] }),
    }
    runtime = new AgentRuntimeService(mockRepo, mockRunner)
  })

  it('transitions task pending → running → succeeded on success', async () => {
    await runtime.execute('task-1')
    expect(mockRepo.updateStatus).toHaveBeenCalledWith('task-1', OrchestratorTaskStatus.running)
    expect(mockRepo.updateStatus).toHaveBeenCalledWith(
      'task-1',
      OrchestratorTaskStatus.succeeded,
      expect.objectContaining({ modelResult: expect.any(Object) }),
    )
  })

  it('transitions to waiting_for_approval on WaitingForApprovalSignal', async () => {
    const { WaitingForApprovalSignal } = await import('../tools/write/notify-human.tool')
    mockRunner.run.mockRejectedValue(new WaitingForApprovalSignal('needs review'))
    await runtime.execute('task-1')
    expect(mockRepo.updateStatus).toHaveBeenCalledWith('task-1', OrchestratorTaskStatus.waiting_for_approval)
  })

  it('marks failed and re-throws on unexpected error', async () => {
    mockRunner.run.mockRejectedValue(new Error('llm timeout'))
    await expect(runtime.execute('task-1')).rejects.toThrow('llm timeout')
    expect(mockRepo.updateStatus).toHaveBeenCalledWith(
      'task-1',
      OrchestratorTaskStatus.failed,
      expect.objectContaining({ error: expect.any(Object) }),
    )
  })

  it('does not retry on domain service failure (DomainServiceError)', async () => {
    const { DomainServiceError } = await import('../tools/write/create-node.tool')
    mockRunner.run.mockRejectedValue(new DomainServiceError('NODE_ARCHIVED'))
    await runtime.execute('task-1') // no throw — no BullMQ retry
    expect(mockRepo.updateStatus).toHaveBeenCalledWith(
      'task-1',
      OrchestratorTaskStatus.failed,
      expect.objectContaining({ error: { reason: 'NODE_ARCHIVED' } }),
    )
  })
})
```

- [ ] **Step 2: Create WaitingForApprovalSignal and DomainServiceError (needed for the test imports)**

Create the signal files first, even as stubs:

```typescript
// apps/server/src/orchestrator/tools/write/notify-human.tool.ts
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

export class WaitingForApprovalSignal extends Error {
  constructor(public readonly reason: string) {
    super('WAITING_FOR_APPROVAL')
  }
}

export const notifyHumanTool = () =>
  tool(
    async ({ reason }) => {
      throw new WaitingForApprovalSignal(reason)
    },
    {
      name: 'notify_human',
      description: 'Call when human judgment is required. Exits the loop and marks task waiting_for_approval.',
      schema: z.object({
        reason: z.string().describe('Why human judgment is needed'),
        context: z.string().describe('Summary of the situation for the human reviewer'),
      }),
    },
  )
```

```typescript
// apps/server/src/orchestrator/tools/write/create-node.tool.ts
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

export class DomainServiceError extends Error {
  constructor(public readonly reason: string) {
    super(`DOMAIN_SERVICE_ERROR: ${reason}`)
  }
}

// Stub — full implementation in Task 11
export const createNodeTool = (_deps: unknown) =>
  tool(
    async () => JSON.stringify({ error: 'not implemented' }),
    {
      name: 'create_node',
      description: 'Create a new growth node in the graph',
      schema: z.object({
        title: z.string(),
        description: z.string().optional(),
      }),
    },
  )
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd apps/server && pnpm vitest run src/orchestrator/runtime/agent-runtime.service.spec.ts
```

Expected: FAIL — AgentRuntimeService not found.

- [ ] **Step 4: Implement AgentRuntimeService**

```typescript
// apps/server/src/orchestrator/runtime/agent-runtime.service.ts
import { Injectable } from '@nestjs/common'
import { OrchestratorTaskStatus } from '@generated/client'
import { OrchestratorTaskRepository } from '../repository/orchestrator-task.repository'
import { TaskRunnerService } from './task-runner.service'
import { WaitingForApprovalSignal } from '../tools/write/notify-human.tool'
import { SkipSignal } from '../tools/write/skip.tool'
import { DomainServiceError } from '../tools/write/create-node.tool'
import type { AgentInsight } from '../types'

@Injectable()
export class AgentRuntimeService {
  constructor(
    private readonly repo: OrchestratorTaskRepository,
    private readonly runner: TaskRunnerService,
  ) {}

  async execute(taskId: string): Promise<void> {
    const task = await this.repo.findById(taskId)
    if (!task) throw new Error(`Task ${taskId} not found`)

    await this.repo.updateStatus(taskId, OrchestratorTaskStatus.running)

    try {
      const insight: AgentInsight = await this.runner.run(task)
      await this.repo.updateStatus(taskId, OrchestratorTaskStatus.succeeded, {
        modelResult: insight as unknown as Record<string, unknown>,
      })
    } catch (err) {
      if (err instanceof WaitingForApprovalSignal) {
        await this.repo.updateStatus(taskId, OrchestratorTaskStatus.waiting_for_approval)
        return
      }
      if (err instanceof SkipSignal) {
        const insight: AgentInsight = {
          summary: err.reason,
          signalType: 'noise',
          confidence: 1,
          evidence: [],
        }
        await this.repo.updateStatus(taskId, OrchestratorTaskStatus.succeeded, {
          modelResult: insight as unknown as Record<string, unknown>,
        })
        return
      }
      if (err instanceof DomainServiceError) {
        await this.repo.updateStatus(taskId, OrchestratorTaskStatus.failed, {
          error: { reason: err.reason },
        })
        return // no rethrow — no BullMQ retry
      }
      await this.repo.updateStatus(taskId, OrchestratorTaskStatus.failed, {
        error: { message: String(err) },
      })
      throw err // rethrow → BullMQ retries
    }
  }
}
```

- [ ] **Step 5: Create TaskRunnerService stub**

```typescript
// apps/server/src/orchestrator/runtime/task-runner.service.ts
import { Injectable } from '@nestjs/common'
import type { OrchestratorTask } from '../types'
import type { AgentInsight } from '../types'

@Injectable()
export class TaskRunnerService {
  async run(_task: OrchestratorTask): Promise<AgentInsight> {
    // Full routing implemented in Task 13
    throw new Error('TaskRunnerService.run not yet implemented')
  }
}
```

- [ ] **Step 6: Create SkipSignal stub (needed by AgentRuntimeService)**

```typescript
// apps/server/src/orchestrator/tools/write/skip.tool.ts
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

export class SkipSignal extends Error {
  constructor(public readonly reason: string) {
    super('SKIP')
  }
}

export const skipTool = () =>
  tool(
    async ({ reason }) => {
      throw new SkipSignal(reason)
    },
    {
      name: 'skip',
      description: 'Call when the event is noise with no project relevance. Exits the loop cleanly.',
      schema: z.object({
        reason: z.string().describe('Why this event is noise and should be skipped'),
      }),
    },
  )
```

- [ ] **Step 7: Create the BullMQ Worker**

```typescript
// apps/server/src/orchestrator/runtime/orchestrator-task.worker.ts
import { Logger } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { ORCHESTRATOR_TASKS_QUEUE } from '../types'
import { AgentRuntimeService } from './agent-runtime.service'

@Processor(ORCHESTRATOR_TASKS_QUEUE)
export class OrchestratorTaskWorker extends WorkerHost {
  private readonly logger = new Logger(OrchestratorTaskWorker.name)

  constructor(private readonly runtime: AgentRuntimeService) {
    super()
  }

  async process(job: Job<{ taskId: string }>): Promise<void> {
    this.logger.log(`Processing task ${job.data.taskId}`)
    await this.runtime.execute(job.data.taskId)
  }
}
```

- [ ] **Step 8: Run tests**

```bash
cd apps/server && pnpm vitest run src/orchestrator/runtime/agent-runtime.service.spec.ts
```

Expected: all tests PASS.

- [ ] **Step 9: Update orchestrator.module.ts to register providers**

```typescript
// apps/server/src/orchestrator/orchestrator.module.ts
import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { PrismaService } from '../prisma/prisma.service'
import { ORCHESTRATOR_TASKS_QUEUE } from './types'
import { OrchestratorTaskRepository } from './repository/orchestrator-task.repository'
import { OrchestratorTaskPublisher } from './ingress/orchestrator-task.publisher'
import { AgentRuntimeService } from './runtime/agent-runtime.service'
import { TaskRunnerService } from './runtime/task-runner.service'
import { OrchestratorTaskWorker } from './runtime/orchestrator-task.worker'

@Module({
  imports: [
    BullModule.registerQueue({ name: ORCHESTRATOR_TASKS_QUEUE }),
  ],
  providers: [
    PrismaService,
    OrchestratorTaskRepository,
    OrchestratorTaskPublisher,
    TaskRunnerService,
    AgentRuntimeService,
    OrchestratorTaskWorker,
  ],
})
export class OrchestratorModule {}
```

- [ ] **Step 10: Commit**

```bash
git add apps/server/src/orchestrator/
git commit -m "feat(orchestrator): worker + runtime skeleton + signal types"
```

---

## Task 6: Install LangGraph Dependencies

**Files:**
- Modify: `apps/server/package.json` (via pnpm add)

- [ ] **Step 1: Check latest versions**

```bash
npm view @langchain/langgraph dist-tags.latest
npm view @langchain/core dist-tags.latest
npm view @langchain/anthropic dist-tags.latest
npm view openai dist-tags.latest
```

Expected at time of writing: langgraph@1.3.0, core@1.1.45, anthropic@1.3.29, openai@4.x.

- [ ] **Step 2: Install packages**

```bash
cd apps/server
pnpm add @langchain/langgraph @langchain/core @langchain/anthropic openai
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/server && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server/package.json apps/server/pnpm-lock.yaml 2>/dev/null || git add apps/server/package.json
git commit -m "feat(orchestrator): add langchain/langgraph + openai deps"
```

---

## Task 7: SkillRegistry + Tests

**Files:**
- Create: `apps/server/src/orchestrator/llm/skill-registry.ts`
- Create: `apps/server/src/orchestrator/llm/skill-registry.spec.ts`

- [ ] **Step 1: Create placeholder skill files so tests can run**

```bash
mkdir -p apps/server/skills/orchestrator/event-anchoring
mkdir -p apps/server/skills/orchestrator/knowledge-sedimentation
mkdir -p apps/server/skills/orchestrator/checkpoint-analysis
mkdir -p apps/server/skills/orchestrator/graph-growth
mkdir -p apps/server/skills/orchestrator/node-lifecycle
mkdir -p apps/server/skills/orchestrator/github-pr-reading
```

```markdown
---
name: event-anchoring
description: Guides the agent on routing and anchoring external events
applicable_tasks: [event_anchor]
---

# Event Anchoring

Placeholder — full content in Task 16.
```

Save this to `apps/server/skills/orchestrator/event-anchoring/index.md`. Create similarly named placeholder files for the other five directories, substituting `name`, `description`, and `applicable_tasks` as follows:

- `knowledge-sedimentation`: `applicable_tasks: [event_anchor]`
- `checkpoint-analysis`: `applicable_tasks: [checkpoint]`
- `graph-growth`: `applicable_tasks: [graph_growth]`
- `node-lifecycle`: `applicable_tasks: [graph_growth]`
- `github-pr-reading`: `applicable_tasks: [event_anchor]`

- [ ] **Step 2: Write failing tests**

```typescript
// apps/server/src/orchestrator/llm/skill-registry.spec.ts
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { SkillRegistry } from './skill-registry'

const SKILLS_DIR = join(__dirname, '../../../skills/orchestrator')

describe('SkillRegistry', () => {
  it('loads skills on boot and returns prompt for event_anchor', async () => {
    const registry = new SkillRegistry(SKILLS_DIR)
    await registry.onModuleInit()
    const prompt = registry.getSystemPrompt('event_anchor')
    expect(prompt).toContain('event-anchoring')
    expect(prompt).toContain('knowledge-sedimentation')
  })

  it('returns checkpoint skill only for checkpoint task type', async () => {
    const registry = new SkillRegistry(SKILLS_DIR)
    await registry.onModuleInit()
    const prompt = registry.getSystemPrompt('checkpoint')
    expect(prompt).toContain('checkpoint-analysis')
    expect(prompt).not.toContain('event-anchoring')
  })

  it('returns empty string for task type with no skills', async () => {
    const registry = new SkillRegistry(SKILLS_DIR)
    await registry.onModuleInit()
    const prompt = registry.getSystemPrompt('embedding')
    expect(prompt).toBe('')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd apps/server && pnpm vitest run src/orchestrator/llm/skill-registry.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement SkillRegistry**

```typescript
// apps/server/src/orchestrator/llm/skill-registry.ts
import { Injectable, OnModuleInit } from '@nestjs/common'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseFrontmatter } from 'yaml'
import type { OrchestratorTaskType } from '../types'

type SkillEntry = {
  name: string
  applicableTasks: OrchestratorTaskType[]
  content: string
}

@Injectable()
export class SkillRegistry implements OnModuleInit {
  private skills: SkillEntry[] = []

  constructor(private readonly skillsDir: string) {}

  async onModuleInit(): Promise<void> {
    await this.loadSkills()
  }

  private async loadSkills(): Promise<void> {
    const dirs = await readdir(this.skillsDir, { withFileTypes: true })
    const entries: SkillEntry[] = []

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue
      const indexPath = join(this.skillsDir, dir.name, 'index.md')
      let raw: string
      try {
        raw = await readFile(indexPath, 'utf-8')
      } catch {
        continue
      }

      const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
      if (!match) continue

      const frontmatter = parseFrontmatter(match[1]) as {
        name: string
        applicable_tasks?: string[]
      }
      const body = match[2].trim()

      entries.push({
        name: frontmatter.name,
        applicableTasks: (frontmatter.applicable_tasks ?? []) as OrchestratorTaskType[],
        content: body,
      })
    }

    this.skills = entries
  }

  getSystemPrompt(taskType: OrchestratorTaskType): string {
    const applicable = this.skills.filter((s) => s.applicableTasks.includes(taskType))
    if (!applicable.length) return ''
    return applicable
      .map((s) => `## Skill: ${s.name}\n\n${s.content}`)
      .join('\n\n---\n\n')
  }
}
```

- [ ] **Step 5: Install yaml parser**

```bash
cd apps/server && pnpm add yaml
```

- [ ] **Step 6: Run tests**

```bash
cd apps/server && pnpm vitest run src/orchestrator/llm/skill-registry.spec.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/orchestrator/llm/ apps/server/skills/
git commit -m "feat(orchestrator): skill registry + placeholder skill files"
```

---

## Task 8: ContextBuilder + Readers + Tests

**Files:**
- Create: `apps/server/src/orchestrator/context/context-builder.service.ts`
- Create: `apps/server/src/orchestrator/context/graph-context.reader.ts`
- Create: `apps/server/src/orchestrator/context/knowledge-context.reader.ts`
- Create: `apps/server/src/orchestrator/context/context-builder.service.spec.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/server/src/orchestrator/context/context-builder.service.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContextBuilderService } from './context-builder.service'
import { OrchestratorTaskType, OrchestratorSourceType, OrchestratorTaskStatus } from '@generated/client'

const makeTask = (type: OrchestratorTaskType, input: unknown = {}) => ({
  id: 'task-1',
  projectId: 'p1',
  type,
  sourceType: OrchestratorSourceType.graph_event,
  sourceId: 'src-1',
  status: OrchestratorTaskStatus.pending,
  idempotencyKey: 'k',
  input,
  modelResult: null,
  error: null,
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe('ContextBuilderService', () => {
  let builder: ContextBuilderService
  let mockGraphReader: any
  let mockKnowledgeReader: any
  let mockTaskRepo: any

  beforeEach(() => {
    mockGraphReader = {
      getCandidateNodes: vi.fn().mockResolvedValue([]),
      getSubgraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
    }
    mockKnowledgeReader = {
      getRelatedEntries: vi.fn().mockResolvedValue([]),
    }
    mockTaskRepo = {
      findRecentByProject: vi.fn().mockResolvedValue([]),
    }
    builder = new ContextBuilderService(mockGraphReader, mockKnowledgeReader, mockTaskRepo)
  })

  it('builds context with project and trigger fields', async () => {
    const ctx = await builder.build(makeTask(OrchestratorTaskType.event_anchor, { projectId: 'p1' }))
    expect(ctx.project.id).toBe('p1')
    expect(ctx.trigger.sourceType).toBe('graph_event')
    expect(ctx.trigger.sourceId).toBe('src-1')
  })

  it('sets requiresHumanApproval=true for checkpoint tasks', async () => {
    const ctx = await builder.build(makeTask(OrchestratorTaskType.checkpoint))
    expect(ctx.constraints.requiresHumanApproval).toBe(true)
  })

  it('sets requiresHumanApproval=false for non-checkpoint tasks', async () => {
    const ctx = await builder.build(makeTask(OrchestratorTaskType.event_anchor))
    expect(ctx.constraints.requiresHumanApproval).toBe(false)
  })

  it('calls graph reader for event_anchor tasks', async () => {
    await builder.build(makeTask(OrchestratorTaskType.event_anchor))
    expect(mockGraphReader.getCandidateNodes).toHaveBeenCalledWith('p1')
  })

  it('skips graph reader for embedding tasks', async () => {
    await builder.build(makeTask(OrchestratorTaskType.embedding))
    expect(mockGraphReader.getCandidateNodes).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/server && pnpm vitest run src/orchestrator/context/context-builder.service.spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement GraphContextReader**

```typescript
// apps/server/src/orchestrator/context/graph-context.reader.ts
import { Injectable } from '@nestjs/common'
import { GraphRepository } from '../../graph/repository/graph.repository'
import type { NodeSnapshot, GraphSnapshot } from '../types'

@Injectable()
export class GraphContextReader {
  constructor(private readonly graphRepo: GraphRepository) {}

  async getCandidateNodes(projectId: string): Promise<NodeSnapshot[]> {
    const nodes = await this.graphRepo.listProjectNodes(projectId)
    return nodes
      .filter((n) => n.status !== 'archived')
      .map((n) => ({
        id: n.id,
        projectId: n.projectId,
        type: n.type,
        title: n.title,
        description: n.description,
        status: n.status,
        isCheckpoint: n.isCheckpoint,
      }))
  }

  async getSubgraph(nodeId: string): Promise<GraphSnapshot> {
    const { nodes, edges } = await this.graphRepo.getSubgraph(nodeId)
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        projectId: n.projectId,
        type: n.type,
        title: n.title,
        description: n.description,
        status: n.status,
        isCheckpoint: n.isCheckpoint,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        fromId: e.fromId,
        toId: e.toId,
        type: e.type,
      })),
    }
  }
}
```

- [ ] **Step 4: Implement KnowledgeContextReader**

```typescript
// apps/server/src/orchestrator/context/knowledge-context.reader.ts
import { Injectable } from '@nestjs/common'
import { KnowledgeRepository } from '../../knowledge/repository/knowledge.repository'
import type { KnowledgeEntrySnapshot } from '../types'

@Injectable()
export class KnowledgeContextReader {
  constructor(private readonly knowledgeRepo: KnowledgeRepository) {}

  async getRelatedEntries(projectId: string, nodeIds: string[]): Promise<KnowledgeEntrySnapshot[]> {
    if (!nodeIds.length) return []
    const entries = await this.knowledgeRepo.listEntries(projectId, {})
    return entries
      .filter((e) => nodeIds.includes(e.nodeId) && e.status !== 'deprecated')
      .map((e) => ({
        id: e.id,
        projectId: e.projectId,
        nodeId: e.nodeId,
        category: e.category,
        title: e.title,
        body: e.body,
        status: e.status,
      }))
  }
}
```

- [ ] **Step 5: Implement ContextBuilderService**

```typescript
// apps/server/src/orchestrator/context/context-builder.service.ts
import { Injectable } from '@nestjs/common'
import { OrchestratorTaskType } from '@generated/client'
import type { OrchestratorTask, OrchestratorContext, TaskHistorySnapshot } from '../types'
import { GraphContextReader } from './graph-context.reader'
import { KnowledgeContextReader } from './knowledge-context.reader'
import { OrchestratorTaskRepository } from '../repository/orchestrator-task.repository'

@Injectable()
export class ContextBuilderService {
  constructor(
    private readonly graphReader: GraphContextReader,
    private readonly knowledgeReader: KnowledgeContextReader,
    private readonly taskRepo: OrchestratorTaskRepository,
  ) {}

  async build(task: OrchestratorTask): Promise<OrchestratorContext> {
    const projectId = task.projectId
    const isEmbedding = task.type === OrchestratorTaskType.embedding

    const [candidateNodes, recentHistory] = await Promise.all([
      isEmbedding ? [] : this.graphReader.getCandidateNodes(projectId),
      this.taskRepo.findRecentByProject(projectId, 10),
    ])

    const nodeIds = candidateNodes.map((n) => n.id)
    const relatedEntries = isEmbedding
      ? []
      : await this.knowledgeReader.getRelatedEntries(projectId, nodeIds)

    const taskHistory: TaskHistorySnapshot[] = recentHistory.map((t) => ({
      id: t.id,
      type: t.type,
      status: t.status,
      sourceType: t.sourceType,
      sourceId: t.sourceId,
      modelResult: t.modelResult,
      createdAt: t.createdAt,
    }))

    return {
      project: { id: projectId, name: projectId, status: 'active' },
      trigger: {
        sourceType: task.sourceType,
        sourceId: task.sourceId,
        raw: task.input,
      },
      candidateNodes,
      relatedEntries,
      recentTaskHistory: taskHistory,
      constraints: {
        mayWriteGraph: true,
        mayWriteKnowledge: true,
        requiresHumanApproval: task.type === OrchestratorTaskType.checkpoint,
      },
    }
  }
}
```

- [ ] **Step 6: Run tests**

```bash
cd apps/server && pnpm vitest run src/orchestrator/context/context-builder.service.spec.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/orchestrator/context/
git commit -m "feat(orchestrator): context builder + graph/knowledge readers"
```

---

## Task 9: Read Tools + Tests

**Files:**
- Create: `apps/server/src/orchestrator/tools/read/get-node.tool.ts`
- Create: `apps/server/src/orchestrator/tools/read/get-subgraph.tool.ts`
- Create: `apps/server/src/orchestrator/tools/read/search-nodes.tool.ts`
- Create: `apps/server/src/orchestrator/tools/read/search-knowledge.tool.ts`
- Create: `apps/server/src/orchestrator/tools/read/get-task-history.tool.ts`
- Create: `apps/server/src/orchestrator/tools/read/read-tools.spec.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/server/src/orchestrator/tools/read/read-tools.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { getNodeTool } from './get-node.tool'
import { searchNodesTool } from './search-nodes.tool'

describe('getNodeTool', () => {
  it('returns node JSON when found', async () => {
    const mockReader = {
      getCandidateNodes: vi.fn(),
      getSubgraph: vi.fn(),
      getNode: vi.fn().mockResolvedValue({ id: 'n1', title: 'My Node', status: 'active' }),
    }
    const t = getNodeTool(mockReader as any)
    const result = await t.invoke({ nodeId: 'n1' })
    const parsed = JSON.parse(result)
    expect(parsed.id).toBe('n1')
  })

  it('returns error JSON when node not found', async () => {
    const mockReader = {
      getNode: vi.fn().mockResolvedValue(null),
      getSubgraph: vi.fn(),
      getCandidateNodes: vi.fn(),
    }
    const t = getNodeTool(mockReader as any)
    const result = await t.invoke({ nodeId: 'missing' })
    const parsed = JSON.parse(result)
    expect(parsed.error).toBeDefined()
  })
})

describe('searchNodesTool', () => {
  it('returns matching nodes filtered by keyword', async () => {
    const mockReader = {
      getCandidateNodes: vi.fn().mockResolvedValue([
        { id: 'n1', title: 'Auth Service', status: 'active' },
        { id: 'n2', title: 'Payment', status: 'blocked' },
      ]),
      getNode: vi.fn(),
      getSubgraph: vi.fn(),
    }
    const t = searchNodesTool(mockReader as any)
    const result = await t.invoke({ keyword: 'auth' })
    const parsed = JSON.parse(result)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe('n1')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/server && pnpm vitest run src/orchestrator/tools/read/read-tools.spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement get-node.tool.ts**

```typescript
// apps/server/src/orchestrator/tools/read/get-node.tool.ts
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { GraphRepository } from '../../../graph/repository/graph.repository'

export const getNodeTool = (graphRepo: GraphRepository) =>
  tool(
    async ({ nodeId }) => {
      const node = await graphRepo.findNode(nodeId)
      if (!node) return JSON.stringify({ error: `Node ${nodeId} not found` })
      return JSON.stringify({
        id: node.id,
        projectId: node.projectId,
        type: node.type,
        title: node.title,
        description: node.description,
        status: node.status,
        isCheckpoint: node.isCheckpoint,
        checkpointResolution: node.checkpointResolution,
      })
    },
    {
      name: 'get_node',
      description: 'Get details of a specific node by ID',
      schema: z.object({ nodeId: z.string().describe('The node ID to look up') }),
    },
  )
```

- [ ] **Step 4: Implement get-subgraph.tool.ts**

```typescript
// apps/server/src/orchestrator/tools/read/get-subgraph.tool.ts
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { GraphContextReader } from '../../context/graph-context.reader'

export const getSubgraphTool = (graphReader: GraphContextReader) =>
  tool(
    async ({ nodeId }) => {
      const subgraph = await graphReader.getSubgraph(nodeId)
      return JSON.stringify(subgraph)
    },
    {
      name: 'get_subgraph',
      description: 'Get a node and all its composition descendants',
      schema: z.object({ nodeId: z.string().describe('Root node ID') }),
    },
  )
```

- [ ] **Step 5: Implement search-nodes.tool.ts**

```typescript
// apps/server/src/orchestrator/tools/read/search-nodes.tool.ts
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { GraphContextReader } from '../../context/graph-context.reader'

export const searchNodesTool = (graphReader: GraphContextReader) =>
  tool(
    async ({ keyword, status, projectId }) => {
      const nodes = await graphReader.getCandidateNodes(projectId)
      const kw = keyword?.toLowerCase()
      const filtered = nodes.filter((n) => {
        const matchesKw = !kw || n.title.toLowerCase().includes(kw) || n.description?.toLowerCase().includes(kw)
        const matchesStatus = !status || n.status === status
        return matchesKw && matchesStatus
      })
      return JSON.stringify(filtered.slice(0, 20))
    },
    {
      name: 'search_nodes',
      description: 'Search candidate nodes by keyword and/or status',
      schema: z.object({
        projectId: z.string(),
        keyword: z.string().optional().describe('Text to match in title or description'),
        status: z.enum(['active', 'blocked', 'completed', 'archived']).optional(),
      }),
    },
  )
```

- [ ] **Step 6: Implement search-knowledge.tool.ts**

```typescript
// apps/server/src/orchestrator/tools/read/search-knowledge.tool.ts
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { SearchService } from '../../../knowledge/search/search.service'

export const searchKnowledgeTool = (searchService: SearchService, queryEmbedding: (text: string) => Promise<number[]>) =>
  tool(
    async ({ projectId, query, limit }) => {
      const vector = await queryEmbedding(query)
      const results = await searchService.search(projectId, vector, { limit: limit ?? 5 })
      return JSON.stringify(results)
    },
    {
      name: 'search_knowledge',
      description: 'Vector search for relevant KnowledgeEntries',
      schema: z.object({
        projectId: z.string(),
        query: z.string().describe('Natural language search query'),
        limit: z.number().int().min(1).max(20).optional(),
      }),
    },
  )
```

- [ ] **Step 7: Implement get-task-history.tool.ts**

```typescript
// apps/server/src/orchestrator/tools/read/get-task-history.tool.ts
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { OrchestratorTaskRepository } from '../../repository/orchestrator-task.repository'

export const getTaskHistoryTool = (taskRepo: OrchestratorTaskRepository) =>
  tool(
    async ({ projectId, limit }) => {
      const tasks = await taskRepo.findRecentByProject(projectId, limit ?? 10)
      const snapshots = tasks.map((t) => ({
        id: t.id,
        type: t.type,
        status: t.status,
        sourceId: t.sourceId,
        modelResult: t.modelResult,
        createdAt: t.createdAt,
      }))
      return JSON.stringify(snapshots)
    },
    {
      name: 'get_task_history',
      description: 'Get recent Orchestrator task summaries for this project',
      schema: z.object({
        projectId: z.string(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    },
  )
```

- [ ] **Step 8: Run tests**

```bash
cd apps/server && pnpm vitest run src/orchestrator/tools/read/read-tools.spec.ts
```

Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/server/src/orchestrator/tools/read/
git commit -m "feat(orchestrator): read tools"
```

---

## Task 10: Write Tools — Graph Mutations + Tests

**Files:**
- Update: `apps/server/src/orchestrator/tools/write/create-node.tool.ts` (was stub)
- Create: `apps/server/src/orchestrator/tools/write/create-edge.tool.ts`
- Create: `apps/server/src/orchestrator/tools/write/move-node.tool.ts`
- Create: `apps/server/src/orchestrator/tools/write/update-node-status.tool.ts`
- Create: `apps/server/src/orchestrator/tools/write/graph-write-tools.spec.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/server/src/orchestrator/tools/write/graph-write-tools.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createNodeTool, DomainServiceError } from './create-node.tool'
import { updateNodeStatusTool } from './update-node-status.tool'
import { NodeStatus, NodeType, CreatedBy } from '@generated/client'

const makeNode = (overrides = {}) => ({
  id: 'n1', projectId: 'p1', type: NodeType.growth, title: 'T', description: null,
  status: NodeStatus.active, isCheckpoint: false, checkpointResolution: null,
  createdBy: CreatedBy.agent, createdAt: new Date(), updatedAt: new Date(),
  ...overrides,
})

describe('createNodeTool', () => {
  it('creates a growth node and returns its id', async () => {
    const mockNodeService = {
      createNode: vi.fn().mockResolvedValue(makeNode()),
    }
    const t = createNodeTool({ nodeService: mockNodeService, projectId: 'p1' })
    const result = await t.invoke({ title: 'New Feature', description: 'desc' })
    const parsed = JSON.parse(result)
    expect(parsed.nodeId).toBe('n1')
  })

  it('throws DomainServiceError when project is not active', async () => {
    const mockNodeService = {
      createNode: vi.fn().mockRejectedValue(new Error('PROJECT_INACTIVE')),
    }
    const t = createNodeTool({ nodeService: mockNodeService, projectId: 'p1' })
    await expect(t.invoke({ title: 'X' })).rejects.toBeInstanceOf(DomainServiceError)
  })
})

describe('updateNodeStatusTool', () => {
  it('calls updateStatus and returns updated node id', async () => {
    const mockNodeService = {
      updateStatus: vi.fn().mockResolvedValue(makeNode({ status: NodeStatus.completed })),
    }
    const t = updateNodeStatusTool({ nodeService: mockNodeService })
    const result = await t.invoke({ nodeId: 'n1', newStatus: 'completed' })
    const parsed = JSON.parse(result)
    expect(parsed.nodeId).toBe('n1')
    expect(mockNodeService.updateStatus).toHaveBeenCalledWith('n1', NodeStatus.completed)
  })

  it('throws DomainServiceError on ConflictException from domain service', async () => {
    const { ConflictException } = await import('@nestjs/common')
    const mockNodeService = {
      updateStatus: vi.fn().mockRejectedValue(new ConflictException('NODE_ARCHIVED')),
    }
    const t = updateNodeStatusTool({ nodeService: mockNodeService })
    await expect(t.invoke({ nodeId: 'n1', newStatus: 'active' })).rejects.toBeInstanceOf(DomainServiceError)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/server && pnpm vitest run src/orchestrator/tools/write/graph-write-tools.spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement create-node.tool.ts (full version)**

```typescript
// apps/server/src/orchestrator/tools/write/create-node.tool.ts
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { ConflictException } from '@nestjs/common'
import { NodeType, CreatedBy } from '@generated/client'
import { NodeService } from '../../../graph/node/node.service'

export class DomainServiceError extends Error {
  constructor(public readonly reason: string) {
    super(`DOMAIN_SERVICE_ERROR: ${reason}`)
  }
}

export const createNodeTool = (deps: { nodeService: NodeService; projectId: string }) =>
  tool(
    async ({ title, description }) => {
      try {
        const node = await deps.nodeService.createNode({
          projectId: deps.projectId,
          type: NodeType.growth,
          title,
          description,
          createdBy: CreatedBy.agent,
        })
        return JSON.stringify({ nodeId: node.id, title: node.title })
      } catch (err) {
        if (err instanceof ConflictException) {
          throw new DomainServiceError(err.message)
        }
        if (err instanceof Error && err.message.includes('PROJECT_INACTIVE')) {
          throw new DomainServiceError(err.message)
        }
        throw err
      }
    },
    {
      name: 'create_node',
      description: 'Create a new growth node. Only use when a new theme or area clearly warrants its own node.',
      schema: z.object({
        title: z.string().describe('Concise node title'),
        description: z.string().optional().describe('One-sentence description'),
      }),
    },
  )
```

- [ ] **Step 4: Implement create-edge.tool.ts**

```typescript
// apps/server/src/orchestrator/tools/write/create-edge.tool.ts
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { ConflictException } from '@nestjs/common'
import { EdgeType, CreatedBy } from '@generated/client'
import { EdgeService } from '../../../graph/edge/edge.service'
import { DomainServiceError } from './create-node.tool'

export const createEdgeTool = (deps: { edgeService: EdgeService; projectId: string }) =>
  tool(
    async ({ fromId, toId, type }) => {
      try {
        const edge = await deps.edgeService.createEdge({
          projectId: deps.projectId,
          fromId,
          toId,
          type: type === 'composition' ? EdgeType.composition : EdgeType.dependency,
          createdBy: CreatedBy.agent,
        })
        return JSON.stringify({ edgeId: edge.id })
      } catch (err) {
        if (err instanceof ConflictException) throw new DomainServiceError(err.message)
        throw err
      }
    },
    {
      name: 'create_edge',
      description: 'Create a composition or dependency edge between two nodes',
      schema: z.object({
        fromId: z.string(),
        toId: z.string(),
        type: z.enum(['composition', 'dependency']),
      }),
    },
  )
```

- [ ] **Step 5: Implement move-node.tool.ts**

```typescript
// apps/server/src/orchestrator/tools/write/move-node.tool.ts
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { ConflictException } from '@nestjs/common'
import { EdgeType, CreatedBy } from '@generated/client'
import { EdgeService } from '../../../graph/edge/edge.service'
import { DomainServiceError } from './create-node.tool'

export const moveNodeTool = (deps: { edgeService: EdgeService; projectId: string }) =>
  tool(
    async ({ nodeId, newParentId }) => {
      try {
        const edge = await deps.edgeService.createEdge({
          projectId: deps.projectId,
          fromId: newParentId,
          toId: nodeId,
          type: EdgeType.composition,
          createdBy: CreatedBy.agent,
        })
        return JSON.stringify({ edgeId: edge.id, nodeId, newParentId })
      } catch (err) {
        if (err instanceof ConflictException) throw new DomainServiceError(err.message)
        throw err
      }
    },
    {
      name: 'move_node',
      description: 'Move a node to a new parent by creating a composition edge',
      schema: z.object({
        nodeId: z.string().describe('The node to move'),
        newParentId: z.string().describe('The new parent node ID'),
      }),
    },
  )
```

- [ ] **Step 6: Implement update-node-status.tool.ts**

```typescript
// apps/server/src/orchestrator/tools/write/update-node-status.tool.ts
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { ConflictException } from '@nestjs/common'
import { NodeStatus } from '@generated/client'
import { NodeService } from '../../../graph/node/node.service'
import { DomainServiceError } from './create-node.tool'

export const updateNodeStatusTool = (deps: { nodeService: NodeService }) =>
  tool(
    async ({ nodeId, newStatus }) => {
      try {
        const updated = await deps.nodeService.updateStatus(nodeId, newStatus as NodeStatus)
        return JSON.stringify({ nodeId: updated.id, status: updated.status })
      } catch (err) {
        if (err instanceof ConflictException) throw new DomainServiceError(err.message)
        throw err
      }
    },
    {
      name: 'update_node_status',
      description: 'Update a node status. Cannot be used to set resolution on checkpoints — use notify_human instead.',
      schema: z.object({
        nodeId: z.string(),
        newStatus: z.enum(['active', 'blocked', 'completed']).describe('Target status — archived not permitted'),
      }),
    },
  )
```

- [ ] **Step 7: Run tests**

```bash
cd apps/server && pnpm vitest run src/orchestrator/tools/write/graph-write-tools.spec.ts
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/orchestrator/tools/write/
git commit -m "feat(orchestrator): graph write tools"
```

---

## Task 11: Write Tools — Knowledge Mutations + Tests

**Files:**
- Create: `apps/server/src/orchestrator/tools/write/write-embedding.tool.ts`
- Create: `apps/server/src/orchestrator/tools/write/create-knowledge-entry.tool.ts`
- Create: `apps/server/src/orchestrator/tools/write/revise-knowledge-entry.tool.ts`
- Create: `apps/server/src/orchestrator/tools/write/knowledge-write-tools.spec.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/server/src/orchestrator/tools/write/knowledge-write-tools.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { createKnowledgeEntryTool } from './create-knowledge-entry.tool'
import { EntryStatus, EntryCategory, CreatedBy, EmbeddingStatus } from '@generated/client'

const makeEntry = (overrides = {}) => ({
  id: 'e1', projectId: 'p1', nodeId: 'n1', category: EntryCategory.finding,
  title: 'T', body: {}, status: EntryStatus.draft,
  embeddingStatus: EmbeddingStatus.unindexed, embedding: null,
  createdBy: CreatedBy.agent, createdAt: new Date(), updatedAt: new Date(),
  ...overrides,
})

describe('createKnowledgeEntryTool', () => {
  it('creates entry and returns entryId', async () => {
    const mockEntryService = {
      createEntry: vi.fn().mockResolvedValue(makeEntry()),
      listEntries: vi.fn().mockResolvedValue([]),
    }
    const mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    const t = createKnowledgeEntryTool({
      entryService: mockEntryService as any,
      publisher: mockPublisher as any,
      projectId: 'p1',
    })
    const result = await t.invoke({
      nodeId: 'n1', category: 'finding', title: 'Test', body: 'content',
    })
    const parsed = JSON.parse(result)
    expect(parsed.entryId).toBe('e1')
    expect(parsed.action).toBe('created')
  })

  it('returns existing id when duplicate title found (dedup check)', async () => {
    const mockEntryService = {
      createEntry: vi.fn(),
      listEntries: vi.fn().mockResolvedValue([makeEntry({ title: 'Test Finding' })]),
    }
    const mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    const t = createKnowledgeEntryTool({
      entryService: mockEntryService as any,
      publisher: mockPublisher as any,
      projectId: 'p1',
    })
    const result = await t.invoke({
      nodeId: 'n1', category: 'finding', title: 'Test Finding', body: 'content',
    })
    const parsed = JSON.parse(result)
    expect(parsed.action).toBe('duplicate_found')
    expect(parsed.existingId).toBe('e1')
    expect(mockEntryService.createEntry).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/server && pnpm vitest run src/orchestrator/tools/write/knowledge-write-tools.spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement write-embedding.tool.ts**

```typescript
// apps/server/src/orchestrator/tools/write/write-embedding.tool.ts
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { SearchService } from '../../../knowledge/search/search.service'

export const writeEmbeddingTool = (deps: { searchService: SearchService }) =>
  tool(
    async ({ entryId, vector }) => {
      await deps.searchService.storeEmbedding(entryId, vector)
      return JSON.stringify({ entryId, indexed: true })
    },
    {
      name: 'write_embedding',
      description: 'Store a computed embedding vector for a KnowledgeEntry',
      schema: z.object({
        entryId: z.string(),
        vector: z.array(z.number()).length(1536),
      }),
    },
  )
```

- [ ] **Step 4: Implement create-knowledge-entry.tool.ts**

```typescript
// apps/server/src/orchestrator/tools/write/create-knowledge-entry.tool.ts
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { EntryCategory, CreatedBy, OrchestratorSourceType, OrchestratorTaskType } from '@generated/client'
import { EntryService } from '../../../knowledge/entry/entry.service'
import { OrchestratorTaskPublisher } from '../../ingress/orchestrator-task.publisher'

export const createKnowledgeEntryTool = (deps: {
  entryService: EntryService
  publisher: OrchestratorTaskPublisher
  projectId: string
}) =>
  tool(
    async ({ nodeId, category, title, body }) => {
      // Dedup: check for existing entry with same title on this node
      const existing = await deps.entryService.listEntries(deps.projectId, { nodeId })
      const duplicate = existing.find((e) => e.title.toLowerCase() === title.toLowerCase())
      if (duplicate) {
        return JSON.stringify({
          action: 'duplicate_found',
          existingId: duplicate.id,
          suggestion: 'Use revise_knowledge_entry to update the existing entry instead',
        })
      }

      const entry = await deps.entryService.createEntry({
        projectId: deps.projectId,
        nodeId,
        category: category as EntryCategory,
        title,
        body: { text: body },
        createdBy: CreatedBy.agent,
      })

      // Cascade: trigger embedding task
      await deps.publisher.publish({
        projectId: deps.projectId,
        type: OrchestratorTaskType.embedding,
        sourceType: OrchestratorSourceType.knowledge_event,
        sourceId: entry.id,
        input: { entryId: entry.id },
      })

      return JSON.stringify({ entryId: entry.id, action: 'created' })
    },
    {
      name: 'create_knowledge_entry',
      description: 'Create a new KnowledgeEntry anchored to a node. Automatically triggers embedding.',
      schema: z.object({
        nodeId: z.string(),
        category: z.enum(['decision', 'pitfall', 'finding', 'context']),
        title: z.string().describe('Concise, unique title'),
        body: z.string().describe('Full content of the entry'),
      }),
    },
  )
```

- [ ] **Step 5: Implement revise-knowledge-entry.tool.ts**

```typescript
// apps/server/src/orchestrator/tools/write/revise-knowledge-entry.tool.ts
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { CreatedBy } from '@generated/client'
import { RevisionService } from '../../../knowledge/revision/revision.service'

export const reviseKnowledgeEntryTool = (deps: { revisionService: RevisionService }) =>
  tool(
    async ({ entryId, body, changeNote }) => {
      const revision = await deps.revisionService.appendRevision({
        entryId,
        body: { text: body },
        changeNote,
        createdBy: CreatedBy.agent,
      })
      return JSON.stringify({ entryId, revisionVersion: revision.version, action: 'revised' })
    },
    {
      name: 'revise_knowledge_entry',
      description: 'Append a new revision to an existing KnowledgeEntry',
      schema: z.object({
        entryId: z.string(),
        body: z.string().describe('Updated full content'),
        changeNote: z.string().optional().describe('Brief note about what changed'),
      }),
    },
  )
```

- [ ] **Step 6: Implement to-staging.tool.ts**

```typescript
// apps/server/src/orchestrator/tools/write/to-staging.tool.ts
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { EntryCategory, CreatedBy, EntryStatus } from '@generated/client'
import { EntryService } from '../../../knowledge/entry/entry.service'

export const toStagingTool = (deps: { entryService: EntryService; stagingNodeId: string }) =>
  tool(
    async ({ summary, rationale }) => {
      const entry = await deps.entryService.createEntry({
        projectId: '', // will be set by closure in agent-graph
        nodeId: deps.stagingNodeId,
        category: EntryCategory.context,
        title: `Staging: ${summary.slice(0, 80)}`,
        body: { text: rationale, isStagingEntry: true },
        createdBy: CreatedBy.agent,
      })
      return JSON.stringify({ stagingEntryId: entry.id, action: 'to_staging' })
    },
    {
      name: 'to_staging',
      description: 'Route a meaningful but unanchored event to the Staging Graph for later review',
      schema: z.object({
        summary: z.string().describe('One-line summary of the event'),
        rationale: z.string().describe('Why this event matters and what anchor might exist later'),
      }),
    },
  )
```

- [ ] **Step 7: Run tests**

```bash
cd apps/server && pnpm vitest run src/orchestrator/tools/write/knowledge-write-tools.spec.ts
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/orchestrator/tools/write/
git commit -m "feat(orchestrator): knowledge write tools + to-staging + signals"
```

---

## Task 12: LangGraph Agent Loop + Full AgentRuntimeService

**Files:**
- Create: `apps/server/src/orchestrator/llm/agent-graph.ts`
- Update: `apps/server/src/orchestrator/runtime/task-runner.service.ts`
- Create: `apps/server/src/orchestrator/llm/agent-graph.spec.ts`

- [ ] **Step 1: Write failing test for agent-graph**

```typescript
// apps/server/src/orchestrator/llm/agent-graph.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { buildAgentGraph } from './agent-graph'

describe('buildAgentGraph', () => {
  it('compiles without error given empty tool list', () => {
    const graph = buildAgentGraph({
      tools: [],
      systemPrompt: 'You are a test agent.',
      model: 'claude-haiku-4-5-20251001',
    })
    expect(graph).toBeDefined()
    expect(typeof graph.invoke).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server && pnpm vitest run src/orchestrator/llm/agent-graph.spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement agent-graph.ts**

```typescript
// apps/server/src/orchestrator/llm/agent-graph.ts
import { StateGraph, MessagesAnnotation, END } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { ChatAnthropic } from '@langchain/anthropic'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { AIMessage } from '@langchain/core/messages'
import type { StructuredToolInterface } from '@langchain/core/tools'
import type { AgentInsight } from '../types'
import { MAX_ITERATIONS } from '../types'

type BuildOptions = {
  tools: StructuredToolInterface[]
  systemPrompt: string
  model: string
}

export function buildAgentGraph(options: BuildOptions) {
  const llm = new ChatAnthropic({ model: options.model }).bindTools(options.tools)
  const toolNode = new ToolNode(options.tools)

  function shouldContinue(state: typeof MessagesAnnotation.State): 'tools' | typeof END {
    const last = state.messages.at(-1) as AIMessage
    if (last?.tool_calls?.length) return 'tools'
    return END
  }

  async function callModel(state: typeof MessagesAnnotation.State) {
    const messages = [new SystemMessage(options.systemPrompt), ...state.messages]
    const response = await llm.invoke(messages)
    return { messages: [response] }
  }

  return new StateGraph(MessagesAnnotation)
    .addNode('agent', callModel)
    .addNode('tools', toolNode)
    .addEdge('__start__', 'agent')
    .addConditionalEdges('agent', shouldContinue)
    .addEdge('tools', 'agent')
    .compile({ recursionLimit: MAX_ITERATIONS })
}

export async function runAgentLoop(
  graph: ReturnType<typeof buildAgentGraph>,
  userMessage: string,
): Promise<AgentInsight> {
  const result = await graph.invoke({
    messages: [new HumanMessage(userMessage)],
  })

  const lastMessage = result.messages.at(-1) as AIMessage
  const content = typeof lastMessage.content === 'string'
    ? lastMessage.content
    : JSON.stringify(lastMessage.content)

  try {
    const parsed = JSON.parse(content) as AgentInsight
    if (parsed.summary && parsed.signalType) return parsed
  } catch {
    // LLM returned free-form text — wrap it
  }

  return {
    summary: content,
    signalType: 'progress',
    confidence: 0.7,
    evidence: [],
  }
}
```

- [ ] **Step 4: Run test**

```bash
cd apps/server && pnpm vitest run src/orchestrator/llm/agent-graph.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Implement TaskRunnerService (full)**

The runner needs the services injected. Since tools are factory functions, the runner assembles the tool list per-task before running the loop.

```typescript
// apps/server/src/orchestrator/runtime/task-runner.service.ts
import { Injectable } from '@nestjs/common'
import { OrchestratorTaskType } from '@generated/client'
import type { OrchestratorTask, OrchestratorContext, AgentInsight } from '../types'
import { ContextBuilderService } from '../context/context-builder.service'
import { SkillRegistry } from '../llm/skill-registry'
import { buildAgentGraph, runAgentLoop } from '../llm/agent-graph'
import { GraphContextReader } from '../context/graph-context.reader'
import { GraphRepository } from '../../graph/repository/graph.repository'
import { NodeService } from '../../graph/node/node.service'
import { EdgeService } from '../../graph/edge/edge.service'
import { EntryService } from '../../knowledge/entry/entry.service'
import { RevisionService } from '../../knowledge/revision/revision.service'
import { SearchService } from '../../knowledge/search/search.service'
import { OrchestratorTaskRepository } from '../repository/orchestrator-task.repository'
import { OrchestratorTaskPublisher } from '../ingress/orchestrator-task.publisher'
import { OpenAI } from 'openai'
// read tools
import { getNodeTool } from '../tools/read/get-node.tool'
import { getSubgraphTool } from '../tools/read/get-subgraph.tool'
import { searchNodesTool } from '../tools/read/search-nodes.tool'
import { searchKnowledgeTool } from '../tools/read/search-knowledge.tool'
import { getTaskHistoryTool } from '../tools/read/get-task-history.tool'
// write tools
import { createNodeTool } from '../tools/write/create-node.tool'
import { createEdgeTool } from '../tools/write/create-edge.tool'
import { moveNodeTool } from '../tools/write/move-node.tool'
import { updateNodeStatusTool } from '../tools/write/update-node-status.tool'
import { createKnowledgeEntryTool } from '../tools/write/create-knowledge-entry.tool'
import { reviseKnowledgeEntryTool } from '../tools/write/revise-knowledge-entry.tool'
import { skipTool } from '../tools/write/skip.tool'
import { notifyHumanTool } from '../tools/write/notify-human.tool'
import { toStagingTool } from '../tools/write/to-staging.tool'

@Injectable()
export class TaskRunnerService {
  private readonly openai = new OpenAI()

  constructor(
    private readonly contextBuilder: ContextBuilderService,
    private readonly skillRegistry: SkillRegistry,
    private readonly graphReader: GraphContextReader,
    private readonly graphRepo: GraphRepository,
    private readonly nodeService: NodeService,
    private readonly edgeService: EdgeService,
    private readonly entryService: EntryService,
    private readonly revisionService: RevisionService,
    private readonly searchService: SearchService,
    private readonly taskRepo: OrchestratorTaskRepository,
    private readonly publisher: OrchestratorTaskPublisher,
  ) {}

  async run(task: OrchestratorTask): Promise<AgentInsight> {
    if (task.type === OrchestratorTaskType.embedding) {
      return this.runEmbedding(task)
    }
    const ctx = await this.contextBuilder.build(task)
    return this.runAgenticLoop(task, ctx)
  }

  private async runEmbedding(task: OrchestratorTask): Promise<AgentInsight> {
    const input = task.input as { entryId: string }
    const entry = await this.entryService.getEntry(input.entryId)
    const text = typeof entry.body === 'object' && entry.body !== null
      ? JSON.stringify(entry.body)
      : String(entry.body)

    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    })
    const vector = response.data[0].embedding
    await this.searchService.storeEmbedding(input.entryId, vector)

    return {
      summary: `Embedding indexed for entry ${input.entryId}`,
      signalType: 'progress',
      confidence: 1,
      evidence: [{ sourceType: 'knowledge_entry', sourceId: input.entryId, note: 'embedding stored' }],
    }
  }

  private async runAgenticLoop(
    task: OrchestratorTask,
    ctx: OrchestratorContext,
  ): Promise<AgentInsight> {
    const model = task.type === OrchestratorTaskType.checkpoint
      ? 'claude-sonnet-4-6'
      : 'claude-haiku-4-5-20251001'

    const systemPrompt = this.skillRegistry.getSystemPrompt(task.type)

    const queryEmbedding = async (text: string) => {
      const res = await this.openai.embeddings.create({ model: 'text-embedding-3-small', input: text })
      return res.data[0].embedding
    }

    const tools = [
      // read
      getNodeTool(this.graphRepo),
      getSubgraphTool(this.graphReader),
      searchNodesTool(this.graphReader),
      searchKnowledgeTool(this.searchService, queryEmbedding),
      getTaskHistoryTool(this.taskRepo),
      // write — graph
      createNodeTool({ nodeService: this.nodeService, projectId: task.projectId }),
      createEdgeTool({ edgeService: this.edgeService, projectId: task.projectId }),
      moveNodeTool({ edgeService: this.edgeService, projectId: task.projectId }),
      updateNodeStatusTool({ nodeService: this.nodeService }),
      // write — knowledge
      createKnowledgeEntryTool({
        entryService: this.entryService,
        publisher: this.publisher,
        projectId: task.projectId,
      }),
      reviseKnowledgeEntryTool({ revisionService: this.revisionService }),
      // terminal
      skipTool(),
      notifyHumanTool(),
      toStagingTool({ entryService: this.entryService, stagingNodeId: 'staging' }),
    ]

    const userMessage = `
Task type: ${task.type}
Project: ${ctx.project.id}
Trigger: ${JSON.stringify(ctx.trigger)}
Candidate nodes: ${JSON.stringify(ctx.candidateNodes)}
Related knowledge: ${JSON.stringify(ctx.relatedEntries)}
Recent task history: ${JSON.stringify(ctx.recentTaskHistory)}

Analyze the trigger event and take appropriate actions using the available tools.
When done, respond with a JSON object matching: { summary, signalType, confidence, evidence[] }
`

    const graph = buildAgentGraph({ tools, systemPrompt, model })
    return runAgentLoop(graph, userMessage)
  }
}
```

- [ ] **Step 6: Run all tests**

```bash
cd apps/server && pnpm test
```

Expected: all existing tests PASS, new tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/orchestrator/llm/ apps/server/src/orchestrator/runtime/task-runner.service.ts
git commit -m "feat(orchestrator): langgraph agent loop + full task runner"
```

---

## Task 13: OrchestratorRouter + TaskScheduler (Ingress)

**Files:**
- Create: `apps/server/src/orchestrator/ingress/orchestrator-router.service.ts`
- Create: `apps/server/src/orchestrator/ingress/task-scheduler.service.ts`
- Create: `apps/server/src/orchestrator/ingress/orchestrator-router.service.spec.ts`

- [ ] **Step 1: Install schedule module**

```bash
cd apps/server && pnpm add @nestjs/schedule
```

- [ ] **Step 2: Write failing tests**

```typescript
// apps/server/src/orchestrator/ingress/orchestrator-router.service.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OrchestratorRouterService } from './orchestrator-router.service'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'

describe('OrchestratorRouterService', () => {
  let router: OrchestratorRouterService
  let mockPublisher: any

  beforeEach(() => {
    mockPublisher = { publish: vi.fn().mockResolvedValue({ taskId: 't1', created: true }) }
    router = new OrchestratorRouterService(mockPublisher)
  })

  it('routes graph.node.checkpoint_elevated to checkpoint task', async () => {
    await router.handleGraphEvent({
      type: 'graph.node.checkpoint_elevated',
      payload: { nodeId: 'n1', cyclePath: ['n1', 'n2'], projectId: 'p1' },
    })
    expect(mockPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: OrchestratorTaskType.checkpoint,
        sourceType: OrchestratorSourceType.graph_event,
      }),
    )
  })

  it('routes knowledge.entry.created to embedding task', async () => {
    await router.handleKnowledgeEvent({
      type: 'knowledge.entry.created',
      payload: { entryId: 'e1', projectId: 'p1', nodeId: 'n1', category: 'finding' },
    })
    expect(mockPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: OrchestratorTaskType.embedding,
        sourceType: OrchestratorSourceType.knowledge_event,
      }),
    )
  })

  it('ignores irrelevant graph events', async () => {
    await router.handleGraphEvent({
      type: 'graph.node.deleted',
      payload: { nodeId: 'n1', strategy: 'cascade', affectedNodeIds: [], projectId: 'p1' },
    })
    expect(mockPublisher.publish).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd apps/server && pnpm vitest run src/orchestrator/ingress/orchestrator-router.service.spec.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement OrchestratorRouterService**

```typescript
// apps/server/src/orchestrator/ingress/orchestrator-router.service.ts
import { Injectable } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { GRAPH_EVENTS_QUEUE, type GraphJob } from '../../graph/events/graph-event.publisher'
import { KNOWLEDGE_EVENTS_QUEUE, type KnowledgeJob } from '../../knowledge/events/knowledge-event.publisher'
import { OrchestratorTaskPublisher } from './orchestrator-task.publisher'

@Injectable()
export class OrchestratorRouterService {
  constructor(private readonly publisher: OrchestratorTaskPublisher) {}

  async handleGraphEvent(job: GraphJob): Promise<void> {
    switch (job.type) {
      case 'graph.node.checkpoint_elevated':
        await this.publisher.publish({
          projectId: job.payload.projectId,
          type: OrchestratorTaskType.checkpoint,
          sourceType: OrchestratorSourceType.graph_event,
          sourceId: job.payload.nodeId,
          input: job.payload,
        })
        break
      // other graph events not yet routed to orchestrator
    }
  }

  async handleKnowledgeEvent(job: KnowledgeJob): Promise<void> {
    switch (job.type) {
      case 'knowledge.entry.created':
      case 'knowledge.entry.body_revised':
        await this.publisher.publish({
          projectId: job.payload.projectId,
          type: OrchestratorTaskType.embedding,
          sourceType: OrchestratorSourceType.knowledge_event,
          sourceId: job.payload.entryId,
          input: job.payload,
        })
        break
    }
  }
}

@Processor(GRAPH_EVENTS_QUEUE)
export class OrchestratorGraphEventWorker extends WorkerHost {
  constructor(private readonly router: OrchestratorRouterService) {
    super()
  }

  async process(job: Job): Promise<void> {
    await this.router.handleGraphEvent({ type: job.name, payload: job.data } as GraphJob)
  }
}

@Processor(KNOWLEDGE_EVENTS_QUEUE)
export class OrchestratorKnowledgeEventWorker extends WorkerHost {
  constructor(private readonly router: OrchestratorRouterService) {
    super()
  }

  async process(job: Job): Promise<void> {
    await this.router.handleKnowledgeEvent({ type: job.name, payload: job.data } as KnowledgeJob)
  }
}
```

- [ ] **Step 5: Implement TaskScheduler**

```typescript
// apps/server/src/orchestrator/ingress/task-scheduler.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { OrchestratorTaskPublisher } from './orchestrator-task.publisher'

@Injectable()
export class TaskSchedulerService {
  private readonly logger = new Logger(TaskSchedulerService.name)

  constructor(private readonly publisher: OrchestratorTaskPublisher) {}

  @Cron(CronExpression.EVERY_HOUR)
  async triggerGraphGrowthScan(): Promise<void> {
    // TODO: iterate over active projects from ProjectRepository when it exists
    // For now, log that the scan would run
    this.logger.log('graph_growth scan triggered (no active projects wired yet)')
  }

  async triggerForProject(projectId: string): Promise<void> {
    const sourceId = `schedule:${projectId}:${new Date().toISOString().slice(0, 13)}`
    await this.publisher.publish({
      projectId,
      type: OrchestratorTaskType.graph_growth,
      sourceType: OrchestratorSourceType.schedule,
      sourceId,
      input: { projectId, scheduledAt: new Date().toISOString() },
    })
  }
}
```

- [ ] **Step 6: Run tests**

```bash
cd apps/server && pnpm vitest run src/orchestrator/ingress/orchestrator-router.service.spec.ts
```

Expected: all PASS.

- [ ] **Step 7: Update OrchestratorModule with all providers**

Replace `apps/server/src/orchestrator/orchestrator.module.ts` fully:

```typescript
import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ScheduleModule } from '@nestjs/schedule'
import { join } from 'node:path'
import { PrismaService } from '../prisma/prisma.service'
import { GraphRepository } from '../graph/repository/graph.repository'
import { NodeService } from '../graph/node/node.service'
import { EdgeService } from '../graph/edge/edge.service'
import { GraphEventPublisher, GRAPH_EVENTS_QUEUE } from '../graph/events/graph-event.publisher'
import { CycleDetectorService } from '../graph/cycle/cycle-detector.service'
import { EntryService } from '../knowledge/entry/entry.service'
import { RevisionService } from '../knowledge/revision/revision.service'
import { SearchService } from '../knowledge/search/search.service'
import { KnowledgeRepository } from '../knowledge/repository/knowledge.repository'
import { KnowledgeEventPublisher, KNOWLEDGE_EVENTS_QUEUE } from '../knowledge/events/knowledge-event.publisher'
import { ORCHESTRATOR_TASKS_QUEUE } from './types'
import { OrchestratorTaskRepository } from './repository/orchestrator-task.repository'
import { OrchestratorTaskPublisher } from './ingress/orchestrator-task.publisher'
import {
  OrchestratorRouterService,
  OrchestratorGraphEventWorker,
  OrchestratorKnowledgeEventWorker,
} from './ingress/orchestrator-router.service'
import { TaskSchedulerService } from './ingress/task-scheduler.service'
import { AgentRuntimeService } from './runtime/agent-runtime.service'
import { TaskRunnerService } from './runtime/task-runner.service'
import { OrchestratorTaskWorker } from './runtime/orchestrator-task.worker'
import { ContextBuilderService } from './context/context-builder.service'
import { GraphContextReader } from './context/graph-context.reader'
import { KnowledgeContextReader } from './context/knowledge-context.reader'
import { SkillRegistry } from './llm/skill-registry'

const SKILLS_DIR = join(__dirname, '../../skills/orchestrator')

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.registerQueue(
      { name: ORCHESTRATOR_TASKS_QUEUE },
      { name: GRAPH_EVENTS_QUEUE },
      { name: KNOWLEDGE_EVENTS_QUEUE },
    ),
  ],
  providers: [
    PrismaService,
    // graph domain
    GraphRepository,
    CycleDetectorService,
    GraphEventPublisher,
    NodeService,
    EdgeService,
    // knowledge domain
    KnowledgeRepository,
    KnowledgeEventPublisher,
    EntryService,
    RevisionService,
    SearchService,
    // orchestrator
    OrchestratorTaskRepository,
    OrchestratorTaskPublisher,
    OrchestratorRouterService,
    OrchestratorGraphEventWorker,
    OrchestratorKnowledgeEventWorker,
    TaskSchedulerService,
    AgentRuntimeService,
    TaskRunnerService,
    OrchestratorTaskWorker,
    ContextBuilderService,
    GraphContextReader,
    KnowledgeContextReader,
    {
      provide: SkillRegistry,
      useFactory: () => new SkillRegistry(SKILLS_DIR),
    },
  ],
})
export class OrchestratorModule {}
```

- [ ] **Step 8: Run full test suite and verify server starts**

```bash
cd apps/server && pnpm test
pnpm dev  # Ctrl-C after server boots
```

Expected: all tests PASS, server starts without error.

- [ ] **Step 9: Commit**

```bash
git add apps/server/src/orchestrator/ingress/ apps/server/src/orchestrator/orchestrator.module.ts
git commit -m "feat(orchestrator): ingress router + scheduler + full module wiring"
```

---

## Task 14: Skill Content — Event Anchoring + Knowledge Sedimentation

**Files:**
- Replace: `apps/server/skills/orchestrator/event-anchoring/index.md`
- Replace: `apps/server/skills/orchestrator/knowledge-sedimentation/index.md`
- Replace: `apps/server/skills/orchestrator/github-pr-reading/index.md`

- [ ] **Step 1: Write event-anchoring skill**

```markdown
---
name: event-anchoring
description: Guides routing and anchoring of external events to graph nodes
applicable_tasks: [event_anchor]
---

## Event Anchoring

Your job is to decide what this event means for the project graph.

### Decision Matrix

| Situation | Action |
|---|---|
| Event is noise / no project relevance | Call `skip` with reason |
| Event is meaningful + clear anchor node exists | Use write tools to anchor; cascade sedimentation if knowledge value |
| Event is meaningful + no clear anchor | Call `to_staging` — this is a deliberate routing, not a fallback |
| Human judgment required (high-stakes decision, incomplete info) | Call `notify_human` |

### Noise criteria
- Automated bot activity with no semantic content
- Duplicate of an event already anchored (check `get_task_history`)
- Test/CI artifacts with no project meaning

### Anchoring process
1. Call `search_nodes` to find candidate anchor nodes by keyword from the event
2. If 2+ candidates: use `get_node` to read details and pick the best fit
3. If no candidates: call `search_knowledge` to find related entries as clues
4. Anchor to the most specific matching node; escalate to `to_staging` if uncertain

### Knowledge sedimentation trigger
After anchoring: if the event contains a decision, risk, finding, or learning worth preserving,
immediately call `create_knowledge_entry` in the same loop. Do not defer sedimentation to a later task.
```

- [ ] **Step 2: Write knowledge-sedimentation skill**

```markdown
---
name: knowledge-sedimentation
description: Guides extraction and storage of durable knowledge from events
applicable_tasks: [event_anchor]
---

## Knowledge Sedimentation

Knowledge entries preserve the "why" behind project events. Not every event creates knowledge.

### When to sedate

Create a `KnowledgeEntry` when the event contains:
- A **decision** with rationale (`category: decision`)
- A **pitfall** or failure mode encountered (`category: pitfall`)
- A **finding** or discovery worth remembering (`category: finding`)
- Necessary **context** for understanding a node (`category: context`)

Do NOT create entries for:
- Status updates that are already visible in the graph
- Noise or irrelevant events
- Information already captured in an existing entry (use `revise_knowledge_entry` instead)

### Dedup check
Before calling `create_knowledge_entry`, verify the tool hasn't returned `action: duplicate_found`.
If it does, call `revise_knowledge_entry` with the `existingId` instead.

### Body format
Write the body as a concise, self-contained explanation. Avoid references like "as mentioned above".
The entry must make sense read in isolation, weeks later.
```

- [ ] **Step 3: Write github-pr-reading skill**

```markdown
---
name: github-pr-reading
description: Interprets GitHub PR events for event anchoring
applicable_tasks: [event_anchor]
---

## GitHub PR Reading

When the trigger is a GitHub PR or commit event:

### Signal extraction
- PR title + description → primary signal
- Changed files → infer affected subsystems (map to graph nodes by directory/module name)
- PR labels → look for: `breaking-change`, `hotfix`, `decision`, `blocked`
- Review comments → may contain decisions or risk signals

### Anchoring heuristics
- Map changed file paths to node titles using keyword overlap
- A PR touching `src/auth/` most likely belongs to a node with "auth" in its title
- Merged PRs with `breaking-change` label → consider `update_node_status` to `blocked` if dependents exist

### Sedimentation triggers
- PR description explicitly states a decision → `category: decision`
- PR description mentions a workaround or known issue → `category: pitfall`
- Significant architectural change merged → `category: finding`
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/skills/orchestrator/event-anchoring/ \
        apps/server/skills/orchestrator/knowledge-sedimentation/ \
        apps/server/skills/orchestrator/github-pr-reading/
git commit -m "feat(orchestrator): event-anchoring + knowledge-sedimentation + github-pr-reading skills"
```

---

## Task 15: Skill Content — Checkpoint, Graph Growth, Node Lifecycle

**Files:**
- Replace: `apps/server/skills/orchestrator/checkpoint-analysis/index.md`
- Replace: `apps/server/skills/orchestrator/graph-growth/index.md`
- Replace: `apps/server/skills/orchestrator/node-lifecycle/index.md`

- [ ] **Step 1: Write checkpoint-analysis skill**

```markdown
---
name: checkpoint-analysis
description: Guides checkpoint analysis and human-approval preparation
applicable_tasks: [checkpoint]
---

## Checkpoint Analysis

A checkpoint node has been elevated (a dependency cycle was detected). Your job is to prepare
a decision package for human review. You CANNOT resolve the checkpoint — only humans can.

### Required actions (in order)
1. Call `get_node` on the checkpoint node to understand context
2. Call `get_subgraph` to see the cycle path
3. Call `search_knowledge` to find related decisions and context entries
4. Call `get_task_history` to understand recent activity on this project
5. Call `create_knowledge_entry` with `category: decision` containing:
   - Background: what led to this cycle
   - Risk analysis: what happens with `continue` vs `loop`
   - Your recommendation (clearly labeled as a draft for human review)
6. Call `notify_human` with the `entryId` of the decision draft

### Hard constraints
- NEVER call `update_node_status` — resolution is exclusively a human action
- NEVER call `skip` — checkpoints always require human notification
- The `notify_human` call ends this task; do not attempt further actions after it
```

- [ ] **Step 2: Write graph-growth skill**

```markdown
---
name: graph-growth
description: Guides proactive graph structure improvement without triggering events
applicable_tasks: [graph_growth]
---

## Graph Growth

You are scanning the project graph for gaps that new nodes or edges would fill.

### When to create a new node
- A cluster of KnowledgeEntries shares a theme not represented by any existing node
- Tasks or work items span multiple nodes but no parent node organizes them
- A clearly bounded subsystem has grown complex enough to warrant its own composition child

### When to create an edge
- Two existing nodes have an implicit dependency not yet expressed in the graph
- A child node exists but its parent relationship is missing

### When to call to_staging
- A potential new node is plausible but you lack confidence (call `to_staging` with rationale)
- The graph looks healthy — no changes needed, note this in your final response

### When to call skip
- The scan reveals no opportunities — use `skip` with reason "no_growth_opportunity"

### Constraints
- Only create `type: growth` nodes (not scaffold)
- Do not create nodes for temporary or in-progress work — only for durable themes
- Prefer adding edges over creating new nodes when the concept already exists
```

- [ ] **Step 3: Write node-lifecycle skill**

```markdown
---
name: node-lifecycle
description: Guides valid node status transitions
applicable_tasks: [graph_growth]
---

## Node Lifecycle

Valid status transitions:
- `active` → `blocked` (dependency unresolved or checkpoint elevated)
- `blocked` → `active` (dependency resolved, non-checkpoint)
- `active` → `completed` (all children completed, no unresolved deps)

Forbidden transitions (will be rejected by the domain service):
- Any transition from `archived`
- `blocked` → `completed` (must go through `active` first)
- `completed` → any status (immutable)
- Direct resolution of checkpoint nodes via `update_node_status` (use `notify_human`)

When a status update fails with a domain error, record the reason in your final response.
Do not retry with a different status — respect the domain rules.
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/skills/orchestrator/checkpoint-analysis/ \
        apps/server/skills/orchestrator/graph-growth/ \
        apps/server/skills/orchestrator/node-lifecycle/
git commit -m "feat(orchestrator): checkpoint-analysis + graph-growth + node-lifecycle skills"
```

---

## Task 16: Final Wiring — env vars, full test run, smoke test

**Files:**
- Verify: `.env.example` has `OPENAI_API_KEY`
- Run: full test suite

- [ ] **Step 1: Add OPENAI_API_KEY to .env.example**

Open `apps/server/.env.example` and add if not present:

```
OPENAI_API_KEY=sk-...
```

- [ ] **Step 2: Run full test suite**

```bash
cd apps/server && pnpm test
```

Expected: all tests PASS.

- [ ] **Step 3: Verify TypeScript compiles clean**

```bash
cd apps/server && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Smoke test — start server and verify module loads**

```bash
OPENAI_API_KEY=test DATABASE_URL=postgresql://x REDIS_HOST=localhost pnpm dev 2>&1 | head -20
```

Expected: `OrchestratorModule` appears in the NestJS startup log. Ctrl-C.

- [ ] **Step 5: Final commit**

```bash
git add apps/server/.env.example
git commit -m "feat(orchestrator): env vars + final wiring complete"
```

---

## Post-Implementation Verification Checklist

Run these after all tasks complete to confirm the MVP acceptance criteria from the spec:

- [ ] **Step 1 (Prisma):** `pnpm prisma migrate dev --name verify` returns "already up to date"
- [ ] **Step 2 (Publisher):** Unit test for idempotency passes (Task 4)
- [ ] **Step 3 (Worker skeleton):** Status transitions test passes (Task 5)
- [ ] **Step 4 (embedding):** `OrchestratorTaskType.embedding` handled by `runEmbedding` (no loop)
- [ ] **Step 5 (event_anchor):** `WaitingForApprovalSignal` → `waiting_for_approval` test passes (Task 5)
- [ ] **Step 6 (checkpoint):** `checkpoint-analysis` skill loaded for `checkpoint` task type (Task 7 test)
- [ ] **Step 7 (graph_growth):** `graph-growth` + `node-lifecycle` skills loaded for `graph_growth` task type
- [ ] **Concurrent isolation:** `waiting_for_approval` is a terminal state with no locks
- [ ] **Forbidden tools:** no `delete_node` or `resolve_checkpoint` tool exists in the codebase (`grep -r "delete_node\|resolve_checkpoint" src/orchestrator/tools/`)
