# Graph Rendering Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing card-based Graph rendering with a Pill-idiom, dive-in-only model that gives Scaffold visual prominence as the project's rail and treats Growth as the dominant population. Implements the spec at [docs/superpowers/specs/2026-05-16-graph-rendering-model.md](../specs/2026-05-16-graph-rendering-model.md).

**Architecture:** A pure `canvas-view` domain function derives the visible region (hero + direct children + sibling dependency edges + cross-boundary stubs) from the full graph and a focused-node id. URL search params (`?focus=<nodeId>`) drive dive-in navigation; localStorage drives the knowledge-visibility toggle. The renderer is React + xyflow with a single custom node type (Pill) and a single edge type (dependency, with a dashed variant for knowledge anchors). `ContainerCard`, `NodeCard`, and `CompositionEdge` are deleted.

**Tech Stack:** React 19, xyflow/react 12, @tanstack/react-router 1.x, zod 4, zustand 5, elkjs 0.11, vitest, @testing-library/react, Playwright (e2e).

---

## Scope Check

The spec is a single cohesive frontend refactor of the Graph view in `apps/web`. No backend changes (those are deferred to spec §7). No splitting needed.

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `apps/web/src/features/graph/domain/canvas-view.ts` | Pure function: `(graph, focusedNodeId) → CanvasView` — returns hero node, direct composition children, sibling dependency edges, cross-boundary peripheral stubs, isTopLevel flag |
| `apps/web/src/features/graph/domain/canvas-view.test.ts` | Unit tests for canvas-view |
| `apps/web/src/features/graph/domain/breadcrumb.ts` | Pure function: `(graph, focusedNodeId) → BreadcrumbSegment[]` — returns ordered ancestors from project root down to focused node |
| `apps/web/src/features/graph/domain/breadcrumb.test.ts` | Unit tests for breadcrumb |
| `apps/web/src/features/graph/hooks/use-canvas-navigation.ts` | Reads `focus` from router search params, exposes `focusedNodeId`, `diveInto(id)`, `diveUpTo(id)`, `diveToRoot()` |
| `apps/web/src/features/graph/hooks/use-knowledge-toggle.ts` | localStorage-backed boolean, default false |
| `apps/web/src/features/graph/components/Pill.tsx` | Sibling pill rendered as an xyflow custom node. Scaffold and Growth variants via prop; status tint; flag-tab notch on Scaffold; trailing chips (`K{n}`, `↳{n}`); aggregate bar along bottom |
| `apps/web/src/features/graph/components/Pill.test.tsx` | RTL tests for Pill variants |
| `apps/web/src/features/graph/components/HeroToken.tsx` | The direct-parent presentation. Two variants: `ScaffoldHero` (scaled-up Scaffold pill, no aggregate bar) and `ProjectHero` (larger title, no flag-tab notch, no aggregate bar) |
| `apps/web/src/features/graph/components/Breadcrumb.tsx` | Renders a row of clickable segments; last segment styled as the current focus |
| `apps/web/src/features/graph/components/StagingPanel.tsx` | Right-side panel showing the staging region. Renders a list of Pills for any node whose `role === 'staging_root'` or whose ancestry routes through one. Shown only on the top-level canvas |
| `apps/web/src/features/graph/components/PeripheralStub.tsx` | Faded margin pill representing a cross-boundary node. Click → diveTo it. Smaller, half-opacity, `↗` glyph |
| `apps/web/src/features/graph/components/KnowledgePill.tsx` | Smaller violet pill for a knowledge entry. Stub for v1; appears only when toggle is on (data fetch deferred to a follow-up) |
| `apps/web/src/features/graph/components/KnowledgeToggle.tsx` | A toggle button in the canvas chrome bound to `use-knowledge-toggle` |

**Modified files:**

| Path | Change |
|---|---|
| `apps/web/src/features/graph/components/GraphCanvas.tsx` | Restructure: consume `useCanvasNavigation`, call `canvasView()` and `breadcrumb()`, render `<Breadcrumb>`, `<HeroToken>`, the xyflow canvas with Pills for siblings + PeripheralStubs at margins, plus `<StagingPanel>` on top-level |
| `apps/web/src/features/graph/components/DependencyEdge.tsx` | Add a `variant: 'flow' \| 'knowledge'` data field; render dashed style when `variant === 'knowledge'` |
| `apps/web/src/features/graph/components/Legend.tsx` | Replace "Scaffold solid / Growth dashed" entries with the new pill silhouettes and knowledge toggle hint |
| `apps/web/src/features/graph/styles.css` | Replace `.zp-node--*` and `.zp-container--*` card rules with `.zp-pill--*`, `.zp-pill--scaffold`, `.zp-pill--growth`, hero variants, peripheral stub, knowledge pill |
| `apps/web/src/lib/schemas/graph-search.ts` | Add `focus: z.string().min(1).optional()` (alongside existing `nodeId`, which remains the selection param) |
| `apps/web/src/router/projects.$projectId.graph.tsx` | No structural change to layout; passes router search/navigate down so `useCanvasNavigation` can wire to the route |

**Deleted files:**

| Path |
|---|
| `apps/web/src/features/graph/components/NodeCard.tsx` |
| `apps/web/src/features/graph/components/NodeCard.test.tsx` |
| `apps/web/src/features/graph/components/ContainerCard.tsx` |
| `apps/web/src/features/graph/components/CompositionEdge.tsx` |
| `apps/web/src/features/graph/components/CompositionEdge.test.tsx` |

---

### Task 1: `canvas-view` domain function

**Files:**
- Create: `apps/web/src/features/graph/domain/canvas-view.ts`
- Test: `apps/web/src/features/graph/domain/canvas-view.test.ts`

The function takes the full `ProjectGraph` and a `focusedNodeId` (or `null` meaning project root), and returns the visible region for that canvas.

Shape:

```ts
export type CanvasView = {
  hero: NodeResponse;              // direct parent (project root or dived-in scaffold)
  isTopLevel: boolean;             // true when focusedNodeId is null or points to project root
  children: NodeResponse[];        // direct composition children of hero
  siblingDependencyEdges: EdgeResponse[]; // dependency edges where both ends are in `children`
  peripheralStubs: PeripheralStub[];      // external-dependency targets (outside `children`)
};

export type PeripheralStub = {
  external: NodeResponse;          // the node outside the canvas
  side: 'left' | 'right';          // which margin band it renders on
  edges: EdgeResponse[];           // the dependency edges crossing the boundary involving this node
};
```

- [x] **Step 1: Write the failing tests**

Create `apps/web/src/features/graph/domain/canvas-view.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ProjectGraph } from './types';
import { canvasView } from './canvas-view';

const mkNode = (id: string, overrides: Partial<{
  isProjectRoot: boolean;
  type: 'scaffold' | 'growth' | 'staging';
  title: string;
}> = {}): any => ({
  id,
  projectId: 'p',
  isProjectRoot: overrides.isProjectRoot ?? false,
  role: 'regular',
  type: overrides.type ?? 'growth',
  title: overrides.title ?? id,
  description: null,
  status: 'active',
  isCheckpoint: false,
  checkpointResolution: null,
  createdBy: 'human',
  createdAt: '2026-05-16T00:00:00.000Z',
  updatedAt: '2026-05-16T00:00:00.000Z',
});

const mkEdge = (id: string, fromId: string, toId: string, type: 'composition' | 'dependency'): any => ({
  id, projectId: 'p', fromId, toId, type, createdBy: 'human',
  createdAt: '2026-05-16T00:00:00.000Z',
});

describe('canvasView', () => {
  it('returns project root as hero when focusedNodeId is null', () => {
    const graph: ProjectGraph = {
      nodes: [
        mkNode('root', { isProjectRoot: true, type: 'scaffold', title: 'Project' }),
        mkNode('s1', { type: 'scaffold', title: 'Phase 1' }),
        mkNode('s2', { type: 'scaffold', title: 'Phase 2' }),
      ],
      edges: [
        mkEdge('e1', 'root', 's1', 'composition'),
        mkEdge('e2', 'root', 's2', 'composition'),
        mkEdge('e3', 's1', 's2', 'dependency'),
      ],
    };
    const view = canvasView(graph, null);
    expect(view.hero.id).toBe('root');
    expect(view.isTopLevel).toBe(true);
    expect(view.children.map((c) => c.id).sort()).toEqual(['s1', 's2']);
    expect(view.siblingDependencyEdges.map((e) => e.id)).toEqual(['e3']);
    expect(view.peripheralStubs).toEqual([]);
  });

  it('returns scaffold as hero when focused on a scaffold with children', () => {
    const graph: ProjectGraph = {
      nodes: [
        mkNode('root', { isProjectRoot: true, type: 'scaffold' }),
        mkNode('s1', { type: 'scaffold', title: 'Phase 1' }),
        mkNode('g1', { type: 'growth', title: 'Work A' }),
        mkNode('g2', { type: 'growth', title: 'Work B' }),
      ],
      edges: [
        mkEdge('e1', 'root', 's1', 'composition'),
        mkEdge('e2', 's1', 'g1', 'composition'),
        mkEdge('e3', 's1', 'g2', 'composition'),
        mkEdge('e4', 'g1', 'g2', 'dependency'),
      ],
    };
    const view = canvasView(graph, 's1');
    expect(view.hero.id).toBe('s1');
    expect(view.isTopLevel).toBe(false);
    expect(view.children.map((c) => c.id).sort()).toEqual(['g1', 'g2']);
    expect(view.siblingDependencyEdges.map((e) => e.id)).toEqual(['e4']);
  });

  it('builds peripheral stubs for cross-boundary dependency edges', () => {
    const graph: ProjectGraph = {
      nodes: [
        mkNode('root', { isProjectRoot: true, type: 'scaffold' }),
        mkNode('s1', { type: 'scaffold' }),
        mkNode('s2', { type: 'scaffold' }),
        mkNode('g1', { type: 'growth' }),
        mkNode('g2', { type: 'growth' }),
      ],
      edges: [
        mkEdge('e1', 'root', 's1', 'composition'),
        mkEdge('e2', 'root', 's2', 'composition'),
        mkEdge('e3', 's1', 'g1', 'composition'),
        mkEdge('e4', 's2', 'g2', 'composition'),
        mkEdge('e5', 'g1', 'g2', 'dependency'), // crosses boundary: g1 ∈ canvas of s1, g2 outside
      ],
    };
    const view = canvasView(graph, 's1');
    expect(view.children.map((c) => c.id)).toEqual(['g1']);
    expect(view.siblingDependencyEdges).toEqual([]);
    expect(view.peripheralStubs).toHaveLength(1);
    expect(view.peripheralStubs[0].external.id).toBe('g2');
    expect(view.peripheralStubs[0].edges.map((e) => e.id)).toEqual(['e5']);
  });

  it('returns empty children when hero has no composition children', () => {
    const graph: ProjectGraph = {
      nodes: [
        mkNode('root', { isProjectRoot: true, type: 'scaffold' }),
        mkNode('s1', { type: 'scaffold' }),
      ],
      edges: [mkEdge('e1', 'root', 's1', 'composition')],
    };
    const view = canvasView(graph, 's1');
    expect(view.hero.id).toBe('s1');
    expect(view.children).toEqual([]);
    expect(view.siblingDependencyEdges).toEqual([]);
    expect(view.peripheralStubs).toEqual([]);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && pnpm vitest run src/features/graph/domain/canvas-view.test.ts`
Expected: FAIL with "Cannot find module './canvas-view'".

- [x] **Step 3: Implement `canvas-view.ts`**

Create `apps/web/src/features/graph/domain/canvas-view.ts`:

```ts
import type { EdgeResponse, NodeResponse } from '@zet-plane/contracts';
import type { ProjectGraph } from './types';

export type PeripheralStub = {
  external: NodeResponse;
  side: 'left' | 'right';
  edges: EdgeResponse[];
};

export type CanvasView = {
  hero: NodeResponse;
  isTopLevel: boolean;
  children: NodeResponse[];
  siblingDependencyEdges: EdgeResponse[];
  peripheralStubs: PeripheralStub[];
};

export function canvasView(
  graph: ProjectGraph,
  focusedNodeId: string | null,
): CanvasView {
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));

  const root = graph.nodes.find((n) => n.isProjectRoot);
  if (!root) {
    throw new Error('canvasView: project root not found in graph');
  }

  const hero = focusedNodeId ? (nodesById.get(focusedNodeId) ?? root) : root;
  const isTopLevel = hero.id === root.id;

  const childIds: string[] = [];
  for (const e of graph.edges) {
    if (e.type === 'composition' && e.fromId === hero.id) childIds.push(e.toId);
  }
  const childSet = new Set(childIds);
  const children = childIds
    .map((id) => nodesById.get(id))
    .filter((n): n is NodeResponse => n !== undefined);

  const siblingDependencyEdges: EdgeResponse[] = [];
  const stubsByExternalId = new Map<string, PeripheralStub>();

  for (const e of graph.edges) {
    if (e.type !== 'dependency') continue;
    const fromIn = childSet.has(e.fromId);
    const toIn = childSet.has(e.toId);

    if (fromIn && toIn) {
      siblingDependencyEdges.push(e);
      continue;
    }
    if (!fromIn && !toIn) continue; // edge unrelated to this canvas

    const externalId = fromIn ? e.toId : e.fromId;
    const external = nodesById.get(externalId);
    if (!external) continue;

    const side: 'left' | 'right' = fromIn ? 'right' : 'left';
    const existing = stubsByExternalId.get(externalId);
    if (existing) {
      existing.edges.push(e);
    } else {
      stubsByExternalId.set(externalId, { external, side, edges: [e] });
    }
  }

  return {
    hero,
    isTopLevel,
    children,
    siblingDependencyEdges,
    peripheralStubs: Array.from(stubsByExternalId.values()),
  };
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm vitest run src/features/graph/domain/canvas-view.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Commit**

```bash
git add apps/web/src/features/graph/domain/canvas-view.ts apps/web/src/features/graph/domain/canvas-view.test.ts
git commit -m "feat(graph): add canvas-view domain function"
```

---

### Task 2: `breadcrumb` domain function

**Files:**
- Create: `apps/web/src/features/graph/domain/breadcrumb.ts`
- Test: `apps/web/src/features/graph/domain/breadcrumb.test.ts`

Walks composition edges from project root toward the focused node and returns the ordered ancestor chain.

- [x] **Step 1: Write the failing tests**

Create `apps/web/src/features/graph/domain/breadcrumb.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ProjectGraph } from './types';
import { breadcrumb } from './breadcrumb';

const mkNode = (id: string, isProjectRoot = false): any => ({
  id, projectId: 'p', isProjectRoot, role: 'regular', type: 'scaffold',
  title: id.toUpperCase(), description: null, status: 'active',
  isCheckpoint: false, checkpointResolution: null, createdBy: 'human',
  createdAt: '2026-05-16T00:00:00.000Z', updatedAt: '2026-05-16T00:00:00.000Z',
});
const mkEdge = (id: string, fromId: string, toId: string): any => ({
  id, projectId: 'p', fromId, toId, type: 'composition', createdBy: 'human',
  createdAt: '2026-05-16T00:00:00.000Z',
});

describe('breadcrumb', () => {
  it('returns only the root when focusedNodeId is null', () => {
    const graph: ProjectGraph = {
      nodes: [mkNode('root', true), mkNode('s1')],
      edges: [mkEdge('e1', 'root', 's1')],
    };
    expect(breadcrumb(graph, null).map((s) => s.id)).toEqual(['root']);
  });

  it('returns root → focused for a direct child', () => {
    const graph: ProjectGraph = {
      nodes: [mkNode('root', true), mkNode('s1')],
      edges: [mkEdge('e1', 'root', 's1')],
    };
    expect(breadcrumb(graph, 's1').map((s) => s.id)).toEqual(['root', 's1']);
  });

  it('walks the full composition chain to a deep descendant', () => {
    const graph: ProjectGraph = {
      nodes: [mkNode('root', true), mkNode('s1'), mkNode('s2'), mkNode('g1')],
      edges: [
        mkEdge('e1', 'root', 's1'),
        mkEdge('e2', 's1', 's2'),
        mkEdge('e3', 's2', 'g1'),
      ],
    };
    expect(breadcrumb(graph, 'g1').map((s) => s.id)).toEqual([
      'root', 's1', 's2', 'g1',
    ]);
  });

  it('falls back to root only when focused node not found', () => {
    const graph: ProjectGraph = {
      nodes: [mkNode('root', true)],
      edges: [],
    };
    expect(breadcrumb(graph, 'missing').map((s) => s.id)).toEqual(['root']);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && pnpm vitest run src/features/graph/domain/breadcrumb.test.ts`
Expected: FAIL with "Cannot find module './breadcrumb'".

- [x] **Step 3: Implement `breadcrumb.ts`**

Create `apps/web/src/features/graph/domain/breadcrumb.ts`:

```ts
import type { NodeResponse } from '@zet-plane/contracts';
import type { ProjectGraph } from './types';

export type BreadcrumbSegment = {
  id: string;
  title: string;
  isRoot: boolean;
};

export function breadcrumb(
  graph: ProjectGraph,
  focusedNodeId: string | null,
): BreadcrumbSegment[] {
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const root = graph.nodes.find((n) => n.isProjectRoot);
  if (!root) return [];

  const rootSeg: BreadcrumbSegment = { id: root.id, title: root.title, isRoot: true };
  if (!focusedNodeId || focusedNodeId === root.id) return [rootSeg];
  if (!nodesById.has(focusedNodeId)) return [rootSeg];

  const parentOf = new Map<string, string>();
  for (const e of graph.edges) {
    if (e.type === 'composition') parentOf.set(e.toId, e.fromId);
  }

  const chain: NodeResponse[] = [];
  let cur: string | undefined = focusedNodeId;
  const guard = new Set<string>();
  while (cur && !guard.has(cur)) {
    guard.add(cur);
    const node = nodesById.get(cur);
    if (!node) break;
    chain.unshift(node);
    if (cur === root.id) break;
    cur = parentOf.get(cur);
  }

  if (chain[0]?.id !== root.id) chain.unshift(root);
  return chain.map((n) => ({ id: n.id, title: n.title, isRoot: n.isProjectRoot }));
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm vitest run src/features/graph/domain/breadcrumb.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Commit**

```bash
git add apps/web/src/features/graph/domain/breadcrumb.ts apps/web/src/features/graph/domain/breadcrumb.test.ts
git commit -m "feat(graph): add breadcrumb domain function"
```

---

### Task 3: Extend graph search schema with `focus`

**Files:**
- Modify: `apps/web/src/lib/schemas/graph-search.ts`

- [x] **Step 1: Update the schema**

Replace the contents of `apps/web/src/lib/schemas/graph-search.ts` with:

```ts
import { z } from "zod";

export const graphSearchSchema = z
	.object({
		nodeId: z.string().min(1).optional(),
		focus: z.string().min(1).optional(),
	})
	.strip();

export type GraphSearch = z.infer<typeof graphSearchSchema>;
```

- [x] **Step 2: Verify type-check passes**

Run: `cd apps/web && pnpm tsc -b --noEmit`
Expected: No type errors.

- [x] **Step 3: Commit**

```bash
git add apps/web/src/lib/schemas/graph-search.ts
git commit -m "feat(graph): add focus search param for dive-in navigation"
```

---

### Task 4: `useCanvasNavigation` hook

**Files:**
- Create: `apps/web/src/features/graph/hooks/use-canvas-navigation.ts`

Wraps TanStack Router search params to expose `focusedNodeId`, `diveInto(id)`, `diveUpTo(id)`, `diveToRoot()`.

- [x] **Step 1: Implement the hook**

Create `apps/web/src/features/graph/hooks/use-canvas-navigation.ts`:

```ts
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback } from 'react';

export function useCanvasNavigation() {
	const search = useSearch({
		from: '/projects/$projectId/graph',
	}) as { focus?: string };
	const navigate = useNavigate({ from: '/projects/$projectId/graph' });

	const focusedNodeId = search.focus ?? null;

	const diveInto = useCallback(
		(id: string) => {
			navigate({ search: (prev) => ({ ...(prev as object), focus: id }) });
		},
		[navigate],
	);

	const diveUpTo = useCallback(
		(id: string | null) => {
			navigate({
				search: (prev) => {
					const { focus: _drop, ...rest } = (prev as { focus?: string });
					return id ? { ...rest, focus: id } : rest;
				},
			});
		},
		[navigate],
	);

	const diveToRoot = useCallback(() => diveUpTo(null), [diveUpTo]);

	return { focusedNodeId, diveInto, diveUpTo, diveToRoot };
}
```

- [x] **Step 2: Verify type-check passes**

Run: `cd apps/web && pnpm tsc -b --noEmit`
Expected: No type errors.

- [x] **Step 3: Commit**

```bash
git add apps/web/src/features/graph/hooks/use-canvas-navigation.ts
git commit -m "feat(graph): add useCanvasNavigation hook"
```

---

### Task 5: `useKnowledgeToggle` hook

**Files:**
- Create: `apps/web/src/features/graph/hooks/use-knowledge-toggle.ts`

- [x] **Step 1: Implement the hook**

Create `apps/web/src/features/graph/hooks/use-knowledge-toggle.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'zp.graph.showKnowledge';

function read(): boolean {
	if (typeof window === 'undefined') return false;
	try {
		return window.localStorage.getItem(STORAGE_KEY) === '1';
	} catch {
		return false;
	}
}

function write(value: boolean): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
	} catch {
		/* ignore */
	}
}

export function useKnowledgeToggle(): {
	visible: boolean;
	toggle: () => void;
	set: (value: boolean) => void;
} {
	const [visible, setVisible] = useState<boolean>(() => read());

	useEffect(() => {
		write(visible);
	}, [visible]);

	const toggle = useCallback(() => setVisible((v) => !v), []);
	const set = useCallback((v: boolean) => setVisible(v), []);

	return { visible, toggle, set };
}
```

- [x] **Step 2: Verify type-check passes**

Run: `cd apps/web && pnpm tsc -b --noEmit`
Expected: No type errors.

- [x] **Step 3: Commit**

```bash
git add apps/web/src/features/graph/hooks/use-knowledge-toggle.ts
git commit -m "feat(graph): add useKnowledgeToggle hook"
```

---

### Task 6: Pill component (sibling node primitive)

**Files:**
- Create: `apps/web/src/features/graph/components/Pill.tsx`
- Create: `apps/web/src/features/graph/components/Pill.test.tsx`

Renders the sibling pill as an xyflow custom node. Variant decided by `data.node.type`.

- [x] **Step 1: Write the failing tests**

Create `apps/web/src/features/graph/components/Pill.test.tsx`:

```tsx
import { ReactFlowProvider } from '@xyflow/react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Pill, type PillData } from './Pill';

const mkData = (overrides: Partial<PillData> = {}): PillData => ({
	node: {
		id: 'n1',
		projectId: 'p',
		isProjectRoot: false,
		role: 'regular',
		type: 'scaffold',
		title: 'Ship v1',
		description: null,
		status: 'active',
		isCheckpoint: false,
		checkpointResolution: null,
		createdBy: 'human',
		createdAt: '2026-05-16T00:00:00.000Z',
		updatedAt: '2026-05-16T00:00:00.000Z',
	},
	aggregation: undefined,
	knowledgeCount: 0,
	childCount: 0,
	selected: false,
	dimmed: false,
	...overrides,
});

function renderPill(data: PillData) {
	return render(
		<ReactFlowProvider>
			<Pill
				id="n1"
				data={data as unknown as Record<string, unknown>}
				type="pill"
				selected={data.selected}
				positionAbsoluteX={0}
				positionAbsoluteY={0}
				dragging={false}
				isConnectable={false}
				zIndex={0}
			/>
		</ReactFlowProvider>,
	);
}

describe('Pill', () => {
	it('renders the title', () => {
		renderPill(mkData());
		expect(screen.getByText('Ship v1')).toBeInTheDocument();
	});

	it('shows knowledge chip when knowledgeCount > 0', () => {
		renderPill(mkData({ knowledgeCount: 3 }));
		expect(screen.getByText('K3')).toBeInTheDocument();
	});

	it('does NOT show knowledge chip when knowledgeCount = 0', () => {
		renderPill(mkData());
		expect(screen.queryByText(/^K\d+$/)).toBeNull();
	});

	it('shows dive-in glyph when childCount > 0', () => {
		renderPill(mkData({ childCount: 5 }));
		expect(screen.getByText('↳5')).toBeInTheDocument();
	});

	it('does NOT show dive-in glyph when childCount = 0', () => {
		renderPill(mkData());
		expect(screen.queryByText(/^↳\d+$/)).toBeNull();
	});

	it('applies scaffold class when type=scaffold', () => {
		const { container } = renderPill(mkData());
		expect(container.querySelector('.zp-pill--scaffold')).not.toBeNull();
	});

	it('applies growth class when type=growth', () => {
		const data = mkData();
		data.node = { ...data.node, type: 'growth' };
		const { container } = renderPill(data);
		expect(container.querySelector('.zp-pill--growth')).not.toBeNull();
	});

	it('applies checkpoint class on scaffold pill when isCheckpoint=true', () => {
		const data = mkData();
		data.node = { ...data.node, isCheckpoint: true };
		const { container } = renderPill(data);
		expect(container.querySelector('.zp-pill--checkpoint')).not.toBeNull();
	});
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && pnpm vitest run src/features/graph/components/Pill.test.tsx`
Expected: FAIL with "Cannot find module './Pill'".

- [x] **Step 3: Implement `Pill.tsx`**

Create `apps/web/src/features/graph/components/Pill.tsx`:

```tsx
import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import type { NodeResponse } from '@zet-plane/contracts';
import { Flag } from 'lucide-react';
import { effectiveNodeStatus } from '../domain/effective-status';
import type { AggregatedStatus } from '../domain/types';

export type PillData = {
	node: NodeResponse;
	aggregation: AggregatedStatus | undefined;
	knowledgeCount: number;
	childCount: number;
	selected: boolean;
	dimmed: boolean;
};

export type PillNode = Node<PillData>;

export function Pill({ data }: NodeProps<PillNode>) {
	const { node, aggregation, knowledgeCount, childCount, selected, dimmed } = data;
	const displayStatus = effectiveNodeStatus(node.status, aggregation);

	const classes = ['zp-pill', `zp-pill--${node.type}`, `zp-pill--${displayStatus}`];
	if (node.type === 'scaffold' && node.isCheckpoint) classes.push('zp-pill--checkpoint');
	if (selected) classes.push('zp-pill--selected');
	if (dimmed) classes.push('zp-pill--dimmed');

	const showAggBar = childCount > 0 && aggregation !== undefined;
	const counts = aggregation?.counts ?? { active: 0, blocked: 0, completed: 0, archived: 0 };

	return (
		<div className={classes.join(' ')}>
			<Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
			<Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
			{node.type === 'scaffold' && node.isCheckpoint && (
				<span className="zp-pill__flag" aria-label="checkpoint">
					<Flag size={9} />
				</span>
			)}
			<span className="zp-pill__title">{node.title}</span>
			{knowledgeCount > 0 && (
				<span className="zp-pill__chip" aria-label={`${knowledgeCount} knowledge entries`}>
					K{knowledgeCount}
				</span>
			)}
			{childCount > 0 && (
				<span className="zp-pill__dive" aria-label={`${childCount} children, click to dive in`}>
					↳{childCount}
				</span>
			)}
			{showAggBar && (
				<span className="zp-pill__agg" aria-hidden>
					<i className="zp-pill__agg-a" style={{ flex: counts.active }} />
					<i className="zp-pill__agg-b" style={{ flex: counts.blocked }} />
					<i className="zp-pill__agg-d" style={{ flex: counts.completed }} />
				</span>
			)}
		</div>
	);
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm vitest run src/features/graph/components/Pill.test.tsx`
Expected: PASS (8 tests).

- [x] **Step 5: Commit**

```bash
git add apps/web/src/features/graph/components/Pill.tsx apps/web/src/features/graph/components/Pill.test.tsx
git commit -m "feat(graph): add Pill component for sibling nodes"
```

---

### Task 7: HeroToken component (project + scaffold variants)

**Files:**
- Create: `apps/web/src/features/graph/components/HeroToken.tsx`

Renders the direct-parent presentation above the canvas. Two variants: `ProjectHero` (project root) and `ScaffoldHero` (dived-in scaffold). No aggregate bar in either variant.

- [x] **Step 1: Implement `HeroToken.tsx`**

Create `apps/web/src/features/graph/components/HeroToken.tsx`:

```tsx
import type { NodeResponse } from '@zet-plane/contracts';
import { Flag } from 'lucide-react';
import { effectiveNodeStatus } from '../domain/effective-status';
import type { AggregatedStatus } from '../domain/types';

type Props = {
	node: NodeResponse;
	aggregation: AggregatedStatus | undefined;
};

export function HeroToken({ node, aggregation }: Props) {
	if (node.isProjectRoot) return <ProjectHero node={node} />;
	return <ScaffoldHero node={node} aggregation={aggregation} />;
}

function ProjectHero({ node }: { node: NodeResponse }) {
	return (
		<div className="zp-hero zp-hero--project">
			<div className="zp-hero__eyebrow">Project</div>
			<div className="zp-hero__title">{node.title}</div>
			{node.description && (
				<div className="zp-hero__desc">{node.description}</div>
			)}
		</div>
	);
}

function ScaffoldHero({
	node,
	aggregation,
}: { node: NodeResponse; aggregation: AggregatedStatus | undefined }) {
	const displayStatus = effectiveNodeStatus(node.status, aggregation);
	const classes = ['zp-hero', 'zp-hero--scaffold', `zp-pill--${displayStatus}`];
	if (node.isCheckpoint) classes.push('zp-pill--checkpoint');

	return (
		<div className={classes.join(' ')}>
			{node.isCheckpoint && (
				<span className="zp-pill__flag" aria-label="checkpoint">
					<Flag size={11} />
				</span>
			)}
			<span className="zp-hero__title">{node.title}</span>
			{node.description && (
				<div className="zp-hero__desc">{node.description}</div>
			)}
		</div>
	);
}
```

- [x] **Step 2: Verify type-check passes**

Run: `cd apps/web && pnpm tsc -b --noEmit`
Expected: No type errors.

- [x] **Step 3: Commit**

```bash
git add apps/web/src/features/graph/components/HeroToken.tsx
git commit -m "feat(graph): add HeroToken component"
```

---

### Task 8: Breadcrumb component

**Files:**
- Create: `apps/web/src/features/graph/components/Breadcrumb.tsx`

- [x] **Step 1: Implement `Breadcrumb.tsx`**

Create `apps/web/src/features/graph/components/Breadcrumb.tsx`:

```tsx
import { ChevronRight } from 'lucide-react';
import type { BreadcrumbSegment } from '../domain/breadcrumb';

type Props = {
	segments: BreadcrumbSegment[];
	onSegmentClick: (id: string | null) => void;
};

export function Breadcrumb({ segments, onSegmentClick }: Props) {
	return (
		<nav className="zp-breadcrumb" aria-label="Canvas breadcrumb">
			{segments.map((seg, i) => {
				const isLast = i === segments.length - 1;
				return (
					<span key={seg.id} className="zp-breadcrumb__item">
						<button
							type="button"
							className={
								isLast
									? 'zp-breadcrumb__seg zp-breadcrumb__seg--current'
									: 'zp-breadcrumb__seg'
							}
							onClick={() => onSegmentClick(seg.isRoot ? null : seg.id)}
							disabled={isLast}
							aria-current={isLast ? 'page' : undefined}
						>
							{seg.title}
						</button>
						{!isLast && <ChevronRight size={12} className="zp-breadcrumb__sep" />}
					</span>
				);
			})}
		</nav>
	);
}
```

- [x] **Step 2: Verify type-check passes**

Run: `cd apps/web && pnpm tsc -b --noEmit`
Expected: No type errors.

- [x] **Step 3: Commit**

```bash
git add apps/web/src/features/graph/components/Breadcrumb.tsx
git commit -m "feat(graph): add Breadcrumb component"
```

---

### Task 9: PeripheralStub component

**Files:**
- Create: `apps/web/src/features/graph/components/PeripheralStub.tsx`

Renders a faded margin pill for a cross-boundary node. Click → dive to it.

- [x] **Step 1: Implement `PeripheralStub.tsx`**

Create `apps/web/src/features/graph/components/PeripheralStub.tsx`:

```tsx
import type { NodeResponse } from '@zet-plane/contracts';
import { ArrowUpRight } from 'lucide-react';

type Props = {
	node: NodeResponse;
	onJump: (id: string) => void;
};

export function PeripheralStub({ node, onJump }: Props) {
	const classes = [
		'zp-pill',
		'zp-pill--peripheral',
		`zp-pill--${node.type}`,
		`zp-pill--${node.status}`,
	];
	return (
		<button
			type="button"
			className={classes.join(' ')}
			onClick={() => onJump(node.id)}
			aria-label={`Open ${node.title}`}
		>
			<span className="zp-pill__title">{node.title}</span>
			<ArrowUpRight size={11} className="zp-pill__jump" aria-hidden />
		</button>
	);
}
```

- [x] **Step 2: Verify type-check passes**

Run: `cd apps/web && pnpm tsc -b --noEmit`
Expected: No type errors.

- [x] **Step 3: Commit**

```bash
git add apps/web/src/features/graph/components/PeripheralStub.tsx
git commit -m "feat(graph): add PeripheralStub component"
```

---

### Task 10: StagingPanel component

**Files:**
- Create: `apps/web/src/features/graph/components/StagingPanel.tsx`

Right-side panel listing nodes whose `role === 'staging_root'` or whose ancestor is one. For v1 we filter on `role === 'staging_root'` only; deeper staging trees can be added later.

- [x] **Step 1: Implement `StagingPanel.tsx`**

Create `apps/web/src/features/graph/components/StagingPanel.tsx`:

```tsx
import type { NodeResponse } from '@zet-plane/contracts';

type Props = {
	nodes: NodeResponse[];
	onSelect: (id: string) => void;
};

export function StagingPanel({ nodes, onSelect }: Props) {
	const stagingNodes = nodes.filter((n) => n.role === 'staging_root' || n.type === 'staging');

	return (
		<aside className="zp-staging" aria-label="Staging region">
			<div className="zp-staging__header">
				<span className="zp-staging__title">Staging</span>
				<span className="zp-staging__count">{stagingNodes.length}</span>
			</div>
			<div className="zp-staging__list">
				{stagingNodes.length === 0 ? (
					<div className="zp-staging__empty">No unanchored nodes</div>
				) : (
					stagingNodes.map((n) => (
						<button
							key={n.id}
							type="button"
							className={`zp-pill zp-pill--growth zp-pill--${n.status} zp-pill--staging`}
							onClick={() => onSelect(n.id)}
						>
							<span className="zp-pill__title">{n.title}</span>
						</button>
					))
				)}
			</div>
		</aside>
	);
}
```

- [x] **Step 2: Verify type-check passes**

Run: `cd apps/web && pnpm tsc -b --noEmit`
Expected: No type errors.

- [x] **Step 3: Commit**

```bash
git add apps/web/src/features/graph/components/StagingPanel.tsx
git commit -m "feat(graph): add StagingPanel component"
```

---

### Task 11: KnowledgePill + KnowledgeToggle components

**Files:**
- Create: `apps/web/src/features/graph/components/KnowledgePill.tsx`
- Create: `apps/web/src/features/graph/components/KnowledgeToggle.tsx`

KnowledgePill is a stub component for v1 — rendered only when knowledge data is fetched (which is a follow-up). The toggle is wired now so the chrome is correct from day one.

- [x] **Step 1: Implement both components**

Create `apps/web/src/features/graph/components/KnowledgePill.tsx`:

```tsx
type Props = {
	title: string;
	category: 'decision' | 'pitfall' | 'finding' | 'context';
};

export function KnowledgePill({ title, category }: Props) {
	return (
		<div className="zp-pill zp-pill--knowledge">
			<span className="zp-pill__title">{title}</span>
			<span className="zp-pill__chip">{category[0].toUpperCase()}</span>
		</div>
	);
}
```

Create `apps/web/src/features/graph/components/KnowledgeToggle.tsx`:

```tsx
import { BookOpen, BookOpenCheck } from 'lucide-react';

type Props = {
	visible: boolean;
	onToggle: () => void;
};

export function KnowledgeToggle({ visible, onToggle }: Props) {
	return (
		<button
			type="button"
			className="zp-chrome-toggle"
			onClick={onToggle}
			aria-pressed={visible}
			title={visible ? 'Hide knowledge' : 'Show knowledge'}
		>
			{visible ? <BookOpenCheck size={14} /> : <BookOpen size={14} />}
			<span>Knowledge</span>
		</button>
	);
}
```

- [x] **Step 2: Verify type-check passes**

Run: `cd apps/web && pnpm tsc -b --noEmit`
Expected: No type errors.

- [x] **Step 3: Commit**

```bash
git add apps/web/src/features/graph/components/KnowledgePill.tsx apps/web/src/features/graph/components/KnowledgeToggle.tsx
git commit -m "feat(graph): add KnowledgePill and KnowledgeToggle stubs"
```

---

### Task 12: Add `knowledge` variant to DependencyEdge

**Files:**
- Modify: `apps/web/src/features/graph/components/DependencyEdge.tsx`

- [x] **Step 1: Read the existing file**

Run: `cd apps/web && cat src/features/graph/components/DependencyEdge.tsx`

- [x] **Step 2: Update it to support a `variant: 'flow' | 'knowledge'` data field**

Open `apps/web/src/features/graph/components/DependencyEdge.tsx`. Locate the `data` shape (currently `{ targetStatus, dimmed }`). Extend with `variant?: 'flow' | 'knowledge'` (default `'flow'`). When `variant === 'knowledge'`, render the SVG path with `strokeDasharray="4 4"` and a slightly thinner stroke.

Concretely, replace the rendered `<path>` block with:

```tsx
const dashed = data?.variant === 'knowledge';
return (
	<path
		id={id}
		d={edgePath}
		className={`zp-edge zp-edge--${data?.targetStatus ?? 'active'} ${data?.dimmed ? 'zp-edge--dim' : ''}`}
		stroke={dashed ? 'var(--zp-edge-knowledge, #a67bd8)' : undefined}
		strokeDasharray={dashed ? '4 4' : undefined}
		strokeWidth={dashed ? 1.25 : undefined}
		fill="none"
	/>
);
```

(Keep existing imports, prop typings, and edge-path computation logic intact — only the rendered path attributes change.)

- [x] **Step 3: Verify type-check passes**

Run: `cd apps/web && pnpm tsc -b --noEmit`
Expected: No type errors.

- [x] **Step 4: Commit**

```bash
git add apps/web/src/features/graph/components/DependencyEdge.tsx
git commit -m "feat(graph): add knowledge variant to DependencyEdge"
```

---

### Task 13: CSS overhaul — pill silhouettes, hero, staging, periphery

**Files:**
- Modify: `apps/web/src/features/graph/styles.css`

Replace the existing `.zp-node--*` / `.zp-container--*` rules with the new pill/hero/staging/peripheral classes. Status tints stay driven by existing `--zp-status-*` variables.

- [x] **Step 1: Read the existing CSS to find the section to replace**

Run: `cd apps/web && cat src/features/graph/styles.css`

- [x] **Step 2: Replace the file with the new pill-based styles**

Overwrite `apps/web/src/features/graph/styles.css` with:

```css
/* Status palette (kept) */
:root {
	--zp-status-active: #3b82f6;
	--zp-status-active-bg: #e0ecff;
	--zp-status-blocked: #d97757;
	--zp-status-blocked-bg: #fbe5da;
	--zp-status-completed: #5d9970;
	--zp-status-completed-bg: #dceadf;
	--zp-status-archived: #b6b6b6;
	--zp-status-archived-bg: #ececec;
	--zp-accent-scaffold: #c79420;
	--zp-accent-growth: #2f8c8c;
	--zp-accent-knowledge: #a67bd8;
	--zp-edge-knowledge: #a67bd8;
}

/* Sibling Pill */
.zp-pill {
	position: relative;
	display: inline-flex;
	align-items: center;
	gap: 10px;
	padding: 6px 14px 6px 12px;
	border-radius: 999px;
	font-size: 13px;
	background: var(--zp-status-active-bg);
	box-shadow: 0 1px 2px rgba(20, 20, 20, 0.04), 0 1px 3px rgba(20, 20, 20, 0.06);
	min-width: 140px;
	overflow: hidden;
	font-family: inherit;
	border: 0;
	color: inherit;
}
.zp-pill__title {
	font-weight: 500;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	max-width: 220px;
}
.zp-pill__chip {
	font-family: ui-monospace, monospace;
	font-size: 10px;
	color: #6b6b6b;
	background: rgba(255, 255, 255, 0.55);
	padding: 1px 6px;
	border-radius: 6px;
}
.zp-pill__dive {
	font-family: ui-monospace, monospace;
	font-size: 11px;
	color: #6b6b6b;
	margin-left: auto;
	padding-left: 6px;
	cursor: pointer;
}
.zp-pill__agg {
	position: absolute;
	bottom: 0;
	left: 0;
	right: 0;
	height: 3px;
	display: flex;
}
.zp-pill__agg-a { background: var(--zp-status-active); }
.zp-pill__agg-b { background: var(--zp-status-blocked); }
.zp-pill__agg-d { background: var(--zp-status-completed); }

/* Status tints */
.zp-pill--blocked { background: var(--zp-status-blocked-bg); }
.zp-pill--completed { background: var(--zp-status-completed-bg); color: #6b6b6b; }
.zp-pill--completed .zp-pill__title { text-decoration: line-through; text-decoration-color: #9a9a9a; }
.zp-pill--archived { background: var(--zp-status-archived-bg); color: #9a9a9a; }

/* Scaffold variant */
.zp-pill--scaffold {
	padding-left: 22px;
	font-size: 13.5px;
	font-weight: 500;
	box-shadow: 0 2px 4px rgba(20, 20, 20, 0.05), 0 4px 10px rgba(20, 20, 20, 0.06);
}
.zp-pill--scaffold::before {
	content: "";
	position: absolute;
	left: 0;
	top: 50%;
	transform: translateY(-50%);
	width: 14px;
	height: 100%;
	background: var(--zp-accent-scaffold);
	clip-path: polygon(0 0, 100% 0, 100% 35%, 60% 50%, 100% 65%, 100% 100%, 0 100%);
	opacity: 0.85;
}
.zp-pill--scaffold.zp-pill--checkpoint::before { opacity: 1; }
.zp-pill__flag {
	position: absolute;
	left: 3px;
	top: 50%;
	transform: translateY(-50%);
	color: #fff;
	line-height: 1;
}

/* Growth variant */
.zp-pill--growth { font-size: 12.5px; padding-top: 4px; padding-bottom: 4px; }
.zp-pill--growth::before {
	content: "";
	display: inline-block;
	width: 5px;
	height: 5px;
	border-radius: 50%;
	background: var(--zp-accent-growth);
	margin-right: 2px;
	flex: 0 0 auto;
}

/* Selection / dim */
.zp-pill--selected { outline: 2px solid var(--zp-status-active); outline-offset: 2px; }
.zp-pill--dimmed { opacity: 0.4; }

/* Knowledge variant */
.zp-pill--knowledge {
	background: rgba(166, 123, 216, 0.18);
	font-size: 11.5px;
	min-width: 100px;
	padding: 3px 10px;
}
.zp-pill--knowledge::before {
	content: "";
	display: inline-block;
	width: 5px;
	height: 5px;
	border-radius: 50%;
	background: var(--zp-accent-knowledge);
	margin-right: 2px;
	flex: 0 0 auto;
}

/* Peripheral stub */
.zp-pill--peripheral { opacity: 0.55; transform: scale(0.92); cursor: pointer; }
.zp-pill--peripheral:hover { opacity: 0.9; }

/* Hero */
.zp-hero {
	position: relative;
	display: inline-flex;
	align-items: center;
	gap: 12px;
	padding: 10px 18px;
	border-radius: 999px;
	background: var(--zp-status-active-bg);
	box-shadow: 0 3px 6px rgba(20, 20, 20, 0.06), 0 6px 14px rgba(20, 20, 20, 0.06);
	font-size: 15px;
}
.zp-hero__title { font-weight: 600; }
.zp-hero__eyebrow { font-size: 10px; color: #9a9a9a; letter-spacing: 0.08em; text-transform: uppercase; }
.zp-hero__desc { font-size: 12px; color: #6b6b6b; margin-left: 10px; }
.zp-hero--scaffold { padding-left: 28px; }
.zp-hero--scaffold::before {
	content: "";
	position: absolute;
	left: 0;
	top: 50%;
	transform: translateY(-50%);
	width: 20px;
	height: 100%;
	background: var(--zp-accent-scaffold);
	clip-path: polygon(0 0, 100% 0, 100% 35%, 60% 50%, 100% 65%, 100% 100%, 0 100%);
	opacity: 0.85;
}
.zp-hero--project { background: #fff; box-shadow: 0 4px 10px rgba(20, 20, 20, 0.08); }

/* Breadcrumb */
.zp-breadcrumb { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #6b6b6b; padding: 6px 10px; }
.zp-breadcrumb__seg { background: none; border: 0; padding: 2px 6px; color: inherit; cursor: pointer; border-radius: 4px; }
.zp-breadcrumb__seg:hover:not(:disabled) { background: rgba(0, 0, 0, 0.05); }
.zp-breadcrumb__seg--current { color: #1a1a1a; font-weight: 600; cursor: default; }
.zp-breadcrumb__sep { color: #c0c0c0; }

/* Staging panel */
.zp-staging { width: 280px; border-left: 1px solid #e3e1dc; background: #fafaf8; display: flex; flex-direction: column; }
.zp-staging__header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid #e3e1dc; }
.zp-staging__title { font-size: 12px; font-weight: 600; }
.zp-staging__count { font-family: ui-monospace, monospace; font-size: 11px; color: #6b6b6b; }
.zp-staging__list { padding: 10px; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; }
.zp-staging__empty { font-size: 11px; color: #9a9a9a; }

/* Chrome toggle */
.zp-chrome-toggle {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 4px 10px;
	border-radius: 6px;
	font-size: 11px;
	background: #fff;
	border: 1px solid #e3e1dc;
	cursor: pointer;
}
.zp-chrome-toggle[aria-pressed="true"] { background: rgba(166, 123, 216, 0.18); border-color: var(--zp-accent-knowledge); }

/* Edges */
.zp-edge--active { stroke: var(--zp-status-active); }
.zp-edge--blocked { stroke: var(--zp-status-blocked); }
.zp-edge--completed { stroke: var(--zp-status-completed); }
.zp-edge--archived { stroke: var(--zp-status-archived); }
.zp-edge--dim { opacity: 0.25; }

/* Legacy classes removed:
   .zp-node--scaffold, .zp-node--growth, .zp-container--*, etc. */
```

- [x] **Step 3: Verify build succeeds**

Run: `cd apps/web && pnpm tsc -b --noEmit && pnpm vitest run`
Expected: All type-checks and existing tests pass (some old component tests may still reference dead components; those are handled in Task 16).

- [x] **Step 4: Commit**

```bash
git add apps/web/src/features/graph/styles.css
git commit -m "feat(graph): replace card styles with pill silhouettes"
```

---

### Task 14: Restructure GraphCanvas to use canvas-view + breadcrumb + hero

**Files:**
- Modify: `apps/web/src/features/graph/components/GraphCanvas.tsx`

The new GraphCanvas: uses `useCanvasNavigation` to read the focused node id; calls `canvasView()` and `breadcrumb()`; renders the breadcrumb + hero above the xyflow canvas; renders only the focused canvas's siblings (not the entire project graph) + their dependency edges + peripheral stubs + staging panel on top-level.

- [ ] **Step 1: Replace GraphCanvas.tsx**

Overwrite `apps/web/src/features/graph/components/GraphCanvas.tsx`:

```tsx
import {
	Background,
	Controls,
	type Edge,
	type Node,
	ReactFlow,
	ReactFlowProvider,
} from '@xyflow/react';
import { useCallback, useMemo } from 'react';
import '@xyflow/react/dist/style.css';
import { aggregateStatus } from '../domain/aggregate-status';
import { breadcrumb } from '../domain/breadcrumb';
import { canvasView } from '../domain/canvas-view';
import type { ProjectGraph } from '../domain/types';
import { useCanvasNavigation } from '../hooks/use-canvas-navigation';
import { useKnowledgeToggle } from '../hooks/use-knowledge-toggle';
import { useLayoutedGraph } from '../layout/use-layouted-graph';
import { Breadcrumb } from './Breadcrumb';
import { DependencyEdge } from './DependencyEdge';
import { EmptyState, ErrorState, LoadingState } from './EmptyState';
import { HeroToken } from './HeroToken';
import { KnowledgeToggle } from './KnowledgeToggle';
import { PeripheralStub } from './PeripheralStub';
import { Pill, type PillData } from './Pill';
import { StagingPanel } from './StagingPanel';

const nodeTypes = { pill: Pill };
const edgeTypes = { dependency: DependencyEdge };

type Props = {
	graph: ProjectGraph | undefined;
	isLoading: boolean;
	error: Error | null;
	onRetry?: () => void;
	selectedNodeId: string | null;
	onSelectNode: (id: string | null) => void;
};

export function GraphCanvas(props: Props) {
	return (
		<ReactFlowProvider>
			<CanvasInner {...props} />
		</ReactFlowProvider>
	);
}

function CanvasInner({ graph, isLoading, error, onRetry, selectedNodeId, onSelectNode }: Props) {
	const { focusedNodeId, diveInto, diveUpTo } = useCanvasNavigation();
	const knowledge = useKnowledgeToggle();

	const aggregation = useMemo(
		() => (graph ? aggregateStatus(graph) : new Map()),
		[graph],
	);

	const compositionChildCount = useMemo(() => {
		const counts = new Map<string, number>();
		if (!graph) return counts;
		for (const e of graph.edges) {
			if (e.type !== 'composition') continue;
			counts.set(e.fromId, (counts.get(e.fromId) ?? 0) + 1);
		}
		return counts;
	}, [graph]);

	const view = useMemo(
		() => (graph ? canvasView(graph, focusedNodeId) : null),
		[graph, focusedNodeId],
	);

	const crumbs = useMemo(
		() => (graph ? breadcrumb(graph, focusedNodeId) : []),
		[graph, focusedNodeId],
	);

	// Build a sub-graph for layout containing only hero + visible children + sibling dependency edges.
	const subGraphForLayout: ProjectGraph | undefined = useMemo(() => {
		if (!view) return undefined;
		return {
			nodes: view.children,
			edges: view.siblingDependencyEdges,
		};
	}, [view]);

	const { data: layouted, isLayouting, error: layoutErr } = useLayoutedGraph(subGraphForLayout);

	const onNodeClick = useCallback(
		(_: unknown, n: Node) => {
			onSelectNode(n.id);
			// dive-in via the dive glyph would be a separate click target inside Pill;
			// here a plain click selects only.
		},
		[onSelectNode],
	);
	const onPaneClick = useCallback(() => onSelectNode(null), [onSelectNode]);

	if (isLoading) return <LoadingState message="Loading graph…" />;
	if (error) return <ErrorState error={error} onRetry={onRetry} />;
	if (layoutErr) return <ErrorState error={layoutErr} />;
	if (!view) return <EmptyState rootOnly />;
	if (isLayouting || !layouted) return <LoadingState message="Laying out…" />;

	const xyNodes: Node[] = layouted.nodes.map((n) => {
		const data: PillData = {
			node: n,
			aggregation: aggregation.get(n.id),
			knowledgeCount: 0,
			childCount: compositionChildCount.get(n.id) ?? 0,
			selected: selectedNodeId === n.id,
			dimmed: false,
		};
		return {
			id: n.id,
			type: 'pill',
			position: n.position,
			width: n.width,
			height: n.height,
			data: data as Record<string, unknown>,
			selectable: true,
			draggable: false,
		};
	});

	const xyEdges: Edge[] = layouted.edges.map((e) => ({
		id: e.id,
		source: e.fromId,
		target: e.toId,
		type: 'dependency',
		data: {
			targetStatus: layouted.nodes.find((n) => n.id === e.toId)?.status ?? 'active',
			dimmed: false,
			variant: 'flow',
		} as Record<string, unknown>,
	}));

	const heroAggregation = aggregation.get(view.hero.id);

	return (
		<div className="relative flex h-full w-full">
			<div className="relative flex flex-1 flex-col">
				<div className="flex items-center justify-between border-b border-border px-3 py-2">
					<Breadcrumb segments={crumbs} onSegmentClick={(id) => diveUpTo(id)} />
					<KnowledgeToggle visible={knowledge.visible} onToggle={knowledge.toggle} />
				</div>
				<div className="flex justify-center px-6 py-4">
					<HeroToken node={view.hero} aggregation={heroAggregation} />
				</div>
				<div className="relative flex-1">
					<ReactFlow
						nodes={xyNodes}
						edges={xyEdges}
						nodeTypes={nodeTypes}
						edgeTypes={edgeTypes}
						onNodeClick={onNodeClick}
						onPaneClick={onPaneClick}
						onNodeDoubleClick={(_, n) => diveInto(n.id)}
						proOptions={{ hideAttribution: true }}
						fitView
					>
						<Background />
						<Controls />
					</ReactFlow>
					{view.peripheralStubs.length > 0 && (
						<div className="pointer-events-none absolute inset-y-0 right-2 flex flex-col justify-center gap-2">
							{view.peripheralStubs
								.filter((s) => s.side === 'right')
								.map((s) => (
									<div key={s.external.id} className="pointer-events-auto">
										<PeripheralStub node={s.external} onJump={diveInto} />
									</div>
								))}
						</div>
					)}
					{view.peripheralStubs.some((s) => s.side === 'left') && (
						<div className="pointer-events-none absolute inset-y-0 left-2 flex flex-col justify-center gap-2">
							{view.peripheralStubs
								.filter((s) => s.side === 'left')
								.map((s) => (
									<div key={s.external.id} className="pointer-events-auto">
										<PeripheralStub node={s.external} onJump={diveInto} />
									</div>
								))}
						</div>
					)}
				</div>
			</div>
			{view.isTopLevel && graph && (
				<StagingPanel nodes={graph.nodes} onSelect={(id) => diveInto(id)} />
			)}
		</div>
	);
}
```

Notes embedded in code:
- Dive-in trigger for v1 is **double-click on a pill** (simpler than wiring a click handler inside the Pill internals). The spec's `↳N` glyph remains a visual affordance only in v1; clicking the glyph dives in via the same double-click pattern users can also use. Promote the glyph to a real click target in a v1.1 follow-up if the UX warrants it.
- The layout is computed over only the *visible sub-graph*, not the whole project graph. This is a behavior change from today's code and is the whole point of dive-in.

- [ ] **Step 2: Verify type-check passes**

Run: `cd apps/web && pnpm tsc -b --noEmit`
Expected: No type errors.

- [ ] **Step 3: Verify tests pass (excluding tests for deleted components)**

Run: `cd apps/web && pnpm vitest run --reporter=verbose`
Expected: Tests pass except for `NodeCard.test.tsx`, `CompositionEdge.test.tsx`, and any tests that import deleted symbols. Those are removed in Task 16.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/graph/components/GraphCanvas.tsx
git commit -m "feat(graph): restructure GraphCanvas around canvas-view + dive-in"
```

---

### Task 15: Update Legend

**Files:**
- Modify: `apps/web/src/features/graph/components/Legend.tsx`

- [ ] **Step 1: Replace Legend.tsx contents**

Overwrite `apps/web/src/features/graph/components/Legend.tsx`:

```tsx
import { useState } from 'react';

export function Legend() {
	const [open, setOpen] = useState(true);

	return (
		<div className="absolute right-3 bottom-3 z-10 rounded-md border border-border bg-background text-xs shadow-sm">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="block w-full px-2 py-1 text-left font-medium hover:bg-accent"
			>
				{open ? 'Legend ▾' : 'Legend ▸'}
			</button>
			{open && (
				<div className="space-y-2 border-t border-border p-2">
					<Row label="Active" swatch={<Swatch color="var(--zp-status-active)" />} />
					<Row label="Blocked" swatch={<Swatch color="var(--zp-status-blocked)" />} />
					<Row label="Completed" swatch={<Swatch color="var(--zp-status-completed)" />} />
					<Row label="Archived" swatch={<Swatch color="var(--zp-status-archived)" />} />
					<hr className="border-border" />
					<Row label="Scaffold (flag-tab)" swatch={<ScaffoldGlyph />} />
					<Row label="Growth (compact)" swatch={<GrowthGlyph />} />
					<Row label="Knowledge (violet)" swatch={<KnowledgeGlyph />} />
					<hr className="border-border" />
					<Row label="Checkpoint" swatch={<span>⚑</span>} />
					<Row label="Dive in" swatch={<span>↳N</span>} />
				</div>
			)}
		</div>
	);
}

function Row({ swatch, label }: { swatch: React.ReactNode; label: string }) {
	return (
		<div className="flex items-center gap-2">
			<span className="flex w-6 justify-center">{swatch}</span>
			<span>{label}</span>
		</div>
	);
}
function Swatch({ color }: { color: string }) {
	return <span className="inline-block h-3 w-3 rounded-sm" style={{ background: color }} />;
}
function ScaffoldGlyph() {
	return (
		<span
			className="inline-block h-3 w-5 rounded-full"
			style={{
				background: 'var(--zp-status-active-bg)',
				borderLeft: '3px solid var(--zp-accent-scaffold)',
			}}
		/>
	);
}
function GrowthGlyph() {
	return (
		<span
			className="inline-block h-2 w-5 rounded-full"
			style={{ background: 'var(--zp-status-active-bg)' }}
		/>
	);
}
function KnowledgeGlyph() {
	return (
		<span
			className="inline-block h-2 w-5 rounded-full"
			style={{ background: 'rgba(166, 123, 216, 0.35)' }}
		/>
	);
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `cd apps/web && pnpm tsc -b --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/graph/components/Legend.tsx
git commit -m "feat(graph): update Legend for pill-based visual language"
```

---

### Task 16: Delete obsoleted components

**Files:**
- Delete: `apps/web/src/features/graph/components/NodeCard.tsx`
- Delete: `apps/web/src/features/graph/components/NodeCard.test.tsx`
- Delete: `apps/web/src/features/graph/components/ContainerCard.tsx`
- Delete: `apps/web/src/features/graph/components/CompositionEdge.tsx`
- Delete: `apps/web/src/features/graph/components/CompositionEdge.test.tsx`
- Update: `apps/web/src/features/graph/components/status-classes.ts` (drop now-unused exports)

- [ ] **Step 1: Search for any remaining references**

Run: `cd apps/web && grep -rn "NodeCard\|ContainerCard\|CompositionEdge\|nodeTypeClass\|containerStatusClass" src/`
Expected: Only references should be in the files about to be deleted. If any others exist, fix them first.

- [ ] **Step 2: Delete the files**

```bash
cd /Volumes/Major/ai/zet-plane
rm apps/web/src/features/graph/components/NodeCard.tsx
rm apps/web/src/features/graph/components/NodeCard.test.tsx
rm apps/web/src/features/graph/components/ContainerCard.tsx
rm apps/web/src/features/graph/components/CompositionEdge.tsx
rm apps/web/src/features/graph/components/CompositionEdge.test.tsx
```

- [ ] **Step 3: Trim `status-classes.ts`**

Replace `apps/web/src/features/graph/components/status-classes.ts` with:

```ts
import type { NodeResponse } from "@zet-plane/contracts";

type NodeStatus = NodeResponse["status"];

export function nodeStatusClass(status: NodeStatus): string {
	return `zp-pill--${status}`;
}

export function edgeStatusClass(targetStatus: NodeStatus): string {
	if (targetStatus === "blocked" || targetStatus === "archived")
		return "zp-edge--blocked";
	if (targetStatus === "completed") return "zp-edge--completed";
	return "zp-edge--active";
}
```

- [ ] **Step 4: Update `status-classes.test.ts`**

Open `apps/web/src/features/graph/components/status-classes.test.ts` and remove any tests that reference deleted exports (`nodeTypeClass`, `containerStatusClass`). Keep tests for the remaining `nodeStatusClass` and `edgeStatusClass` exports.

Concretely, replace its full contents with:

```ts
import { describe, expect, it } from "vitest";
import { edgeStatusClass, nodeStatusClass } from "./status-classes";

describe("nodeStatusClass", () => {
	it("returns zp-pill-- prefixed class for each status", () => {
		expect(nodeStatusClass("active")).toBe("zp-pill--active");
		expect(nodeStatusClass("blocked")).toBe("zp-pill--blocked");
		expect(nodeStatusClass("completed")).toBe("zp-pill--completed");
		expect(nodeStatusClass("archived")).toBe("zp-pill--archived");
	});
});

describe("edgeStatusClass", () => {
	it("returns blocked for blocked or archived targets", () => {
		expect(edgeStatusClass("blocked")).toBe("zp-edge--blocked");
		expect(edgeStatusClass("archived")).toBe("zp-edge--blocked");
	});
	it("returns completed for completed targets", () => {
		expect(edgeStatusClass("completed")).toBe("zp-edge--completed");
	});
	it("returns active for active targets", () => {
		expect(edgeStatusClass("active")).toBe("zp-edge--active");
	});
});
```

- [ ] **Step 5: Run the full test suite**

Run: `cd apps/web && pnpm vitest run`
Expected: All remaining tests pass.

- [ ] **Step 6: Type-check the whole web app**

Run: `cd apps/web && pnpm tsc -b --noEmit`
Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add -A apps/web/src/features/graph/components/
git commit -m "refactor(graph): remove NodeCard, ContainerCard, CompositionEdge"
```

---

### Task 17: Manual smoke test in dev server

The frontend changes are visual and interaction-heavy; type checks and unit tests cannot verify the golden path. Spin up the dev server and walk through the flows.

- [ ] **Step 1: Start the backend and frontend**

Open two terminals:

Terminal 1: `cd apps/server && pnpm dev` — confirm the server boots and listens on port 3000.
Terminal 2: `cd apps/web && pnpm dev` — confirm Vite starts and prints a localhost URL (usually 5173).

If you do not have a running PostgreSQL + Redis, skip the backend and instead point the frontend at a fixture (or use the existing test fixtures from `apps/web/src/test/`).

- [ ] **Step 2: Open the graph route for a seed project**

Navigate to `http://localhost:5173/projects/<id>/graph` for a project that has at least one Scaffold with composition children plus one dependency edge among them.

- [ ] **Step 3: Verify top-level canvas anatomy**

Confirm:
- Breadcrumb shows only "Project: <name>" (single segment, disabled/current).
- ProjectHero pill appears above the canvas — no flag-tab notch, larger title, no aggregate bar.
- Children below are top-level Scaffolds rendered as Scaffold pills with flag-tab notches.
- Staging panel is visible on the right side.
- Knowledge toggle exists in the chrome and starts in the off state.

- [ ] **Step 4: Verify dive-in**

Double-click a Scaffold pill that has the `↳N` glyph.
Confirm:
- URL updates to include `?focus=<id>`.
- Breadcrumb adds a second segment with the Scaffold's title.
- A new HeroToken appears showing the dived-in Scaffold (with flag-tab notch).
- The canvas now shows that Scaffold's direct children (a mix of Growth + Scaffold pills depending on data).
- Staging panel disappears.

- [ ] **Step 5: Verify breadcrumb back-navigation**

Click the project segment in the breadcrumb.
Confirm: URL drops `?focus=`, top-level canvas re-renders, staging panel reappears.

- [ ] **Step 6: Verify knowledge toggle**

Click the Knowledge toggle. Confirm:
- Toggle visually flips to pressed state.
- Reload the page → toggle remains pressed (localStorage works).
- (Visual knowledge entries are not yet wired; this is documented as a v1.1 follow-up.)

- [ ] **Step 7: Verify peripheral stubs (if test data includes cross-graph deps)**

If your seed data has a dependency edge crossing a sub-graph boundary, dive into the relevant Scaffold and confirm a faded `PeripheralStub` appears on the canvas margin pointing to the external node. Click it → URL updates to focus on that external node.

- [ ] **Step 8: Verify visual regression on the legend**

Click the Legend toggle. Confirm the new entries appear: Scaffold (flag-tab), Growth (compact), Knowledge (violet), Checkpoint glyph, Dive-in glyph.

- [ ] **Step 9: Commit a placeholder if any post-smoke tweaks were needed**

If you adjusted CSS or component code as a result of the smoke test, commit those changes:

```bash
git add -A
git commit -m "fix(graph): post-smoke-test visual adjustments"
```

If everything passed without changes, skip the commit.

---

### Task 18: Update existing e2e to match the new dive-in flow

**Files:**
- Modify: any failing files under `apps/web/e2e/` that exercise the old canvas behavior.

- [ ] **Step 1: Run the existing e2e suite**

Run: `cd apps/web && pnpm test:e2e`
Expected: Tests that depended on `NodeCard`-class names or composition edges visible will fail.

- [ ] **Step 2: Update failing selectors**

Replace any `.zp-node--scaffold` / `.zp-container--*` selectors in tests with `.zp-pill--scaffold` / `.zp-pill--growth` etc. Replace any "click composition edge" assertions with "double-click pill to dive in" + breadcrumb / focus URL assertions.

If multiple e2e files need to change, do them one at a time so the test failures stay scoped.

- [ ] **Step 3: Re-run e2e**

Run: `cd apps/web && pnpm test:e2e`
Expected: Tests pass. If a test was exercising behavior that no longer exists (e.g., "verify composition edges are visible"), delete it — the new spec eliminates that surface.

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/e2e/
git commit -m "test(graph): update e2e for pill rendering and dive-in flow"
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task |
|---|---|
| §2.1 Intent-based type | Task 6 (Pill uses `node.type` directly) |
| §2.2 Type set-once | No backend changes — Pill does not expose any type-change UI |
| §2.3 Composition = Sub-Graph | Task 1 (canvas-view filters composition for dive-in) + Task 14 (no composition edges rendered) |
| §2.4 Rule I | Frontend prevention is out of scope for v1; the rule is enforced at creation UI in a follow-up. Documented in spec §6 and §7 |
| §2.5 Edge types | Task 12 (`variant: knowledge` on DependencyEdge); composition simply not rendered (Task 14) |
| §3 Canvas anatomy | Task 14 wires it all (breadcrumb, hero, children, peripheral stubs, staging) |
| §3.1 Layout regime | Task 14 keeps `useLayoutedGraph` (existing dagre/elk pipeline) on the sub-graph |
| §4.1 Sibling Pill | Task 6 + Task 13 (CSS) |
| §4.2 Project hero | Task 7 (ProjectHero variant) + Task 13 (CSS) |
| §4.3 Sub-graph hero | Task 7 (ScaffoldHero variant) + Task 13 (CSS) |
| §4.4 Knowledge pill | Task 11 (stub component) — visual data wiring deferred |
| §4.5 Interaction | Task 14 (double-click dive-in, breadcrumb back-nav) + Task 11 (toggle) |
| §5 Replaces / deletes | Task 16 |
| §6 Non-goals | Explicitly out of scope here; nothing to do |
| §7 Backend follow-ups | Not implemented — spec documents them |

**2. Placeholder scan:** None found. Every step shows actual code or commands.

**3. Type consistency:**
- `PillData` (Task 6) is consumed in Task 14 — same shape.
- `BreadcrumbSegment` (Task 2) is consumed in Task 8 — same shape.
- `CanvasView` (Task 1) is consumed in Task 14 — same shape.
- `useCanvasNavigation` returns `{ focusedNodeId, diveInto, diveUpTo, diveToRoot }` (Task 4) and is consumed in Task 14 with those exact names.

**4. Known gaps (acknowledged):**
- Frontend-only Rule I enforcement is **not** implemented in v1. Server-side enforcement is deferred (spec §7 B-1). Frontend create-node UX does not yet exist as a separate flow; current creation paths go through the API and the API does not yet enforce Rule I.
- Knowledge pill data fetching is **not** wired (v1.1 follow-up). The toggle and stub component exist; the canvas will not render knowledge pills until a query layer feeds them in.
- Staging panel filters on `role === 'staging_root'` or `type === 'staging'`. If the backend's staging-graph linkage model uses a different signal (e.g., a separate Graph row or a flag), the StagingPanel's filter will need to be revisited when that lands.
- Peripheral stubs use a naive `side: 'left' | 'right'` heuristic based on `from`/`to` direction. Side-allocation polish can come later.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-16-graph-rendering-model.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
