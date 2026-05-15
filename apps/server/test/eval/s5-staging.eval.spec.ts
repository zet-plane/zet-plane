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

    expect(onN1.length).toBeGreaterThanOrEqual(1)
    expect(onStaging.length).toBeGreaterThanOrEqual(1)
    // knowledge point 3 (team building) is irrelevant and must be discarded — max 2 entries
    expect(entries.length).toBeLessThanOrEqual(2)
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
