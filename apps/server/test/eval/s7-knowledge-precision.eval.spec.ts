import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { getEvalApp, type EvalApp } from './setup'
import {
  createProject, createNode, createEntry,
  publishAndExecute, parseInsight, printRecord, deleteProject, withEvalTrace,
} from './helpers'

type SeedEntry = {
  nodeId: string
  category: string
  title: string
}

describe('S-7: Knowledge Precision (Long Project)', () => {
  let ctx: EvalApp
  let projectId: string
  let N1: { id: string }, N2: { id: string }, N3: { id: string }
  let embedSpy: ReturnType<typeof vi.spyOn> | null = null

  beforeAll(async () => {
    ctx = await getEvalApp()
    embedSpy = vi.spyOn(ctx.llm, 'embed').mockImplementation(async (text: string) => {
      return keywordEmbedding(text)
    })

    const project = await createProject(ctx.app, `eval-s7-${Date.now()}`)
    projectId = project.id

    N1 = await createNode(ctx.app, projectId, { title: '支付系统', type: 'scaffold' })
    N2 = await createNode(ctx.app, projectId, { title: '库存系统', type: 'scaffold' })
    N3 = await createNode(ctx.app, projectId, { title: '用户系统', type: 'scaffold' })

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

    await seedKnowledgeEntries(ctx, projectId, seeds)
  }, 180_000)

  afterAll(async () => {
    embedSpy?.mockRestore()
    await deleteProject(ctx, projectId)
  })

  it('A: Redis TTL 描述 → anchors to N2 (库存系统)', async () => {
    const entriesBefore = await ctx.prisma.knowledgeEntry.findMany({ where: { projectId } })

    const task = await publishAndExecute(ctx, {
      projectId,
      type: OrchestratorTaskType.event_anchor,
      sourceType: OrchestratorSourceType.manual,
      sourceId: `manual-s7a-${Date.now()}`,
      input: withEvalTrace({
        text: '我们再次遭遇了 Redis TTL 问题，这次是库存锁的过期时间设置不当。',
      }, {
        evalCase: 'S-7A',
        testName: 'A: Redis TTL 描述 → anchors to N2 (库存系统)',
        specFile: 'test/eval/s7-knowledge-precision.eval.spec.ts',
      }),
    })

    expect(task.status).toBe('succeeded')
    const newEntries = (await ctx.prisma.knowledgeEntry.findMany({ where: { projectId } }))
      .filter(e => !entriesBefore.some(b => b.id === e.id))

    const correct = newEntries.some(e => e.nodeId === N2.id)
    printRecord('S-7A', { 'new entry nodeIds': newEntries.map(e => e.nodeId), '期望': N2.id, '正确': correct ? 'Y' : 'N' })
    expect(correct, `Expected at least one new entry on N2(${N2.id})`).toBe(true)
  })

  it('B: bcrypt 描述 → anchors to N3 (用户系统)', async () => {
    const entriesBefore = await ctx.prisma.knowledgeEntry.findMany({ where: { projectId } })

    const task = await publishAndExecute(ctx, {
      projectId,
      type: OrchestratorTaskType.event_anchor,
      sourceType: OrchestratorSourceType.manual,
      sourceId: `manual-s7b-${Date.now()}`,
      input: withEvalTrace({
        text: '用户登录接口压测发现 bcrypt 验证在 8 核机器上并发 50 时 P99 延迟达到 600ms，需要评估 cost factor 是否需要降低。',
      }, {
        evalCase: 'S-7B',
        testName: 'B: bcrypt 描述 → anchors to N3 (用户系统)',
        specFile: 'test/eval/s7-knowledge-precision.eval.spec.ts',
      }),
    })

    expect(task.status).toBe('succeeded')
    const newEntries = (await ctx.prisma.knowledgeEntry.findMany({ where: { projectId } }))
      .filter(e => !entriesBefore.some(b => b.id === e.id))

    const correct = newEntries.some(e => e.nodeId === N3.id)
    printRecord('S-7B', { 'new entry nodeIds': newEntries.map(e => e.nodeId), '期望': N3.id, '正确': correct ? 'Y' : 'N' })
    expect(correct, `Expected at least one new entry on N3(${N3.id})`).toBe(true)
  })

  it('C: 支付回调重放描述 → anchors to N1 (支付系统)', async () => {
    const entriesBefore = await ctx.prisma.knowledgeEntry.findMany({ where: { projectId } })

    const task = await publishAndExecute(ctx, {
      projectId,
      type: OrchestratorTaskType.event_anchor,
      sourceType: OrchestratorSourceType.manual,
      sourceId: `manual-s7c-${Date.now()}`,
      input: withEvalTrace({
        text: '支付回调被第三方平台重放了两次，幸好幂等校验拦住了。',
      }, {
        evalCase: 'S-7C',
        testName: 'C: 支付回调重放描述 → anchors to N1 (支付系统)',
        specFile: 'test/eval/s7-knowledge-precision.eval.spec.ts',
      }),
    })

    expect(task.status).toBe('succeeded')
    const newEntries = (await ctx.prisma.knowledgeEntry.findMany({ where: { projectId } }))
      .filter(e => !entriesBefore.some(b => b.id === e.id))

    const correct = newEntries.some(e => e.nodeId === N1.id)
    printRecord('S-7C', { 'new entry nodeIds': newEntries.map(e => e.nodeId), '期望': N1.id, '正确': correct ? 'Y' : 'N' })
    expect(correct, `Expected at least one new entry on N1(${N1.id})`).toBe(true)
  })
})

async function seedKnowledgeEntries(ctx: EvalApp, projectId: string, seeds: SeedEntry[]) {
  for (const seed of seeds) {
    await createEmbeddedEntry(ctx, projectId, seed)
  }
}

async function createEmbeddedEntry(ctx: EvalApp, projectId: string, seed: SeedEntry) {
  const entry = await createEntry(ctx.app, projectId, seed)
  await ensureEntryEmbedded(ctx, projectId, entry.id)
  return entry
}

async function ensureEntryEmbedded(ctx: EvalApp, projectId: string, entryId: string) {
  const result = await ctx.publisher.publish({
    projectId,
    type: OrchestratorTaskType.embedding,
    sourceType: OrchestratorSourceType.knowledge_event,
    sourceId: entryId,
    input: { entryId },
  }, { enqueue: false })

  await ctx.runtime.execute(result.taskId)
}

function keywordEmbedding(text: string): number[] {
  const lower = text.toLowerCase()
  const signal = [
    score(lower, ['支付', '回调', '签名', '第三方', '幂等']),
    score(lower, ['库存', 'sku', '超卖', '库存锁', '快照']),
    score(lower, ['用户', '密码', 'bcrypt', 'token', '会话']),
    score(lower, ['redis', 'ttl']),
  ]

  return Array.from({ length: 1536 }, (_, index) => signal[index] ?? 0)
}

function score(text: string, keywords: string[]): number {
  return keywords.reduce((sum, keyword) => sum + (text.includes(keyword.toLowerCase()) ? 1 : 0), 0)
}
