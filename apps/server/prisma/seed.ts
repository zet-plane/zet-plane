/**
 * Frontend canvas display fixture.
 *
 * Seeds three projects covering every visual feature of Graph Canvas v1:
 *   1. [demo] Full coverage — 14 nodes, all statuses, types, checkpoint
 *      resolutions, knowledge-entry categories, container aggregation, and
 *      dep-edge tinting in one project.
 *   2. [demo] Empty project — root-only, drives the rootOnly EmptyState.
 *   3. [demo] Compact 3-node — deterministic graph for Playwright e2e and
 *      clean screenshots.
 *
 * NOT a regression test for the API surface. Backend regressions live in
 * apps/server/test/graph.e2e-spec.ts. This fixture writes directly through
 * Prisma to exercise visual axes the controller doesn't expose (notably
 * type=growth and createdBy=agent), and to construct end states that the
 * service layer would otherwise reach in multiple steps.
 *
 * Re-runnable: scoped wipe by stable UUIDs before insert. Coexisting
 * user-created projects are untouched.
 *
 * Staging nodes are intentionally NOT seeded: listProjectNodes filters by
 * isProjectRoot=false but not by role, so a staging_root would leak into the
 * canvas; canvas v1 doesn't surface staging anyway. See plan section
 * "Out of scope" → action item.
 *
 * Run with: pnpm seed   (from apps/server)
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import yaml from 'js-yaml'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  PrismaClient,
  NodeRole,
  NodeStatus,
  NodeType,
  EdgeType,
  CreatedBy,
  CheckpointResolution,
  EntryCategory,
  EntryStatus,
} from '../src/prisma/gen/client/client'

if (process.env.NODE_ENV === 'production') {
  throw new Error('seed.ts refuses to run with NODE_ENV=production')
}

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  try {
    const config = yaml.load(
      readFileSync(resolve(__dirname, '..', 'config.yaml'), 'utf8'),
    ) as { database?: { url?: string } }
    if (config?.database?.url) return config.database.url
  } catch {
    // fall through
  }
  throw new Error('seed.ts: DATABASE_URL not set and config.yaml is missing or malformed')
}

const adapter = new PrismaPg({ connectionString: getDatabaseUrl() })
const prisma = new PrismaClient({ adapter })

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

// ─── Stable UUIDs ────────────────────────────────────────────────────────────

const PROJECT_FULL = '00000000-0000-4000-8000-000000000001'
const PROJECT_EMPTY = '00000000-0000-4000-8000-000000000002'
const PROJECT_COMPACT = '00000000-0000-4000-8000-000000000003'

// Version nibble = 4, variant nibble = 8 — valid RFC 4122 format.
const fullNode = (i: number) => `00000000-0000-4000-8001-${String(i).padStart(12, '0')}`
const emptyNode = (i: number) => `00000000-0000-4000-8002-${String(i).padStart(12, '0')}`
const compactNode = (i: number) => `00000000-0000-4000-8003-${String(i).padStart(12, '0')}`

// ─── Wipe ────────────────────────────────────────────────────────────────────
// Matches by name prefix rather than a hardcoded UUID list so that stale rows
// from old runs (with different UUIDs) are always cleaned up.

async function wipeSeedProjects(): Promise<void> {
  const demoProjects = await prisma.project.findMany({
    where: { name: { startsWith: '[demo]' } },
    select: { id: true },
  })
  const ids = demoProjects.map((p) => p.id)
  if (ids.length === 0) return

  // KnowledgeRevision has no `entry` relation field — resolve entry IDs first.
  const entryIds = (
    await prisma.knowledgeEntry.findMany({
      where: { projectId: { in: ids } },
      select: { id: true },
    })
  ).map((r) => r.id)

  await prisma.$transaction([
    prisma.knowledgeRevision.deleteMany({ where: { entryId: { in: entryIds } } }),
    prisma.knowledgeEntry.deleteMany({ where: { projectId: { in: ids } } }),
    prisma.edge.deleteMany({ where: { projectId: { in: ids } } }),
    prisma.node.deleteMany({ where: { projectId: { in: ids } } }),
    prisma.project.deleteMany({ where: { id: { in: ids } } }),
  ])

  console.log(`[seed] wiped ${ids.length} demo project(s)`)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function bootstrapProject(
  tx: PrismaTx,
  args: { id: string; name: string; description?: string; rootId: string },
): Promise<void> {
  await tx.project.create({
    data: { id: args.id, name: args.name, description: args.description },
  })
  await tx.node.create({
    data: {
      id: args.rootId,
      projectId: args.id,
      isProjectRoot: true,
      role: NodeRole.project_root,
      type: NodeType.scaffold,
      title: '[Project Root]',
      createdBy: CreatedBy.human,
    },
  })
}

async function createEntry(
  tx: PrismaTx,
  args: {
    projectId: string
    nodeId: string
    category: EntryCategory
    title: string
    body: object
    status: EntryStatus
    createdBy?: CreatedBy
  },
): Promise<void> {
  const id = randomUUID()
  await tx.knowledgeEntry.create({
    data: {
      id,
      projectId: args.projectId,
      nodeId: args.nodeId,
      category: args.category,
      title: args.title,
      body: args.body,
      status: args.status,
      createdBy: args.createdBy ?? CreatedBy.human,
    },
  })
  await tx.knowledgeRevision.create({
    data: {
      id: randomUUID(),
      entryId: id,
      version: 1,
      body: args.body,
      createdBy: args.createdBy ?? CreatedBy.human,
    },
  })
}

// ─── Full coverage ───────────────────────────────────────────────────────────

type LeafSpec = {
  id: string
  parentId: string
  title: string
  type: NodeType
  status: NodeStatus
  isCheckpoint?: boolean
  resolution?: CheckpointResolution | null
  createdBy?: CreatedBy
}

async function seedFullCoverage(tx: PrismaTx): Promise<void> {
  const ROOT = fullNode(0)
  const A = fullNode(10) // Container: Backend platform
  const B = fullNode(11) // Container: Search rollout
  const C = fullNode(12) // Container: Mobile app
  const AUTH = fullNode(20)
  const DBMIG = fullNode(21)
  const CACHE = fullNode(22)
  const LEGAUTH = fullNode(23)
  const IDX = fullNode(30)
  const QAPI = fullNode(31)
  const IOS = fullNode(40)
  const PUSH = fullNode(41)
  const TELE = fullNode(50)
  const PERF = fullNode(51)

  await bootstrapProject(tx, {
    id: PROJECT_FULL,
    name: '[demo] Full coverage',
    description:
      'Exercises every visual axis: statuses, growth vs scaffold, agent vs human, checkpoints, knowledge categories, container aggregation, dep tinting.',
    rootId: ROOT,
  })

  const leaves: LeafSpec[] = [
    // Top-level containers / siblings
    { id: A, parentId: ROOT, title: 'Backend platform', type: NodeType.scaffold, status: NodeStatus.active },
    { id: B, parentId: ROOT, title: 'Search rollout', type: NodeType.scaffold, status: NodeStatus.completed },
    { id: C, parentId: ROOT, title: 'Mobile app', type: NodeType.growth, status: NodeStatus.active },
    {
      id: TELE,
      parentId: ROOT,
      title: 'Telemetry pipeline',
      type: NodeType.scaffold,
      status: NodeStatus.active,
      createdBy: CreatedBy.agent,
    },
    { id: PERF, parentId: ROOT, title: 'Performance audit', type: NodeType.scaffold, status: NodeStatus.blocked },

    // Backend platform children
    {
      id: AUTH,
      parentId: A,
      title: 'Auth service',
      type: NodeType.scaffold,
      status: NodeStatus.blocked,
      isCheckpoint: true,
      resolution: null,
    },
    { id: DBMIG, parentId: A, title: 'Database migration', type: NodeType.scaffold, status: NodeStatus.completed },
    { id: CACHE, parentId: A, title: 'Cache layer', type: NodeType.growth, status: NodeStatus.active },
    { id: LEGAUTH, parentId: A, title: 'Legacy auth', type: NodeType.scaffold, status: NodeStatus.archived },

    // Search rollout children (both completed → container sealed)
    { id: IDX, parentId: B, title: 'Index builder', type: NodeType.scaffold, status: NodeStatus.completed },
    {
      id: QAPI,
      parentId: B,
      title: 'Query API',
      type: NodeType.scaffold,
      status: NodeStatus.completed,
      isCheckpoint: true,
      resolution: CheckpointResolution.continue,
    },

    // Mobile app children
    { id: IOS, parentId: C, title: 'iOS shell', type: NodeType.scaffold, status: NodeStatus.active },
    {
      id: PUSH,
      parentId: C,
      title: 'Push notifications',
      type: NodeType.growth,
      status: NodeStatus.blocked,
      isCheckpoint: true,
      resolution: CheckpointResolution.loop,
    },
  ]

  for (const spec of leaves) {
    await tx.node.create({
      data: {
        id: spec.id,
        projectId: PROJECT_FULL,
        type: spec.type,
        status: spec.status,
        title: spec.title,
        isCheckpoint: spec.isCheckpoint ?? false,
        checkpointResolution: spec.resolution ?? null,
        createdBy: spec.createdBy ?? CreatedBy.human,
        role: NodeRole.regular,
      },
    })
    await tx.edge.create({
      data: {
        projectId: PROJECT_FULL,
        fromId: spec.parentId,
        toId: spec.id,
        type: EdgeType.composition,
        createdBy: spec.createdBy ?? CreatedBy.human,
      },
    })
  }

  const deps: Array<{ fromId: string; toId: string }> = [
    { fromId: IOS, toId: AUTH }, // active → blocked
    { fromId: PUSH, toId: QAPI }, // blocked → completed
    { fromId: CACHE, toId: DBMIG }, // active → completed
    { fromId: TELE, toId: CACHE }, // active → active
    { fromId: AUTH, toId: LEGAUTH }, // blocked → archived
  ]
  for (const d of deps) {
    await tx.edge.create({
      data: {
        projectId: PROJECT_FULL,
        fromId: d.fromId,
        toId: d.toId,
        type: EdgeType.dependency,
        createdBy: CreatedBy.human,
      },
    })
  }

  // Knowledge entries — categories + statuses spread across a few anchors.
  await createEntry(tx, {
    projectId: PROJECT_FULL,
    nodeId: DBMIG,
    category: EntryCategory.decision,
    title: 'Adopt online-DDL migration strategy',
    body: { summary: 'Switch from gh-ost to native pg_repack for online schema changes.', details: 'Lower lag, simpler ops, fewer moving parts than gh-ost on a write-heavy primary.' },
    status: EntryStatus.published,
  })
  await createEntry(tx, {
    projectId: PROJECT_FULL,
    nodeId: DBMIG,
    category: EntryCategory.finding,
    title: 'Replica lag spike during long DDL',
    body: { summary: 'Lag exceeded 30s on the analytics replica during last week\'s migration.', details: 'Reproducible when DDL touches > 50M rows.' },
    status: EntryStatus.draft,
  })
  await createEntry(tx, {
    projectId: PROJECT_FULL,
    nodeId: CACHE,
    category: EntryCategory.context,
    title: 'TTL strategy',
    body: { summary: 'Read-through with 5-minute TTL on most read endpoints; bypass for billing.', details: 'Billing must not be cached — single source of truth lives in Postgres.' },
    status: EntryStatus.published,
  })
  await createEntry(tx, {
    projectId: PROJECT_FULL,
    nodeId: IOS,
    category: EntryCategory.decision,
    title: 'Adopt SwiftUI for all new screens',
    body: { summary: 'New screens are SwiftUI; UIKit only for screens we have not rewritten yet.', details: 'Dropping the UIKit fallback would block iOS 15 users.' },
    status: EntryStatus.published,
  })
  await createEntry(tx, {
    projectId: PROJECT_FULL,
    nodeId: IOS,
    category: EntryCategory.pitfall,
    title: 'Background-task scheduling on iOS 17',
    body: { summary: 'BGProcessingTask quietly fails when the app is woken < 5 minutes after another launch.', details: 'Use BGAppRefreshTask for short jobs.' },
    status: EntryStatus.draft,
  })
  await createEntry(tx, {
    projectId: PROJECT_FULL,
    nodeId: IOS,
    category: EntryCategory.finding,
    title: 'TLS pinning broke OTA',
    body: { summary: 'Pin rotation during OTA caused 100% handshake failures for 30 minutes.', details: 'Rolled back; pin set is now versioned alongside the app build.' },
    status: EntryStatus.deprecated,
  })
  await createEntry(tx, {
    projectId: PROJECT_FULL,
    nodeId: IOS,
    category: EntryCategory.context,
    title: 'Build matrix',
    body: { summary: 'Xcode 16.2, Swift 5.10, iOS 15+, iPadOS 17+.', details: 'CI builds on macOS 14 runners.' },
    status: EntryStatus.published,
  })
}

// ─── Compact ─────────────────────────────────────────────────────────────────

async function seedCompact(tx: PrismaTx): Promise<void> {
  const ROOT = compactNode(0)
  const TASK_A = compactNode(1)
  const TASK_B = compactNode(2)

  await bootstrapProject(tx, {
    id: PROJECT_COMPACT,
    name: '[demo] Compact 3-node',
    description: 'Tiny deterministic graph used by Playwright canvas spec.',
    rootId: ROOT,
  })

  const tasks: Array<[string, string, NodeStatus]> = [
    [TASK_A, 'Task A', NodeStatus.active],
    [TASK_B, 'Task B', NodeStatus.blocked],
  ]
  for (const [id, title, status] of tasks) {
    await tx.node.create({
      data: {
        id,
        projectId: PROJECT_COMPACT,
        type: NodeType.scaffold,
        status,
        title,
        createdBy: CreatedBy.human,
        role: NodeRole.regular,
      },
    })
    await tx.edge.create({
      data: {
        projectId: PROJECT_COMPACT,
        fromId: ROOT,
        toId: id,
        type: EdgeType.composition,
        createdBy: CreatedBy.human,
      },
    })
  }

  await tx.edge.create({
    data: {
      projectId: PROJECT_COMPACT,
      fromId: TASK_A,
      toId: TASK_B,
      type: EdgeType.dependency,
      createdBy: CreatedBy.human,
    },
  })
}

// ─── Empty ───────────────────────────────────────────────────────────────────

async function seedEmpty(tx: PrismaTx): Promise<void> {
  await bootstrapProject(tx, {
    id: PROJECT_EMPTY,
    name: '[demo] Empty project',
    description: 'Root-only project that drives the rootOnly EmptyState.',
    rootId: emptyNode(0),
  })
}

// ─── Main ────────────────────────────────────────────────────────────────────

const cleanOnly = process.argv.includes('--clean')

async function main(): Promise<void> {
  console.log('[seed] wiping demo projects…')
  await wipeSeedProjects()

  if (cleanOnly) {
    console.log('[seed:clean] done.')
    return
  }

  console.log('[seed] inserting fixture…')
  await prisma.$transaction(async (tx) => {
    await seedFullCoverage(tx)
    await seedEmpty(tx)
    await seedCompact(tx)
  })

  console.log('[seed] done. Projects:')
  console.log(`  /projects/${PROJECT_FULL}/graph  -> [demo] Full coverage`)
  console.log(`  /projects/${PROJECT_EMPTY}/graph  -> [demo] Empty project`)
  console.log(`  /projects/${PROJECT_COMPACT}/graph  -> [demo] Compact 3-node`)
}

main()
  .catch((err) => {
    console.error('[seed] FAILED:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
