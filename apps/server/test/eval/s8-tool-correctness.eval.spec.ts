import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { getEvalApp, type EvalApp } from './setup'
import {
  createProject, getSystemNodes, createNode, publishAndExecute,
  parseInsight, printRecord, getUserNodes, deleteProject,
} from './helpers'

describe('S-8: Tool Call Correctness & Timing', () => {
  let ctx: EvalApp
  let projectId: string
  let N1: { id: string }, N2: { id: string }

  beforeAll(async () => {
    ctx = await getEvalApp()
    const project = await createProject(ctx.app, `eval-s8-${Date.now()}`)
    projectId = project.id
    N1 = await createNode(ctx.app, projectId, { title: '基础设施层', type: 'scaffold' })
    N2 = await createNode(ctx.app, projectId, { title: '数据库连接池', type: 'growth', parentId: N1.id })
  })

  afterAll(async () => {
    await deleteProject(ctx, projectId)
  })

  it('P1–P6: succeeds with valid node mutations and no DomainServiceError', async () => {
    const task = await publishAndExecute(ctx, {
      projectId,
      type: OrchestratorTaskType.event_anchor,
      sourceType: OrchestratorSourceType.manual,
      sourceId: `manual-s8-${Date.now()}`,
      input: {
        text: '数据库连接池优化已完成：最大连接数从 10 调整为 50，并增加了连接健康检查机制。这是一个重要的基础设施决策，请记录为知识并更新节点状态为 completed。同时需要为下一步的缓存层搭建创建一个新节点。',
      },
    })

    expect(task.status).toBe('succeeded')

    const updatedN2 = await ctx.prisma.node.findUniqueOrThrow({ where: { id: N2.id } })
    expect(updatedN2.status).toBe('completed')

    const entriesOnN2 = await ctx.prisma.knowledgeEntry.findMany({ where: { projectId, nodeId: N2.id } })
    expect(entriesOnN2.length).toBeGreaterThanOrEqual(1)
    expect(entriesOnN2.some(e => e.category === 'decision')).toBe(true)

    const allUserNodes = await getUserNodes(ctx, projectId)
    const newNodes = allUserNodes.filter(n => n.id !== N1.id && n.id !== N2.id)
    expect(newNodes.length).toBeGreaterThanOrEqual(1)

    const edges = await ctx.prisma.edge.findMany({ where: { projectId } })
    const newNodeIds = new Set(newNodes.map(n => n.id))
    const compositionToN1 = edges.filter(
      e => e.fromId === N1.id && newNodeIds.has(e.toId) && e.type === 'composition',
    )
    expect(compositionToN1.length).toBeGreaterThanOrEqual(1)

    const { rootNode, stagingNode } = await getSystemNodes(ctx, projectId)
    const allNodeIds = new Set(allUserNodes.map(n => n.id))
    allNodeIds.add(rootNode.id)
    allNodeIds.add(stagingNode.id)
    for (const edge of edges) {
      expect(allNodeIds.has(edge.fromId), `fromId ${edge.fromId} not in project`).toBe(true)
      expect(allNodeIds.has(edge.toId), `toId ${edge.toId} not in project`).toBe(true)
    }

    const insight = parseInsight(task)
    printRecord('S-8', {
      'task.status': task.status,
      signalType: insight?.signalType,
      confidence: insight?.confidence,
      'N2.status after': updatedN2.status,
      'entries on N2': entriesOnN2.length,
      'new nodes': newNodes.map(n => n.title),
      'composition edges to N1': compositionToN1.length,
    })
  })
})
