# Canvas Display Fixture

**Date:** 2026-05-15
**Goal:** Seed the dev database with three curated projects that exercise every visual feature of the Graph Canvas v1, so the canvas can be developed and demoed against real data instead of an empty `/projects` list.

**Audience:** Frontend canvas testing and demos. This fixture is **NOT a regression test for the API surface** — backend regressions live in `apps/server/test/graph.e2e-spec.ts`. The fixture bypasses service-layer guards intentionally to construct end states (e.g. `completed` containers with completed children) that are otherwise multi-step.

## Decisions (grilled, captured)

| # | Decision | Choice |
|---|---|---|
| 1 | Write surface | Pure Prisma in one `$transaction` (the HTTP API can't create `growth`-typed or `agent`-created nodes — those fields are hardcoded in the controller; without Prisma you can't exercise the scaffold-vs-growth visual axis at all). |
| 2 | Runner | `prisma db seed` via `apps/server/prisma/seed.ts`; `pnpm seed` alias; adds `tsx` devDep. `prisma migrate reset` auto-runs the seed for free. |
| 3 | Framing | Frontend canvas display fixture. Project names prefixed `[demo]` so they're visually obvious in the projects list. Docstring at file top says explicitly "not for API regression". |
| 4 | Re-run policy | Scoped wipe by stable UUIDs (`00000000-0000-0000-0000-00000000000{1,2,3}`) — `deleteMany` rows owned by the seed, then insert. Coexisting user projects untouched. Guarded by `NODE_ENV !== 'production'`. |
| 5 | Coverage shape | Three projects: Full coverage (`...0001`), Empty (`...0002`), Compact (`...0003`). One rich project is needed to compare statuses side-by-side; empty needs its own project for the `rootOnly` EmptyState; compact is for deterministic Playwright. |
| 6 | Test coupling | Bundle deterministic node UUIDs + rewrite `canvas.spec.ts` to navigate to Compact by UUID and click Task A by `data-id` + add `orderBy: createdAt asc` to project list. |
| 7 | Bundled bug fix | `buildParentMap` filters composition edges whose `fromId` is not in `graph.nodes` (so root composition edges don't leak a non-existent parent into xyflow). Pre-existing issue exposed by seeding. |

## File structure

### Create

- `apps/server/prisma/seed.ts` — the seed script (single file, ~300 lines).
- `apps/web/src/features/graph/domain/build-parent-map.test.ts` — extend existing test file with one case ("ignores composition edges whose parent is not in graph.nodes"). No new file.

### Modify

- `apps/server/package.json` — add `tsx` devDep, `prisma.seed` field, `seed` script.
- `apps/server/src/project/repository/project.repository.ts` — add `orderBy: { createdAt: 'asc' }` to `list()`.
- `apps/web/src/features/graph/domain/build-parent-map.ts` — filter unknown-parent composition edges.
- `apps/web/e2e/canvas.spec.ts` — rewrite to target Compact project by UUID; click Task A by its known node UUID.

### Delete

None.

## UUID conventions

| UUID | Owner |
|---|---|
| `00000000-0000-0000-0000-000000000001` | Project: `[demo] Full coverage` |
| `00000000-0000-0000-0000-000000000002` | Project: `[demo] Empty project` |
| `00000000-0000-0000-0000-000000000003` | Project: `[demo] Compact 3-node` |
| `00000000-0000-0000-0001-00000000000X` | Nodes in Full coverage (X = 1..15, plus `0` for root, `9` for staging) |
| `00000000-0000-0000-0002-000000000000` | Root node of Empty |
| `00000000-0000-0000-0003-00000000000X` | Nodes in Compact (X = 0/1/2 = root/Task A/Task B) |

Edge IDs and knowledge entry IDs are not stable — `crypto.randomUUID()` is fine.

---

## Task 1: Server-side prep — add `orderBy` and Prisma seed wiring

**Files:**
- Modify: `apps/server/src/project/repository/project.repository.ts`
- Modify: `apps/server/package.json`

### Step 1.1 — Stable project list order

In `apps/server/src/project/repository/project.repository.ts`, change:

```ts
async list(): Promise<Project[]> {
  return this.prisma.project.findMany()
}
```

to:

```ts
async list(): Promise<Project[]> {
  return this.prisma.project.findMany({ orderBy: { createdAt: 'asc' } })
}
```

Run `pnpm test` from `apps/server`. If existing tests assert a specific order, they should still pass (asc-by-createdAt is the most natural and likely what they already expected). Fix anything that fails.

### Step 1.2 — Wire `prisma db seed`

In `apps/server/package.json`:

1. Under `devDependencies`, add `"tsx": "^4.20.6"` (or latest stable — verify with `npm view tsx dist-tags.latest`).
2. Add a top-level `prisma` field:
   ```json
   "prisma": {
     "seed": "tsx prisma/seed.ts"
   }
   ```
3. Under `scripts`, add `"seed": "prisma db seed"`.

Run `pnpm install` from the repo root to populate `node_modules` with `tsx`.

### Step 1.3 — Commit

```bash
git add apps/server/src/project/repository/project.repository.ts apps/server/package.json pnpm-lock.yaml
git commit -m "chore(server): wire prisma db seed runner and stable project list order"
```

---

## Task 2: Canvas-side prep — filter unknown parents in `buildParentMap`

**Files:**
- Modify: `apps/web/src/features/graph/domain/build-parent-map.ts`
- Modify: `apps/web/src/features/graph/domain/build-parent-map.test.ts`

### Step 2.1 — Write the failing test

Append to `build-parent-map.test.ts`:

```ts
it("ignores composition edges whose parent is not in graph.nodes", () => {
  // simulates the real project-root case: server returns top-level user nodes
  // (isProjectRoot=false) plus composition edges from the root, but the root
  // itself is not in the nodes list.
  const m = buildParentMap({
    nodes: [
      { id: "child", title: "x", /* …minimal fields… */ } as NodeResponse,
    ],
    edges: [
      { id: "e1", projectId: "p", fromId: "missing-root", toId: "child", type: "composition", createdBy: "human", createdAt: "2026-05-15T00:00:00Z" } as EdgeResponse,
    ],
  });

  expect(m.has("child")).toBe(false);
});
```

(Use the existing test file's helpers — match the shape of nearby cases. Don't invent new helpers.)

Run: `pnpm vitest run src/features/graph/domain/build-parent-map.test.ts`. Expected: fails.

### Step 2.2 — Make it pass

In `build-parent-map.ts`, build a `Set` of node IDs first and skip edges whose `fromId` isn't in it:

```ts
export function buildParentMap(graph: ProjectGraph): Map<string, string> {
  const map = new Map<string, string>();
  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  for (const edge of graph.edges) {
    if (edge.type !== "composition") continue;
    if (!nodeIds.has(edge.fromId)) continue;

    const existingParentId = map.get(edge.toId);
    if (existingParentId !== undefined && existingParentId !== edge.fromId) {
      throw new Error(
        `Duplicate composition parent for child ${edge.toId}: ${existingParentId} and ${edge.fromId}`,
      );
    }
    map.set(edge.toId, edge.fromId);
  }

  return map;
}
```

Run vitest again. Expected: pass + the existing tests still pass.

### Step 2.3 — Commit

```bash
git add apps/web/src/features/graph/domain/build-parent-map.ts apps/web/src/features/graph/domain/build-parent-map.test.ts
git commit -m "fix(web): buildParentMap ignores composition edges whose parent is not a visible node"
```

---

## Task 3: Implement the seed script

**Files:**
- Create: `apps/server/prisma/seed.ts`

### Step 3.1 — Skeleton

Create `apps/server/prisma/seed.ts` with this docstring + skeleton:

```ts
/**
 * Frontend canvas display fixture.
 *
 * Seeds three projects covering every visual feature of Graph Canvas v1:
 *   1. [demo] Full coverage — 15 nodes, all statuses, types, checkpoint
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
 * Run with: pnpm seed   (from apps/server)
 */

import { PrismaClient, NodeRole, NodeStatus, NodeType, EdgeType, CreatedBy, CheckpointResolution, EntryCategory, EntryStatus } from '../src/prisma/gen/client'

if (process.env.NODE_ENV === 'production') {
  throw new Error('seed.ts refuses to run with NODE_ENV=production')
}

const prisma = new PrismaClient()

// ─── Stable UUIDs ────────────────────────────────────────────────────────────

const PROJECT_FULL    = '00000000-0000-0000-0000-000000000001'
const PROJECT_EMPTY   = '00000000-0000-0000-0000-000000000002'
const PROJECT_COMPACT = '00000000-0000-0000-0000-000000000003'

const SEED_PROJECT_IDS = [PROJECT_FULL, PROJECT_EMPTY, PROJECT_COMPACT] as const

// Helper for project-scoped node UUIDs (deterministic across runs)
const fullNode    = (i: number) => `00000000-0000-0000-0001-${String(i).padStart(12, '0')}`
const emptyNode   = (i: number) => `00000000-0000-0000-0002-${String(i).padStart(12, '0')}`
const compactNode = (i: number) => `00000000-0000-0000-0003-${String(i).padStart(12, '0')}`

// ─── Wipe ────────────────────────────────────────────────────────────────────

async function wipeSeedProjects(): Promise<void> {
  await prisma.$transaction([
    prisma.knowledgeRevision.deleteMany({
      where: { entry: { projectId: { in: [...SEED_PROJECT_IDS] } } },
    }),
    prisma.knowledgeEntry.deleteMany({ where: { projectId: { in: [...SEED_PROJECT_IDS] } } }),
    prisma.edge.deleteMany({ where: { projectId: { in: [...SEED_PROJECT_IDS] } } }),
    prisma.node.deleteMany({ where: { projectId: { in: [...SEED_PROJECT_IDS] } } }),
    prisma.project.deleteMany({ where: { id: { in: [...SEED_PROJECT_IDS] } } }),
  ])
}
```

Note: `knowledgeRevision.deleteMany` uses a relational filter — verify that the Prisma client generates the `entry` relation. If it doesn't (e.g. no `entry` relation field in the schema; only the FK column exists), fall back to `where: { entryId: { in: (await listEntryIds) } }`. Check the schema before writing this query.

Actually — the schema as it stands has `KnowledgeRevision.entryId` but no relation field. So the relational filter won't work; use a two-step delete:

```ts
const entryIds = (await prisma.knowledgeEntry.findMany({
  where: { projectId: { in: [...SEED_PROJECT_IDS] } },
  select: { id: true },
})).map((r) => r.id)

await prisma.$transaction([
  prisma.knowledgeRevision.deleteMany({ where: { entryId: { in: entryIds } } }),
  prisma.knowledgeEntry.deleteMany({ where: { projectId: { in: [...SEED_PROJECT_IDS] } } }),
  prisma.edge.deleteMany({ where: { projectId: { in: [...SEED_PROJECT_IDS] } } }),
  prisma.node.deleteMany({ where: { projectId: { in: [...SEED_PROJECT_IDS] } } }),
  prisma.project.deleteMany({ where: { id: { in: [...SEED_PROJECT_IDS] } } }),
])
```

### Step 3.2 — Project + root bootstrap helper

Mirror what `graph.repository.initProjectRootTx` does, since we're bypassing the service:

```ts
async function bootstrapProject(
  tx: PrismaTx,
  args: { id: string; name: string; description?: string; rootId: string; stagingId: string },
): Promise<{ rootId: string }> {
  const now = new Date()
  await tx.project.create({
    data: { id: args.id, name: args.name, description: args.description, createdAt: now, updatedAt: now },
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
  await tx.node.create({
    data: {
      id: args.stagingId,
      projectId: args.id,
      role: NodeRole.staging_root,
      type: NodeType.staging,
      title: '[Staging Area]',
      createdBy: CreatedBy.human,
    },
  })
  return { rootId: args.rootId }
}
```

`PrismaTx` is the transaction client type. Import or alias appropriately — Prisma 7 exposes `Prisma.TransactionClient`. Match whatever the rest of the codebase uses for transaction parameter types.

### Step 3.3 — Full coverage project body

Inside `seedFullCoverage(tx)`:

Define the manifest as a typed array, then iterate:

```ts
type LeafSpec = {
  id: string
  parentId: string
  title: string
  type: NodeType
  status: NodeStatus
  isCheckpoint?: boolean
  resolution?: CheckpointResolution | null
  createdBy?: CreatedBy
  description?: string
}

const ROOT   = fullNode(0)
const STAG   = fullNode(9)  // staging — not displayed
const A      = fullNode(10) // Container A: Backend platform
const B      = fullNode(11) // Container B: Search rollout
const C      = fullNode(12) // Container C: Mobile app
const AUTH   = fullNode(20)
const DBMIG  = fullNode(21)
const CACHE  = fullNode(22)
const LEGAUTH= fullNode(23)
const IDX    = fullNode(30)
const QAPI   = fullNode(31)
const IOS    = fullNode(40)
const PUSH   = fullNode(41)
const TELE   = fullNode(50)
const PERF   = fullNode(51)

const leaves: LeafSpec[] = [
  { id: A,       parentId: ROOT, title: 'Backend platform',  type: NodeType.scaffold, status: NodeStatus.active },
  { id: B,       parentId: ROOT, title: 'Search rollout',    type: NodeType.scaffold, status: NodeStatus.completed },
  { id: C,       parentId: ROOT, title: 'Mobile app',        type: NodeType.growth,   status: NodeStatus.active },
  { id: TELE,    parentId: ROOT, title: 'Telemetry pipeline',type: NodeType.scaffold, status: NodeStatus.active,    createdBy: CreatedBy.agent },
  { id: PERF,    parentId: ROOT, title: 'Performance audit', type: NodeType.scaffold, status: NodeStatus.blocked },

  { id: AUTH,    parentId: A,    title: 'Auth service',      type: NodeType.scaffold, status: NodeStatus.blocked,   isCheckpoint: true, resolution: null },
  { id: DBMIG,   parentId: A,    title: 'Database migration',type: NodeType.scaffold, status: NodeStatus.completed },
  { id: CACHE,   parentId: A,    title: 'Cache layer',       type: NodeType.growth,   status: NodeStatus.active },
  { id: LEGAUTH, parentId: A,    title: 'Legacy auth',       type: NodeType.scaffold, status: NodeStatus.archived },

  { id: IDX,     parentId: B,    title: 'Index builder',     type: NodeType.scaffold, status: NodeStatus.completed },
  { id: QAPI,    parentId: B,    title: 'Query API',         type: NodeType.scaffold, status: NodeStatus.completed, isCheckpoint: true, resolution: CheckpointResolution.continue },

  { id: IOS,     parentId: C,    title: 'iOS shell',         type: NodeType.scaffold, status: NodeStatus.active },
  { id: PUSH,    parentId: C,    title: 'Push notifications',type: NodeType.growth,   status: NodeStatus.blocked,   isCheckpoint: true, resolution: CheckpointResolution.loop },
]

// Insert nodes
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
  // Composition edge from parent
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

// Dependency edges
const deps: Array<{ fromId: string; toId: string }> = [
  { fromId: IOS,   toId: AUTH },     // active -> blocked
  { fromId: PUSH,  toId: QAPI },     // blocked -> completed
  { fromId: CACHE, toId: DBMIG },    // active -> completed
  { fromId: TELE,  toId: CACHE },    // active -> active
  { fromId: AUTH,  toId: LEGAUTH },  // blocked -> archived
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
```

### Step 3.4 — Knowledge entries

Add a helper that creates an entry with its initial revision (mirroring `knowledge.repository.createEntryWithRevision`):

```ts
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
  const id = crypto.randomUUID()
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
      id: crypto.randomUUID(),
      entryId: id,
      version: 1,
      body: args.body,
      createdBy: args.createdBy ?? CreatedBy.human,
    },
  })
}
```

Entries to create:

| Anchor node | Category | Status | Title | Body |
|---|---|---|---|---|
| `DBMIG` | decision | published | "Adopt online-DDL migration strategy" | `{ summary: "Switch from gh-ost to native pg_repack for online schema changes.", details: "..." }` |
| `DBMIG` | finding | draft | "Replica lag spike during long DDL" | `{ summary: "Lag exceeded 30s on the analytics replica during last week's migration.", details: "..." }` |
| `CACHE` | context | published | "TTL strategy" | `{ summary: "Read-through with 5-minute TTL on most read endpoints; bypass for billing.", details: "..." }` |
| `IOS` | decision | published | "Adopt SwiftUI for all new screens" | `{ ... }` |
| `IOS` | pitfall | draft | "Background-task scheduling on iOS 17" | `{ ... }` |
| `IOS` | finding | deprecated | "TLS pinning broke OTA" | `{ ... }` |
| `IOS` | context | published | "Build matrix" | `{ ... }` |

Total: 7 entries. iOS shell ends up with K4 (one of each category), DBMIG with K2, CACHE with K1.

### Step 3.5 — Compact and Empty projects

```ts
async function seedCompact(tx: PrismaTx): Promise<void> {
  const ROOT  = compactNode(0)
  const TASK_A = compactNode(1)
  const TASK_B = compactNode(2)
  await bootstrapProject(tx, {
    id: PROJECT_COMPACT,
    name: '[demo] Compact 3-node',
    description: 'Tiny deterministic graph used by Playwright canvas spec.',
    rootId: ROOT,
    stagingId: compactNode(9),
  })
  // Task A and Task B as children of root
  for (const [id, title, status] of [
    [TASK_A, 'Task A', NodeStatus.active],
    [TASK_B, 'Task B', NodeStatus.blocked],
  ] as const) {
    await tx.node.create({
      data: { id, projectId: PROJECT_COMPACT, type: NodeType.scaffold, status, title, createdBy: CreatedBy.human, role: NodeRole.regular },
    })
    await tx.edge.create({
      data: { projectId: PROJECT_COMPACT, fromId: ROOT, toId: id, type: EdgeType.composition, createdBy: CreatedBy.human },
    })
  }
  // Dependency: Task A -> Task B
  await tx.edge.create({
    data: { projectId: PROJECT_COMPACT, fromId: TASK_A, toId: TASK_B, type: EdgeType.dependency, createdBy: CreatedBy.human },
  })
}

async function seedEmpty(tx: PrismaTx): Promise<void> {
  await bootstrapProject(tx, {
    id: PROJECT_EMPTY,
    name: '[demo] Empty project',
    description: 'Root-only project that drives the rootOnly EmptyState.',
    rootId: emptyNode(0),
    stagingId: emptyNode(9),
  })
}
```

### Step 3.6 — Main

```ts
async function main(): Promise<void> {
  console.log('[seed] wiping seed-owned projects…')
  await wipeSeedProjects()

  console.log('[seed] inserting fixture…')
  await prisma.$transaction(async (tx) => {
    await seedFullCoverage(tx)
    await seedEmpty(tx)
    await seedCompact(tx)
  })

  console.log('[seed] done. Projects:')
  console.log('  /projects/' + PROJECT_FULL    + '/graph  -> [demo] Full coverage')
  console.log('  /projects/' + PROJECT_EMPTY   + '/graph  -> [demo] Empty project')
  console.log('  /projects/' + PROJECT_COMPACT + '/graph  -> [demo] Compact 3-node')
}

main()
  .catch((err) => {
    console.error('[seed] FAILED:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

### Step 3.7 — Run it

```bash
cd apps/server
pnpm seed
```

Expected:
- Script completes in <2s.
- `psql` query: `SELECT name FROM projects WHERE id LIKE '00000000-0000-0000-0000-%';` shows the three rows.
- Visit `http://localhost:3001/projects` → three `[demo]` rows visible in sorted order.
- Click "Full coverage" → canvas renders with status-tinted nodes, dashed-bordered growth nodes, K-badges, checkpoint flags, container aggregation tints.
- Click "Empty project" → `EmptyState rootOnly` ("This project doesn't have any work nodes yet.").
- Click "Compact 3-node" → 2 nodes + 1 dep edge.

### Step 3.8 — Re-run smoke

Run `pnpm seed` again. Should succeed cleanly (wipe deletes old rows, fresh insert). Visit the canvas again — same fixture state.

### Step 3.9 — Commit

```bash
git add apps/server/prisma/seed.ts
git commit -m "feat(server): canvas display fixture - seed 3 projects covering all visual axes"
```

---

## Task 4: Rewrite Playwright canvas spec

**Files:**
- Modify: `apps/web/e2e/canvas.spec.ts`

### Step 4.1 — Replace contents

```ts
import { expect, test } from "@playwright/test";

const COMPACT_PROJECT_ID = "00000000-0000-0000-0000-000000000003";
const TASK_A_NODE_ID     = "00000000-0000-0000-0003-000000000001";

test("graph canvas renders and selection updates URL", async ({ page, baseURL }) => {
  await page.goto(`${baseURL ?? "http://localhost:3001"}/projects/${COMPACT_PROJECT_ID}/graph`);

  // xyflow's root container mounts
  await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10000 });

  // Task A node mounts (data-id is set by xyflow on every node wrapper)
  const taskA = page.locator(`[data-id="${TASK_A_NODE_ID}"]`);
  await expect(taskA).toBeVisible({ timeout: 10000 });

  // Click; URL gains ?nodeId=
  await taskA.click();
  await expect(page).toHaveURL(new RegExp(`nodeId=${TASK_A_NODE_ID}`));

  // DetailPanel shows the node title
  await expect(page.getByRole("heading", { level: 2, name: "Task A" })).toBeVisible();
});
```

### Step 4.2 — Run (manual)

This requires the dev server running AND the seed applied. Document a one-line setup in `apps/web/README.md` if absent:

```bash
# from apps/server
pnpm seed && pnpm dev
# from apps/web (another terminal)
pnpm test:e2e
```

Don't actually run it as part of plan execution unless the user has the API running — note in the report that the test compiles and matches the seeded fixture but requires live infrastructure to exercise.

### Step 4.3 — Commit

```bash
git add apps/web/e2e/canvas.spec.ts
git commit -m "test(web): canvas spec targets seeded Compact project deterministically"
```

---

## Task 5: Final verification

### Step 5.1 — Cross-cutting checks

From repo root:

```bash
cd apps/server && pnpm test                  # backend unit suite still green
cd apps/server && pnpm test:e2e              # backend e2e still green
cd apps/web && pnpm vitest run               # frontend unit + the new build-parent-map case
cd apps/web && pnpm tsc -b --noEmit          # frontend types
cd apps/web && pnpm exec biome check .       # frontend lint (existing warnings only)
cd /repo-root && pnpm -w build               # full build
```

All must pass.

### Step 5.2 — Browser smoke (manual)

With API + dev server running:

- `/projects` shows three `[demo]` projects in alphabetical-ish order (by createdAt asc).
- Full coverage canvas: count nodes, verify 4 statuses are visually present, verify growth nodes have dashed borders, verify K-badges show on iOS shell + Cache + DB migration, verify checkpoint flag glyph on 3 nodes, verify container A tints red (worst=blocked), container B tints green (sealed completed), container C tints red (push blocked).
- DetailPanel: select iOS shell → 4 entries visible, one per category; expand one → JSON body renders.
- Select Telemetry pipeline → DetailPanel shows `created by: agent`.
- Empty project: only "This project doesn't have any work nodes yet." renders.
- ProjectSwitcher in left rail: dropdown shows all three projects, switching navigates correctly.

### Step 5.3 — Optional Playwright

If running e2e is feasible (DB + API + dev server up):

```bash
cd apps/web && pnpm test:e2e
```

Expected: `canvas.spec.ts` passes.

### Step 5.4 — Final commit (only if cleanup happened)

If verification surfaced minor cleanups, commit them. Otherwise no final commit.

---

## Out of scope (deferred)

- **Knowledge revision history** — Each entry gets one revision (version 1). Multi-version histories aren't needed for the canvas (no UI surface yet).
- **Embeddings** — Left unindexed (`EmbeddingStatus.unindexed`, embedding column null). No vector search demo in v1.
- **Cycle/blocked edge demos** — The service forbids cycles; canvas v1 doesn't visualize cycle resolution.
- **Staging nodes** — Out of canvas v1 scope; we create the staging root only because the bootstrap demands it, but it's `isProjectRoot=false, role=staging_root` so it doesn't appear in `listNodes` (which filters `isProjectRoot=false` but doesn't filter `role`). Actually — verify this. If staging nodes leak into `listNodes`, we need to add a filter. Worst case the canvas shows a stray "[Staging Area]" node.

**Action item embedded in Task 3:** double-check `listProjectNodes` — if it doesn't filter out `role=staging_root`, the seeded staging nodes will be rendered. If so, EITHER (a) skip creating the staging node entirely in seed (the service code requires it but the seed bypasses the service; canvas data doesn't need it), OR (b) add `role: NodeRole.regular` filter in `listProjectNodes`. Prefer (a) — minimal scope, since canvas v1 explicitly defers staging.
