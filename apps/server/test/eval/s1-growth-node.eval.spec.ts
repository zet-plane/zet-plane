import { describe, it, beforeAll, expect } from 'vitest'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { getEvalApp, type EvalApp } from './setup'
import {
  createProject, createNode, publishAndExecute,
  parseInsight, printRecord, getUserNodes, deleteProject, withEvalTrace,
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

  // afterAll(async () => {
  //   if (!ctx || !projectId) return
  //   await deleteProject(ctx, projectId)
  // })

  it('P1–P4: creates ≥1 growth nodes with composition edges to N1', async () => {
    const nodesBefore = await getUserNodes(ctx, projectId)

    const task = await publishAndExecute(ctx, {
      projectId,
      type: OrchestratorTaskType.event_anchor,
      sourceType: OrchestratorSourceType.manual,
      sourceId: `manual-s1-${Date.now()}`,
      input: withEvalTrace({
        text: '和技术负责人确认了支付网关集成的拆解方案：需要实现三个独立子模块——签名验证服务、回调幂等处理器、对账任务调度器。每个子模块需要独立开发和测试，最终组合到网关集成节点下。',
      }, {
        evalCase: 'S-1',
        testName: 'P1–P4: creates ≥1 growth nodes with composition edges to N1',
        specFile: 'test/eval/s1-growth-node.eval.spec.ts',
      }),
    })

    expect(task.status).toBe('succeeded')

    const nodesAfter = await getUserNodes(ctx, projectId)
    const newNodes = nodesAfter.filter(n => !nodesBefore.some(b => b.id === n.id))

    expect(newNodes.length).toBeGreaterThanOrEqual(1)
    expect(newNodes.every(n => n.type === 'growth')).toBe(true)

    const edges = await ctx.prisma.edge.findMany({ where: { projectId } })
    const newNodeIds = new Set(newNodes.map(n => n.id))
    const compositionToN1 = edges.filter(
      e => e.fromId === N1.id && newNodeIds.has(e.toId) && e.type === 'composition',
    )
    expect(compositionToN1.length).toBeGreaterThanOrEqual(1)

    for (const node of newNodes) {
      const hasEdge = edges.some(e => e.fromId === node.id || e.toId === node.id)
      expect(hasEdge, `Node "${node.title}" is orphaned`).toBe(true)
    }

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
