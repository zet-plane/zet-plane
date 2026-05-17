import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { getEvalApp, type EvalApp } from './setup'
import {
  createProject, createNode, updateNodeStatus, publishAndExecute,
  parseInsight, printRecord, getUserNodes, deleteProject, withEvalTrace,
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
      input: withEvalTrace({
        text: '第一阶段核心模块全部完成并稳定上线：数据库设计、认证系统、核心 API 均已通过生产验证。项目正式进入扩展阶段，下一步需要启动数据分析平台和用户运营系统的建设。',
      }, {
        evalCase: 'S-4',
        testName: 'P1–P4: creates new node with second-phase semantics, no completed nodes modified',
        specFile: 'test/eval/s4-phase-transition.eval.spec.ts',
      }),
    })

    expect(task.status).toBe('succeeded')

    const nodesAfter = await getUserNodes(ctx, projectId)
    const newNodes = nodesAfter.filter(n => !nodesBefore.some(b => b.id === n.id))

    expect(newNodes.length).toBeGreaterThanOrEqual(1)

    const hasPhaseSemantics = newNodes.some(n =>
      /扩展|分析|运营|数据|平台|二期|phase|stage/i.test(n.title + ((n as any).description ?? '')),
    )
    console.log(`  → Phase semantics detected: ${hasPhaseSemantics} (nodes: ${newNodes.map(n => n.title)})`)

    const insight = parseInsight(task)
    expect(['decision', 'learning', 'progress']).toContain(insight?.signalType)

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
