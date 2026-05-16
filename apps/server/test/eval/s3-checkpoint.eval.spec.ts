import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { getEvalApp, type EvalApp } from './setup'
import {
  createProject, createNode, setCheckpoint, updateNodeStatus,
  publishAndExecute, parseInsight, printRecord, deleteProject, withEvalTrace,
} from './helpers'

describe('S-3: Checkpoint Phase Judgment', () => {
  let ctx: EvalApp
  let projectId: string
  let N1: { id: string }

  beforeAll(async () => {
    ctx = await getEvalApp()
    const project = await createProject(ctx.app, `eval-s3-${Date.now()}`)
    projectId = project.id

    N1 = await createNode(ctx.app, projectId, { title: 'MVP 阶段', type: 'scaffold' })
    await setCheckpoint(ctx.app, N1.id)

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
      sourceId: `checkpoint-s3-${Date.now()}`,
      input: withEvalTrace({
        nodeId: N1.id,
        projectId,
        title: 'MVP 阶段',
      }, {
        evalCase: 'S-3',
        testName: 'P1–P4: checkpoint task → succeeded, decision/learning, confidence > 0.7, evidence references N1',
        specFile: 'test/eval/s3-checkpoint.eval.spec.ts',
      }),
    })

    expect(task.status).toBe('succeeded')

    const insight = parseInsight(task)
    expect(insight).not.toBeNull()
    expect(['decision', 'learning']).toContain(insight!.signalType)
    expect(insight!.confidence).toBeGreaterThan(0.7)

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
