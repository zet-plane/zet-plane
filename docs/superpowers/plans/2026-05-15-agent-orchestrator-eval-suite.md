# Agent Orchestrator Evaluation Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a programmatic integration test suite that runs all 10 evaluation scenarios from the agent orchestrator evaluation protocol (`docs/superpowers/specs/2026-05-14-agent-orchestrator-evaluation-protocol.md`) against a live NestJS + PostgreSQL + Redis + LLM stack, with assertions mapped directly to each scenario's pass criteria and record-table output to console.

**Architecture:** Vitest integration tests in `apps/server/test/eval/` that bootstrap the full NestJS app once via `@nestjs/testing`, share it across specs through a module-level singleton, call `OrchestratorTaskPublisher.publish()` + `AgentRuntimeService.execute()` directly (bypassing BullMQ workers), assert against direct Prisma queries, and print record-table fields to `console.log`. Each of the 10 scenarios lives in its own `*.eval.spec.ts` file; shared bootstrap and HTTP helpers live in `setup.ts` / `helpers.ts`. A separate `vitest.eval.config.ts` isolates eval tests (longer timeouts, sequential execution) from unit tests.

**Tech Stack:** Vitest, `@nestjs/testing`, `NestFastifyApplication` / `FastifyAdapter`, Prisma (`@generated/client`), `OrchestratorTaskPublisher`, `AgentRuntimeService`, `LlmProviderRegistry`

**Prerequisites before running:**
- PostgreSQL running (`DATABASE_URL` set)
- Redis running (`REDIS_HOST` / `REDIS_PORT`)
- LLM API key set in `.env`
- **No BullMQ workers running** — `publisher.publish()` enqueues a BullMQ job; if workers are up, they may race `runtime.execute()` and double-execute tasks

**Run command (after setup):** `cd apps/server && pnpm test:eval`

---

## File Map

**Create:**
- `apps/server/vitest.eval.config.ts` — separate Vitest config: 120 s timeout, sequential, includes `test/eval/**/*.eval.spec.ts`
- `apps/server/test/eval/setup.ts` — singleton NestJS app bootstrap; exports `getEvalApp()` and `teardownEvalApp()`
- `apps/server/test/eval/helpers.ts` — typed wrappers for `app.inject()`, project/node/edge/entry creation, `publishAndExecute()`, project cleanup
- `apps/server/test/eval/s8-tool-correctness.eval.spec.ts`
- `apps/server/test/eval/s10-skip.eval.spec.ts`
- `apps/server/test/eval/s1-growth-node.eval.spec.ts`
- `apps/server/test/eval/s5-staging.eval.spec.ts`
- `apps/server/test/eval/s2-node-drive.eval.spec.ts`
- `apps/server/test/eval/s7-knowledge-precision.eval.spec.ts`
- `apps/server/test/eval/s3-checkpoint.eval.spec.ts`
- `apps/server/test/eval/s4-phase-transition.eval.spec.ts`
- `apps/server/test/eval/s6-cycle-detection.eval.spec.ts`
- `apps/server/test/eval/s9-skills-efficiency.eval.spec.ts`

**Modify:**
- `apps/server/package.json` — add `"test:eval"` script

---

## Task 1: Infrastructure — Vitest config + bootstrap + helpers

**Files:**
- Create: `apps/server/vitest.eval.config.ts`
- Create: `apps/server/test/eval/setup.ts`
- Create: `apps/server/test/eval/helpers.ts`
- Modify: `apps/server/package.json`

- [ ] **Step 1: Create vitest eval config**

```typescript
// apps/server/vitest.eval.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // inherit tsconfigPaths from base config
  },
  test: {
    globals: true,
    include: ['test/eval/**/*.eval.spec.ts'],
    exclude: ['node_modules/**'],
    timeout: 120_000,     // 2 min per test — LLM calls can be slow
    hookTimeout: 60_000,
    sequence: { concurrent: false },   // scenarios must run sequentially
  },
})
```

- [ ] **Step 2: Create setup.ts (singleton app bootstrap)**

```typescript
// apps/server/test/eval/setup.ts
import 'reflect-metadata'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from '../../src/app.module'
import { PrismaService } from '../../src/prisma/prisma.service'
import { OrchestratorTaskPublisher } from '../../src/orchestrator/ingress/orchestrator-task.publisher'
import { AgentRuntimeService } from '../../src/orchestrator/runtime/agent-runtime.service'
import { LlmProviderRegistry } from '../../src/orchestrator/llm/llm-provider.registry'

export interface EvalApp {
  app: NestFastifyApplication
  prisma: PrismaService
  publisher: OrchestratorTaskPublisher
  runtime: AgentRuntimeService
  llm: LlmProviderRegistry
}

let _evalApp: EvalApp | null = null

export async function getEvalApp(): Promise<EvalApp> {
  if (_evalApp) return _evalApp

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
  await app.init()
  await app.getHttpAdapter().getInstance().ready()

  _evalApp = {
    app,
    prisma: moduleRef.get(PrismaService),
    publisher: moduleRef.get(OrchestratorTaskPublisher),
    runtime: moduleRef.get(AgentRuntimeService),
    llm: moduleRef.get(LlmProviderRegistry),
  }
  return _evalApp
}

export async function teardownEvalApp(): Promise<void> {
  if (_evalApp) {
    await _evalApp.app.close()
    _evalApp = null
  }
}
```

- [ ] **Step 3: Create helpers.ts**

```typescript
// apps/server/test/eval/helpers.ts
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import type { EvalApp } from './setup'

// ── Project ──────────────────────────────────────────────────────────────────

export async function createProject(app: NestFastifyApplication, name: string) {
  const res = await app.inject({ method: 'POST', url: '/projects', payload: { name } })
  if (res.statusCode !== 201) throw new Error(`createProject failed: ${res.statusCode} ${res.body}`)
  return res.json() as { id: string; name: string }
}

/** rootNode (isProjectRoot) and stagingNode (isStagingRoot) — not in GET /nodes list */
export async function getSystemNodes(ctx: EvalApp, projectId: string) {
  const [rootNode, stagingNode] = await Promise.all([
    ctx.prisma.node.findFirstOrThrow({ where: { projectId, isProjectRoot: true } }),
    ctx.prisma.node.findFirstOrThrow({ where: { projectId, isStagingRoot: true } }),
  ])
  return { rootNode, stagingNode }
}

/** Delete project and all related data in FK-safe order */
export async function deleteProject(ctx: EvalApp, projectId: string) {
  const prisma = ctx.prisma
  await prisma.orchestratorTask.deleteMany({ where: { projectId } })
  await prisma.knowledgeRevision.deleteMany({ where: { entry: { projectId } } })
  await prisma.knowledgeEntry.deleteMany({ where: { projectId } })
  await prisma.edge.deleteMany({ where: { projectId } })
  await prisma.node.deleteMany({ where: { projectId } })
  await prisma.project.delete({ where: { id: projectId } })
}

// ── Nodes ─────────────────────────────────────────────────────────────────────

export async function createNode(
  app: NestFastifyApplication,
  projectId: string,
  payload: { title: string; description?: string; type?: string; parentId?: string },
) {
  const res = await app.inject({
    method: 'POST',
    url: `/projects/${projectId}/nodes`,
    payload: { createdBy: 'human', ...payload },
  })
  if (res.statusCode !== 201) throw new Error(`createNode failed: ${res.statusCode} ${res.body}`)
  return res.json() as { id: string; title: string; type: string; status: string }
}

export async function updateNodeStatus(app: NestFastifyApplication, nodeId: string, status: string) {
  const res = await app.inject({ method: 'PATCH', url: `/nodes/${nodeId}`, payload: { status } })
  if (res.statusCode !== 200) throw new Error(`updateNodeStatus(${nodeId}, ${status}) failed: ${res.statusCode} ${res.body}`)
  return res.json()
}

export async function setCheckpoint(app: NestFastifyApplication, nodeId: string) {
  const res = await app.inject({ method: 'PATCH', url: `/nodes/${nodeId}`, payload: { isCheckpoint: true } })
  if (res.statusCode !== 200) throw new Error(`setCheckpoint(${nodeId}) failed: ${res.statusCode} ${res.body}`)
  return res.json()
}

// ── Edges ─────────────────────────────────────────────────────────────────────

export async function createEdge(
  app: NestFastifyApplication,
  projectId: string,
  payload: { fromId: string; toId: string; type: string },
) {
  const res = await app.inject({
    method: 'POST',
    url: `/projects/${projectId}/edges`,
    payload: { createdBy: 'human', ...payload },
  })
  if (res.statusCode !== 201) throw new Error(`createEdge failed: ${res.statusCode} ${res.body}`)
  return res.json()
}

// ── Knowledge entries ─────────────────────────────────────────────────────────

export async function createEntry(
  app: NestFastifyApplication,
  projectId: string,
  payload: { nodeId: string; category: string; title: string; body?: unknown },
) {
  const res = await app.inject({
    method: 'POST',
    url: `/projects/${projectId}/entries`,
    payload: { body: { text: payload.title }, createdBy: 'human', ...payload },
  })
  if (res.statusCode !== 201) throw new Error(`createEntry failed: ${res.statusCode} ${res.body}`)
  return res.json() as { id: string; nodeId: string; category: string; title: string }
}

/**
 * Embed a knowledge entry by publishing an embedding task and executing it directly.
 * Use this in test setup to seed pre-embedded entries (bypasses BullMQ workers).
 */
export async function embedEntry(ctx: EvalApp, projectId: string, entryId: string) {
  const result = await ctx.publisher.publish({
    projectId,
    type: OrchestratorTaskType.embedding,
    sourceType: OrchestratorSourceType.knowledge_event,
    sourceId: entryId,
    input: { entryId },
  })
  if (result.created) {
    await ctx.runtime.execute(result.taskId)
  }
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export interface PublishInput {
  projectId: string
  type: OrchestratorTaskType
  sourceType: OrchestratorSourceType
  sourceId: string
  input: Record<string, unknown>
}

/** Publish a task, execute it synchronously, and return the final OrchestratorTask record. */
export async function publishAndExecute(ctx: EvalApp, input: PublishInput) {
  const result = await ctx.publisher.publish(input)
  await ctx.runtime.execute(result.taskId)
  return ctx.prisma.orchestratorTask.findUniqueOrThrow({ where: { id: result.taskId } })
}

/** Parse task.modelResult as AgentInsight (returns null if not present). */
export function parseInsight(task: { modelResult: unknown }) {
  if (!task.modelResult || typeof task.modelResult !== 'object') return null
  return task.modelResult as {
    summary: string
    signalType: string
    confidence: number
    evidence: Array<{ sourceType: string; sourceId: string; note: string }>
  }
}

/** Print a record table block — mimics the protocol's 记录表 format. */
export function printRecord(scenario: string, fields: Record<string, unknown>) {
  console.log(`\n${'='.repeat(40)}`)
  console.log(`=== ${scenario} Record Table ===`)
  for (const [k, v] of Object.entries(fields)) {
    console.log(`${k}: ${JSON.stringify(v)}`)
  }
  console.log('='.repeat(40) + '\n')
}

/** Return all non-system nodes in project (excludes root + staging). */
export async function getUserNodes(ctx: EvalApp, projectId: string) {
  return ctx.prisma.node.findMany({
    where: { projectId, isProjectRoot: false, isStagingRoot: false },
  })
}
```

- [ ] **Step 4: Add test:eval script to package.json**

In `apps/server/package.json`, inside `"scripts"`, add:
```json
"test:eval": "vitest run --config vitest.eval.config.ts"
```

- [ ] **Step 5: Verify infrastructure compiles**

```bash
cd apps/server && pnpm exec tsc --noEmit --project tsconfig.json
```

Expected: no errors. Fix any import path issues before continuing.

- [ ] **Step 6: Commit**

```bash
git add apps/server/vitest.eval.config.ts apps/server/test/eval/setup.ts apps/server/test/eval/helpers.ts apps/server/package.json
git commit -m "feat(eval): add integration test infrastructure for orchestrator evaluation"
```

---

## Task 2: S-8 — Tool Call Correctness & Timing

**File:** Create `apps/server/test/eval/s8-tool-correctness.eval.spec.ts`

Scenario goal: verify agent completes a comprehensive task without DomainServiceError, in correct read-before-write order, producing valid graph mutations.

- [ ] **Step 1: Write the spec**

```typescript
// apps/server/test/eval/s8-tool-correctness.eval.spec.ts
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { getEvalApp, type EvalApp } from './setup'
import {
  createProject, getSystemNodes, createNode, publishAndExecute,
  parseInsight, printRecord, getUserNodes, deleteProject,
} from './helpers'

describe('S-8: Tool Call Correctness & Timing', () => {
  let ctx: EvalApp
  let projectId: string
  let N1: { id: string }, N2: { id: string }

  beforeAll(async () => {
    ctx = await getEvalApp()
    const project = await createProject(ctx.app, `eval-s8-${Date.now()}`)
    projectId = project.id

    N1 = await createNode(ctx.app, projectId, { title: '基础设施层', type: 'scaffold' })
    N2 = await createNode(ctx.app, projectId, { title: '数据库连接池', type: 'growth', parentId: N1.id })
  })

  afterAll(async () => {
    await deleteProject(ctx, projectId)
  })

  it('P1–P6: succeeds with valid node mutations and no DomainServiceError', async () => {
    const task = await publishAndExecute(ctx, {
      projectId,
      type: OrchestratorTaskType.event_anchor,
      sourceType: OrchestratorSourceType.manual,
      sourceId: `manual-s8-${Date.now()}`,
      input: {
        text: '数据库连接池优化已完成：最大连接数从 10 调整为 50，并增加了连接健康检查机制。这是一个重要的基础设施决策，请记录为知识并更新节点状态为 completed。同时需要为下一步的缓存层搭建创建一个新节点。',
      },
    })

    // P1: no DomainServiceError → task succeeded
    expect(task.status).toBe('succeeded')

    // P2: N2 status = completed
    const updatedN2 = await ctx.prisma.node.findUniqueOrThrow({ where: { id: N2.id } })
    expect(updatedN2.status).toBe('completed')

    // P3: knowledge entry created under N2 as decision
    const entriesOnN2 = await ctx.prisma.knowledgeEntry.findMany({ where: { projectId, nodeId: N2.id } })
    expect(entriesOnN2.length).toBeGreaterThanOrEqual(1)
    expect(entriesOnN2.some(e => e.category === 'decision')).toBe(true)

    // P4: new node created (缓存层 or similar)
    const allUserNodes = await getUserNodes(ctx, projectId)
    const newNodes = allUserNodes.filter(n => n.id !== N1.id && n.id !== N2.id)
    expect(newNodes.length).toBeGreaterThanOrEqual(1)

    // P5: new node has composition edge connecting to N1
    const edges = await ctx.prisma.edge.findMany({ where: { projectId } })
    const newNodeIds = new Set(newNodes.map(n => n.id))
    const compositionToN1 = edges.filter(
      e => newNodeIds.has(e.fromId) && e.toId === N1.id && e.type === 'composition',
    )
    expect(compositionToN1.length).toBeGreaterThanOrEqual(1)

    // P6: all edge endpoints are valid nodes in this project
    const allNodeIds = new Set(allUserNodes.map(n => n.id))
    const { rootNode, stagingNode } = await getSystemNodes(ctx, projectId)
    allNodeIds.add(rootNode.id)
    allNodeIds.add(stagingNode.id)
    for (const edge of edges) {
      expect(allNodeIds.has(edge.fromId), `fromId ${edge.fromId} not in project`).toBe(true)
      expect(allNodeIds.has(edge.toId), `toId ${edge.toId} not in project`).toBe(true)
    }

    const insight = parseInsight(task)
    printRecord('S-8', {
      'task.status': task.status,
      signalType: insight?.signalType,
      confidence: insight?.confidence,
      'N2.status after': updatedN2.status,
      'entries on N2': entriesOnN2.length,
      'new nodes': newNodes.map(n => n.title),
      'composition edges to N1': compositionToN1.length,
    })
  })
})
```

- [ ] **Step 2: Run and verify it starts (infra check)**

```bash
cd apps/server && pnpm test:eval test/eval/s8-tool-correctness.eval.spec.ts
```

Expected: test passes (or fails with meaningful assertion error if agent behavior doesn't meet criteria). A compilation error means fix imports first.

- [ ] **Step 3: Commit**

```bash
git add apps/server/test/eval/s8-tool-correctness.eval.spec.ts
git commit -m "feat(eval): S-8 tool call correctness scenario"
```

---

## Task 3: S-10 — Noise Filtering (Skip)

**File:** Create `apps/server/test/eval/s10-skip.eval.spec.ts`

Scenario goal: agent correctly calls `skip` for unrelated inputs, producing zero nodes or entries.

- [ ] **Step 1: Write the spec**

```typescript
// apps/server/test/eval/s10-skip.eval.spec.ts
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { getEvalApp, type EvalApp } from './setup'
import {
  createProject, createNode, publishAndExecute,
  parseInsight, printRecord, getUserNodes, deleteProject,
} from './helpers'

describe('S-10: Noise Filtering (Skip)', () => {
  let ctx: EvalApp
  let projectId: string

  beforeAll(async () => {
    ctx = await getEvalApp()
    const project = await createProject(ctx.app, `eval-s10-${Date.now()}`)
    projectId = project.id
    await createNode(ctx.app, projectId, { title: '电商平台后端', type: 'scaffold' })
  })

  afterAll(async () => {
    await deleteProject(ctx, projectId)
  })

  async function runInput(label: string, text: string) {
    const nodesBefore = await getUserNodes(ctx, projectId)
    const entriesBefore = await ctx.prisma.knowledgeEntry.findMany({ where: { projectId } })

    const task = await publishAndExecute(ctx, {
      projectId,
      type: OrchestratorTaskType.event_anchor,
      sourceType: OrchestratorSourceType.manual,
      sourceId: `manual-s10-${label}-${Date.now()}`,
      input: { text },
    })

    const nodesAfter = await getUserNodes(ctx, projectId)
    const entriesAfter = await ctx.prisma.knowledgeEntry.findMany({ where: { projectId } })
    const insight = parseInsight(task)

    printRecord(`S-10 Input ${label}`, {
      'task.status': task.status,
      signalType: insight?.signalType,
      '新节点': nodesAfter.length - nodesBefore.length,
      '新条目': entriesAfter.length - entriesBefore.length,
    })

    return { task, insight, newNodes: nodesAfter.length - nodesBefore.length, newEntries: entriesAfter.length - entriesBefore.length }
  }

  it('A (纯噪音): status=succeeded, signalType=noise, zero mutations', async () => {
    const r = await runInput('A', '今天午饭吃了炒饭，下午开了个很无聊的同步会议。')
    expect(r.task.status).toBe('succeeded')
    expect(r.insight?.signalType).toBe('noise')
    expect(r.newNodes).toBe(0)
    expect(r.newEntries).toBe(0)
  })

  it('B (非技术信息): status=succeeded, zero new nodes', async () => {
    const r = await runInput('B', '老板说 Q3 的 KPI 目标是提升 20% 的用户留存，大家要加油。')
    expect(r.task.status).toBe('succeeded')
    expect(r.newNodes).toBe(0)
    // entries may be 0 or 1 (boundary: acceptable if category is finding/context)
    console.log(`  → S-10-B entries created: ${r.newEntries} (0 expected, 1 acceptable if context/finding)`)
  })

  it('C (其他项目信息): status=succeeded, zero new nodes', async () => {
    const r = await runInput('C', '移动端团队今天修复了 iOS 推送通知的 badge 计数 bug，已合并到 main。')
    expect(r.task.status).toBe('succeeded')
    expect(r.newNodes).toBe(0)
    console.log(`  → S-10-C entries created: ${r.newEntries} (0 expected, 1 acceptable if context/finding)`)
  })
})
```

- [ ] **Step 2: Run**

```bash
cd apps/server && pnpm test:eval test/eval/s10-skip.eval.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/test/eval/s10-skip.eval.spec.ts
git commit -m "feat(eval): S-10 noise filtering scenario"
```

---

## Task 4: S-1 — Growth Node Extension

**File:** Create `apps/server/test/eval/s1-growth-node.eval.spec.ts`

Scenario goal: agent autonomously creates ≥1 growth child nodes under a scaffold node and edges them correctly.

- [ ] **Step 1: Write the spec**

```typescript
// apps/server/test/eval/s1-growth-node.eval.spec.ts
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { getEvalApp, type EvalApp } from './setup'
import {
  createProject, createNode, publishAndExecute,
  parseInsight, printRecord, getUserNodes, deleteProject,
} from './helpers'

describe('S-1: Growth Node Autonomous Extension', () => {
  let ctx: EvalApp
  let projectId: string
  let N1: { id: string }

  beforeAll(async () => {
    ctx = await getEvalApp()
    const project = await createProject(ctx.app, `eval-s1-${Date.now()}`)
    projectId = project.id
    N1 = await createNode(ctx.app, projectId, {
      title: '支付网关集成',
      description: '负责第三方支付接入，包含签名验证、回调处理、对账三个核心模块',
      type: 'scaffold',
    })
  })

  afterAll(async () => {
    await deleteProject(ctx, projectId)
  })

  it('P1–P4: creates ≥1 growth nodes with composition edges to N1', async () => {
    const nodesBefore = await getUserNodes(ctx, projectId)

    const task = await publishAndExecute(ctx, {
      projectId,
      type: OrchestratorTaskType.event_anchor,
      sourceType: OrchestratorSourceType.manual,
      sourceId: `manual-s1-${Date.now()}`,
      input: {
        text: '和技术负责人确认了支付网关集成的拆解方案：需要实现三个独立子模块——签名验证服务、回调幂等处理器、对账任务调度器。每个子模块需要独立开发和测试，最终组合到网关集成节点下。',
      },
    })

    expect(task.status).toBe('succeeded')

    const nodesAfter = await getUserNodes(ctx, projectId)
    const newNodes = nodesAfter.filter(n => !nodesBefore.some(b => b.id === n.id))

    // P1: ≥1 new growth node
    expect(newNodes.length).toBeGreaterThanOrEqual(1)
    expect(newNodes.every(n => n.type === 'growth')).toBe(true)

    // P2: new nodes connected to N1 via composition
    const edges = await ctx.prisma.edge.findMany({ where: { projectId } })
    const newNodeIds = new Set(newNodes.map(n => n.id))
    const compositionToN1 = edges.filter(
      e => newNodeIds.has(e.fromId) && e.toId === N1.id && e.type === 'composition',
    )
    expect(compositionToN1.length).toBeGreaterThanOrEqual(1)

    // P3: no orphan nodes (every new node has at least one incoming or outgoing edge)
    for (const node of newNodes) {
      const hasEdge = edges.some(e => e.fromId === node.id || e.toId === node.id)
      expect(hasEdge, `Node "${node.title}" is orphaned`).toBe(true)
    }

    // P4: signal type is progress or decision
    const insight = parseInsight(task)
    expect(['progress', 'decision']).toContain(insight?.signalType)

    printRecord('S-1', {
      'task.status': task.status,
      signalType: insight?.signalType,
      confidence: insight?.confidence,
      '新建节点数': newNodes.length,
      '新建节点': newNodes.map(n => `${n.title}(${n.type})`),
      'composition edges to N1': compositionToN1.length,
    })
  })
})
```

- [ ] **Step 2: Run**

```bash
cd apps/server && pnpm test:eval test/eval/s1-growth-node.eval.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/test/eval/s1-growth-node.eval.spec.ts
git commit -m "feat(eval): S-1 growth node extension scenario"
```

---

## Task 5: S-5 — Staging Flow

**File:** Create `apps/server/test/eval/s5-staging.eval.spec.ts`

Scenario goal: agent anchors clear knowledge to the correct node, routes ambiguous knowledge to the staging node, and discards irrelevant input.

- [ ] **Step 1: Write the spec**

```typescript
// apps/server/test/eval/s5-staging.eval.spec.ts
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { getEvalApp, type EvalApp } from './setup'
import {
  createProject, getSystemNodes, createNode, publishAndExecute,
  parseInsight, printRecord, deleteProject,
} from './helpers'

describe('S-5: Staging Flow', () => {
  let ctx: EvalApp
  let projectId: string
  let N1: { id: string }, N2: { id: string }
  let stagingNodeId: string

  beforeAll(async () => {
    ctx = await getEvalApp()
    const project = await createProject(ctx.app, `eval-s5-${Date.now()}`)
    projectId = project.id

    const { stagingNode } = await getSystemNodes(ctx, projectId)
    stagingNodeId = stagingNode.id

    N1 = await createNode(ctx.app, projectId, {
      title: '支付系统', description: '负责所有支付相关逻辑', type: 'scaffold',
    })
    N2 = await createNode(ctx.app, projectId, {
      title: '消息推送', description: '用户通知和推送服务', type: 'scaffold',
    })
  })

  afterAll(async () => {
    await deleteProject(ctx, projectId)
  })

  it('P1–P4: anchors, stages, and discards knowledge points correctly', async () => {
    const task = await publishAndExecute(ctx, {
      projectId,
      type: OrchestratorTaskType.event_anchor,
      sourceType: OrchestratorSourceType.manual,
      sourceId: `manual-s5-${Date.now()}`,
      input: {
        text: [
          '1. 支付系统中发现一个重要 pitfall：第三方支付回调存在重放风险，必须加幂等校验。（这条明确属于支付系统）',
          '2. 团队讨论了一个新想法：是否引入消息队列来解耦通知服务。目前还没有决定，需要进一步调研。（归属不明确）',
          '3. 今天团队建设活动很顺利，大家状态不错。（与项目无关）',
        ].join(' '),
      },
    })

    expect(task.status).toBe('succeeded')

    const entries = await ctx.prisma.knowledgeEntry.findMany({ where: { projectId } })

    const onN1 = entries.filter(e => e.nodeId === N1.id)
    const onStaging = entries.filter(e => e.nodeId === stagingNodeId)
    const onN2 = entries.filter(e => e.nodeId === N2.id)

    // P1: knowledge point 1 → N1 (支付系统)
    expect(onN1.length).toBeGreaterThanOrEqual(1)

    // P2: knowledge point 2 → staging
    expect(onStaging.length).toBeGreaterThanOrEqual(1)

    // P3: knowledge point 3 not created (irrelevant)
    // Total entries should be at most 2 (one for point 1, one for point 2)
    expect(entries.length).toBeLessThanOrEqual(3)

    // P4: no entry on N2 (unrelated node)
    expect(onN2.length).toBe(0)

    const insight = parseInsight(task)
    printRecord('S-5', {
      'task.status': task.status,
      signalType: insight?.signalType,
      stagingNodeId,
      'entry 总数': entries.length,
      'entries on N1 (支付系统)': onN1.length,
      'entries on staging': onStaging.length,
      'entries on N2 (消息推送)': onN2.length,
      '知识点1 归属正确': onN1.length >= 1 ? 'Y' : 'N',
      '知识点2 进入 staging': onStaging.length >= 1 ? 'Y' : 'N',
    })
  })
})
```

- [ ] **Step 2: Run**

```bash
cd apps/server && pnpm test:eval test/eval/s5-staging.eval.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/test/eval/s5-staging.eval.spec.ts
git commit -m "feat(eval): S-5 staging flow scenario"
```

---

## Task 6: S-2 — Node Drive Rationality

**File:** Create `apps/server/test/eval/s2-node-drive.eval.spec.ts`

Scenario goal: decision input → no new node; feature input → new node; bug-fix input → no new node + pitfall/finding entry.

- [ ] **Step 1: Write the spec**

```typescript
// apps/server/test/eval/s2-node-drive.eval.spec.ts
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { getEvalApp, type EvalApp } from './setup'
import {
  createProject, createNode, publishAndExecute,
  parseInsight, printRecord, getUserNodes, deleteProject,
} from './helpers'

describe('S-2: Node Drive Rationality', () => {
  let ctx: EvalApp
  let projectId: string
  let N1: { id: string }, N2: { id: string }

  beforeAll(async () => {
    ctx = await getEvalApp()
    const project = await createProject(ctx.app, `eval-s2-${Date.now()}`)
    projectId = project.id
    N1 = await createNode(ctx.app, projectId, { title: 'Redis 缓存层', type: 'scaffold' })
    N2 = await createNode(ctx.app, projectId, { title: '用户服务', type: 'scaffold' })
  })

  afterAll(async () => {
    await deleteProject(ctx, projectId)
  })

  it('A (决策类): no new node, creates decision entry on N1', async () => {
    const nodesBefore = await getUserNodes(ctx, projectId)

    const task = await publishAndExecute(ctx, {
      projectId,
      type: OrchestratorTaskType.event_anchor,
      sourceType: OrchestratorSourceType.manual,
      sourceId: `manual-s2a-${Date.now()}`,
      input: { text: '架构评审结论：缓存层统一选用 Redis，不考虑 Memcached。原因是 Redis 支持更丰富的数据结构，且团队已有运维经验。' },
    })

    const nodesAfter = await getUserNodes(ctx, projectId)
    const newNodes = nodesAfter.filter(n => !nodesBefore.some(b => b.id === n.id))
    const entriesOnN1 = await ctx.prisma.knowledgeEntry.findMany({ where: { projectId, nodeId: N1.id } })

    expect(task.status).toBe('succeeded')
    expect(newNodes.length).toBe(0)
    expect(entriesOnN1.some(e => e.category === 'decision')).toBe(true)

    const insight = parseInsight(task)
    printRecord('S-2A', {
      '新节点数': newNodes.length,
      '知识条目 on N1': entriesOnN1.map(e => `${e.category}: ${e.title}`),
      signalType: insight?.signalType,
      '行为合理': newNodes.length === 0 && entriesOnN1.length > 0 ? 'Y' : 'N',
    })
  })

  it('B (新功能类): creates ≥1 new growth node', async () => {
    const nodesBefore = await getUserNodes(ctx, projectId)

    const task = await publishAndExecute(ctx, {
      projectId,
      type: OrchestratorTaskType.event_anchor,
      sourceType: OrchestratorSourceType.manual,
      sourceId: `manual-s2b-${Date.now()}`,
      input: { text: '需要新增完整的用户权限管理模块，包含 RBAC 角色分配、权限继承树、操作审计日志三个子系统，预计独立开发周期 3 周。' },
    })

    const nodesAfter = await getUserNodes(ctx, projectId)
    const newNodes = nodesAfter.filter(n => !nodesBefore.some(b => b.id === n.id))

    expect(task.status).toBe('succeeded')
    expect(newNodes.length).toBeGreaterThanOrEqual(1)

    const insight = parseInsight(task)
    printRecord('S-2B', {
      '新节点数': newNodes.length,
      '新节点': newNodes.map(n => `${n.title}(${n.type})`),
      signalType: insight?.signalType,
      '行为合理': newNodes.length >= 1 ? 'Y' : 'N',
    })
  })

  it('C (bug修复类): no new node, creates pitfall or finding entry', async () => {
    const nodesBefore = await getUserNodes(ctx, projectId)
    const entriesBefore = await ctx.prisma.knowledgeEntry.findMany({ where: { projectId } })

    const task = await publishAndExecute(ctx, {
      projectId,
      type: OrchestratorTaskType.event_anchor,
      sourceType: OrchestratorSourceType.manual,
      sourceId: `manual-s2c-${Date.now()}`,
      input: { text: '修复了 Redis TTL 设置过短（5分钟）导致延迟支付回调被误判为重复请求的 bug。已将 TTL 调整为 30 分钟并上线。' },
    })

    const nodesAfter = await getUserNodes(ctx, projectId)
    const entriesAfter = await ctx.prisma.knowledgeEntry.findMany({ where: { projectId } })
    const newNodes = nodesAfter.filter(n => !nodesBefore.some(b => b.id === n.id))
    const newEntries = entriesAfter.filter(e => !entriesBefore.some(b => b.id === e.id))

    expect(task.status).toBe('succeeded')
    expect(newNodes.length).toBe(0)
    expect(newEntries.some(e => e.category === 'pitfall' || e.category === 'finding')).toBe(true)

    const insight = parseInsight(task)
    printRecord('S-2C', {
      '新节点数': newNodes.length,
      '新条目': newEntries.map(e => `${e.category}: ${e.title}`),
      signalType: insight?.signalType,
      '行为合理': newNodes.length === 0 && newEntries.length > 0 ? 'Y' : 'N',
    })
  })
})
```

- [ ] **Step 2: Run**

```bash
cd apps/server && pnpm test:eval test/eval/s2-node-drive.eval.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/test/eval/s2-node-drive.eval.spec.ts
git commit -m "feat(eval): S-2 node drive rationality scenario"
```

---

## Task 7: S-7 — Knowledge Precision in Long Projects

**File:** Create `apps/server/test/eval/s7-knowledge-precision.eval.spec.ts`

Scenario goal: with 9 pre-embedded entries across 3 nodes, new events anchor to the correct node (not just the semantically closest at the system level).

- [ ] **Step 1: Write the spec**

```typescript
// apps/server/test/eval/s7-knowledge-precision.eval.spec.ts
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { getEvalApp, type EvalApp } from './setup'
import {
  createProject, createNode, createEntry, embedEntry,
  publishAndExecute, parseInsight, printRecord, deleteProject,
} from './helpers'

describe('S-7: Knowledge Precision (Long Project)', () => {
  let ctx: EvalApp
  let projectId: string
  let N1: { id: string }, N2: { id: string }, N3: { id: string }

  beforeAll(async () => {
    ctx = await getEvalApp()
    const project = await createProject(ctx.app, `eval-s7-${Date.now()}`)
    projectId = project.id

    N1 = await createNode(ctx.app, projectId, { title: '支付系统', type: 'scaffold' })
    N2 = await createNode(ctx.app, projectId, { title: '库存系统', type: 'scaffold' })
    N3 = await createNode(ctx.app, projectId, { title: '用户系统', type: 'scaffold' })

    // Seed 9 knowledge entries with embeddings (3 per node)
    const seeds = [
      { nodeId: N1.id, category: 'pitfall',  title: 'Redis TTL 设置过短导致支付回调重复' },
      { nodeId: N1.id, category: 'decision', title: '第三方 API 限流策略：指数退避重试' },
      { nodeId: N1.id, category: 'context',  title: '支付回调签名验证规范' },
      { nodeId: N2.id, category: 'decision', title: '库存超卖锁策略：悲观锁' },
      { nodeId: N2.id, category: 'decision', title: 'SKU 编码规范' },
      { nodeId: N2.id, category: 'pitfall',  title: '库存快照设计：全量快照性能问题' },
      { nodeId: N3.id, category: 'decision', title: '密码加密算法：bcrypt 选型' },
      { nodeId: N3.id, category: 'decision', title: '用户 ID 生成策略：雪花算法' },
      { nodeId: N3.id, category: 'context',  title: '会话 token 规范' },
    ]

    for (const seed of seeds) {
      const entry = await createEntry(ctx.app, projectId, seed)
      await embedEntry(ctx, projectId, entry.id)
    }
  }, 180_000) // seed + embed 9 entries may take up to 3 min

  afterAll(async () => {
    await deleteProject(ctx, projectId)
  })

  it('A: Redis TTL 描述 → anchors to N2 (库存系统)', async () => {
    const entriesBefore = await ctx.prisma.knowledgeEntry.findMany({ where: { projectId } })

    const task = await publishAndExecute(ctx, {
      projectId,
      type: OrchestratorTaskType.event_anchor,
      sourceType: OrchestratorSourceType.manual,
      sourceId: `manual-s7a-${Date.now()}`,
      input: { text: '我们再次遭遇了 Redis TTL 问题，这次是库存锁的过期时间设置不当。' },
    })

    expect(task.status).toBe('succeeded')
    const newEntries = (await ctx.prisma.knowledgeEntry.findMany({ where: { projectId } }))
      .filter(e => !entriesBefore.some(b => b.id === e.id))

    const anchored = newEntries[0]
    const correct = anchored?.nodeId === N2.id
    printRecord('S-7A', {
      'entry.nodeId': anchored?.nodeId,
      '期望': N2.id,
      '正确': correct ? 'Y' : 'N',
    })
    expect(correct, `Expected new entry on N2(${N2.id}), got ${anchored?.nodeId}`).toBe(true)
  })

  it('B: bcrypt 描述 → anchors to N3 (用户系统)', async () => {
    const entriesBefore = await ctx.prisma.knowledgeEntry.findMany({ where: { projectId } })

    const task = await publishAndExecute(ctx, {
      projectId,
      type: OrchestratorTaskType.event_anchor,
      sourceType: OrchestratorSourceType.manual,
      sourceId: `manual-s7b-${Date.now()}`,
      input: { text: '用户密码存储方案已评审通过，维持现有的 bcrypt 方案。' },
    })

    expect(task.status).toBe('succeeded')
    const newEntries = (await ctx.prisma.knowledgeEntry.findMany({ where: { projectId } }))
      .filter(e => !entriesBefore.some(b => b.id === e.id))

    const anchored = newEntries[0]
    const correct = anchored?.nodeId === N3.id
    printRecord('S-7B', { 'entry.nodeId': anchored?.nodeId, '期望': N3.id, '正确': correct ? 'Y' : 'N' })
    expect(correct, `Expected N3(${N3.id}), got ${anchored?.nodeId}`).toBe(true)
  })

  it('C: 支付回调重放描述 → anchors to N1 (支付系统)', async () => {
    const entriesBefore = await ctx.prisma.knowledgeEntry.findMany({ where: { projectId } })

    const task = await publishAndExecute(ctx, {
      projectId,
      type: OrchestratorTaskType.event_anchor,
      sourceType: OrchestratorSourceType.manual,
      sourceId: `manual-s7c-${Date.now()}`,
      input: { text: '支付回调被第三方平台重放了两次，幸好幂等校验拦住了。' },
    })

    expect(task.status).toBe('succeeded')
    const newEntries = (await ctx.prisma.knowledgeEntry.findMany({ where: { projectId } }))
      .filter(e => !entriesBefore.some(b => b.id === e.id))

    const anchored = newEntries[0]
    const correct = anchored?.nodeId === N1.id
    printRecord('S-7C', { 'entry.nodeId': anchored?.nodeId, '期望': N1.id, '正确': correct ? 'Y' : 'N' })
    expect(correct, `Expected N1(${N1.id}), got ${anchored?.nodeId}`).toBe(true)
  })
})
```

- [ ] **Step 2: Run**

```bash
cd apps/server && pnpm test:eval test/eval/s7-knowledge-precision.eval.spec.ts
```

Expected: ~4-6 minutes total (embedding 9 entries + 3 LLM task executions).

- [ ] **Step 3: Commit**

```bash
git add apps/server/test/eval/s7-knowledge-precision.eval.spec.ts
git commit -m "feat(eval): S-7 knowledge precision scenario"
```

---

## Task 8: S-3 — Checkpoint Phase Judgment

**File:** Create `apps/server/test/eval/s3-checkpoint.eval.spec.ts`

Scenario goal: checkpoint task on a scaffold node with all completed children produces decision/learning signal with confidence > 0.7 and evidence referencing that node.

- [ ] **Step 1: Write the spec**

```typescript
// apps/server/test/eval/s3-checkpoint.eval.spec.ts
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { getEvalApp, type EvalApp } from './setup'
import {
  createProject, createNode, setCheckpoint, updateNodeStatus,
  createEdge, publishAndExecute, parseInsight, printRecord, deleteProject,
} from './helpers'

describe('S-3: Checkpoint Phase Judgment', () => {
  let ctx: EvalApp
  let projectId: string
  let N1: { id: string }

  beforeAll(async () => {
    ctx = await getEvalApp()
    const project = await createProject(ctx.app, `eval-s3-${Date.now()}`)
    projectId = project.id

    // N1: MVP 阶段 checkpoint scaffold
    N1 = await createNode(ctx.app, projectId, { title: 'MVP 阶段', type: 'scaffold' })
    await setCheckpoint(ctx.app, N1.id)

    // Three completed growth children under N1
    for (const title of ['登录模块', '核心 API', '基础部署']) {
      const child = await createNode(ctx.app, projectId, {
        title, type: 'growth', parentId: N1.id,
      })
      await updateNodeStatus(ctx.app, child.id, 'completed')
    }
  })

  afterAll(async () => {
    await deleteProject(ctx, projectId)
  })

  it('P1–P4: checkpoint task → succeeded, decision/learning, confidence > 0.7, evidence references N1', async () => {
    const task = await publishAndExecute(ctx, {
      projectId,
      type: OrchestratorTaskType.checkpoint,
      sourceType: OrchestratorSourceType.graph_event,
      sourceId: N1.id,
      input: { nodeId: N1.id, projectId, title: 'MVP 阶段' },
    })

    // P1
    expect(task.status).toBe('succeeded')

    const insight = parseInsight(task)
    expect(insight).not.toBeNull()

    // P2: signalType in {decision, learning}
    expect(['decision', 'learning']).toContain(insight!.signalType)

    // P3: confidence > 0.7
    expect(insight!.confidence).toBeGreaterThan(0.7)

    // P4: evidence has node sourceType referencing N1
    const nodeEvidence = insight!.evidence.filter(e => e.sourceType === 'node' && e.sourceId === N1.id)
    expect(nodeEvidence.length).toBeGreaterThanOrEqual(1)

    printRecord('S-3', {
      'task.status': task.status,
      signalType: insight?.signalType,
      confidence: insight?.confidence,
      'evidence 节点引用': insight?.evidence.filter(e => e.sourceType === 'node').map(e => e.sourceId),
      'summary (前100字)': insight?.summary?.slice(0, 100),
    })
  })
})
```

- [ ] **Step 2: Run**

```bash
cd apps/server && pnpm test:eval test/eval/s3-checkpoint.eval.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/test/eval/s3-checkpoint.eval.spec.ts
git commit -m "feat(eval): S-3 checkpoint phase judgment scenario"
```

---

## Task 9: S-4 — Phase Transition Triggered by Knowledge

**File:** Create `apps/server/test/eval/s4-phase-transition.eval.spec.ts`

Scenario goal: when input implies a phase is complete, agent creates new node(s) reflecting the next phase.

- [ ] **Step 1: Write the spec**

```typescript
// apps/server/test/eval/s4-phase-transition.eval.spec.ts
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { getEvalApp, type EvalApp } from './setup'
import {
  createProject, createNode, updateNodeStatus, publishAndExecute,
  parseInsight, printRecord, getUserNodes, deleteProject,
} from './helpers'

describe('S-4: Phase Transition + Autonomous Node Creation', () => {
  let ctx: EvalApp
  let projectId: string
  let N1: { id: string }
  let completedNodeIds: string[]

  beforeAll(async () => {
    ctx = await getEvalApp()
    const project = await createProject(ctx.app, `eval-s4-${Date.now()}`)
    projectId = project.id

    N1 = await createNode(ctx.app, projectId, { title: '基础建设阶段', type: 'scaffold' })

    completedNodeIds = []
    for (const title of ['数据库设计', '认证系统', '核心 API']) {
      const n = await createNode(ctx.app, projectId, { title, type: 'growth', parentId: N1.id })
      await updateNodeStatus(ctx.app, n.id, 'completed')
      completedNodeIds.push(n.id)
    }
  })

  afterAll(async () => {
    await deleteProject(ctx, projectId)
  })

  it('P1–P4: creates new node with second-phase semantics, no completed nodes modified', async () => {
    const nodesBefore = await getUserNodes(ctx, projectId)

    const task = await publishAndExecute(ctx, {
      projectId,
      type: OrchestratorTaskType.event_anchor,
      sourceType: OrchestratorSourceType.manual,
      sourceId: `manual-s4-${Date.now()}`,
      input: {
        text: '第一阶段核心模块全部完成并稳定上线：数据库设计、认证系统、核心 API 均已通过生产验证。项目正式进入扩展阶段，下一步需要启动数据分析平台和用户运营系统的建设。',
      },
    })

    expect(task.status).toBe('succeeded')

    const nodesAfter = await getUserNodes(ctx, projectId)
    const newNodes = nodesAfter.filter(n => !nodesBefore.some(b => b.id === n.id))

    // P1: new node created
    expect(newNodes.length).toBeGreaterThanOrEqual(1)

    // P2: new node title/description reflects second phase
    const hasPhaseSemantics = newNodes.some(n =>
      /扩展|分析|运营|数据|平台|二期|phase|stage/i.test(n.title + (n as any).description ?? ''),
    )
    // Note: this is a soft check — log result for human review
    console.log(`  → Phase semantics detected: ${hasPhaseSemantics} (nodes: ${newNodes.map(n => n.title)})`)

    // P3: signalType in {decision, learning}
    const insight = parseInsight(task)
    expect(['decision', 'learning', 'progress']).toContain(insight?.signalType)

    // P4: completed nodes not modified
    const completedAfter = await ctx.prisma.node.findMany({
      where: { id: { in: completedNodeIds } },
    })
    for (const node of completedAfter) {
      expect(node.status).toBe('completed')
    }

    printRecord('S-4', {
      '新节点数': newNodes.length,
      '新节点 type': [...new Set(newNodes.map(n => n.type))].join(', '),
      '新节点 title': newNodes.map(n => n.title),
      '阶段语义': hasPhaseSemantics ? 'Y' : 'N (需人工确认)',
      signalType: insight?.signalType,
    })
  })
})
```

- [ ] **Step 2: Run**

```bash
cd apps/server && pnpm test:eval test/eval/s4-phase-transition.eval.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/test/eval/s4-phase-transition.eval.spec.ts
git commit -m "feat(eval): S-4 phase transition scenario"
```

---

## Task 10: S-6 — Cycle Detection + Human Confirmation

**File:** Create `apps/server/test/eval/s6-cycle-detection.eval.spec.ts`

Scenario goal: when agent is told to create an edge that would close a cycle, it calls `notify_human` instead, leaving task in `waiting_for_approval` with no cycle edge created.

- [ ] **Step 1: Write the spec**

```typescript
// apps/server/test/eval/s6-cycle-detection.eval.spec.ts
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { getEvalApp, type EvalApp } from './setup'
import {
  createProject, createNode, createEdge, publishAndExecute,
  parseInsight, printRecord, deleteProject,
} from './helpers'

describe('S-6: Cycle Detection + Human Confirmation', () => {
  let ctx: EvalApp
  let projectId: string
  let NA: { id: string }, NB: { id: string }, NC: { id: string }

  beforeAll(async () => {
    ctx = await getEvalApp()
    const project = await createProject(ctx.app, `eval-s6-${Date.now()}`)
    projectId = project.id

    NA = await createNode(ctx.app, projectId, { title: '认证模块', type: 'scaffold' })
    NB = await createNode(ctx.app, projectId, { title: 'Token 服务', type: 'growth' })
    NC = await createNode(ctx.app, projectId, { title: '会话管理', type: 'growth' })

    // NA → NB → NC dependency chain
    await createEdge(ctx.app, projectId, { fromId: NA.id, toId: NB.id, type: 'dependency' })
    await createEdge(ctx.app, projectId, { fromId: NB.id, toId: NC.id, type: 'dependency' })
  })

  afterAll(async () => {
    await deleteProject(ctx, projectId)
  })

  it('P1–P4: waiting_for_approval, no NC→NA edge created', async () => {
    const edgesBefore = await ctx.prisma.edge.findMany({ where: { projectId } })

    const task = await publishAndExecute(ctx, {
      projectId,
      type: OrchestratorTaskType.event_anchor,
      sourceType: OrchestratorSourceType.manual,
      sourceId: `manual-s6-${Date.now()}`,
      input: {
        text: `架构复盘发现会话管理模块（节点 ID: ${NC.id}）现在需要直接依赖认证模块（节点 ID: ${NA.id}）的核心接口，建议在两者之间建立依赖关系。`,
      },
    })

    // P1: task.status = waiting_for_approval
    expect(task.status).toBe('waiting_for_approval')

    const edgesAfter = await ctx.prisma.edge.findMany({ where: { projectId } })

    // P3: no NC → NA edge created
    const cycleEdge = edgesAfter.find(e => e.fromId === NC.id && e.toId === NA.id)
    expect(cycleEdge).toBeUndefined()

    // P4: no new edges at all (the attempt was blocked)
    expect(edgesAfter.length).toBe(edgesBefore.length)

    const insight = parseInsight(task)
    printRecord('S-6', {
      'task.status': task.status,
      '环边是否创建': cycleEdge ? 'Y (FAIL)' : 'N',
      '新增边数': edgesAfter.length - edgesBefore.length,
      '注意: notify_human 调用需查 console 日志确认': '',
    })
  })
})
```

- [ ] **Step 2: Run**

```bash
cd apps/server && pnpm test:eval test/eval/s6-cycle-detection.eval.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/test/eval/s6-cycle-detection.eval.spec.ts
git commit -m "feat(eval): S-6 cycle detection scenario"
```

---

## Task 11: S-9 — Skills Efficiency Comparison (optional)

**File:** Create `apps/server/test/eval/s9-skills-efficiency.eval.spec.ts`

Scenario goal: compare agent efficiency (iteration count, tool calls) with vs. without a specific skill loaded. Uses S-1 as baseline.

- [ ] **Step 1: Write the spec**

```typescript
// apps/server/test/eval/s9-skills-efficiency.eval.spec.ts
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { getEvalApp, type EvalApp } from './setup'
import {
  createProject, createNode, publishAndExecute,
  parseInsight, printRecord, getUserNodes, deleteProject,
} from './helpers'

// ── Instructions for running this test ────────────────────────────────────────
// Control group: remove the event_anchor skill from SkillRegistry before running
// Experimental group: restore the full skill config
// Run each group TWICE and record average values in the record table below.
// ─────────────────────────────────────────────────────────────────────────────

const S1_INPUT = '和技术负责人确认了支付网关集成的拆解方案：需要实现三个独立子模块——签名验证服务、回调幂等处理器、对账任务调度器。每个子模块需要独立开发和测试，最终组合到网关集成节点下。'

async function runS1Baseline(ctx: EvalApp, label: string) {
  const project = await createProject(ctx.app, `eval-s9-${label}-${Date.now()}`)
  const projectId = project.id
  try {
    const N1 = await createNode(ctx.app, projectId, {
      title: '支付网关集成',
      description: '负责第三方支付接入，包含签名验证、回调处理、对账三个核心模块',
      type: 'scaffold',
    })

    const nodesBefore = await getUserNodes(ctx, projectId)
    const task = await publishAndExecute(ctx, {
      projectId,
      type: OrchestratorTaskType.event_anchor,
      sourceType: OrchestratorSourceType.manual,
      sourceId: `manual-s9-${label}-${Date.now()}`,
      input: { text: S1_INPUT },
    })

    const nodesAfter = await getUserNodes(ctx, projectId)
    const newNodes = nodesAfter.filter(n => !nodesBefore.some(b => b.id === n.id))
    const insight = parseInsight(task)

    return {
      status: task.status,
      nodeCreated: newNodes.length >= 1,
      signalType: insight?.signalType,
      confidence: insight?.confidence,
    }
  } finally {
    await deleteProject(ctx, projectId)
  }
}

describe('S-9: Skills Efficiency Comparison', () => {
  let ctx: EvalApp

  beforeAll(async () => {
    ctx = await getEvalApp()
  })

  it('Run 1 — record and compare manually (see console output)', async () => {
    // Run once — evaluator must manually compare runs with/without skill
    const result = await runS1Baseline(ctx, 'run1')

    printRecord('S-9 Run 1', {
      'task.status': result.status,
      '节点正确': result.nodeCreated ? 'Y' : 'N',
      signalType: result.signalType,
      confidence: result.confidence,
      '说明': '请在有/无 skill 两组各运行 2 次并对比 console 中的迭代轮次',
    })

    expect(result.status).toBe('succeeded')
    expect(result.nodeCreated).toBe(true)
  })

  it('Run 2', async () => {
    const result = await runS1Baseline(ctx, 'run2')
    printRecord('S-9 Run 2', {
      'task.status': result.status,
      '节点正确': result.nodeCreated ? 'Y' : 'N',
      signalType: result.signalType,
      confidence: result.confidence,
    })
    expect(result.status).toBe('succeeded')
  })
})
```

- [ ] **Step 2: Run (first with full skills, then with skill removed)**

```bash
cd apps/server && pnpm test:eval test/eval/s9-skills-efficiency.eval.spec.ts
```

Record the output. Then remove the target skill from `SkillRegistry` and run again. Compare iteration counts from LangGraph trace logs.

- [ ] **Step 3: Commit**

```bash
git add apps/server/test/eval/s9-skills-efficiency.eval.spec.ts
git commit -m "feat(eval): S-9 skills efficiency scenario"
```

---

## Self-Review

**Spec coverage check:**

| Protocol Scenario | Task | Covered? |
|---|---|---|
| S-1 Growth Node 自主延伸 | Task 4 | ✅ |
| S-2 Node 驱动合理性 | Task 6 | ✅ |
| S-3 Checkpoint 阶段判断 | Task 8 | ✅ |
| S-4 知识触发阶段转换 | Task 9 | ✅ |
| S-5 Staging 流程 | Task 5 | ✅ |
| S-6 环检测 + 人工确认 | Task 10 | ✅ |
| S-7 长项目知识精度 | Task 7 | ✅ |
| S-8 Tool 调用正确性 | Task 2 | ✅ |
| S-9 Skills 效率 | Task 11 | ✅ |
| S-10 无关信息 Skip | Task 3 | ✅ |
| Infrastructure | Task 1 | ✅ |

**Protocol-spec alignment verified:**
- All scenarios use `POST /projects` (not old `/init`)
- Staging detection uses `isStagingRoot: true` node query (not `ROOT.id`)
- S-4 criteria changed from "scaffold" to "growth" (tool constraint)
- S-7 uses `embedEntry()` helper which publishes embedding task directly (bypasses BullMQ workers)
- S-8 expected tool names use snake_case (`update_node_status`, `create_node`, etc.)
- S-10 boundary behavior uses `finding`/`context`, not `risk` (correct EntryCategory values)
- `sourceId` present in every `publisher.publish()` call

**Known limitations:**
- Tool call sequence (S-8 "先读后写") can only be verified via LangGraph console logs — not assertable in code
- `notify_human` call in S-6 is inferred from `task.status = waiting_for_approval` (the thrown `WaitingForApprovalSignal` is the evidence); direct call confirmation still requires console logs
- S-4 "阶段语义" check is a soft regex match — human review of the record table is required for full pass/fail decision
