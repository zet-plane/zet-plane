# Graph Canvas v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read-only, status-aware Graph Canvas inside `apps/web` that renders the full project graph (nested composition containers + status-aware dependency edges) for a selected project, with selection-driven URL state, a rich detail panel showing knowledge entries, and the chrome (legend, minimap, "Updated Xs ago") that makes the gestalt legible.

**Architecture:** Two-query read path through `@zet-plane/contracts` endpoints. Pure-function domain layer for topology hashing and container status aggregation. Layout pipeline: `@chenglou/pretext` text measurement → `elkjs` hierarchical layout (in a Web Worker) → `@xyflow/react` render with custom `NodeCard` / `ContainerCard` / `DependencyEdge` types. CSS custom properties for the entire status palette. TanStack Router file-based routing under `projects.*` with selection in `?nodeId=`.

**Tech Stack:** Vite 8, React 19, TypeScript, `@tanstack/react-router`, `@tanstack/react-query` v5, `@xyflow/react` v12, `elkjs`, `@chenglou/pretext`, Zustand v5, Tailwind v4, shadcn/ui, Vitest + happy-dom + @testing-library/react, Playwright.

**Reference spec:** [docs/superpowers/specs/2026-05-14-graph-canvas-v1-design.md](../specs/2026-05-14-graph-canvas-v1-design.md)

---

## File Structure

All paths relative to repo root.

### Create (new)

- `apps/web/src/features/graph/domain/types.ts` — `ProjectGraph`, `LayoutedGraph`, `AggregatedStatus`, status enums re-exported.
- `apps/web/src/features/graph/domain/topology-hash.ts` — pure function: stable hash over the topology-affecting fields.
- `apps/web/src/features/graph/domain/topology-hash.test.ts`
- `apps/web/src/features/graph/domain/aggregate-status.ts` — pure function: walk composition tree and return per-container status counts + worst-child status.
- `apps/web/src/features/graph/domain/aggregate-status.test.ts`
- `apps/web/src/features/graph/domain/build-parent-map.ts` — pure: derive `Map<nodeId, parentId>` from composition edges.
- `apps/web/src/features/graph/domain/build-parent-map.test.ts`
- `apps/web/src/features/graph/hooks/use-project-graph.ts` — combined TanStack Query hook returning `ProjectGraph`.
- `apps/web/src/features/graph/hooks/use-project-graph.test.ts`
- `apps/web/src/features/graph/hooks/use-node-entries.ts` — knowledge entries for selected node.
- `apps/web/src/features/graph/layout/measure-text.ts` — thin `pretext` wrapper that returns `{width, height}` for a node's text block.
- `apps/web/src/features/graph/layout/measure-text.test.ts`
- `apps/web/src/features/graph/layout/elk-layout.ts` — pure async function `layoutGraph(input): Promise<output>` using `elkjs`.
- `apps/web/src/features/graph/layout/elk-layout.test.ts`
- `apps/web/src/features/graph/layout/elk.worker.ts` — Web Worker entry that imports and exposes `layoutGraph`.
- `apps/web/src/features/graph/layout/use-layouted-graph.ts` — hook: pretext measure → ELK (via worker) → memoize by topology hash.
- `apps/web/src/features/graph/components/GraphCanvas.tsx` — the `<ReactFlow>` shell + custom node/edge type registration.
- `apps/web/src/features/graph/components/NodeCard.tsx` — leaf node visual.
- `apps/web/src/features/graph/components/ContainerCard.tsx` — parent/container node with tint + badge.
- `apps/web/src/features/graph/components/DependencyEdge.tsx` — status-aware edge component.
- `apps/web/src/features/graph/components/DetailPanel.tsx` — right-side panel.
- `apps/web/src/features/graph/components/Legend.tsx` — color/border/glyph legend chrome.
- `apps/web/src/features/graph/components/UpdatedAgo.tsx` — "Updated Xs ago" chip with manual refetch.
- `apps/web/src/features/graph/components/ProjectSwitcher.tsx` — left-rail project picker.
- `apps/web/src/features/graph/components/EmptyState.tsx` — empty/loading/error renderers (single file, three exports).
- `apps/web/src/features/graph/styles.css` — status tokens + `.zp-status-*` utility classes scoped to this feature.
- `apps/web/src/features/projects/hooks/use-projects-list.ts` — list query.
- `apps/web/src/features/projects/hooks/use-projects-list.test.ts`
- `apps/web/src/router/projects.tsx` — `/projects` list page.
- `apps/web/src/router/projects.$projectId.tsx` — layout route (left rail + breadcrumb + Outlet).
- `apps/web/src/router/projects.$projectId.graph.tsx` — Canvas route.
- `apps/web/e2e/canvas.spec.ts` — Playwright smoke.

### Modify

- `apps/web/package.json` — add `elkjs`, `@chenglou/pretext`.
- `apps/web/src/router/index.tsx` — REPLACE with `redirect` to `/projects`.
- `apps/web/src/lib/schemas/graph-search.ts` — REPLACE: single `nodeId` optional field; drop legacy `projectId`/`zoom`/`x`/`y` (project moves to route param, viewport is not URL-persisted).
- `apps/web/src/lib/schemas/graph-search.test.ts` — CREATE alongside the change.
- `apps/web/src/stores/graph-view.store.ts` — REPLACE: keep only transient UI state (hover, focus, panel pin). Nodes/edges/selection move out (server data → TanStack Query; selection → URL).
- `apps/web/src/stores/graph-view.store.test.ts` — REWRITE matching new shape.
- `apps/web/src/index.css` — APPEND status palette tokens at the `:root` block.
- `apps/web/src/test/setup.ts` — APPEND ResizeObserver / matchMedia stubs (xyflow needs them under happy-dom).

### Delete

- The `CreateNodePanel` and demo `initialNodes`/`initialEdges` constants in `apps/web/src/router/index.tsx` disappear with that file's replacement; nothing else gets deleted.

---

## Task 1: Install dependencies

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Check current latest versions**

Run: `cd apps/web && npm view elkjs dist-tags.latest && npm view @chenglou/pretext dist-tags.latest`
Expected: prints two version strings (record them, use those exact versions in the next step).

- [ ] **Step 2: Add dependencies**

Run: `cd apps/web && pnpm add elkjs @chenglou/pretext`
Expected: both lines appear in `package.json` dependencies; no peer warnings.

- [ ] **Step 3: Verify install**

Run: `cd apps/web && pnpm install`
Expected: `Done in …` with no errors. `node_modules/elkjs` and `node_modules/@chenglou/pretext` exist.

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add elkjs and @chenglou/pretext for graph canvas layout"
```

---

## Task 2: Status color tokens in index.css

**Files:**
- Modify: `apps/web/src/index.css` (append to existing `:root` block)

- [ ] **Step 1: Add the token block**

Open `apps/web/src/index.css` and append the following inside the existing `:root { ... }` block (just before its closing brace, after `--sidebar-ring`):

```css
  /* Graph Canvas — status palette (blue-toned v1) */
  --zp-status-active: oklch(0.62 0.18 250);
  --zp-status-active-bg: oklch(0.95 0.04 250);
  --zp-status-blocked: oklch(0.58 0.21 25);
  --zp-status-blocked-bg: oklch(0.95 0.05 25);
  --zp-status-completed: oklch(0.62 0.16 150);
  --zp-status-completed-bg: oklch(0.95 0.04 150);
  --zp-status-archived: oklch(0.60 0 0);
  --zp-status-archived-bg: oklch(0.95 0 0);

  /* Graph Canvas — accents */
  --zp-selection-ring: oklch(0.55 0.20 285);
  --zp-badge-neutral: oklch(0.50 0 0);

  /* Graph Canvas — edge dim opacity for focus mode */
  --zp-edge-dim-opacity: 0.18;
```

- [ ] **Step 2: Visual smoke check (manual)**

Run: `cd apps/web && pnpm dev` (in another terminal)
Expected: server boots on port 3001 with no console error about CSS parsing. Stop after confirming.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/index.css
git commit -m "feat(web): add graph canvas status palette tokens"
```

---

## Task 3: Replace graph-search schema with nodeId-only

**Files:**
- Modify: `apps/web/src/lib/schemas/graph-search.ts`
- Create: `apps/web/src/lib/schemas/graph-search.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/schemas/graph-search.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { graphSearchSchema } from "./graph-search";

describe("graphSearchSchema", () => {
  it("accepts an empty object", () => {
    expect(graphSearchSchema.parse({})).toEqual({});
  });

  it("accepts a nodeId", () => {
    expect(graphSearchSchema.parse({ nodeId: "n1" })).toEqual({ nodeId: "n1" });
  });

  it("strips unknown keys", () => {
    expect(graphSearchSchema.parse({ nodeId: "n1", zoom: 2 })).toEqual({ nodeId: "n1" });
  });

  it("rejects non-string nodeId", () => {
    expect(() => graphSearchSchema.parse({ nodeId: 5 })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run src/lib/schemas/graph-search.test.ts`
Expected: tests fail (current schema has `projectId`/`zoom`/`x`/`y` and does not strip unknown keys).

- [ ] **Step 3: Rewrite the schema**

Replace the entire contents of `apps/web/src/lib/schemas/graph-search.ts` with:

```ts
import { z } from "zod";

export const graphSearchSchema = z
  .object({
    nodeId: z.string().min(1).optional(),
  })
  .strip();

export type GraphSearch = z.infer<typeof graphSearchSchema>;
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd apps/web && pnpm vitest run src/lib/schemas/graph-search.test.ts`
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/schemas/graph-search.ts apps/web/src/lib/schemas/graph-search.test.ts
git commit -m "feat(web): simplify graph search params to nodeId only"
```

---

## Task 4: Reduce graph-view store to transient UI state

**Files:**
- Modify: `apps/web/src/stores/graph-view.store.ts`
- Modify: `apps/web/src/stores/graph-view.store.test.ts`

Rationale: TanStack Query owns server data (nodes/edges). URL owns selection. Zustand only owns transient UI state — currently just `hoveredNodeId` for the focus-dim behavior.

- [ ] **Step 1: Rewrite the test**

Replace `apps/web/src/stores/graph-view.store.test.ts` with:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useGraphViewStore } from "./graph-view.store";

beforeEach(() => {
  useGraphViewStore.setState({ hoveredNodeId: null });
});

describe("useGraphViewStore", () => {
  it("starts with no hovered node", () => {
    expect(useGraphViewStore.getState().hoveredNodeId).toBeNull();
  });

  it("sets hoveredNodeId", () => {
    useGraphViewStore.getState().setHoveredNodeId("n1");
    expect(useGraphViewStore.getState().hoveredNodeId).toBe("n1");
  });

  it("clears hoveredNodeId on null", () => {
    useGraphViewStore.getState().setHoveredNodeId("n1");
    useGraphViewStore.getState().setHoveredNodeId(null);
    expect(useGraphViewStore.getState().hoveredNodeId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `cd apps/web && pnpm vitest run src/stores/graph-view.store.test.ts`
Expected: failures referencing `setHoveredNodeId` not a function.

- [ ] **Step 3: Rewrite the store**

Replace `apps/web/src/stores/graph-view.store.ts`:

```ts
import { create } from "zustand";

interface GraphViewState {
  hoveredNodeId: string | null;
  setHoveredNodeId: (id: string | null) => void;
}

export const useGraphViewStore = create<GraphViewState>((set) => ({
  hoveredNodeId: null,
  setHoveredNodeId: (hoveredNodeId) => set({ hoveredNodeId }),
}));
```

- [ ] **Step 4: Run test to confirm pass**

Run: `cd apps/web && pnpm vitest run src/stores/graph-view.store.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/stores/graph-view.store.ts apps/web/src/stores/graph-view.store.test.ts
git commit -m "refactor(web): graph-view store keeps only transient hover state"
```

---

## Task 5: Domain types

**Files:**
- Create: `apps/web/src/features/graph/domain/types.ts`

- [ ] **Step 1: Create the types file**

```ts
import type { NodeResponse, EdgeResponse } from "@zet-plane/contracts";

export type ProjectGraph = {
  nodes: NodeResponse[];
  edges: EdgeResponse[];
};

export type AggregatedStatus = {
  worst: "blocked" | "active" | "completed" | "archived" | null;
  counts: {
    blocked: number;
    active: number;
    completed: number;
    archived: number;
  };
};

export type LayoutedNode = NodeResponse & {
  width: number;
  height: number;
  position: { x: number; y: number };
  parentId: string | null;
};

export type LayoutedGraph = {
  nodes: LayoutedNode[];
  edges: EdgeResponse[];
};
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm tsc -b --noEmit`
Expected: no errors (or only errors in unrelated existing files; this file alone must compile).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/graph/domain/types.ts
git commit -m "feat(web): add graph domain types"
```

---

## Task 6: Topology hash pure function

**Files:**
- Create: `apps/web/src/features/graph/domain/topology-hash.ts`
- Create: `apps/web/src/features/graph/domain/topology-hash.test.ts`

A stable hash over the layout-affecting fields, used as memo key for the layout pipeline so that re-renders triggered by status/selection do not re-run ELK.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { topologyHash } from "./topology-hash";
import type { ProjectGraph } from "./types";

const g = (n: { id: string; pid?: string; title?: string }[], e: { id: string; from: string; to: string; type?: "composition" | "dependency" }[]): ProjectGraph => ({
  nodes: n.map(({ id, title }) => ({
    id, projectId: "p", isProjectRoot: false, role: "regular",
    type: "scaffold", title: title ?? id, description: null,
    status: "active", isCheckpoint: false, checkpointResolution: null,
    createdBy: "human", createdAt: "2026-05-14T00:00:00Z", updatedAt: "2026-05-14T00:00:00Z",
  })),
  edges: e.map(({ id, from, to, type }) => ({
    id, projectId: "p", fromId: from, toId: to,
    type: type ?? "composition", createdBy: "human", createdAt: "2026-05-14T00:00:00Z",
  })),
});

describe("topologyHash", () => {
  it("is stable across array reorderings", () => {
    const a = g([{ id: "n1" }, { id: "n2" }], [{ id: "e1", from: "n1", to: "n2" }]);
    const b = g([{ id: "n2" }, { id: "n1" }], [{ id: "e1", from: "n1", to: "n2" }]);
    expect(topologyHash(a)).toBe(topologyHash(b));
  });

  it("changes when a node is added", () => {
    const a = g([{ id: "n1" }], []);
    const b = g([{ id: "n1" }, { id: "n2" }], []);
    expect(topologyHash(a)).not.toBe(topologyHash(b));
  });

  it("changes when an edge type changes", () => {
    const a = g([{ id: "n1" }, { id: "n2" }], [{ id: "e1", from: "n1", to: "n2", type: "composition" }]);
    const b = g([{ id: "n1" }, { id: "n2" }], [{ id: "e1", from: "n1", to: "n2", type: "dependency" }]);
    expect(topologyHash(a)).not.toBe(topologyHash(b));
  });

  it("does NOT change when only node title changes", () => {
    const a = g([{ id: "n1", title: "A" }], []);
    const b = g([{ id: "n1", title: "B" }], []);
    expect(topologyHash(a)).toBe(topologyHash(b));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm vitest run src/features/graph/domain/topology-hash.test.ts`
Expected: "Cannot find module './topology-hash'".

- [ ] **Step 3: Implement**

Create `apps/web/src/features/graph/domain/topology-hash.ts`:

```ts
import type { ProjectGraph } from "./types";

export function topologyHash(graph: ProjectGraph): string {
  const nodes = graph.nodes
    .map((n) => n.id)
    .sort()
    .join("|");
  const edges = graph.edges
    .map((e) => `${e.id}:${e.fromId}>${e.toId}:${e.type}`)
    .sort()
    .join("|");
  return `${nodes}#${edges}`;
}
```

Note: title/description/status/checkpoint/createdBy are *not* layout-affecting. Only node ids and edge (id, endpoints, type) are. Text width is captured separately by the measurement step.

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && pnpm vitest run src/features/graph/domain/topology-hash.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/graph/domain/topology-hash.ts apps/web/src/features/graph/domain/topology-hash.test.ts
git commit -m "feat(web): add topology hash for layout memoization"
```

---

## Task 7: Parent map (composition tree derivation)

**Files:**
- Create: `apps/web/src/features/graph/domain/build-parent-map.ts`
- Create: `apps/web/src/features/graph/domain/build-parent-map.test.ts`

Composition edges express parent→child. We need `Map<childId, parentId>` for both ELK (parentId on nodes) and aggregation (walking up).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildParentMap } from "./build-parent-map";
import type { ProjectGraph } from "./types";

const mkEdges = (pairs: [string, string][]): ProjectGraph["edges"] =>
  pairs.map(([from, to], i) => ({
    id: `e${i}`, projectId: "p", fromId: from, toId: to,
    type: "composition", createdBy: "human", createdAt: "2026-05-14T00:00:00Z",
  }));

describe("buildParentMap", () => {
  it("returns empty map when no composition edges", () => {
    const m = buildParentMap({ nodes: [], edges: [] });
    expect(m.size).toBe(0);
  });

  it("maps child to parent for composition edges", () => {
    const m = buildParentMap({ nodes: [], edges: mkEdges([["root", "a"], ["root", "b"], ["a", "c"]]) });
    expect(m.get("a")).toBe("root");
    expect(m.get("b")).toBe("root");
    expect(m.get("c")).toBe("a");
  });

  it("ignores dependency edges", () => {
    const m = buildParentMap({
      nodes: [],
      edges: [
        { id: "e1", projectId: "p", fromId: "a", toId: "b", type: "dependency", createdBy: "human", createdAt: "2026-05-14T00:00:00Z" },
      ],
    });
    expect(m.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm vitest run src/features/graph/domain/build-parent-map.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/features/graph/domain/build-parent-map.ts
import type { ProjectGraph } from "./types";

export function buildParentMap(graph: ProjectGraph): Map<string, string> {
  const map = new Map<string, string>();
  for (const edge of graph.edges) {
    if (edge.type === "composition") {
      map.set(edge.toId, edge.fromId);
    }
  }
  return map;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && pnpm vitest run src/features/graph/domain/build-parent-map.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/graph/domain/build-parent-map.ts apps/web/src/features/graph/domain/build-parent-map.test.ts
git commit -m "feat(web): derive composition parent map from edges"
```

---

## Task 8: Container status aggregation

**Files:**
- Create: `apps/web/src/features/graph/domain/aggregate-status.ts`
- Create: `apps/web/src/features/graph/domain/aggregate-status.test.ts`

Per spec §6: transitive tint + numeric badge; archived excluded; completed containers sealed.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { aggregateStatus } from "./aggregate-status";
import type { ProjectGraph } from "./types";

type Status = "active" | "blocked" | "completed" | "archived";

const node = (id: string, status: Status) => ({
  id, projectId: "p", isProjectRoot: false, role: "regular" as const,
  type: "scaffold" as const, title: id, description: null,
  status, isCheckpoint: false, checkpointResolution: null,
  createdBy: "human" as const, createdAt: "2026-05-14T00:00:00Z", updatedAt: "2026-05-14T00:00:00Z",
});

const composition = (from: string, to: string, i: number) => ({
  id: `e${i}`, projectId: "p", fromId: from, toId: to,
  type: "composition" as const, createdBy: "human" as const, createdAt: "2026-05-14T00:00:00Z",
});

describe("aggregateStatus", () => {
  it("returns null worst and zero counts for a leaf node", () => {
    const g: ProjectGraph = { nodes: [node("n1", "active")], edges: [] };
    const result = aggregateStatus(g);
    expect(result.get("n1")).toEqual({ worst: null, counts: { blocked: 0, active: 0, completed: 0, archived: 0 } });
  });

  it("counts direct children", () => {
    const g: ProjectGraph = {
      nodes: [node("root", "active"), node("a", "blocked"), node("b", "active")],
      edges: [composition("root", "a", 0), composition("root", "b", 1)],
    };
    const result = aggregateStatus(g);
    expect(result.get("root")).toEqual({
      worst: "blocked",
      counts: { blocked: 1, active: 1, completed: 0, archived: 0 },
    });
  });

  it("propagates worst status transitively", () => {
    const g: ProjectGraph = {
      nodes: [node("root", "active"), node("a", "active"), node("b", "blocked")],
      edges: [composition("root", "a", 0), composition("a", "b", 1)],
    };
    const result = aggregateStatus(g);
    expect(result.get("root")?.worst).toBe("blocked");
    expect(result.get("root")?.counts).toEqual({ blocked: 1, active: 1, completed: 0, archived: 0 });
  });

  it("excludes archived descendants from worst and counts", () => {
    const g: ProjectGraph = {
      nodes: [node("root", "active"), node("a", "archived")],
      edges: [composition("root", "a", 0)],
    };
    const result = aggregateStatus(g);
    expect(result.get("root")?.worst).toBe(null);
    expect(result.get("root")?.counts.archived).toBe(0);
  });

  it("seals a completed container — counts empty, worst null", () => {
    const g: ProjectGraph = {
      nodes: [node("root", "completed"), node("a", "blocked")],
      edges: [composition("root", "a", 0)],
    };
    const result = aggregateStatus(g);
    expect(result.get("root")).toEqual({ worst: null, counts: { blocked: 0, active: 0, completed: 0, archived: 0 } });
  });

  it("worst ordering: blocked > active > completed", () => {
    const g: ProjectGraph = {
      nodes: [node("root", "active"), node("a", "completed"), node("b", "active")],
      edges: [composition("root", "a", 0), composition("root", "b", 1)],
    };
    expect(aggregateStatus(g).get("root")?.worst).toBe("active");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm vitest run src/features/graph/domain/aggregate-status.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/features/graph/domain/aggregate-status.ts
import type { ProjectGraph, AggregatedStatus } from "./types";

const SEVERITY: Record<"blocked" | "active" | "completed", number> = {
  blocked: 3,
  active: 2,
  completed: 1,
};

function emptyCounts(): AggregatedStatus["counts"] {
  return { blocked: 0, active: 0, completed: 0, archived: 0 };
}

export function aggregateStatus(graph: ProjectGraph): Map<string, AggregatedStatus> {
  const childrenOf = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (e.type !== "composition") continue;
    const list = childrenOf.get(e.fromId) ?? [];
    list.push(e.toId);
    childrenOf.set(e.fromId, list);
  }

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const result = new Map<string, AggregatedStatus>();

  function visit(nodeId: string): AggregatedStatus {
    const cached = result.get(nodeId);
    if (cached) return cached;

    const node = byId.get(nodeId);
    if (!node) {
      const empty = { worst: null, counts: emptyCounts() } as AggregatedStatus;
      result.set(nodeId, empty);
      return empty;
    }

    // Sealed: a completed container reports empty aggregation.
    if (node.status === "completed") {
      const sealed = { worst: null, counts: emptyCounts() } as AggregatedStatus;
      result.set(nodeId, sealed);
      return sealed;
    }

    const counts = emptyCounts();
    let worstSeverity = 0;
    let worst: AggregatedStatus["worst"] = null;

    const kids = childrenOf.get(nodeId) ?? [];
    for (const kidId of kids) {
      const kid = byId.get(kidId);
      if (!kid) continue;

      if (kid.status !== "archived") {
        counts[kid.status] += 1;
        const sev = SEVERITY[kid.status as keyof typeof SEVERITY];
        if (sev > worstSeverity) {
          worstSeverity = sev;
          worst = kid.status;
        }
      }

      const sub = visit(kidId);
      counts.blocked += sub.counts.blocked;
      counts.active += sub.counts.active;
      counts.completed += sub.counts.completed;
      if (sub.worst) {
        const sev = SEVERITY[sub.worst];
        if (sev > worstSeverity) {
          worstSeverity = sev;
          worst = sub.worst;
        }
      }
    }

    const out = { worst, counts };
    result.set(nodeId, out);
    return out;
  }

  for (const n of graph.nodes) visit(n.id);
  return result;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && pnpm vitest run src/features/graph/domain/aggregate-status.test.ts`
Expected: 6 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/graph/domain/aggregate-status.ts apps/web/src/features/graph/domain/aggregate-status.test.ts
git commit -m "feat(web): container status aggregation with archive/completed rules"
```

---

## Task 9: useProjectGraph hook (combined query)

**Files:**
- Create: `apps/web/src/features/graph/hooks/use-project-graph.ts`
- Create: `apps/web/src/features/graph/hooks/use-project-graph.test.ts`

Two parallel TanStack queries; returns a `ProjectGraph` once both succeed, plus the latest `dataUpdatedAt` for the "Updated Xs ago" chip and a unified `refetch`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useProjectGraph } from "./use-project-graph";

vi.mock("@/lib/api-client", () => ({
  apiCall: vi.fn(),
}));

import { apiCall } from "@/lib/api-client";

const N = (id: string) => ({
  id, projectId: "p", isProjectRoot: false, role: "regular",
  type: "scaffold", title: id, description: null, status: "active",
  isCheckpoint: false, checkpointResolution: null,
  createdBy: "human", createdAt: "2026-05-14T00:00:00Z", updatedAt: "2026-05-14T00:00:00Z",
});

const E = (id: string, from: string, to: string) => ({
  id, projectId: "p", fromId: from, toId: to,
  type: "composition", createdBy: "human", createdAt: "2026-05-14T00:00:00Z",
});

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useProjectGraph", () => {
  beforeEach(() => vi.mocked(apiCall).mockReset());

  it("returns assembled ProjectGraph when both queries succeed", async () => {
    vi.mocked(apiCall).mockImplementation(async (endpoint) => {
      if ((endpoint as any).path.endsWith("/nodes")) return [N("n1"), N("n2")] as any;
      if ((endpoint as any).path.endsWith("/edges")) return [E("e1", "n1", "n2")] as any;
      throw new Error("unexpected endpoint");
    });

    const { result } = renderHook(() => useProjectGraph("p"), { wrapper: wrap() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.nodes.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(result.current.data?.edges.map((e) => e.id)).toEqual(["e1"]);
  });

  it("surfaces error when nodes query fails", async () => {
    vi.mocked(apiCall).mockImplementation(async (endpoint) => {
      if ((endpoint as any).path.endsWith("/nodes")) throw new Error("boom");
      return [] as any;
    });
    const { result } = renderHook(() => useProjectGraph("p"), { wrapper: wrap() });
    await waitFor(() => expect(result.current.error).toBeDefined());
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm vitest run src/features/graph/hooks/use-project-graph.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement the hook**

```ts
// apps/web/src/features/graph/hooks/use-project-graph.ts
import { useQueries } from "@tanstack/react-query";
import { listNodesEndpoint, listEdgesEndpoint } from "@zet-plane/contracts";
import { apiCall } from "@/lib/api-client";
import type { ProjectGraph } from "../domain/types";

export function useProjectGraph(projectId: string) {
  const queries = useQueries({
    queries: [
      {
        queryKey: ["project", projectId, "nodes"],
        queryFn: () => apiCall(listNodesEndpoint, { params: { id: projectId } }),
      },
      {
        queryKey: ["project", projectId, "edges"],
        queryFn: () => apiCall(listEdgesEndpoint, { params: { id: projectId } }),
      },
    ],
  });
  const [nodesQ, edgesQ] = queries;

  const data: ProjectGraph | undefined =
    nodesQ.data && edgesQ.data ? { nodes: nodesQ.data, edges: edgesQ.data } : undefined;

  const error = nodesQ.error ?? edgesQ.error ?? null;
  const isLoading = nodesQ.isLoading || edgesQ.isLoading;
  const isFetching = nodesQ.isFetching || edgesQ.isFetching;
  const dataUpdatedAt = Math.max(nodesQ.dataUpdatedAt, edgesQ.dataUpdatedAt);

  const refetch = async () => {
    await Promise.all([nodesQ.refetch(), edgesQ.refetch()]);
  };

  return { data, error, isLoading, isFetching, dataUpdatedAt, refetch };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && pnpm vitest run src/features/graph/hooks/use-project-graph.test.ts`
Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/graph/hooks/use-project-graph.ts apps/web/src/features/graph/hooks/use-project-graph.test.ts
git commit -m "feat(web): useProjectGraph combined nodes+edges query"
```

---

## Task 10: Pretext text measurement wrapper

**Files:**
- Create: `apps/web/src/features/graph/layout/measure-text.ts`
- Create: `apps/web/src/features/graph/layout/measure-text.test.ts`

Wraps `@chenglou/pretext` to produce `{width, height}` for a node's title + (optional) description preview, given a max width. Caches by `(text + font + maxWidth)` to avoid re-measuring on every render.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@chenglou/pretext", () => {
  const prepare = vi.fn((text: string) => ({ text }));
  const layout = vi.fn((prepared: { text: string }, maxWidth: number, lineHeight: number) => ({
    width: Math.min(prepared.text.length * 8, maxWidth),
    height: Math.ceil((prepared.text.length * 8) / maxWidth) * lineHeight,
  }));
  return { prepare, layout };
});

import { measureNodeText, resetMeasureCache } from "./measure-text";
import * as pretext from "@chenglou/pretext";

beforeEach(() => {
  resetMeasureCache();
  vi.mocked(pretext.prepare).mockClear();
});

describe("measureNodeText", () => {
  it("returns positive width and height", () => {
    const { width, height } = measureNodeText({ text: "Hello", font: "14px Inter", maxWidth: 200, lineHeight: 18 });
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });

  it("caches identical calls", () => {
    measureNodeText({ text: "Same", font: "14px Inter", maxWidth: 200, lineHeight: 18 });
    measureNodeText({ text: "Same", font: "14px Inter", maxWidth: 200, lineHeight: 18 });
    expect(vi.mocked(pretext.prepare).mock.calls.length).toBe(1);
  });

  it("does not cache across different texts", () => {
    measureNodeText({ text: "A", font: "14px Inter", maxWidth: 200, lineHeight: 18 });
    measureNodeText({ text: "B", font: "14px Inter", maxWidth: 200, lineHeight: 18 });
    expect(vi.mocked(pretext.prepare).mock.calls.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm vitest run src/features/graph/layout/measure-text.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/features/graph/layout/measure-text.ts
import { prepare, layout } from "@chenglou/pretext";

type MeasureInput = {
  text: string;
  font: string;
  maxWidth: number;
  lineHeight: number;
};

const cache = new Map<string, { width: number; height: number }>();

export function measureNodeText({ text, font, maxWidth, lineHeight }: MeasureInput): { width: number; height: number } {
  const key = `${maxWidth}|${lineHeight}|${font}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const prepared = prepare(text, font);
  const result = layout(prepared, maxWidth, lineHeight);
  const out = { width: Math.max(1, Math.ceil(result.width)), height: Math.max(1, Math.ceil(result.height)) };
  cache.set(key, out);
  return out;
}

export function resetMeasureCache() {
  cache.clear();
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && pnpm vitest run src/features/graph/layout/measure-text.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/graph/layout/measure-text.ts apps/web/src/features/graph/layout/measure-text.test.ts
git commit -m "feat(web): pretext-backed node text measurement with cache"
```

---

## Task 11: ELK layout pure function

**Files:**
- Create: `apps/web/src/features/graph/layout/elk-layout.ts`
- Create: `apps/web/src/features/graph/layout/elk-layout.test.ts`

The pure layout function — takes nodes (with sizes + parentIds) and edges (dependency only — composition is encoded via parentId, not as ELK edges), returns positioned nodes. Runs both inline (tests) and inside the worker (production).

Note on architecture: composition edges are *not* passed to ELK as edges. ELK's hierarchical layout uses `parentId` for containment. Only `dependency` edges become ELK edges.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { layoutGraph, type LayoutInput } from "./elk-layout";

describe("layoutGraph", () => {
  it("assigns positions to a flat 2-node graph", async () => {
    const input: LayoutInput = {
      nodes: [
        { id: "a", width: 100, height: 40, parentId: null },
        { id: "b", width: 100, height: 40, parentId: null },
      ],
      edges: [{ id: "e1", fromId: "a", toId: "b" }],
    };
    const result = await layoutGraph(input);
    const a = result.nodes.find((n) => n.id === "a")!;
    const b = result.nodes.find((n) => n.id === "b")!;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(typeof a.position.x).toBe("number");
    expect(typeof a.position.y).toBe("number");
    // DOWN direction: target below source
    expect(b.position.y).toBeGreaterThan(a.position.y);
  });

  it("nests a child under its parent", async () => {
    const input: LayoutInput = {
      nodes: [
        { id: "root", width: 300, height: 200, parentId: null },
        { id: "child", width: 80, height: 30, parentId: "root" },
      ],
      edges: [],
    };
    const result = await layoutGraph(input);
    const child = result.nodes.find((n) => n.id === "child")!;
    // Child position is relative to parent in xyflow; ELK returns absolute, we
    // expect non-negative coords inside container bounds.
    expect(child.position.x).toBeGreaterThanOrEqual(0);
    expect(child.position.y).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm vitest run src/features/graph/layout/elk-layout.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/features/graph/layout/elk-layout.ts
import ELK from "elkjs/lib/elk.bundled.js";

export type LayoutInputNode = {
  id: string;
  width: number;
  height: number;
  parentId: string | null;
};

export type LayoutInputEdge = {
  id: string;
  fromId: string;
  toId: string;
};

export type LayoutInput = {
  nodes: LayoutInputNode[];
  edges: LayoutInputEdge[];
};

export type LayoutOutputNode = {
  id: string;
  position: { x: number; y: number };
  width: number;
  height: number;
};

export type LayoutOutput = {
  nodes: LayoutOutputNode[];
};

type ElkNode = {
  id: string;
  width?: number;
  height?: number;
  children?: ElkNode[];
  edges?: { id: string; sources: string[]; targets: string[] }[];
  layoutOptions?: Record<string, string>;
};

const COMMON_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.layered.spacing.nodeNodeBetweenLayers": "48",
  "elk.spacing.nodeNode": "32",
  "elk.padding": "[top=32,left=24,right=24,bottom=24]",
};

const elk = new ELK();

export async function layoutGraph(input: LayoutInput): Promise<LayoutOutput> {
  const byId = new Map<string, ElkNode>();
  for (const n of input.nodes) {
    byId.set(n.id, { id: n.id, width: n.width, height: n.height, children: [], edges: [] });
  }

  const root: ElkNode = { id: "__root__", layoutOptions: COMMON_OPTIONS, children: [], edges: [] };

  for (const n of input.nodes) {
    const node = byId.get(n.id)!;
    const parent = n.parentId ? byId.get(n.parentId) ?? root : root;
    parent.children!.push(node);
  }

  for (const e of input.edges) {
    root.edges!.push({ id: e.id, sources: [e.fromId], targets: [e.toId] });
  }

  const laid = await elk.layout(root as never);

  const out: LayoutOutputNode[] = [];
  const walk = (node: ElkNode, dx: number, dy: number) => {
    if (node.id !== "__root__") {
      out.push({
        id: node.id,
        position: { x: (node as ElkNode & { x?: number }).x ?? 0, y: (node as ElkNode & { y?: number }).y ?? 0 },
        width: node.width ?? 0,
        height: node.height ?? 0,
      });
    }
    for (const child of node.children ?? []) walk(child, 0, 0);
  };
  walk(laid as ElkNode, 0, 0);

  return { nodes: out };
}
```

Note: ELK returns child coordinates *relative to parent*, which is exactly what xyflow expects for nested nodes. No further transform needed.

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && pnpm vitest run src/features/graph/layout/elk-layout.test.ts`
Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/graph/layout/elk-layout.ts apps/web/src/features/graph/layout/elk-layout.test.ts
git commit -m "feat(web): ELK hierarchical layout pure function"
```

---

## Task 12: ELK worker wrapper

**Files:**
- Create: `apps/web/src/features/graph/layout/elk.worker.ts`

Vite-style web worker. Imports `layoutGraph` and proxies via `postMessage`. Pure plumbing — no unit test (covered by the hook test in Task 13).

- [ ] **Step 1: Create the worker file**

```ts
// apps/web/src/features/graph/layout/elk.worker.ts
/// <reference lib="webworker" />
import { layoutGraph, type LayoutInput, type LayoutOutput } from "./elk-layout";

self.onmessage = async (e: MessageEvent<{ id: string; input: LayoutInput }>) => {
  const { id, input } = e.data;
  try {
    const result: LayoutOutput = await layoutGraph(input);
    (self as DedicatedWorkerGlobalScope).postMessage({ id, ok: true, result });
  } catch (err) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
```

- [ ] **Step 2: Verify type check**

Run: `cd apps/web && pnpm tsc -b --noEmit`
Expected: no new errors for this file.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/graph/layout/elk.worker.ts
git commit -m "feat(web): ELK web worker entry"
```

---

## Task 13: useLayoutedGraph hook

**Files:**
- Create: `apps/web/src/features/graph/layout/use-layouted-graph.ts`
- Create: `apps/web/src/features/graph/layout/use-layouted-graph.test.ts`

Combines pretext sizing + parent map + worker-driven ELK call, memoized by topology hash. Falls back to the in-process `layoutGraph` when running under test (no `Worker` constructor available in happy-dom).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// Stub the worker import — fall through to in-process layout in tests.
vi.mock("./elk.worker?worker", () => ({ default: class { /* never instantiated in tests */ } }));

import { useLayoutedGraph } from "./use-layouted-graph";
import type { ProjectGraph } from "../domain/types";

const N = (id: string) => ({
  id, projectId: "p", isProjectRoot: false, role: "regular" as const,
  type: "scaffold" as const, title: id, description: null,
  status: "active" as const, isCheckpoint: false, checkpointResolution: null,
  createdBy: "human" as const, createdAt: "2026-05-14T00:00:00Z", updatedAt: "2026-05-14T00:00:00Z",
});
const E = (id: string, from: string, to: string, type: "composition" | "dependency" = "composition") => ({
  id, projectId: "p", fromId: from, toId: to, type, createdBy: "human" as const, createdAt: "2026-05-14T00:00:00Z",
});

describe("useLayoutedGraph", () => {
  it("returns layouted nodes after async layout completes", async () => {
    const graph: ProjectGraph = {
      nodes: [N("a"), N("b")],
      edges: [E("e1", "a", "b", "dependency")],
    };
    const { result } = renderHook(() => useLayoutedGraph(graph));
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.nodes).toHaveLength(2);
    expect(result.current.data?.edges).toHaveLength(1);
  });

  it("returns undefined data while loading", () => {
    const graph: ProjectGraph = { nodes: [N("a")], edges: [] };
    const { result } = renderHook(() => useLayoutedGraph(graph));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLayouting).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm vitest run src/features/graph/layout/use-layouted-graph.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/features/graph/layout/use-layouted-graph.ts
import { useEffect, useMemo, useState } from "react";
import { layoutGraph, type LayoutInput, type LayoutOutput } from "./elk-layout";
import { measureNodeText } from "./measure-text";
import { topologyHash } from "../domain/topology-hash";
import { buildParentMap } from "../domain/build-parent-map";
import type { ProjectGraph, LayoutedGraph, LayoutedNode } from "../domain/types";

const NODE_FONT = "14px 'Inter Variable', system-ui, sans-serif";
const MAX_NODE_TEXT_WIDTH = 220;
const NODE_PADDING_X = 24;
const NODE_PADDING_Y = 28;
const LINE_HEIGHT = 20;

function isWorkerSupported(): boolean {
  return typeof Worker !== "undefined";
}

async function runLayoutInWorker(input: LayoutInput): Promise<LayoutOutput> {
  const WorkerCtor = (await import("./elk.worker?worker")).default;
  const worker = new WorkerCtor();
  const id = Math.random().toString(36).slice(2);
  return new Promise<LayoutOutput>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<{ id: string; ok: true; result: LayoutOutput } | { id: string; ok: false; error: string }>) => {
      if (e.data.id !== id) return;
      worker.terminate();
      if (e.data.ok) resolve(e.data.result);
      else reject(new Error(e.data.error));
    };
    worker.onerror = (e: ErrorEvent) => {
      worker.terminate();
      reject(new Error(e.message));
    };
    worker.postMessage({ id, input });
  });
}

export function useLayoutedGraph(graph: ProjectGraph | undefined) {
  const hash = useMemo(() => (graph ? topologyHash(graph) : ""), [graph]);

  const [data, setData] = useState<LayoutedGraph | undefined>(undefined);
  const [isLayouting, setIsLayouting] = useState<boolean>(Boolean(graph));
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!graph) {
      setData(undefined);
      setIsLayouting(false);
      return;
    }
    setIsLayouting(true);
    setError(null);

    const parentMap = buildParentMap(graph);

    const measured = graph.nodes.map((n) => {
      const { width: textW, height: textH } = measureNodeText({
        text: n.title,
        font: NODE_FONT,
        maxWidth: MAX_NODE_TEXT_WIDTH,
        lineHeight: LINE_HEIGHT,
      });
      return {
        node: n,
        width: textW + NODE_PADDING_X * 2,
        height: textH + NODE_PADDING_Y * 2,
        parentId: parentMap.get(n.id) ?? null,
      };
    });

    const dependencyEdges = graph.edges.filter((e) => e.type === "dependency");

    const input: LayoutInput = {
      nodes: measured.map(({ node, width, height, parentId }) => ({
        id: node.id,
        width,
        height,
        parentId,
      })),
      edges: dependencyEdges.map((e) => ({ id: e.id, fromId: e.fromId, toId: e.toId })),
    };

    const run = isWorkerSupported() ? runLayoutInWorker(input) : layoutGraph(input);

    let cancelled = false;
    run.then((output) => {
      if (cancelled) return;
      const byId = new Map(output.nodes.map((p) => [p.id, p]));
      const layouted: LayoutedNode[] = measured.map(({ node, width, height, parentId }) => {
        const pos = byId.get(node.id);
        return {
          ...node,
          width,
          height,
          parentId,
          position: pos?.position ?? { x: 0, y: 0 },
        };
      });
      setData({ nodes: layouted, edges: graph.edges });
      setIsLayouting(false);
    }).catch((err) => {
      if (cancelled) return;
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsLayouting(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);

  return { data, isLayouting, error };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && pnpm vitest run src/features/graph/layout/use-layouted-graph.test.ts`
Expected: 2 pass. (If the Worker import in happy-dom errors, the in-process fallback path handles it; the `isWorkerSupported` check covers that.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/graph/layout/use-layouted-graph.ts apps/web/src/features/graph/layout/use-layouted-graph.test.ts
git commit -m "feat(web): useLayoutedGraph composes pretext + ELK with topology memoization"
```

---

## Task 14: ResizeObserver / matchMedia polyfills for tests

**Files:**
- Modify: `apps/web/src/test/setup.ts`

xyflow uses `ResizeObserver` and `matchMedia`; happy-dom doesn't ship them.

- [ ] **Step 1: Append the polyfills**

Open `apps/web/src/test/setup.ts` and append:

```ts
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as unknown as { ResizeObserver: typeof StubResizeObserver }).ResizeObserver = StubResizeObserver;
}

if (typeof window !== "undefined" && typeof window.matchMedia === "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
```

- [ ] **Step 2: Run the existing store test as a sanity check**

Run: `cd apps/web && pnpm vitest run src/stores/graph-view.store.test.ts`
Expected: still passes.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/test/setup.ts
git commit -m "test(web): polyfill ResizeObserver and matchMedia for happy-dom"
```

---

## Task 15: useProjectsList hook

**Files:**
- Create: `apps/web/src/features/projects/hooks/use-projects-list.ts`
- Create: `apps/web/src/features/projects/hooks/use-projects-list.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useProjectsList } from "./use-projects-list";

vi.mock("@/lib/api-client", () => ({ apiCall: vi.fn() }));
import { apiCall } from "@/lib/api-client";

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const P = (id: string, name: string) => ({
  id, name, description: null,
  createdAt: "2026-05-14T00:00:00Z", updatedAt: "2026-05-14T00:00:00Z",
});

describe("useProjectsList", () => {
  beforeEach(() => vi.mocked(apiCall).mockReset());

  it("returns project list from listProjectsEndpoint", async () => {
    vi.mocked(apiCall).mockResolvedValue([P("p1", "Project One"), P("p2", "Project Two")] as never);
    const { result } = renderHook(() => useProjectsList(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.map((p) => p.id)).toEqual(["p1", "p2"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm vitest run src/features/projects/hooks/use-projects-list.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/features/projects/hooks/use-projects-list.ts
import { useQuery } from "@tanstack/react-query";
import { listProjectsEndpoint } from "@zet-plane/contracts";
import { apiCall } from "@/lib/api-client";

export function useProjectsList() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => apiCall(listProjectsEndpoint),
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && pnpm vitest run src/features/projects/hooks/use-projects-list.test.ts`
Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/projects/hooks/use-projects-list.ts apps/web/src/features/projects/hooks/use-projects-list.test.ts
git commit -m "feat(web): useProjectsList query"
```

---

## Task 16: /projects list route

**Files:**
- Create: `apps/web/src/router/projects.tsx`

- [ ] **Step 1: Create the route**

```tsx
// apps/web/src/router/projects.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useProjectsList } from "@/features/projects/hooks/use-projects-list";

function ProjectsListPage() {
  const { data, isLoading, error } = useProjectsList();

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading projects…</div>;
  if (error) return <div className="p-8 text-sm text-destructive">Failed to load projects: {error.message}</div>;
  if (!data || data.length === 0) {
    return <div className="p-8 text-sm text-muted-foreground">No projects yet.</div>;
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Projects</h1>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {data.map((p) => (
          <li key={p.id}>
            <Link
              to="/projects/$projectId/graph"
              params={{ projectId: p.id }}
              className="flex items-baseline justify-between px-4 py-3 hover:bg-accent"
            >
              <span className="text-base font-medium">{p.name}</span>
              <span className="text-xs text-muted-foreground">
                Updated {new Date(p.updatedAt).toLocaleDateString()}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const Route = createFileRoute("/projects")({
  component: ProjectsListPage,
});
```

- [ ] **Step 2: Regenerate route tree**

Run: `cd apps/web && pnpm dev` for ~5s (the tanstack-router-plugin regenerates `routeTree.gen.ts` on save), then stop.
Expected: `routeTree.gen.ts` now references `/projects`. No console errors.

- [ ] **Step 3: Type-check**

Run: `cd apps/web && pnpm tsc -b --noEmit`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/router/projects.tsx apps/web/src/routeTree.gen.ts
git commit -m "feat(web): /projects list route"
```

---

## Task 17: /projects/$projectId layout route

**Files:**
- Create: `apps/web/src/router/projects.$projectId.tsx`

A layout route that renders the chrome (left rail + breadcrumb + outlet) for everything under a project. v1 left rail is minimal — placeholder for future tabs.

- [ ] **Step 1: Create the route**

```tsx
// apps/web/src/router/projects.$projectId.tsx
import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getProjectEndpoint } from "@zet-plane/contracts";
import { apiCall } from "@/lib/api-client";

function ProjectShell() {
  const { projectId } = Route.useParams();
  const { data: project } = useQuery({
    queryKey: ["project", projectId, "meta"],
    queryFn: () => apiCall(getProjectEndpoint, { params: { id: projectId } }),
  });

  return (
    <div className="grid h-screen w-screen grid-cols-[220px_1fr] grid-rows-[48px_1fr] bg-background text-foreground">
      <header className="col-span-2 flex items-center gap-2 border-b border-border px-4 text-sm">
        <Link to="/projects" className="text-muted-foreground hover:underline">Projects</Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{project?.name ?? projectId}</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-muted-foreground">Graph</span>
      </header>
      <aside className="row-start-2 border-r border-border p-3 text-sm">
        <nav className="flex flex-col gap-1">
          <Link
            to="/projects/$projectId/graph"
            params={{ projectId }}
            className="rounded px-2 py-1 hover:bg-accent"
            activeProps={{ className: "rounded px-2 py-1 bg-accent font-medium" }}
          >
            Graph
          </Link>
        </nav>
      </aside>
      <main className="row-start-2 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId")({
  component: ProjectShell,
});
```

- [ ] **Step 2: Touch dev to regenerate route tree**

Run: `cd apps/web && pnpm dev` for ~5s, then stop.
Expected: `routeTree.gen.ts` references `/projects/$projectId`.

- [ ] **Step 3: Type-check**

Run: `cd apps/web && pnpm tsc -b --noEmit`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/router/projects.\$projectId.tsx apps/web/src/routeTree.gen.ts
git commit -m "feat(web): /projects/:projectId shell with breadcrumb and rail"
```

---

## Task 18: / redirect to /projects

**Files:**
- Modify: `apps/web/src/router/index.tsx`

Replaces the demo with a redirect.

- [ ] **Step 1: Replace the file**

Open `apps/web/src/router/index.tsx` and replace its entire contents with:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/projects" });
  },
});
```

- [ ] **Step 2: Touch dev to regenerate route tree**

Run: `cd apps/web && pnpm dev` for ~5s, then stop.
Expected: route tree references `/` with no component.

- [ ] **Step 3: Type-check + smoke**

Run: `cd apps/web && pnpm tsc -b --noEmit && pnpm dev` (in another terminal) and visit `http://localhost:3001/`
Expected: redirects to `/projects`. Stop dev after confirming.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/router/index.tsx apps/web/src/routeTree.gen.ts
git commit -m "feat(web): redirect / to /projects"
```

---

## Task 19: Graph route skeleton (no styling yet)

**Files:**
- Create: `apps/web/src/router/projects.$projectId.graph.tsx`

The route mounts a bare `<GraphCanvas>` that, until later tasks, just calls `useProjectGraph` + `useLayoutedGraph` and renders xyflow with default-styled nodes/edges. Verifies the read+layout path end-to-end.

- [ ] **Step 1: Create a minimal canvas component**

Create `apps/web/src/features/graph/components/GraphCanvas.tsx`:

```tsx
import { ReactFlow, Background, Controls, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useProjectGraph } from "../hooks/use-project-graph";
import { useLayoutedGraph } from "../layout/use-layouted-graph";

type Props = { projectId: string };

export function GraphCanvas({ projectId }: Props) {
  const { data: graph, isLoading, error } = useProjectGraph(projectId);
  const { data: layouted, isLayouting } = useLayoutedGraph(graph);

  if (isLoading) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading graph…</div>;
  if (error) return <div className="flex h-full items-center justify-center text-sm text-destructive">{error.message}</div>;
  if (isLayouting || !layouted) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Laying out…</div>;

  const nodes: Node[] = layouted.nodes.map((n) => ({
    id: n.id,
    position: n.position,
    data: { label: n.title },
    parentId: n.parentId ?? undefined,
    extent: n.parentId ? ("parent" as const) : undefined,
    width: n.width,
    height: n.height,
    style: n.parentId
      ? undefined
      : layouted.nodes.some((m) => m.parentId === n.id)
        ? { width: n.width, height: n.height, background: "rgba(0,0,0,0.02)", border: "1px solid var(--border)" }
        : undefined,
  }));

  const edges: Edge[] = layouted.edges
    .filter((e) => e.type === "dependency")
    .map((e) => ({ id: e.id, source: e.fromId, target: e.toId }));

  return (
    <div className="h-full w-full">
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 2: Create the route**

```tsx
// apps/web/src/router/projects.$projectId.graph.tsx
import { createFileRoute } from "@tanstack/react-router";
import { GraphCanvas } from "@/features/graph/components/GraphCanvas";
import { graphSearchSchema } from "@/lib/schemas/graph-search";

function GraphRoute() {
  const { projectId } = Route.useParams();
  return <GraphCanvas projectId={projectId} />;
}

export const Route = createFileRoute("/projects/$projectId/graph")({
  validateSearch: (raw) => graphSearchSchema.parse(raw),
  component: GraphRoute,
});
```

- [ ] **Step 3: Regenerate route tree + manual smoke**

Run: `cd apps/web && pnpm dev` and visit `http://localhost:3001/projects` then click a project (or hand-craft `/projects/<known-id>/graph`).
Expected: the canvas renders bare nodes/edges without crashing. Stop dev after.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/graph/components/GraphCanvas.tsx apps/web/src/router/projects.\$projectId.graph.tsx apps/web/src/routeTree.gen.ts
git commit -m "feat(web): bare graph canvas route renders project nodes and dependency edges"
```

---

## Task 20: feature styles file + status helper

**Files:**
- Create: `apps/web/src/features/graph/styles.css`
- Create: `apps/web/src/features/graph/components/status-classes.ts`
- Create: `apps/web/src/features/graph/components/status-classes.test.ts`

- [ ] **Step 1: Create the styles file**

```css
/* apps/web/src/features/graph/styles.css */
.zp-node {
  border-radius: 8px;
  padding: 10px 14px;
  background: var(--background);
  font: 500 13px/1.3 'Inter Variable', system-ui, sans-serif;
  color: var(--foreground);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
}

.zp-node--scaffold { border: 1.5px solid currentColor; }
.zp-node--growth   { border: 1.5px dashed currentColor; }

.zp-node--active    { color: var(--zp-status-active);    background: var(--zp-status-active-bg); }
.zp-node--blocked   { color: var(--zp-status-blocked);   background: var(--zp-status-blocked-bg); }
.zp-node--completed { color: var(--zp-status-completed); background: var(--zp-status-completed-bg); }
.zp-node--archived  { color: var(--zp-status-archived);  background: var(--zp-status-archived-bg); opacity: 0.6; }

.zp-node__title { color: var(--foreground); }
.zp-node__glyph { position: absolute; top: 4px; right: 6px; font-size: 11px; opacity: 0.85; }
.zp-node__badge { position: absolute; bottom: 4px; right: 6px; font-size: 10px; color: var(--zp-badge-neutral); }

.zp-container {
  border-radius: 12px;
  padding: 28px 16px 16px 16px;
  border: 1.5px solid currentColor;
  position: relative;
  font: 500 12px/1.3 'Inter Variable', system-ui, sans-serif;
}
.zp-container--active    { color: var(--zp-status-active);    background: var(--zp-status-active-bg); }
.zp-container--blocked   { color: var(--zp-status-blocked);   background: var(--zp-status-blocked-bg); }
.zp-container--completed { color: var(--zp-status-completed); background: var(--zp-status-completed-bg); }
.zp-container--archived  { color: var(--zp-status-archived);  background: var(--zp-status-archived-bg); opacity: 0.6; }
.zp-container--neutral   { color: var(--zp-badge-neutral);    background: transparent; }

.zp-container__header {
  position: absolute; top: 6px; left: 12px; right: 12px;
  display: flex; justify-content: space-between; align-items: center;
  font-size: 11px;
}
.zp-container__count { color: var(--zp-badge-neutral); }

.zp-edge--blocked   { stroke: var(--zp-status-blocked); }
.zp-edge--completed { stroke: var(--zp-status-completed); opacity: 0.6; }
.zp-edge--active    { stroke: var(--zp-badge-neutral); }
.zp-edge--dim       { opacity: var(--zp-edge-dim-opacity); }

.zp-selection-ring {
  outline: 3px solid var(--zp-selection-ring);
  outline-offset: 2px;
}
```

- [ ] **Step 2: Import the styles in `index.css`**

Append to `apps/web/src/index.css` (after the other `@import` lines at the top):

```css
@import "./features/graph/styles.css";
```

- [ ] **Step 3: Write status-classes test**

```ts
// apps/web/src/features/graph/components/status-classes.test.ts
import { describe, it, expect } from "vitest";
import { nodeStatusClass, containerStatusClass, edgeStatusClass } from "./status-classes";

describe("status class helpers", () => {
  it("returns the expected node class", () => {
    expect(nodeStatusClass("active")).toBe("zp-node--active");
    expect(nodeStatusClass("blocked")).toBe("zp-node--blocked");
    expect(nodeStatusClass("completed")).toBe("zp-node--completed");
    expect(nodeStatusClass("archived")).toBe("zp-node--archived");
  });

  it("returns neutral container class when worst is null", () => {
    expect(containerStatusClass(null)).toBe("zp-container--neutral");
  });

  it("returns sealed completed when status is completed", () => {
    expect(containerStatusClass(null, "completed")).toBe("zp-container--completed");
  });

  it("edge class follows target status", () => {
    expect(edgeStatusClass("blocked")).toBe("zp-edge--blocked");
    expect(edgeStatusClass("archived")).toBe("zp-edge--blocked");
    expect(edgeStatusClass("completed")).toBe("zp-edge--completed");
    expect(edgeStatusClass("active")).toBe("zp-edge--active");
  });
});
```

- [ ] **Step 4: Implement**

```ts
// apps/web/src/features/graph/components/status-classes.ts
import type { NodeResponse } from "@zet-plane/contracts";
import type { AggregatedStatus } from "../domain/types";

type NodeStatus = NodeResponse["status"];

export function nodeStatusClass(status: NodeStatus): string {
  return `zp-node--${status}`;
}

export function containerStatusClass(worst: AggregatedStatus["worst"], ownStatus?: NodeStatus): string {
  if (ownStatus === "completed") return "zp-container--completed";
  if (ownStatus === "archived") return "zp-container--archived";
  if (!worst) return "zp-container--neutral";
  return `zp-container--${worst}`;
}

export function edgeStatusClass(targetStatus: NodeStatus): string {
  if (targetStatus === "blocked" || targetStatus === "archived") return "zp-edge--blocked";
  if (targetStatus === "completed") return "zp-edge--completed";
  return "zp-edge--active";
}

export function nodeTypeClass(type: NodeResponse["type"]): string {
  if (type === "growth") return "zp-node--growth";
  return "zp-node--scaffold";
}
```

- [ ] **Step 5: Run tests**

Run: `cd apps/web && pnpm vitest run src/features/graph/components/status-classes.test.ts`
Expected: 4 pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/graph/styles.css apps/web/src/index.css apps/web/src/features/graph/components/status-classes.ts apps/web/src/features/graph/components/status-classes.test.ts
git commit -m "feat(web): graph feature styles and status class helpers"
```

---

## Task 21: NodeCard custom node component

**Files:**
- Create: `apps/web/src/features/graph/components/NodeCard.tsx`

Custom xyflow node type. Receives the underlying `NodeResponse` via `data` plus optional knowledge count.

- [ ] **Step 1: Create the component**

```tsx
// apps/web/src/features/graph/components/NodeCard.tsx
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Flag } from "lucide-react";
import type { NodeResponse } from "@zet-plane/contracts";
import { nodeStatusClass, nodeTypeClass } from "./status-classes";

export type NodeCardData = {
  node: NodeResponse;
  knowledgeCount: number;
  selected: boolean;
  dimmed: boolean;
};

export function NodeCard({ data }: NodeProps<NodeCardData>) {
  const { node, knowledgeCount, selected, dimmed } = data;
  const classes = ["zp-node", nodeTypeClass(node.type), nodeStatusClass(node.status)];
  if (selected) classes.push("zp-selection-ring");
  if (dimmed) classes.push("zp-edge--dim");

  return (
    <div className={classes.join(" ")} style={{ position: "relative", minWidth: 120 }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <div className="zp-node__title">{node.title}</div>
      {node.isCheckpoint && (
        <span className="zp-node__glyph" aria-label="checkpoint">
          <Flag size={11} />
        </span>
      )}
      {knowledgeCount > 0 && (
        <span className="zp-node__badge" aria-label={`${knowledgeCount} knowledge entries`}>
          K{knowledgeCount}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm tsc -b --noEmit`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/graph/components/NodeCard.tsx
git commit -m "feat(web): NodeCard custom xyflow node with status, type, checkpoint, badge"
```

---

## Task 22: ContainerCard custom node component

**Files:**
- Create: `apps/web/src/features/graph/components/ContainerCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/web/src/features/graph/components/ContainerCard.tsx
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Flag } from "lucide-react";
import type { NodeResponse } from "@zet-plane/contracts";
import type { AggregatedStatus } from "../domain/types";
import { containerStatusClass, nodeTypeClass } from "./status-classes";

export type ContainerCardData = {
  node: NodeResponse;
  aggregation: AggregatedStatus;
  knowledgeCount: number;
  selected: boolean;
  dimmed: boolean;
};

export function ContainerCard({ data }: NodeProps<ContainerCardData>) {
  const { node, aggregation, selected, dimmed } = data;
  const classes = ["zp-container", nodeTypeClass(node.type), containerStatusClass(aggregation.worst, node.status)];
  if (selected) classes.push("zp-selection-ring");
  if (dimmed) classes.push("zp-edge--dim");

  const { blocked, active, completed } = aggregation.counts;
  const total = blocked + active + completed;
  const countLabel = total === 0
    ? null
    : `${blocked} blocked / ${active} active / ${completed} done`;

  return (
    <div className={classes.join(" ")} style={{ position: "relative", width: "100%", height: "100%" }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <div className="zp-container__header">
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {node.isCheckpoint && <Flag size={11} />}
          <strong>{node.title}</strong>
        </span>
        {countLabel && <span className="zp-container__count">{countLabel}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm tsc -b --noEmit`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/graph/components/ContainerCard.tsx
git commit -m "feat(web): ContainerCard with aggregated status tint and count badge"
```

---

## Task 23: DependencyEdge custom edge component

**Files:**
- Create: `apps/web/src/features/graph/components/DependencyEdge.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/web/src/features/graph/components/DependencyEdge.tsx
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { NodeResponse } from "@zet-plane/contracts";
import { edgeStatusClass } from "./status-classes";

export type DependencyEdgeData = {
  targetStatus: NodeResponse["status"];
  dimmed: boolean;
};

export function DependencyEdge(props: EdgeProps<DependencyEdgeData>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd } = props;
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const classes = ["zp-edge", edgeStatusClass(data?.targetStatus ?? "active")];
  if (data?.dimmed) classes.push("zp-edge--dim");
  return <BaseEdge id={props.id} path={path} className={classes.join(" ")} markerEnd={markerEnd} />;
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm tsc -b --noEmit`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/graph/components/DependencyEdge.tsx
git commit -m "feat(web): DependencyEdge custom edge with target-status tinting"
```

---

## Task 24: Wire custom node/edge types into GraphCanvas

**Files:**
- Modify: `apps/web/src/features/graph/components/GraphCanvas.tsx`

Replaces the bare ReactFlow render from Task 19 with one that uses `NodeCard`, `ContainerCard`, `DependencyEdge`, plus aggregation, hover focus, and URL-driven selection.

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `apps/web/src/features/graph/components/GraphCanvas.tsx`:

```tsx
import { useMemo, useCallback } from "react";
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useProjectGraph } from "../hooks/use-project-graph";
import { useLayoutedGraph } from "../layout/use-layouted-graph";
import { aggregateStatus } from "../domain/aggregate-status";
import { useGraphViewStore } from "@/stores/graph-view.store";
import { NodeCard, type NodeCardData } from "./NodeCard";
import { ContainerCard, type ContainerCardData } from "./ContainerCard";
import { DependencyEdge } from "./DependencyEdge";
import { EmptyState, LoadingState, ErrorState } from "./EmptyState";

const nodeTypes = { node: NodeCard, container: ContainerCard };
const edgeTypes = { dependency: DependencyEdge };

type Props = { projectId: string };

export function GraphCanvas({ projectId }: Props) {
  const { data: graph, isLoading, error } = useProjectGraph(projectId);
  const { data: layouted, isLayouting, error: layoutErr } = useLayoutedGraph(graph);
  const search = useSearch({ from: "/projects/$projectId/graph" });
  const navigate = useNavigate({ from: "/projects/$projectId/graph" });
  const hoveredNodeId = useGraphViewStore((s) => s.hoveredNodeId);
  const setHoveredNodeId = useGraphViewStore((s) => s.setHoveredNodeId);

  const aggregation = useMemo(() => (graph ? aggregateStatus(graph) : new Map()), [graph]);
  const isContainer = useMemo(() => {
    const set = new Set<string>();
    if (layouted) for (const n of layouted.nodes) if (n.parentId) set.add(n.parentId);
    return set;
  }, [layouted]);

  const focusId = hoveredNodeId ?? search.nodeId ?? null;
  const focusOutgoing = useMemo(() => {
    if (!focusId || !graph) return new Set<string>();
    const ids = new Set<string>();
    for (const e of graph.edges) {
      if (e.type === "dependency" && (e.fromId === focusId || e.toId === focusId)) ids.add(e.id);
    }
    return ids;
  }, [focusId, graph]);

  const nodesById = useMemo(() => new Map(graph?.nodes.map((n) => [n.id, n]) ?? []), [graph]);

  const onNodeClick = useCallback(
    (_: unknown, n: Node) => {
      navigate({ search: (prev) => ({ ...prev, nodeId: n.id }) });
    },
    [navigate],
  );
  const onPaneClick = useCallback(() => {
    navigate({ search: (prev) => ({ ...prev, nodeId: undefined }) });
  }, [navigate]);
  const onNodeMouseEnter = useCallback((_: unknown, n: Node) => setHoveredNodeId(n.id), [setHoveredNodeId]);
  const onNodeMouseLeave = useCallback(() => setHoveredNodeId(null), [setHoveredNodeId]);

  if (isLoading) return <LoadingState message="Loading graph…" />;
  if (error) return <ErrorState error={error} />;
  if (layoutErr) return <ErrorState error={layoutErr} />;
  if (isLayouting || !layouted) return <LoadingState message="Laying out…" />;
  if (layouted.nodes.length === 0) return <EmptyState />;

  const xyNodes: Node[] = layouted.nodes.map((n) => {
    const isParent = isContainer.has(n.id);
    const data: NodeCardData | ContainerCardData = isParent
      ? {
          node: n,
          aggregation: aggregation.get(n.id) ?? { worst: null, counts: { blocked: 0, active: 0, completed: 0, archived: 0 } },
          knowledgeCount: 0,
          selected: search.nodeId === n.id,
          dimmed: focusId !== null && focusId !== n.id,
        }
      : {
          node: n,
          knowledgeCount: 0,
          selected: search.nodeId === n.id,
          dimmed: focusId !== null && focusId !== n.id,
        };
    return {
      id: n.id,
      type: isParent ? "container" : "node",
      position: n.position,
      width: n.width,
      height: n.height,
      parentId: n.parentId ?? undefined,
      extent: n.parentId ? ("parent" as const) : undefined,
      data: data as Record<string, unknown>,
      selectable: true,
      draggable: false,
    };
  });

  const xyEdges: Edge[] = layouted.edges
    .filter((e) => e.type === "dependency")
    .map((e) => {
      const target = nodesById.get(e.toId);
      const dimmed = focusId !== null && !focusOutgoing.has(e.id);
      return {
        id: e.id,
        source: e.fromId,
        target: e.toId,
        type: "dependency",
        data: { targetStatus: target?.status ?? "active", dimmed },
      };
    });

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={xyNodes}
        edges={xyEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <MiniMap zoomable pannable />
      </ReactFlow>
    </div>
  );
}

GraphCanvas.displayName = "GraphCanvas";
```

- [ ] **Step 2: Create EmptyState (stub for now; full version in Task 30)**

```tsx
// apps/web/src/features/graph/components/EmptyState.tsx
export function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      This project doesn't have any work nodes yet.
    </div>
  );
}

export function LoadingState({ message }: { message: string }) {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{message}</div>;
}

export function ErrorState({ error }: { error: Error }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="rounded-lg border border-destructive p-4 text-sm text-destructive">
        Failed to load graph: {error.message}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + smoke**

Run: `cd apps/web && pnpm tsc -b --noEmit && pnpm dev` (in another terminal), visit a project graph route.
Expected: type checks pass. Visiting the route shows status-tinted nodes and edges, dependency edges colored by target status, hover dims unrelated edges.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/graph/components/GraphCanvas.tsx apps/web/src/features/graph/components/EmptyState.tsx
git commit -m "feat(web): GraphCanvas wires custom node/edge types, aggregation, hover focus, URL selection"
```

---

## Task 25: useNodeEntries hook

**Files:**
- Create: `apps/web/src/features/graph/hooks/use-node-entries.ts`

Fetches knowledge entries for a node via `listEntriesEndpoint?nodeId=…`. Disabled when no node is selected.

- [ ] **Step 1: Implement**

```ts
// apps/web/src/features/graph/hooks/use-node-entries.ts
import { useQuery } from "@tanstack/react-query";
import { listEntriesEndpoint } from "@zet-plane/contracts";
import { apiCall } from "@/lib/api-client";

export function useNodeEntries(projectId: string, nodeId: string | null | undefined) {
  return useQuery({
    queryKey: ["project", projectId, "entries", { nodeId }],
    queryFn: () => apiCall(listEntriesEndpoint, { params: { id: projectId }, query: { nodeId: nodeId ?? undefined } }),
    enabled: Boolean(nodeId),
  });
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm tsc -b --noEmit`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/graph/hooks/use-node-entries.ts
git commit -m "feat(web): useNodeEntries query for selected node"
```

---

## Task 26: DetailPanel component

**Files:**
- Create: `apps/web/src/features/graph/components/DetailPanel.tsx`

Renders the right-side detail. Fields: title, description, type, status, createdBy, timestamps, checkpoint info, knowledge list (inline-expand), dependency in/out lists.

- [ ] **Step 1: Implement**

```tsx
// apps/web/src/features/graph/components/DetailPanel.tsx
import { useState } from "react";
import type { NodeResponse, EdgeResponse, KnowledgeEntryResponse } from "@zet-plane/contracts";
import { useNodeEntries } from "../hooks/use-node-entries";

type Props = {
  projectId: string;
  nodes: NodeResponse[];
  edges: EdgeResponse[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
};

export function DetailPanel({ projectId, nodes, edges, selectedNodeId, onSelectNode }: Props) {
  const selected = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null;
  const { data: entries } = useNodeEntries(projectId, selectedNodeId);

  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Select a node to see details.
      </div>
    );
  }

  const outgoing = edges.filter((e) => e.type === "dependency" && e.fromId === selected.id);
  const incoming = edges.filter((e) => e.type === "dependency" && e.toId === selected.id);

  return (
    <div className="flex h-full flex-col overflow-auto p-4 text-sm">
      <header className="mb-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {selected.type} · {selected.status}
        </div>
        <h2 className="mt-1 text-lg font-semibold">{selected.title}</h2>
        {selected.description && (
          <p className="mt-1 text-sm text-muted-foreground">{selected.description}</p>
        )}
      </header>

      <Section title="Meta">
        <Field label="Created by" value={selected.createdBy} />
        <Field label="Created" value={new Date(selected.createdAt).toLocaleString()} />
        <Field label="Updated" value={new Date(selected.updatedAt).toLocaleString()} />
        {selected.isCheckpoint && (
          <Field label="Checkpoint" value={selected.checkpointResolution ?? "unresolved"} />
        )}
      </Section>

      <Section title={`Knowledge (${entries?.length ?? 0})`}>
        {!entries && <div className="text-muted-foreground">Loading…</div>}
        {entries && entries.length === 0 && <div className="text-muted-foreground">No knowledge entries.</div>}
        {entries && entries.map((entry) => <EntryRow key={entry.id} entry={entry} />)}
      </Section>

      <Section title={`Outgoing dependencies (${outgoing.length})`}>
        {outgoing.length === 0 && <div className="text-muted-foreground">None.</div>}
        {outgoing.map((e) => {
          const target = nodes.find((n) => n.id === e.toId);
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => onSelectNode(e.toId)}
              className="block w-full rounded px-2 py-1 text-left hover:bg-accent"
            >
              {target?.title ?? e.toId} <span className="text-xs text-muted-foreground">({target?.status ?? "?"})</span>
            </button>
          );
        })}
      </Section>

      <Section title={`Incoming dependencies (${incoming.length})`}>
        {incoming.length === 0 && <div className="text-muted-foreground">None.</div>}
        {incoming.map((e) => {
          const source = nodes.find((n) => n.id === e.fromId);
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => onSelectNode(e.fromId)}
              className="block w-full rounded px-2 py-1 text-left hover:bg-accent"
            >
              {source?.title ?? e.fromId} <span className="text-xs text-muted-foreground">({source?.status ?? "?"})</span>
            </button>
          );
        })}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function EntryRow({ entry }: { entry: KnowledgeEntryResponse }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded border border-border p-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-baseline justify-between text-left">
        <span>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{entry.category}</span>{" "}
          <span className="font-medium">{entry.title}</span>
        </span>
        <span className="text-xs text-muted-foreground">{entry.status}</span>
      </button>
      {open && (
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
          {JSON.stringify(entry.body, null, 2)}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm tsc -b --noEmit`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/graph/components/DetailPanel.tsx
git commit -m "feat(web): DetailPanel renders meta, knowledge entries, dependency lists"
```

---

## Task 27: Wire DetailPanel into the route shell (three-pane)

**Files:**
- Modify: `apps/web/src/router/projects.$projectId.graph.tsx`
- Modify: `apps/web/src/features/graph/components/GraphCanvas.tsx` (extract data exposure)

Refactor so the route mounts both `GraphCanvas` and `DetailPanel` side-by-side. The data flows from a small shared layer.

- [ ] **Step 1: Extract a shared hook**

Create `apps/web/src/features/graph/hooks/use-graph-page.ts`:

```ts
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useProjectGraph } from "./use-project-graph";

export function useGraphPage(projectId: string) {
  const { data, isLoading, error, isFetching, dataUpdatedAt, refetch } = useProjectGraph(projectId);
  const search = useSearch({ from: "/projects/$projectId/graph" });
  const navigate = useNavigate({ from: "/projects/$projectId/graph" });

  const setSelectedNodeId = (id: string | null) =>
    navigate({ search: (prev) => ({ ...prev, nodeId: id ?? undefined }) });

  return {
    graph: data,
    isLoading,
    error,
    isFetching,
    dataUpdatedAt,
    refetch,
    selectedNodeId: search.nodeId ?? null,
    setSelectedNodeId,
  };
}
```

- [ ] **Step 2: Update GraphCanvas to accept data via props**

Replace the top of `apps/web/src/features/graph/components/GraphCanvas.tsx` so it takes data via props rather than calling `useProjectGraph` itself. Open the file and replace its contents with:

```tsx
import { useMemo, useCallback } from "react";
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useLayoutedGraph } from "../layout/use-layouted-graph";
import { aggregateStatus } from "../domain/aggregate-status";
import { useGraphViewStore } from "@/stores/graph-view.store";
import type { ProjectGraph } from "../domain/types";
import { NodeCard, type NodeCardData } from "./NodeCard";
import { ContainerCard, type ContainerCardData } from "./ContainerCard";
import { DependencyEdge } from "./DependencyEdge";
import { EmptyState, LoadingState, ErrorState } from "./EmptyState";

const nodeTypes = { node: NodeCard, container: ContainerCard };
const edgeTypes = { dependency: DependencyEdge };

type Props = {
  graph: ProjectGraph | undefined;
  isLoading: boolean;
  error: Error | null;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
};

export function GraphCanvas({ graph, isLoading, error, selectedNodeId, onSelectNode }: Props) {
  const { data: layouted, isLayouting, error: layoutErr } = useLayoutedGraph(graph);
  const hoveredNodeId = useGraphViewStore((s) => s.hoveredNodeId);
  const setHoveredNodeId = useGraphViewStore((s) => s.setHoveredNodeId);

  const aggregation = useMemo(() => (graph ? aggregateStatus(graph) : new Map()), [graph]);
  const isContainer = useMemo(() => {
    const set = new Set<string>();
    if (layouted) for (const n of layouted.nodes) if (n.parentId) set.add(n.parentId);
    return set;
  }, [layouted]);

  const focusId = hoveredNodeId ?? selectedNodeId;
  const focusEdgeIds = useMemo(() => {
    if (!focusId || !graph) return new Set<string>();
    const ids = new Set<string>();
    for (const e of graph.edges) {
      if (e.type === "dependency" && (e.fromId === focusId || e.toId === focusId)) ids.add(e.id);
    }
    return ids;
  }, [focusId, graph]);

  const nodesById = useMemo(() => new Map(graph?.nodes.map((n) => [n.id, n]) ?? []), [graph]);

  const onNodeClick = useCallback((_: unknown, n: Node) => onSelectNode(n.id), [onSelectNode]);
  const onPaneClick = useCallback(() => onSelectNode(null), [onSelectNode]);
  const onNodeMouseEnter = useCallback((_: unknown, n: Node) => setHoveredNodeId(n.id), [setHoveredNodeId]);
  const onNodeMouseLeave = useCallback(() => setHoveredNodeId(null), [setHoveredNodeId]);

  if (isLoading) return <LoadingState message="Loading graph…" />;
  if (error) return <ErrorState error={error} />;
  if (layoutErr) return <ErrorState error={layoutErr} />;
  if (isLayouting || !layouted) return <LoadingState message="Laying out…" />;
  if (layouted.nodes.length === 0) return <EmptyState />;

  const xyNodes: Node[] = layouted.nodes.map((n) => {
    const isParent = isContainer.has(n.id);
    const data: NodeCardData | ContainerCardData = isParent
      ? {
          node: n,
          aggregation: aggregation.get(n.id) ?? { worst: null, counts: { blocked: 0, active: 0, completed: 0, archived: 0 } },
          knowledgeCount: 0,
          selected: selectedNodeId === n.id,
          dimmed: focusId !== null && focusId !== n.id,
        }
      : {
          node: n,
          knowledgeCount: 0,
          selected: selectedNodeId === n.id,
          dimmed: focusId !== null && focusId !== n.id,
        };
    return {
      id: n.id,
      type: isParent ? "container" : "node",
      position: n.position,
      width: n.width,
      height: n.height,
      parentId: n.parentId ?? undefined,
      extent: n.parentId ? ("parent" as const) : undefined,
      data: data as Record<string, unknown>,
      selectable: true,
      draggable: false,
    };
  });

  const xyEdges: Edge[] = layouted.edges
    .filter((e) => e.type === "dependency")
    .map((e) => {
      const target = nodesById.get(e.toId);
      const dimmed = focusId !== null && !focusEdgeIds.has(e.id);
      return {
        id: e.id,
        source: e.fromId,
        target: e.toId,
        type: "dependency",
        data: { targetStatus: target?.status ?? "active", dimmed },
      };
    });

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={xyNodes}
        edges={xyEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <MiniMap zoomable pannable nodeColor={(n) => {
          const d = n.data as { node?: { status?: string } } | undefined;
          const s = d?.node?.status;
          if (s === "blocked") return "var(--zp-status-blocked)";
          if (s === "completed") return "var(--zp-status-completed)";
          if (s === "archived") return "var(--zp-status-archived)";
          return "var(--zp-status-active)";
        }} />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 3: Update the route to a three-pane layout**

Replace `apps/web/src/router/projects.$projectId.graph.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { GraphCanvas } from "@/features/graph/components/GraphCanvas";
import { DetailPanel } from "@/features/graph/components/DetailPanel";
import { useGraphPage } from "@/features/graph/hooks/use-graph-page";
import { graphSearchSchema } from "@/lib/schemas/graph-search";

function GraphRoute() {
  const { projectId } = Route.useParams();
  const { graph, isLoading, error, selectedNodeId, setSelectedNodeId } = useGraphPage(projectId);

  return (
    <div className="grid h-full grid-cols-[1fr_360px]">
      <GraphCanvas
        graph={graph}
        isLoading={isLoading}
        error={error}
        selectedNodeId={selectedNodeId}
        onSelectNode={setSelectedNodeId}
      />
      <aside className="border-l border-border bg-background">
        <DetailPanel
          projectId={projectId}
          nodes={graph?.nodes ?? []}
          edges={graph?.edges ?? []}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
        />
      </aside>
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId/graph")({
  validateSearch: (raw) => graphSearchSchema.parse(raw),
  component: GraphRoute,
});
```

- [ ] **Step 4: Type-check + smoke**

Run: `cd apps/web && pnpm tsc -b --noEmit && pnpm dev` then visit a project graph route.
Expected: three-pane layout, click a node to populate panel, click empty pane to clear selection, URL `?nodeId=` updates.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/graph/hooks/use-graph-page.ts apps/web/src/features/graph/components/GraphCanvas.tsx apps/web/src/router/projects.\$projectId.graph.tsx
git commit -m "feat(web): three-pane canvas + detail panel wired by useGraphPage"
```

---

## Task 28: Center-on-mount for `?nodeId=`

**Files:**
- Modify: `apps/web/src/features/graph/components/GraphCanvas.tsx`

When the route mounts with `?nodeId=` set, instead of `fitView`, center+zoom on that node.

- [ ] **Step 1: Add the effect**

In `GraphCanvas.tsx`, add the following imports near the top:

```tsx
import { useEffect, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
```

Then add this hook above the `return` of `GraphCanvas`:

```tsx
const rfApi = useReactFlow();
const initialCenterDone = useRef(false);
useEffect(() => {
  if (initialCenterDone.current) return;
  if (!layouted) return;
  if (!selectedNodeId) {
    rfApi.fitView({ padding: 0.1 });
    initialCenterDone.current = true;
    return;
  }
  const target = layouted.nodes.find((n) => n.id === selectedNodeId);
  if (target) {
    rfApi.setCenter(
      target.position.x + target.width / 2,
      target.position.y + target.height / 2,
      { zoom: 1.2, duration: 400 },
    );
    initialCenterDone.current = true;
  }
}, [layouted, selectedNodeId, rfApi]);
```

Also wrap the `<ReactFlow>` provider context — `useReactFlow` requires `ReactFlowProvider`. Update the return to:

```tsx
import { ReactFlowProvider } from "@xyflow/react";

// inside GraphCanvas:
return (
  <ReactFlowProvider>
    <CanvasInner ... />
  </ReactFlowProvider>
);
```

For minimal churn, extract the existing render into a private `CanvasInner` function that contains the hook and the JSX; the exported `GraphCanvas` wraps it in `<ReactFlowProvider>`. Full updated structure:

```tsx
export function GraphCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ graph, isLoading, error, selectedNodeId, onSelectNode }: Props) {
  // ... existing body of GraphCanvas, plus the useEffect above ...
}
```

- [ ] **Step 2: Type-check + smoke**

Run: `cd apps/web && pnpm tsc -b --noEmit && pnpm dev`, navigate to `/projects/<id>/graph` (should `fitView`), then click a node (URL gains `?nodeId=`), then reload (should re-center on that node).
Expected: behavior matches; no console error about provider context.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/graph/components/GraphCanvas.tsx
git commit -m "feat(web): center-on-mount when nodeId search param is present"
```

---

## Task 29: UpdatedAgo chip

**Files:**
- Create: `apps/web/src/features/graph/components/UpdatedAgo.tsx`
- Create: `apps/web/src/features/graph/components/UpdatedAgo.test.ts`
- Modify: `apps/web/src/router/projects.$projectId.graph.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/graph/components/UpdatedAgo.test.ts
import { describe, it, expect } from "vitest";
import { formatUpdatedAgo } from "./UpdatedAgo";

describe("formatUpdatedAgo", () => {
  it("renders 'just now' under 5 seconds", () => {
    expect(formatUpdatedAgo(2)).toBe("just now");
  });
  it("renders seconds under a minute", () => {
    expect(formatUpdatedAgo(30)).toBe("Updated 30s ago");
  });
  it("renders minutes under an hour", () => {
    expect(formatUpdatedAgo(125)).toBe("Updated 2m ago");
  });
  it("renders hours otherwise", () => {
    expect(formatUpdatedAgo(7200)).toBe("Updated 2h ago");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm vitest run src/features/graph/components/UpdatedAgo.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/web/src/features/graph/components/UpdatedAgo.tsx
import { useEffect, useState } from "react";

export function formatUpdatedAgo(secondsAgo: number): string {
  if (secondsAgo < 5) return "just now";
  if (secondsAgo < 60) return `Updated ${Math.floor(secondsAgo)}s ago`;
  if (secondsAgo < 3600) return `Updated ${Math.floor(secondsAgo / 60)}m ago`;
  return `Updated ${Math.floor(secondsAgo / 3600)}h ago`;
}

type Props = {
  updatedAtMs: number;
  onRefresh: () => void;
  isFetching: boolean;
};

export function UpdatedAgo({ updatedAtMs, onRefresh, isFetching }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  const secondsAgo = updatedAtMs > 0 ? Math.max(0, (now - updatedAtMs) / 1000) : 0;

  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isFetching}
      className="absolute bottom-3 left-3 z-10 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm hover:bg-accent disabled:opacity-50"
    >
      {isFetching ? "Refreshing…" : updatedAtMs > 0 ? formatUpdatedAgo(secondsAgo) : "Never updated"}
    </button>
  );
}
```

- [ ] **Step 4: Run pure tests**

Run: `cd apps/web && pnpm vitest run src/features/graph/components/UpdatedAgo.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Mount in the route**

Update `apps/web/src/router/projects.$projectId.graph.tsx`:

```tsx
// add to imports:
import { UpdatedAgo } from "@/features/graph/components/UpdatedAgo";

// inside GraphRoute, destructure isFetching/dataUpdatedAt/refetch from useGraphPage:
const { graph, isLoading, error, isFetching, dataUpdatedAt, refetch, selectedNodeId, setSelectedNodeId } = useGraphPage(projectId);

// wrap the GraphCanvas column to host the chip:
<div className="relative">
  <GraphCanvas
    graph={graph}
    isLoading={isLoading}
    error={error}
    selectedNodeId={selectedNodeId}
    onSelectNode={setSelectedNodeId}
  />
  <UpdatedAgo updatedAtMs={dataUpdatedAt} onRefresh={refetch} isFetching={isFetching} />
</div>
```

(Make sure the parent grid cell is `position: relative` so the absolute chip anchors correctly — adjust the `grid-cols-[1fr_360px]` parent's first column wrapper accordingly.)

- [ ] **Step 6: Smoke check**

Run: `cd apps/web && pnpm dev`, visit a graph, observe the chip in the bottom-left. Click to refresh.
Expected: chip shows "just now" → counts up; click triggers refetch.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/graph/components/UpdatedAgo.tsx apps/web/src/features/graph/components/UpdatedAgo.test.ts apps/web/src/router/projects.\$projectId.graph.tsx
git commit -m "feat(web): Updated Xs ago chip with manual refetch"
```

---

## Task 30: Legend component

**Files:**
- Create: `apps/web/src/features/graph/components/Legend.tsx`
- Modify: `apps/web/src/router/projects.$projectId.graph.tsx`

A collapsible legend in the top-right of the canvas. Default open on first visit (session-scoped state via Zustand UI extension is overkill — use local component state).

- [ ] **Step 1: Implement**

```tsx
// apps/web/src/features/graph/components/Legend.tsx
import { useState } from "react";

export function Legend() {
  const [open, setOpen] = useState(true);

  return (
    <div className="absolute right-3 top-3 z-10 rounded-md border border-border bg-background text-xs shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="block w-full px-2 py-1 text-left font-medium hover:bg-accent"
      >
        {open ? "Legend ▾" : "Legend ▸"}
      </button>
      {open && (
        <div className="space-y-2 border-t border-border p-2">
          <Row swatch={<span className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--zp-status-active)" }} />} label="Active" />
          <Row swatch={<span className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--zp-status-blocked)" }} />} label="Blocked" />
          <Row swatch={<span className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--zp-status-completed)" }} />} label="Completed" />
          <Row swatch={<span className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--zp-status-archived)" }} />} label="Archived" />
          <hr className="border-border" />
          <Row swatch={<span className="inline-block h-3 w-6 border-y-2 border-foreground" />} label="Scaffold (solid border)" />
          <Row swatch={<span className="inline-block h-3 w-6 border-y-2 border-dashed border-foreground" />} label="Growth (dashed border)" />
          <hr className="border-border" />
          <Row swatch={<span>⚑</span>} label="Checkpoint" />
          <Row swatch={<span>K3</span>} label="Knowledge entry count" />
        </div>
      )}
    </div>
  );
}

function Row({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex w-5 justify-center">{swatch}</span>
      <span>{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: Mount in route (alongside UpdatedAgo)**

In `apps/web/src/router/projects.$projectId.graph.tsx`, add:

```tsx
import { Legend } from "@/features/graph/components/Legend";

// inside the relative wrapper around GraphCanvas:
<Legend />
```

- [ ] **Step 3: Smoke check**

Run dev, see legend top-right, toggle open/closed.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/graph/components/Legend.tsx apps/web/src/router/projects.\$projectId.graph.tsx
git commit -m "feat(web): collapsible legend chrome"
```

---

## Task 31: ProjectSwitcher in left rail

**Files:**
- Create: `apps/web/src/features/graph/components/ProjectSwitcher.tsx`
- Modify: `apps/web/src/router/projects.$projectId.tsx`

- [ ] **Step 1: Implement**

```tsx
// apps/web/src/features/graph/components/ProjectSwitcher.tsx
import { useNavigate } from "@tanstack/react-router";
import { useProjectsList } from "@/features/projects/hooks/use-projects-list";

type Props = { activeProjectId: string };

export function ProjectSwitcher({ activeProjectId }: Props) {
  const { data } = useProjectsList();
  const navigate = useNavigate();

  return (
    <select
      value={activeProjectId}
      onChange={(e) => navigate({ to: "/projects/$projectId/graph", params: { projectId: e.target.value } })}
      className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
    >
      {(data ?? []).map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Mount in shell**

In `apps/web/src/router/projects.$projectId.tsx`, replace the contents of the `<aside>` with:

```tsx
<aside className="row-start-2 flex flex-col gap-3 border-r border-border p-3 text-sm">
  <ProjectSwitcher activeProjectId={projectId} />
  <nav className="flex flex-col gap-1">
    <Link
      to="/projects/$projectId/graph"
      params={{ projectId }}
      className="rounded px-2 py-1 hover:bg-accent"
      activeProps={{ className: "rounded px-2 py-1 bg-accent font-medium" }}
    >
      Graph
    </Link>
  </nav>
</aside>
```

Add the import:

```tsx
import { ProjectSwitcher } from "@/features/graph/components/ProjectSwitcher";
```

- [ ] **Step 3: Smoke check**

Run dev, switch projects via the dropdown, confirm route changes.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/graph/components/ProjectSwitcher.tsx apps/web/src/router/projects.\$projectId.tsx
git commit -m "feat(web): ProjectSwitcher in left rail"
```

---

## Task 32: Improved empty / error states

**Files:**
- Modify: `apps/web/src/features/graph/components/EmptyState.tsx`

Adds Retry button on error, distinct message for root-only project.

- [ ] **Step 1: Replace the file**

```tsx
// apps/web/src/features/graph/components/EmptyState.tsx
type EmptyProps = { rootOnly?: boolean };

export function EmptyState({ rootOnly }: EmptyProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
      <div>{rootOnly ? "This project doesn't have any work nodes yet." : "Nothing to display."}</div>
    </div>
  );
}

export function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      <div>{message}</div>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md rounded-lg border border-destructive bg-background p-4 text-center text-sm">
        <div className="mb-2 font-medium text-destructive">Failed to load graph</div>
        <div className="mb-3 text-muted-foreground">{error.message}</div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md border border-border px-3 py-1 text-xs hover:bg-accent"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Pass `onRetry` from GraphCanvas**

In `apps/web/src/features/graph/components/GraphCanvas.tsx`, extend `Props`:

```tsx
type Props = {
  graph: ProjectGraph | undefined;
  isLoading: boolean;
  error: Error | null;
  onRetry?: () => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
};
```

Use it:

```tsx
if (error) return <ErrorState error={error} onRetry={onRetry} />;
if (layoutErr) return <ErrorState error={layoutErr} />;
```

Detect root-only:

```tsx
if (layouted.nodes.length <= 1) return <EmptyState rootOnly />;
```

- [ ] **Step 3: Wire `onRetry` in the route**

In `apps/web/src/router/projects.$projectId.graph.tsx`, pass `onRetry={refetch}` to `<GraphCanvas …>`.

- [ ] **Step 4: Smoke check**

Stop the API server, refresh the page → see ErrorState with Retry. Start API, click Retry → recovers.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/graph/components/EmptyState.tsx apps/web/src/features/graph/components/GraphCanvas.tsx apps/web/src/router/projects.\$projectId.graph.tsx
git commit -m "feat(web): polished empty/loading/error states with retry"
```

---

## Task 33: Playwright canvas smoke test

**Files:**
- Modify: `apps/web/e2e/canvas.spec.ts` (create if absent)

End-to-end smoke that loads a project page, asserts the canvas renders, clicks a node, and asserts the URL gains `?nodeId=`.

Note: this test assumes a seeded project exists. If your dev DB doesn't have one, the plan executor should create one manually first (or via a seed script).

- [ ] **Step 1: Write the test**

```ts
// apps/web/e2e/canvas.spec.ts
import { test, expect } from "@playwright/test";

test("graph canvas renders and selection updates URL", async ({ page, baseURL }) => {
  await page.goto(`${baseURL ?? "http://localhost:3001"}/projects`);
  // pick the first project in the list
  const firstLink = page.locator("a[href^='/projects/']").first();
  await expect(firstLink).toBeVisible();
  await firstLink.click();

  // canvas mounted (xyflow root)
  await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10000 });

  // wait for at least one zp-node
  const someNode = page.locator(".zp-node, .zp-container").first();
  await expect(someNode).toBeVisible({ timeout: 10000 });

  // click it; URL should gain ?nodeId=
  await someNode.click();
  await expect(page).toHaveURL(/nodeId=/);

  // detail panel should show a heading
  await expect(page.locator("aside h2")).toBeVisible();
});
```

- [ ] **Step 2: Run the test**

Run: `cd apps/web && pnpm dev` in one terminal, then `cd apps/web && pnpm test:e2e` in another.
Expected: test passes. If it fails because there's no project, create one via the API (`POST /api/projects { name: "Smoke" }`) and seed at least one node, then re-run.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/canvas.spec.ts
git commit -m "test(web): Playwright canvas smoke covers render and selection"
```

---

## Task 34: Final tidy + full test run

- [ ] **Step 1: Run all unit tests**

Run: `cd apps/web && pnpm test`
Expected: all suites green.

- [ ] **Step 2: Run lint**

Run: `cd apps/web && pnpm lint`
Expected: zero violations. Fix any inline.

- [ ] **Step 3: Run type check**

Run: `cd apps/web && pnpm tsc -b --noEmit`
Expected: zero errors.

- [ ] **Step 4: Workspace-wide build smoke**

Run: `pnpm -w build`
Expected: all packages build. `apps/web/dist` exists.

- [ ] **Step 5: Final commit (if any cleanup happened)**

```bash
git add -A
git commit -m "chore(web): finalize graph canvas v1"
```

(If no cleanup was needed, skip this step.)

---

## Out of scope (deferred to v2)

- Node editing (create / rename / change status / resolve checkpoint / delete strategies)
- Edge creation / deletion via canvas
- Staging node rendering (`staging_root` subtree, `staging` node type)
- WebSocket real-time invalidation (the canvas is ready — only the WS plumbing is missing)
- Viewport (zoom/pan) persisted to URL
- `createdBy` visual channel on nodes (currently detail-panel only)
- Drag to re-arrange / manually-stored positions
- Collapse/expand composition containers
- Knowledge revision browser inline in DetailPanel
- Multi-workspace / team boundaries
