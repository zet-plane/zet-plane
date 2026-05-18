/**
 * Semantic frontend demo fixture.
 *
 * Seeds one project that demonstrates Zet Plane's own development flow:
 *   - Scaffold nodes are flows: main process, sub-process, checkpoint.
 *   - Growth nodes are events: findings, scope changes, risks, conclusions.
 *   - Composition edges express where a flow/event belongs.
 *   - Dependency edges express causal influence across flows or between events.
 *
 * NOT a regression test for the API surface. Backend regressions live in
 * apps/server/test/graph.e2e-spec.ts. This fixture writes directly through
 * Prisma so it can construct demo states such as archived historical choices
 * and blocked checkpoints without walking the public controller workflow.
 *
 * Re-runnable: scoped wipe by `[demo]` name prefix before insert. Coexisting
 * user-created projects are untouched.
 *
 * Staging nodes are intentionally NOT seeded: listProjectNodes filters by
 * isProjectRoot=false but not by role, so a staging_root would leak into the
 * canvas; canvas v1 doesn't surface staging anyway.
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

const PROJECT_DEMO = '00000000-0000-4000-8000-000000000001'

// Version nibble = 4, variant nibble = 8 — valid RFC 4122 format.
const demoNode = (i: number) => `00000000-0000-4000-8001-${String(i).padStart(12, '0')}`

const NODE = {
  ROOT: demoNode(0),

  IDEA: demoNode(10),
  IDEA_PROBLEM: demoNode(11),
  IDEA_VALUE: demoNode(12),
  IDEA_HANDOFF_FAILED: demoNode(13),
  IDEA_CONTEXT_LOST: demoNode(14),

  REQUIREMENTS: demoNode(20),
  REQ_INTERVIEWS: demoNode(21),
  REQ_CORE_PROBLEM: demoNode(22),
  REQ_BOUNDARIES: demoNode(23),
  REQ_HANDOFF_FINDING: demoNode(24),
  REQ_UNDERSTANDING_NOT_EXECUTION: demoNode(25),

  COMPETITORS: demoNode(30),
  COMP_RESEARCH: demoNode(31),
  COMP_COMPARISON: demoNode(32),
  COMP_OLD_DOCS_PLAN: demoNode(33),
  COMP_RESULT_TOOLS: demoNode(34),
  COMP_AGENT_EXECUTION: demoNode(35),

  PRD: demoNode(40),
  PRD_USER_STORIES: demoNode(41),
  PRD_SCOPE: demoNode(42),
  PRD_MVP_BOUNDARY: demoNode(43),
  PRD_SCOPE_CHECKPOINT: demoNode(44),
  PRD_NO_CODE_WRITING: demoNode(45),

  TECH: demoNode(50),
  TECH_GRAPH_PROTOTYPE: demoNode(51),
  TECH_SCAFFOLD_GRAPH: demoNode(52),
  TECH_REVIEW_CHECKPOINT: demoNode(53),
  TECH_ADAPTER_STRATEGY: demoNode(54),
  TECH_OVER_CONSTRAINT_RISK: demoNode(55),

  DELIVERY: demoNode(60),
  DELIVERY_CANVAS: demoNode(61),
  DELIVERY_REVIEW_CHECKPOINT: demoNode(62),
  DELIVERY_DIVE_IN_TEST: demoNode(63),
} as const

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
  args: {
    id: string
    name: string
    description?: string
    rootId: string
    rootTitle: string
    rootDescription?: string
  },
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
      title: args.rootTitle,
      description: args.rootDescription,
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

type NodeSpec = {
  id: string
  parentId: string
  title: string
  description?: string
  type: NodeType
  status: NodeStatus
  isCheckpoint?: boolean
  resolution?: CheckpointResolution | null
  createdBy?: CreatedBy
}

type DependencySpec = {
  fromId: string
  toId: string
  createdBy?: CreatedBy
}

// ─── Semantic Demo ───────────────────────────────────────────────────────────

const nodes: NodeSpec[] = [
  {
    id: NODE.IDEA,
    parentId: NODE.ROOT,
    title: 'Idea 提出',
    description: '从社团项目交接失败和隐性知识流失中提出产品机会。',
    type: NodeType.scaffold,
    status: NodeStatus.completed,
  },
  {
    id: NODE.REQUIREMENTS,
    parentId: NODE.ROOT,
    title: '需求分析',
    description: '把真实交接痛点整理成系统必须解释的核心问题。',
    type: NodeType.scaffold,
    status: NodeStatus.completed,
  },
  {
    id: NODE.COMPETITORS,
    parentId: NODE.ROOT,
    title: '竞品分析',
    description: '对比看板、文档中心和 agent 执行平台，定位过程理解空白。',
    type: NodeType.scaffold,
    status: NodeStatus.completed,
  },
  {
    id: NODE.PRD,
    parentId: NODE.ROOT,
    title: 'PRD 与项目排期',
    description: '沉淀 MVP 范围、排期风险和阶段性确认点。',
    type: NodeType.scaffold,
    status: NodeStatus.active,
  },
  {
    id: NODE.TECH,
    parentId: NODE.ROOT,
    title: '原型与技术方案',
    description: '验证 Scaffold Graph 的交互模型、边界原则和 Adapter 策略。',
    type: NodeType.scaffold,
    status: NodeStatus.active,
  },
  {
    id: NODE.DELIVERY,
    parentId: NODE.ROOT,
    title: '开发交付与复盘',
    description: '实现核心画布能力，并把交付后的判断继续沉淀回图中。',
    type: NodeType.scaffold,
    status: NodeStatus.active,
  },

  {
    id: NODE.IDEA_PROBLEM,
    parentId: NODE.IDEA,
    title: '问题提出',
    type: NodeType.scaffold,
    status: NodeStatus.completed,
  },
  {
    id: NODE.IDEA_VALUE,
    parentId: NODE.IDEA,
    title: '价值假设',
    type: NodeType.scaffold,
    status: NodeStatus.completed,
  },
  {
    id: NODE.IDEA_HANDOFF_FAILED,
    parentId: NODE.IDEA_PROBLEM,
    title: '事件：社团项目交接失败',
    description: '接手者只能看到代码结果，无法复现前任成员的判断过程。',
    type: NodeType.growth,
    status: NodeStatus.completed,
  },
  {
    id: NODE.IDEA_CONTEXT_LOST,
    parentId: NODE.IDEA_VALUE,
    title: '事件：隐性判断无法追溯',
    description: '被否决的方案、临时取舍和历史坑点没有稳定沉淀位置。',
    type: NodeType.growth,
    status: NodeStatus.completed,
  },

  {
    id: NODE.REQ_INTERVIEWS,
    parentId: NODE.REQUIREMENTS,
    title: '成员访谈',
    type: NodeType.scaffold,
    status: NodeStatus.completed,
  },
  {
    id: NODE.REQ_CORE_PROBLEM,
    parentId: NODE.REQUIREMENTS,
    title: '核心问题定义',
    type: NodeType.scaffold,
    status: NodeStatus.completed,
  },
  {
    id: NODE.REQ_BOUNDARIES,
    parentId: NODE.REQUIREMENTS,
    title: '流程边界梳理',
    type: NodeType.scaffold,
    status: NodeStatus.completed,
  },
  {
    id: NODE.REQ_HANDOFF_FINDING,
    parentId: NODE.REQ_INTERVIEWS,
    title: '访谈发现：接手者缺少判断上下文',
    type: NodeType.growth,
    status: NodeStatus.completed,
  },
  {
    id: NODE.REQ_UNDERSTANDING_NOT_EXECUTION,
    parentId: NODE.REQ_BOUNDARIES,
    title: '边界确认：理解而非执行',
    type: NodeType.growth,
    status: NodeStatus.completed,
  },

  {
    id: NODE.COMP_RESEARCH,
    parentId: NODE.COMPETITORS,
    title: '工具调研',
    type: NodeType.scaffold,
    status: NodeStatus.completed,
  },
  {
    id: NODE.COMP_COMPARISON,
    parentId: NODE.COMPETITORS,
    title: '方案对照',
    type: NodeType.scaffold,
    status: NodeStatus.completed,
  },
  {
    id: NODE.COMP_OLD_DOCS_PLAN,
    parentId: NODE.COMP_COMPARISON,
    title: '原飞书文档中心方案',
    description: '归档：文档中心能记录结论，但难以捕捉开发过程中的判断流转。',
    type: NodeType.scaffold,
    status: NodeStatus.archived,
  },
  {
    id: NODE.COMP_RESULT_TOOLS,
    parentId: NODE.COMP_RESEARCH,
    title: '竞品观察：现有工具偏记录结果',
    type: NodeType.growth,
    status: NodeStatus.completed,
  },
  {
    id: NODE.COMP_AGENT_EXECUTION,
    parentId: NODE.COMP_RESEARCH,
    title: '竞品观察：CrewAI 偏执行自动化',
    type: NodeType.growth,
    status: NodeStatus.completed,
  },

  {
    id: NODE.PRD_USER_STORIES,
    parentId: NODE.PRD,
    title: '用户故事拆分',
    type: NodeType.scaffold,
    status: NodeStatus.active,
  },
  {
    id: NODE.PRD_SCOPE,
    parentId: NODE.PRD,
    title: '范围收敛',
    type: NodeType.scaffold,
    status: NodeStatus.blocked,
  },
  {
    id: NODE.PRD_MVP_BOUNDARY,
    parentId: NODE.PRD_SCOPE,
    title: 'MVP 边界确认',
    type: NodeType.scaffold,
    status: NodeStatus.active,
  },
  {
    id: NODE.PRD_SCOPE_CHECKPOINT,
    parentId: NODE.PRD_SCOPE,
    title: '范围确认 checkpoint',
    description: '当前阻塞点：确认 MVP 是否继续排除自动执行型 agent 能力。',
    type: NodeType.scaffold,
    status: NodeStatus.blocked,
    isCheckpoint: true,
  },
  {
    id: NODE.PRD_NO_CODE_WRITING,
    parentId: NODE.PRD_MVP_BOUNDARY,
    title: '事件：砍掉自动写代码能力',
    type: NodeType.growth,
    status: NodeStatus.completed,
  },

  {
    id: NODE.TECH_GRAPH_PROTOTYPE,
    parentId: NODE.TECH,
    title: 'Graph 交互原型',
    type: NodeType.scaffold,
    status: NodeStatus.active,
  },
  {
    id: NODE.TECH_SCAFFOLD_GRAPH,
    parentId: NODE.TECH,
    title: 'Scaffold Graph 方案确认',
    type: NodeType.scaffold,
    status: NodeStatus.active,
  },
  {
    id: NODE.TECH_REVIEW_CHECKPOINT,
    parentId: NODE.TECH_SCAFFOLD_GRAPH,
    title: '技术方案评审 checkpoint',
    type: NodeType.scaffold,
    status: NodeStatus.active,
    isCheckpoint: true,
  },
  {
    id: NODE.TECH_ADAPTER_STRATEGY,
    parentId: NODE.TECH_SCAFFOLD_GRAPH,
    title: 'Adapter 接入策略',
    type: NodeType.scaffold,
    status: NodeStatus.active,
  },
  {
    id: NODE.TECH_OVER_CONSTRAINT_RISK,
    parentId: NODE.TECH_GRAPH_PROTOTYPE,
    title: '技术方案风险：Graph 过度约束',
    type: NodeType.growth,
    status: NodeStatus.blocked,
  },

  {
    id: NODE.DELIVERY_CANVAS,
    parentId: NODE.DELIVERY,
    title: 'Canvas 实现',
    type: NodeType.scaffold,
    status: NodeStatus.active,
  },
  {
    id: NODE.DELIVERY_REVIEW_CHECKPOINT,
    parentId: NODE.DELIVERY,
    title: '发布前复盘 checkpoint',
    type: NodeType.scaffold,
    status: NodeStatus.completed,
    isCheckpoint: true,
    resolution: CheckpointResolution.continue,
  },
  {
    id: NODE.DELIVERY_DIVE_IN_TEST,
    parentId: NODE.DELIVERY_CANVAS,
    title: '事件：Playwright 覆盖 dive-in',
    type: NodeType.growth,
    status: NodeStatus.completed,
    createdBy: CreatedBy.agent,
  },
]

const dependencies: DependencySpec[] = [
  { fromId: NODE.IDEA, toId: NODE.REQUIREMENTS },
  { fromId: NODE.REQUIREMENTS, toId: NODE.COMPETITORS },
  { fromId: NODE.COMPETITORS, toId: NODE.PRD },
  { fromId: NODE.PRD, toId: NODE.TECH },
  { fromId: NODE.TECH, toId: NODE.DELIVERY },
  { fromId: NODE.IDEA_PROBLEM, toId: NODE.IDEA_VALUE },
  { fromId: NODE.REQ_INTERVIEWS, toId: NODE.REQ_CORE_PROBLEM },
  { fromId: NODE.REQ_CORE_PROBLEM, toId: NODE.REQ_BOUNDARIES },
  { fromId: NODE.COMP_RESEARCH, toId: NODE.COMP_COMPARISON },
  { fromId: NODE.PRD_USER_STORIES, toId: NODE.PRD_SCOPE },
  { fromId: NODE.TECH_GRAPH_PROTOTYPE, toId: NODE.TECH_SCAFFOLD_GRAPH },
  { fromId: NODE.DELIVERY_CANVAS, toId: NODE.DELIVERY_REVIEW_CHECKPOINT },
  { fromId: NODE.IDEA_HANDOFF_FAILED, toId: NODE.IDEA_CONTEXT_LOST },
  { fromId: NODE.REQ_HANDOFF_FINDING, toId: NODE.REQ_CORE_PROBLEM },
  { fromId: NODE.COMP_RESULT_TOOLS, toId: NODE.PRD_MVP_BOUNDARY },
  { fromId: NODE.COMP_OLD_DOCS_PLAN, toId: NODE.TECH_SCAFFOLD_GRAPH },
  { fromId: NODE.REQ_UNDERSTANDING_NOT_EXECUTION, toId: NODE.TECH_ADAPTER_STRATEGY },
  { fromId: NODE.TECH_REVIEW_CHECKPOINT, toId: NODE.TECH_ADAPTER_STRATEGY },
  { fromId: NODE.TECH_OVER_CONSTRAINT_RISK, toId: NODE.PRD_SCOPE_CHECKPOINT },
  { fromId: NODE.PRD_NO_CODE_WRITING, toId: NODE.DELIVERY_CANVAS },
  { fromId: NODE.DELIVERY_DIVE_IN_TEST, toId: NODE.DELIVERY_REVIEW_CHECKPOINT, createdBy: CreatedBy.agent },
]

async function seedSemanticDemo(tx: PrismaTx): Promise<void> {
  await bootstrapProject(tx, {
    id: PROJECT_DEMO,
    name: '[demo] Zet Plane 项目开发流程',
    description:
      'A single semantic demo graph for Zet Plane: project idea, requirements, competitor analysis, PRD, technical planning, delivery, and review.',
    rootId: NODE.ROOT,
    rootTitle: 'Zet Plane 项目开发流程',
    rootDescription: '从 idea 到交付复盘的流程引导图；Scaffold 是流程，Growth 是事件。',
  })

  for (const spec of nodes) {
    await tx.node.create({
      data: {
        id: spec.id,
        projectId: PROJECT_DEMO,
        type: spec.type,
        status: spec.status,
        title: spec.title,
        description: spec.description,
        isCheckpoint: spec.isCheckpoint ?? false,
        checkpointResolution: spec.resolution ?? null,
        createdBy: spec.createdBy ?? CreatedBy.human,
        role: NodeRole.regular,
      },
    })
    await tx.edge.create({
      data: {
        projectId: PROJECT_DEMO,
        fromId: spec.parentId,
        toId: spec.id,
        type: EdgeType.composition,
        createdBy: spec.createdBy ?? CreatedBy.human,
      },
    })
  }

  for (const spec of dependencies) {
    await tx.edge.create({
      data: {
        projectId: PROJECT_DEMO,
        fromId: spec.fromId,
        toId: spec.toId,
        type: EdgeType.dependency,
        createdBy: spec.createdBy ?? CreatedBy.human,
      },
    })
  }

  await createEntry(tx, {
    projectId: PROJECT_DEMO,
    nodeId: NODE.REQ_CORE_PROBLEM,
    category: EntryCategory.finding,
    title: '接手者缺少判断上下文',
    body: {
      summary: '访谈中反复出现的问题不是读不懂代码，而是不知道为什么最终选择了这套实现。',
      details: 'GitHub 和飞书能记录结果，但无法稳定解释被否决方案、临时取舍和历史坑点。',
    },
    status: EntryStatus.published,
  })
  await createEntry(tx, {
    projectId: PROJECT_DEMO,
    nodeId: NODE.REQ_BOUNDARIES,
    category: EntryCategory.context,
    title: '四条产品边界原则',
    body: {
      summary: '理解而非执行、引导而非约束、沉淀面向人、适配端侧而非依赖端侧。',
      details: '这些原则用于判断 Agent 动作、流程控制、知识条目质量和外部工具接入边界。',
    },
    status: EntryStatus.published,
  })
  await createEntry(tx, {
    projectId: PROJECT_DEMO,
    nodeId: NODE.COMP_OLD_DOCS_PLAN,
    category: EntryCategory.pitfall,
    title: '文档中心方案被归档',
    body: {
      summary: '单独维护飞书文档容易回到结果沉淀，无法覆盖流程中的判断流转。',
      details: '方案归档后，知识条目必须锚定到 Scaffold Graph 的流程或事件节点。',
    },
    status: EntryStatus.published,
  })
  await createEntry(tx, {
    projectId: PROJECT_DEMO,
    nodeId: NODE.COMP_RESULT_TOOLS,
    category: EntryCategory.finding,
    title: '现有工具偏向已发生结果',
    body: {
      summary: 'GitHub、CI、飞书和看板已经能覆盖很多结果记录，但过程理解仍然断裂。',
      details: 'Zet Plane 的定位不是替代这些端侧工具，而是在其上方沉淀流程与判断。',
    },
    status: EntryStatus.published,
  })
  await createEntry(tx, {
    projectId: PROJECT_DEMO,
    nodeId: NODE.PRD_MVP_BOUNDARY,
    category: EntryCategory.decision,
    title: 'MVP 只做流程与知识沉淀',
    body: {
      summary: '首版不让 Agent 写代码、改配置、提 PR 或合并分支。',
      details: 'Agent 可以读取、分析、建议和记录；会改变项目内容的动作都留给人完成。',
    },
    status: EntryStatus.published,
  })
  await createEntry(tx, {
    projectId: PROJECT_DEMO,
    nodeId: NODE.PRD_SCOPE_CHECKPOINT,
    category: EntryCategory.decision,
    title: '范围确认仍在阻塞',
    body: {
      summary: '团队需要确认是否继续排除自动执行型能力，避免产品边界过早膨胀。',
      details: '该 checkpoint 阻塞 PRD 排期冻结，但不阻塞需求、竞品和原型继续沉淀。',
    },
    status: EntryStatus.draft,
  })
  await createEntry(tx, {
    projectId: PROJECT_DEMO,
    nodeId: NODE.TECH_SCAFFOLD_GRAPH,
    category: EntryCategory.decision,
    title: '选择 Scaffold Graph 作为流程骨架',
    body: {
      summary: '流程用 Scaffold 引导，事件与发现用 Growth 记录，跨流程影响用 dependency 表达。',
      details: '这让图既能表达主流程，也能容纳开发过程中自由生长出的事件。',
    },
    status: EntryStatus.published,
  })
  await createEntry(tx, {
    projectId: PROJECT_DEMO,
    nodeId: NODE.TECH_OVER_CONSTRAINT_RISK,
    category: EntryCategory.pitfall,
    title: 'Graph 不能变成流程锁',
    body: {
      summary: '如果 Scaffold Graph 被实现成强制流程闸门，就会制造新的流程磨损。',
      details: 'UI 和 Agent 都应强调引导与记录，而不是阻断成员继续推进工作。',
    },
    status: EntryStatus.published,
  })
  await createEntry(tx, {
    projectId: PROJECT_DEMO,
    nodeId: NODE.TECH_ADAPTER_STRATEGY,
    category: EntryCategory.context,
    title: 'Adapter 接入保持端侧无关',
    body: {
      summary: 'GitHub、飞书、QQ 群和监控平台都应通过 Adapter 接入核心模型。',
      details: '任何端侧替换都不应改变项目、节点、边和知识条目的核心语义。',
    },
    status: EntryStatus.published,
  })
  await createEntry(tx, {
    projectId: PROJECT_DEMO,
    nodeId: NODE.DELIVERY_REVIEW_CHECKPOINT,
    category: EntryCategory.finding,
    title: '发布前复盘已通过',
    body: {
      summary: 'Canvas 的 dive-in、breadcrumb、checkpoint glyph 和 dependency stub 已进入回归测试。',
      details: '后续优化方向是把 e2e 测试夹具从产品 demo seed 中拆出。',
    },
    status: EntryStatus.published,
    createdBy: CreatedBy.agent,
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

  console.log('[seed] inserting semantic demo…')
  await prisma.$transaction(async (tx) => {
    await seedSemanticDemo(tx)
  })

  console.log('[seed] done. Project:')
  console.log(`  /projects/${PROJECT_DEMO}/graph  -> [demo] Zet Plane 项目开发流程`)
}

main()
  .catch((err) => {
    console.error('[seed] FAILED:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
