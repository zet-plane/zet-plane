import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { getEvalApp, type EvalApp } from './setup'
import {
  createProject, createNode, createEdge, publishAndExecute,
  parseInsight, printRecord, deleteProject, withEvalTrace,
} from './helpers'

describe('S-3: Knowledge-Driven Cycle -> Checkpoint Elevation', () => {
  let ctx: EvalApp
  let projectId: string
  let NA: { id: string }
  let NB: { id: string }
  let NC: { id: string }

  beforeAll(async () => {
    ctx = await getEvalApp()
    const project = await createProject(ctx.app, `eval-s3-${Date.now()}`)
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

  it('P1–P5: knowledge event drives edge creation, forms a cycle, and auto-spawns a checkpoint task', async () => {
    const tasksBefore = await ctx.prisma.orchestratorTask.findMany({ where: { projectId } })
    const edgesBefore = await ctx.prisma.edge.findMany({ where: { projectId } })

    const task = await publishAndExecute(ctx, {
      projectId,
      type: OrchestratorTaskType.event_anchor,
      sourceType: OrchestratorSourceType.manual,
      sourceId: `manual-s3-${Date.now()}`,
      input: withEvalTrace({
        text: [
          `新增架构约束：会话管理（节点 ID: ${NC.id}）现在必须直接依赖认证模块（节点 ID: ${NA.id}）暴露的统一鉴权接口。`,
          '这是已经确认的结构调整，不是候选方案，也不是讨论稿。',
          '请直接把这条依赖关系更新到项目图中，并保留必要的结构化结论。',
        ].join('\n'),
      }, {
        evalCase: 'S-3',
        testName: 'P1–P5: knowledge event drives edge creation, forms a cycle, and auto-spawns a checkpoint task',
        specFile: 'test/eval/s3-checkpoint.eval.spec.ts',
      }),
    })

    expect(task.status).toBe('succeeded')

    const edgesAfter = await ctx.prisma.edge.findMany({ where: { projectId } })
    const cycleEdge = edgesAfter.find(e => e.fromId === NC.id && e.toId === NA.id && e.type === 'dependency')
    expect(cycleEdge).toBeDefined()
    expect(edgesAfter.length).toBe(edgesBefore.length + 1)

    const checkpointTask = await waitForCheckpointTask(ctx, projectId, tasksBefore.map(t => t.id))
    expect(checkpointTask).not.toBeNull()
    expect(checkpointTask!.type).toBe('checkpoint')
    expect(checkpointTask!.sourceType).toBe('graph_event')

    const checkpointNode = await ctx.prisma.node.findUnique({ where: { id: checkpointTask!.sourceId } })
    expect(checkpointNode?.isCheckpoint).toBe(true)

    const cycleNodes = new Set([NA.id, NB.id, NC.id])
    expect(cycleNodes.has(checkpointTask!.sourceId)).toBe(true)

    const insight = parseInsight(task)
    expect(['progress', 'decision', 'learning']).toContain(insight?.signalType)

    printRecord('S-3', {
      'task.status': task.status,
      signalType: insight?.signalType,
      confidence: insight?.confidence,
      '新增环边': cycleEdge ? `${cycleEdge.fromId}->${cycleEdge.toId}` : null,
      'checkpointTask.id': checkpointTask?.id ?? null,
      'checkpointTask.sourceId': checkpointTask?.sourceId ?? null,
      'checkpointNode.isCheckpoint': checkpointNode?.isCheckpoint ?? null,
    })
  }, 180_000)
})

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
