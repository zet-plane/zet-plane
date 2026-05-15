import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { getEvalApp, type EvalApp } from './setup'
import {
  createProject, createNode, createEdge, publishAndExecute,
  printRecord, deleteProject,
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

    expect(task.status).toBe('waiting_for_approval')

    const edgesAfter = await ctx.prisma.edge.findMany({ where: { projectId } })
    const cycleEdge = edgesAfter.find(e => e.fromId === NC.id && e.toId === NA.id)
    expect(cycleEdge).toBeUndefined()

    expect(edgesAfter.length).toBe(edgesBefore.length)

    printRecord('S-6', {
      'task.status': task.status,
      '环边是否创建': cycleEdge ? 'Y (FAIL)' : 'N',
      '新增边数': edgesAfter.length - edgesBefore.length,
      '注意: notify_human 调用需查 console 日志确认': '',
    })
  })
})
