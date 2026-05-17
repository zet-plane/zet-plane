import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { getEvalApp, type EvalApp } from './setup'
import {
  createProject, createNode, createEdge, publishAndExecute,
  printRecord, deleteProject, withEvalTrace,
} from './helpers'

describe('S-6: Checkpoint Decision Package + Human Notification', () => {
  let ctx: EvalApp
  let projectId: string
  let NA: { id: string }
  let NB: { id: string }
  let NC: { id: string }

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

  it('P1–P4: checkpoint task creates decision draft and transitions to waiting_for_approval', async () => {
    const entriesBefore = await ctx.prisma.knowledgeEntry.findMany({ where: { projectId } })
    const checkpointTask = await createCheckpointTaskFromCycle(ctx, projectId, NA.id, NC.id)

    await ctx.runtime.execute(checkpointTask.id)

    const checkpointTaskAfter = await ctx.prisma.orchestratorTask.findUniqueOrThrow({
      where: { id: checkpointTask.id },
    })
    expect(checkpointTaskAfter.status).toBe('waiting_for_approval')

    const entriesAfter = await ctx.prisma.knowledgeEntry.findMany({ where: { projectId } })
    const newEntries = entriesAfter.filter(e => !entriesBefore.some(before => before.id === e.id))
    const decisionEntries = newEntries.filter(e => e.category === 'decision')
    expect(decisionEntries.length).toBeGreaterThanOrEqual(1)

    const checkpointNode = await ctx.prisma.node.findUniqueOrThrow({ where: { id: checkpointTask.sourceId } })
    const decisionTitles = decisionEntries.map(e => e.title)
    const decisionBodies = decisionEntries.map(e => JSON.stringify(e.body))
    const hasDecisionPackage = decisionBodies.some(body =>
      /Background|背景/.test(body) &&
      /Risk analysis|风险/.test(body) &&
      /recommendation|建议/i.test(body),
    )

    expect(checkpointNode.isCheckpoint).toBe(true)
    expect(hasDecisionPackage).toBe(true)

    printRecord('S-6', {
      'task.status': checkpointTaskAfter.status,
      checkpointNodeId: checkpointTask.sourceId,
      'decision entries': decisionTitles,
      'decision entry 数': decisionEntries.length,
      'decision package 完整性': hasDecisionPackage ? 'Y' : 'N',
      '注意: notify_human 调用需查 console 日志确认': '',
    })
  }, 180_000)
})

async function createCheckpointTaskFromCycle(
  ctx: EvalApp,
  projectId: string,
  targetNodeId: string,
  sourceNodeId: string,
) {
  const tasksBefore = await ctx.prisma.orchestratorTask.findMany({ where: { projectId } })

  const eventTask = await publishAndExecute(ctx, {
    projectId,
    type: OrchestratorTaskType.event_anchor,
    sourceType: OrchestratorSourceType.manual,
    sourceId: `manual-s6-${Date.now()}`,
    input: withEvalTrace({
      text: [
        `新增架构约束：会话管理（节点 ID: ${sourceNodeId}）现在必须直接依赖认证模块（节点 ID: ${targetNodeId}）暴露的统一鉴权接口。`,
        '这是已经确认的结构调整，不是候选方案，也不是讨论稿。',
        '请直接把这条依赖关系更新到项目图中，并保留必要的结构化结论。',
      ].join('\n'),
    }, {
      evalCase: 'S-6',
      testName: 'P1–P4: checkpoint task creates decision draft and transitions to waiting_for_approval',
      specFile: 'test/eval/s6-cycle-detection.eval.spec.ts',
    }),
  })

  expect(eventTask.status).toBe('succeeded')

  const checkpointTask = await waitForCheckpointTask(ctx, projectId, tasksBefore.map(t => t.id))
  expect(checkpointTask).not.toBeNull()
  expect(checkpointTask!.type).toBe('checkpoint')

  return checkpointTask!
}

async function waitForCheckpointTask(ctx: EvalApp, projectId: string, existingTaskIds: string[]) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 10_000) {
    const checkpointTask = await ctx.prisma.orchestratorTask.findFirst({
      where: {
        projectId,
        type: OrchestratorTaskType.checkpoint,
        sourceType: OrchestratorSourceType.graph_event,
        id: { notIn: existingTaskIds },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (checkpointTask) return checkpointTask
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  return null
}
