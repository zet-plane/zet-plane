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
