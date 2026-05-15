import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import type { EvalApp } from './setup'

// ── Project ──────────────────────────────────────────────────────────────────

export async function createProject(app: NestFastifyApplication, name: string) {
  const res = await app.inject({ method: 'POST', url: '/projects', payload: { name } })
  if (res.statusCode !== 201) throw new Error(`createProject failed: ${res.statusCode} ${res.body}`)
  return res.json() as { id: string; name: string }
}

/** rootNode (isProjectRoot) and stagingNode (isStagingRoot) — not in GET /nodes list */
export async function getSystemNodes(ctx: EvalApp, projectId: string) {
  const [rootNode, stagingNode] = await Promise.all([
    ctx.prisma.node.findFirstOrThrow({ where: { projectId, isProjectRoot: true } }),
    ctx.prisma.node.findFirstOrThrow({ where: { projectId, isStagingRoot: true } }),
  ])
  return { rootNode, stagingNode }
}

/** Delete project and all related data in FK-safe order */
export async function deleteProject(ctx: EvalApp, projectId: string) {
  const prisma = ctx.prisma
  await prisma.orchestratorTask.deleteMany({ where: { projectId } })
  await prisma.knowledgeRevision.deleteMany({ where: { entry: { projectId } } })
  await prisma.knowledgeEntry.deleteMany({ where: { projectId } })
  await prisma.edge.deleteMany({ where: { projectId } })
  await prisma.node.deleteMany({ where: { projectId } })
  await prisma.project.delete({ where: { id: projectId } })
}

// ── Nodes ─────────────────────────────────────────────────────────────────────

export async function createNode(
  app: NestFastifyApplication,
  projectId: string,
  payload: { title: string; description?: string; type?: string; parentId?: string },
) {
  const res = await app.inject({
    method: 'POST',
    url: `/projects/${projectId}/nodes`,
    payload: { createdBy: 'human', ...payload },
  })
  if (res.statusCode !== 201) throw new Error(`createNode failed: ${res.statusCode} ${res.body}`)
  return res.json() as { id: string; title: string; type: string; status: string }
}

export async function updateNodeStatus(app: NestFastifyApplication, nodeId: string, status: string) {
  const res = await app.inject({ method: 'PATCH', url: `/nodes/${nodeId}`, payload: { status } })
  if (res.statusCode !== 200) throw new Error(`updateNodeStatus(${nodeId}, ${status}) failed: ${res.statusCode} ${res.body}`)
  return res.json()
}

export async function setCheckpoint(app: NestFastifyApplication, nodeId: string) {
  const res = await app.inject({ method: 'PATCH', url: `/nodes/${nodeId}`, payload: { isCheckpoint: true } })
  if (res.statusCode !== 200) throw new Error(`setCheckpoint(${nodeId}) failed: ${res.statusCode} ${res.body}`)
  return res.json()
}

// ── Edges ─────────────────────────────────────────────────────────────────────

export async function createEdge(
  app: NestFastifyApplication,
  projectId: string,
  payload: { fromId: string; toId: string; type: string },
) {
  const res = await app.inject({
    method: 'POST',
    url: `/projects/${projectId}/edges`,
    payload: { createdBy: 'human', ...payload },
  })
  if (res.statusCode !== 201) throw new Error(`createEdge failed: ${res.statusCode} ${res.body}`)
  return res.json()
}

// ── Knowledge entries ─────────────────────────────────────────────────────────

export async function createEntry(
  app: NestFastifyApplication,
  projectId: string,
  payload: { nodeId: string; category: string; title: string; body?: unknown },
) {
  const res = await app.inject({
    method: 'POST',
    url: `/projects/${projectId}/entries`,
    payload: { body: { text: payload.title }, createdBy: 'human', ...payload },
  })
  if (res.statusCode !== 201) throw new Error(`createEntry failed: ${res.statusCode} ${res.body}`)
  return res.json() as { id: string; nodeId: string; category: string; title: string }
}

/**
 * Embed a knowledge entry by publishing an embedding task and executing it directly.
 * Use this in test setup to seed pre-embedded entries (bypasses BullMQ workers).
 */
export async function embedEntry(ctx: EvalApp, projectId: string, entryId: string) {
  const result = await ctx.publisher.publish({
    projectId,
    type: OrchestratorTaskType.embedding,
    sourceType: OrchestratorSourceType.knowledge_event,
    sourceId: entryId,
    input: { entryId },
  })
  if (!result.created) {
    throw new Error(`embedEntry: idempotency collision — embedding already exists for entryId=${entryId}`)
  }
  await ctx.runtime.execute(result.taskId)
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export interface PublishInput {
  projectId: string
  type: OrchestratorTaskType
  sourceType: OrchestratorSourceType
  sourceId: string
  input: Record<string, unknown>
}

/** Publish a task, execute it synchronously, and return the final OrchestratorTask record. */
export async function publishAndExecute(ctx: EvalApp, input: PublishInput) {
  const result = await ctx.publisher.publish(input)
  if (!result.created) {
    throw new Error(`publishAndExecute: idempotency collision — task already exists (taskId=${result.taskId}). Use a unique sourceId per test run.`)
  }
  await ctx.runtime.execute(result.taskId)
  return ctx.prisma.orchestratorTask.findUniqueOrThrow({ where: { id: result.taskId } })
}

/** Parse task.modelResult as AgentInsight (returns null if not present). */
export function parseInsight(task: { modelResult: unknown }) {
  if (!task.modelResult || typeof task.modelResult !== 'object') return null
  return task.modelResult as {
    summary: string
    signalType: string
    confidence: number
    evidence: Array<{ sourceType: string; sourceId: string; note: string }>
  }
}

/** Print a record table block — mimics the protocol's 记录表 format. */
export function printRecord(scenario: string, fields: Record<string, unknown>) {
  console.log(`\n${'='.repeat(40)}`)
  console.log(`=== ${scenario} Record Table ===`)
  for (const [k, v] of Object.entries(fields)) {
    console.log(`${k}: ${JSON.stringify(v)}`)
  }
  console.log('='.repeat(40) + '\n')
}

/** Return all non-system nodes in project (excludes root + staging). */
export async function getUserNodes(ctx: EvalApp, projectId: string) {
  return ctx.prisma.node.findMany({
    where: { projectId, isProjectRoot: false, isStagingRoot: false },
  })
}
