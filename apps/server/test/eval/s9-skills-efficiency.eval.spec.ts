import { describe, it, beforeAll, expect } from 'vitest'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { getEvalApp, type EvalApp } from './setup'
import {
  createProject, createNode, publishAndExecute,
  parseInsight, printRecord, getUserNodes, deleteProject,
} from './helpers'

const S1_INPUT = '和技术负责人确认了支付网关集成的拆解方案：需要实现三个独立子模块——签名验证服务、回调幂等处理器、对账任务调度器。每个子模块需要独立开发和测试，最终组合到网关集成节点下。'

async function runS1Baseline(ctx: EvalApp, label: string) {
  const project = await createProject(ctx.app, `eval-s9-${label}-${Date.now()}`)
  const projectId = project.id
  try {
    await createNode(ctx.app, projectId, {
      title: '支付网关集成',
      description: '负责第三方支付接入，包含签名验证、回调处理、对账三个核心模块',
      type: 'scaffold',
    })

    const nodesBefore = await getUserNodes(ctx, projectId)
    const task = await publishAndExecute(ctx, {
      projectId,
      type: OrchestratorTaskType.event_anchor,
      sourceType: OrchestratorSourceType.manual,
      sourceId: `manual-s9-${label}-${Date.now()}`,
      input: { text: S1_INPUT },
    })

    const nodesAfter = await getUserNodes(ctx, projectId)
    const newNodes = nodesAfter.filter(n => !nodesBefore.some(b => b.id === n.id))
    const insight = parseInsight(task)

    return {
      status: task.status,
      nodeCreated: newNodes.length >= 1,
      signalType: insight?.signalType,
      confidence: insight?.confidence,
    }
  } finally {
    await deleteProject(ctx, projectId)
  }
}

describe('S-9: Skills Efficiency Comparison', () => {
  let ctx: EvalApp

  beforeAll(async () => {
    ctx = await getEvalApp()
  })

  it('Run 1 — record and compare manually (see console output)', async () => {
    const result = await runS1Baseline(ctx, 'run1')

    printRecord('S-9 Run 1', {
      'task.status': result.status,
      '节点正确': result.nodeCreated ? 'Y' : 'N',
      signalType: result.signalType,
      confidence: result.confidence,
      '说明': '请在有/无 skill 两组各运行 2 次并对比 console 中的迭代轮次',
    })

    expect(result.status).toBe('succeeded')
    expect(result.nodeCreated).toBe(true)
  })

  it('Run 2', async () => {
    const result = await runS1Baseline(ctx, 'run2')
    printRecord('S-9 Run 2', {
      'task.status': result.status,
      '节点正确': result.nodeCreated ? 'Y' : 'N',
      signalType: result.signalType,
      confidence: result.confidence,
    })
    expect(result.status).toBe('succeeded')
  })
})
