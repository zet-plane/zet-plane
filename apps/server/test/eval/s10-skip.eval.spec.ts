import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { getEvalApp, type EvalApp } from './setup'
import {
  createProject, createNode, publishAndExecute,
  parseInsight, printRecord, getUserNodes, deleteProject,
} from './helpers'

describe('S-10: Noise Filtering (Skip)', () => {
  let ctx: EvalApp
  let projectId: string

  beforeAll(async () => {
    ctx = await getEvalApp()
    const project = await createProject(ctx.app, `eval-s10-${Date.now()}`)
    projectId = project.id
    await createNode(ctx.app, projectId, { title: '电商平台后端', type: 'scaffold' })
  })

  afterAll(async () => {
    await deleteProject(ctx, projectId)
  })

  async function runInput(label: string, text: string) {
    const nodesBefore = await getUserNodes(ctx, projectId)
    const entriesBefore = await ctx.prisma.knowledgeEntry.findMany({ where: { projectId } })

    const task = await publishAndExecute(ctx, {
      projectId,
      type: OrchestratorTaskType.event_anchor,
      sourceType: OrchestratorSourceType.manual,
      sourceId: `manual-s10-${label}-${Date.now()}`,
      input: { text },
    })

    const nodesAfter = await getUserNodes(ctx, projectId)
    const entriesAfter = await ctx.prisma.knowledgeEntry.findMany({ where: { projectId } })
    const insight = parseInsight(task)

    printRecord(`S-10 Input ${label}`, {
      'task.status': task.status,
      signalType: insight?.signalType,
      '新节点': nodesAfter.length - nodesBefore.length,
      '新条目': entriesAfter.length - entriesBefore.length,
    })

    return {
      task,
      insight,
      newNodes: nodesAfter.length - nodesBefore.length,
      newEntries: entriesAfter.length - entriesBefore.length,
    }
  }

  it('A (纯噪音): status=succeeded, signalType=noise, zero mutations', async () => {
    const r = await runInput('A', '今天午饭吃了炒饭，下午开了个很无聊的同步会议。')
    expect(r.task.status).toBe('succeeded')
    expect(r.insight?.signalType).toBe('noise')
    expect(r.newNodes).toBe(0)
    expect(r.newEntries).toBe(0)
  })

  it('B (非技术信息): status=succeeded, zero new nodes', async () => {
    const r = await runInput('B', '老板说 Q3 的 KPI 目标是提升 20% 的用户留存，大家要加油。')
    expect(r.task.status).toBe('succeeded')
    expect(r.newNodes).toBe(0)
    console.log(`  → S-10-B entries created: ${r.newEntries} (0 expected, 1 acceptable if context/finding)`)
  })

  it('C (其他项目信息): status=succeeded, zero new nodes', async () => {
    const r = await runInput('C', '移动端团队今天修复了 iOS 推送通知的 badge 计数 bug，已合并到 main。')
    expect(r.task.status).toBe('succeeded')
    expect(r.newNodes).toBe(0)
    console.log(`  → S-10-C entries created: ${r.newEntries} (0 expected, 1 acceptable if context/finding)`)
  })
})
