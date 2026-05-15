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
  }, 180_000)

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
      input: { text: '用户密码存储方案已评审通过，维持现有的 bcrypt 方案。' },
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
      input: { text: '支付回调被第三方平台重放了两次，幸好幂等校验拦住了。' },
    })

    expect(task.status).toBe('succeeded')
    const newEntries = (await ctx.prisma.knowledgeEntry.findMany({ where: { projectId } }))
      .filter(e => !entriesBefore.some(b => b.id === e.id))

    const correct = newEntries.some(e => e.nodeId === N1.id)
    printRecord('S-7C', { 'new entry nodeIds': newEntries.map(e => e.nodeId), '期望': N1.id, '正确': correct ? 'Y' : 'N' })
    expect(correct, `Expected at least one new entry on N1(${N1.id})`).toBe(true)
  })
})
