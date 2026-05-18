# Graph Workbench Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the graph page into a read-only Diagnose / Explore workbench with a compact top bar, collapsible left rail, persistent inspector, canvas staging lane, URL-backed view state, and reduced circuit-light visual language.

**Architecture:** Keep the existing `ProjectGraph`, `canvasView`, React Flow, ELK layout, and route. Add thin view-state and workbench components around the existing canvas, then move canvas chrome out of `GraphCanvas`, replace the external staging panel with a canvas lane, and evolve node/edge styles through CSS variables.

**Tech Stack:** React 19, TanStack Router, TanStack Query, React Flow (`@xyflow/react`), ELK, Vitest, Testing Library, Playwright, Tailwind CSS 4, existing `@zet-plane/contracts`.

---

## File Map

- Modify `apps/web/src/lib/schemas/graph-search.ts`: add `view`, `query`, and `knowledge` URL state validation.
- Modify `apps/web/src/lib/schemas/graph-search.test.ts`: cover defaulting and enum behavior.
- Modify `apps/web/src/features/graph/hooks/use-graph-page.ts`: expose view, query, knowledge mode, and setters.
- Modify `apps/web/src/features/graph/hooks/use-canvas-navigation.ts`: keep `focus`, add leaf-safe helpers only if needed by route/queue code.
- Create `apps/web/src/features/graph/hooks/use-project-entries.ts`: fetch all project knowledge entries for summaries.
- Create `apps/web/src/features/graph/domain/graph-workbench.ts`: pure helpers for parents, child counts, current context, attention items, selected edge state, and knowledge summaries.
- Create `apps/web/src/features/graph/domain/graph-workbench.test.ts`: unit tests for those helpers.
- Create `apps/web/src/features/graph/components/GraphWorkbench.tsx`: workbench shell composition.
- Create `apps/web/src/features/graph/components/GraphTopBar.tsx`: project context, breadcrumb, view switch, refresh, knowledge toggle.
- Create `apps/web/src/features/graph/components/GraphLeftRail.tsx`: collapsible Diagnose / Explore rail.
- Create `apps/web/src/features/graph/components/GraphInspector.tsx`: persistent context/node inspector.
- Modify `apps/web/src/features/graph/components/GraphCanvas.tsx`: remove hero and canvas breadcrumb, add staging lane node, support selected-edge highlighting and filter dimming.
- Create `apps/web/src/features/graph/components/StagingLane.tsx`: React Flow custom node for the staging lane.
- Modify `apps/web/src/features/graph/components/Pill.tsx`: update type silhouettes, compact status marker, knowledge probe rail, and leaf dive behavior.
- Modify `apps/web/src/features/graph/components/PeripheralStub.tsx`: external satellite selected behavior and style.
- Modify `apps/web/src/features/graph/components/DependencyEdge.tsx`: neutral default edge and one-hop selected highlighting.
- Modify `apps/web/src/features/graph/components/Legend.tsx`: collapsed help surface content for new visual language.
- Modify `apps/web/src/features/graph/styles.css`: CSS variables for cool circuit light theme and reduced color area.
- Modify `apps/web/src/router/projects.$projectId.graph.tsx`: replace route layout with `GraphWorkbench`.
- Modify `apps/web/e2e/canvas.spec.ts`: update expectations for no hero, top bar breadcrumb, persistent inspector, URL-backed `knowledge=nodes`, and staging lane.

---

### Task 1: URL State Schema

**Files:**
- Modify: `apps/web/src/lib/schemas/graph-search.ts`
- Modify: `apps/web/src/lib/schemas/graph-search.test.ts`
- Modify: `apps/web/src/features/graph/hooks/use-graph-page.ts`

- [x] **Step 1: Write failing schema tests**

Add tests:

```ts
it("defaults missing view to diagnose", () => {
	expect(graphSearchSchema.parse({})).toEqual({ view: "diagnose" });
});

it("accepts explore view, query, focus, nodeId, and knowledge nodes mode", () => {
	expect(
		graphSearchSchema.parse({
			view: "explore",
			query: "redis ttl",
			focus: "n-parent",
			nodeId: "n-child",
			knowledge: "nodes",
		}),
	).toEqual({
		view: "explore",
		query: "redis ttl",
		focus: "n-parent",
		nodeId: "n-child",
		knowledge: "nodes",
	});
});

it("falls back to diagnose for unknown view values", () => {
	expect(graphSearchSchema.parse({ view: "inspect" })).toEqual({
		view: "diagnose",
	});
});

it("strips unknown knowledge values by returning summary mode", () => {
	expect(graphSearchSchema.parse({ knowledge: "all" })).toEqual({
		view: "diagnose",
	});
});
```

- [x] **Step 2: Run schema tests and verify they fail**

Run: `pnpm --filter @zet-plane/web test -- src/lib/schemas/graph-search.test.ts`

Expected: failures showing `view`, `query`, or `knowledge` are not yet parsed as required.

- [x] **Step 3: Implement schema**

Change `graph-search.ts` to:

```ts
import { z } from "zod";

export const graphViewSchema = z.enum(["diagnose", "explore"]);
export type GraphView = z.infer<typeof graphViewSchema>;

export const graphSearchSchema = z
	.object({
		view: z.catch(graphViewSchema, "diagnose").default("diagnose"),
		nodeId: z.string().min(1).optional(),
		focus: z.string().min(1).optional(),
		query: z.string().optional(),
		knowledge: z.literal("nodes").optional(),
	})
	.strip();

export type GraphSearch = z.infer<typeof graphSearchSchema>;
```

- [x] **Step 4: Expose setters from `useGraphPage`**

Add returned values and setters:

```ts
const setView = (view: "diagnose" | "explore") =>
	navigate({ search: (prev) => ({ ...prev, view }) });

const setQuery = (query: string) =>
	navigate({
		search: (prev) => ({ ...prev, query: query.length > 0 ? query : undefined }),
	});

const setKnowledgeNodesVisible = (visible: boolean) =>
	navigate({
		search: (prev) => ({ ...prev, knowledge: visible ? "nodes" : undefined }),
	});
```

Return `view`, `query`, `knowledgeNodesVisible`, `setView`, `setQuery`, and `setKnowledgeNodesVisible`.

- [x] **Step 5: Run tests**

Run: `pnpm --filter @zet-plane/web test -- src/lib/schemas/graph-search.test.ts`

Expected: all tests pass.

- [x] **Step 6: Commit**

```bash
git add apps/web/src/lib/schemas/graph-search.ts apps/web/src/lib/schemas/graph-search.test.ts apps/web/src/features/graph/hooks/use-graph-page.ts
git commit -m "feat(web): add graph workbench URL state"
```

---

### Task 2: Workbench Domain Helpers

**Files:**
- Create: `apps/web/src/features/graph/domain/graph-workbench.ts`
- Create: `apps/web/src/features/graph/domain/graph-workbench.test.ts`

- [x] **Step 1: Write failing helper tests**

Create tests for:

```ts
expect(buildCompositionParentMap(graph).get("leaf")).toBe("parent");
expect(countCompositionChildren(graph).get("parent")).toBe(1);
expect(isLeafNode(graph, "leaf")).toBe(true);
expect(isLeafNode(graph, "parent")).toBe(false);
expect(getKnowledgeSummary(entries, "n1")).toEqual({
	count: 2,
	pitfallCount: 1,
	categories: ["decision", "pitfall"],
});
expect(getOneHopEdgeIds(graph.edges, "n1")).toEqual(new Set(["e-in", "e-out"]));
```

Use local `node`, `edge`, and `entry` builders mirroring the existing test style in `canvas-view.test.ts`.

- [x] **Step 2: Run helper tests and verify they fail**

Run: `pnpm --filter @zet-plane/web test -- src/features/graph/domain/graph-workbench.test.ts`

Expected: fails because the module does not exist.

- [x] **Step 3: Implement helpers**

Create exported helpers:

```ts
import type { EdgeResponse, KnowledgeEntryResponse, NodeResponse } from "@zet-plane/contracts";
import type { ProjectGraph } from "./types";

export function buildCompositionParentMap(graph: ProjectGraph): Map<string, string> {
	const map = new Map<string, string>();
	for (const edge of graph.edges) {
		if (edge.type === "composition") map.set(edge.toId, edge.fromId);
	}
	return map;
}

export function countCompositionChildren(graph: ProjectGraph): Map<string, number> {
	const counts = new Map<string, number>();
	for (const edge of graph.edges) {
		if (edge.type === "composition") counts.set(edge.fromId, (counts.get(edge.fromId) ?? 0) + 1);
	}
	return counts;
}

export function isLeafNode(graph: ProjectGraph, nodeId: string): boolean {
	return (countCompositionChildren(graph).get(nodeId) ?? 0) === 0;
}

export function getOneHopEdgeIds(edges: EdgeResponse[], nodeId: string): Set<string> {
	return new Set(
		edges
			.filter((edge) => edge.type === "dependency" && (edge.fromId === nodeId || edge.toId === nodeId))
			.map((edge) => edge.id),
	);
}

export function getKnowledgeSummary(entries: KnowledgeEntryResponse[], nodeId: string) {
	const matching = entries.filter((entry) => entry.nodeId === nodeId);
	const categories = Array.from(new Set(matching.map((entry) => entry.category))).sort();
	return {
		count: matching.length,
		pitfallCount: matching.filter((entry) => entry.category === "pitfall").length,
		categories,
	};
}

export function getNodeById(nodes: NodeResponse[], nodeId: string | null | undefined): NodeResponse | null {
	if (!nodeId) return null;
	return nodes.find((node) => node.id === nodeId) ?? null;
}
```

- [x] **Step 4: Run helper tests**

Run: `pnpm --filter @zet-plane/web test -- src/features/graph/domain/graph-workbench.test.ts`

Expected: all tests pass.

- [x] **Step 5: Commit**

```bash
git add apps/web/src/features/graph/domain/graph-workbench.ts apps/web/src/features/graph/domain/graph-workbench.test.ts
git commit -m "feat(web): add graph workbench helpers"
```

---

### Task 3: Fetch Project Knowledge Once

**Files:**
- Create: `apps/web/src/features/graph/hooks/use-project-entries.ts`
- Test: `apps/web/src/features/graph/hooks/use-node-entries.test.tsx` can remain unchanged unless shared query behavior breaks.

- [x] **Step 1: Add hook**

Create:

```ts
import { useQuery } from "@tanstack/react-query";
import { listEntriesEndpoint } from "@zet-plane/contracts";
import { apiCall } from "@/lib/api-client";

export function useProjectEntries(projectId: string) {
	return useQuery({
		queryKey: ["project", projectId, "entries"],
		queryFn: () =>
			apiCall(listEntriesEndpoint, {
				params: { id: projectId },
			}),
	});
}
```

- [x] **Step 2: Run hook-adjacent tests**

Run: `pnpm --filter @zet-plane/web test -- src/features/graph/hooks/use-node-entries.test.tsx`

Expected: existing tests still pass.

- [x] **Step 3: Commit**

```bash
git add apps/web/src/features/graph/hooks/use-project-entries.ts
git commit -m "feat(web): load project graph knowledge entries"
```

---

### Task 4: Workbench Shell And Persistent Inspector

**Files:**
- Create: `apps/web/src/features/graph/components/GraphWorkbench.tsx`
- Create: `apps/web/src/features/graph/components/GraphTopBar.tsx`
- Create: `apps/web/src/features/graph/components/GraphLeftRail.tsx`
- Create: `apps/web/src/features/graph/components/GraphInspector.tsx`
- Modify: `apps/web/src/router/projects.$projectId.graph.tsx`

- [ ] **Step 1: Add components with minimal behavior**

`GraphWorkbench` props:

```ts
type GraphWorkbenchProps = {
	projectId: string;
	graph: ProjectGraph | undefined;
	isLoading: boolean;
	error: Error | null;
	isFetching: boolean;
	dataUpdatedAt: number;
	onRetry: () => void;
	view: "diagnose" | "explore";
	query: string;
	knowledgeNodesVisible: boolean;
	selectedNodeId: string | null;
	onSelectNode: (id: string | null) => void;
	onViewChange: (view: "diagnose" | "explore") => void;
	onQueryChange: (query: string) => void;
	onKnowledgeNodesVisibleChange: (visible: boolean) => void;
};
```

Shell layout:

```tsx
return (
	<div className="zp-workbench">
		<GraphTopBar
			graph={graph}
			view={view}
			knowledgeNodesVisible={knowledgeNodesVisible}
			dataUpdatedAt={dataUpdatedAt}
			isFetching={isFetching}
			onRefresh={onRetry}
			onViewChange={onViewChange}
			onKnowledgeNodesVisibleChange={onKnowledgeNodesVisibleChange}
		/>
		<div className="zp-workbench__body">
			<GraphLeftRail
				graph={graph}
				view={view}
				query={query}
				selectedNodeId={selectedNodeId}
				onQueryChange={onQueryChange}
				onSelectNode={onSelectNode}
			/>
			<div className="zp-workbench__canvas">
				<GraphCanvas
					graph={graph}
					isLoading={isLoading}
					error={error}
					onRetry={onRetry}
					selectedNodeId={selectedNodeId}
					onSelectNode={onSelectNode}
				/>
				<Legend />
				<UpdatedAgo updatedAtMs={dataUpdatedAt} onRefresh={onRetry} isFetching={isFetching} />
			</div>
			<GraphInspector
				projectId={projectId}
				graph={graph}
				view={view}
				selectedNodeId={selectedNodeId}
				onSelectNode={onSelectNode}
			/>
		</div>
	</div>
);
```

- [ ] **Step 2: Implement top bar**

Include:

```tsx
<div className="zp-topbar">
	<div className="zp-topbar__project">{projectTitle}</div>
	<nav className="zp-topbar__crumbs" aria-label="Graph breadcrumb">
		{segments.map((segment) => (
			<button type="button" key={segment.id ?? "root"} onClick={() => onFocusChange(segment.id)}>
				{segment.title}
			</button>
		))}
	</nav>
	<div className="zp-topbar__switch" role="group" aria-label="Graph view">
		<button type="button" aria-pressed={view === "diagnose"} onClick={() => onViewChange("diagnose")}>Diagnose</button>
		<button type="button" aria-pressed={view === "explore"} onClick={() => onViewChange("explore")}>Explore</button>
	</div>
	<button type="button" aria-pressed={knowledgeNodesVisible} onClick={() => onKnowledgeNodesVisibleChange(!knowledgeNodesVisible)}>
		Knowledge nodes
	</button>
</div>
```

- [ ] **Step 3: Implement left rail**

Use local state for collapse:

```tsx
const [collapsed, setCollapsed] = useState(false);
return (
	<aside className={collapsed ? "zp-left-rail zp-left-rail--collapsed" : "zp-left-rail"}>
		<button type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand rail" : "Collapse rail"} />
		{!collapsed && view === "diagnose" && <DiagnoseRailContent />}
		{!collapsed && view === "explore" && <ExploreRailContent query={query} onQueryChange={onQueryChange} />}
	</aside>
);
```

- [ ] **Step 4: Implement persistent inspector**

For v1, render:

```tsx
if (!selected) {
	return <GraphContextSummary view={view} graph={graph} entries={entries} focusedNodeId={focusedNodeId} />;
}

return (
	<aside className="zp-inspector">
		<header>
			<div className="zp-inspector__eyebrow">{selected.type} · {selected.status}</div>
			<h2>{selected.title}</h2>
		</header>
		<section>
			<h3>Flow impact</h3>
			<DependencyRows edges={edges} nodes={nodes} selectedNodeId={selected.id} onSelectNode={onSelectNode} />
		</section>
		<section>
			<h3>Knowledge evidence</h3>
			<EvidenceRows entries={entries.filter((entry) => entry.nodeId === selected.id)} />
		</section>
	</aside>
);
```

- [ ] **Step 5: Replace route layout**

`projects.$projectId.graph.tsx` should call `useProjectEntries(projectId)` and pass state into `GraphWorkbench`. Remove the route-level split grid and old inline Details header.

- [ ] **Step 6: Run build-level tests**

Run: `pnpm --filter @zet-plane/web test -- src/lib/schemas/graph-search.test.ts src/features/graph/domain/graph-workbench.test.ts`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/graph/components/GraphWorkbench.tsx apps/web/src/features/graph/components/GraphTopBar.tsx apps/web/src/features/graph/components/GraphLeftRail.tsx apps/web/src/features/graph/components/GraphInspector.tsx apps/web/src/router/projects.\$projectId.graph.tsx
git commit -m "feat(web): add graph workbench shell"
```

---

### Task 5: Canvas Chrome Removal And Leaf-Safe Dive

**Files:**
- Modify: `apps/web/src/features/graph/components/GraphCanvas.tsx`
- Modify: `apps/web/src/features/graph/components/Pill.tsx`
- Modify: `apps/web/e2e/canvas.spec.ts`

- [ ] **Step 1: Update E2E expectations**

Replace hero/breadcrumb canvas expectations:

```ts
await expect(page.locator(".zp-hero--project")).not.toBeAttached();
await expect(page.locator(".zp-topbar__crumbs")).toContainText("Zet Plane 项目开发流程");
await expect(page.locator(`.react-flow [data-id="${ROOT_ID}"]`)).not.toBeAttached();
```

For focused sub-graph:

```ts
await expect(page.locator(".zp-hero--scaffold")).not.toBeAttached();
await expect(page.locator(".zp-topbar__crumbs")).toContainText("PRD 与项目排期");
```

- [ ] **Step 2: Remove canvas hero and breadcrumb**

In `GraphCanvas`, remove imports and JSX for `Breadcrumb`, `HeroToken`, `KnowledgeToggle`, and `StagingPanel`. Keep only the React Flow canvas surface.

- [ ] **Step 3: Keep leaf nodes from exposing dive affordances**

`Pill` already hides dive when `childCount === 0`. Ensure double-click does nothing unless `childCount > 0`:

```ts
const dive = () => {
	if (childCount > 0) onDive?.(node.id);
};
```

Keep this guard and ensure `GraphCanvas` does not call `diveInto` on double-click for leaf nodes:

```ts
onNodeDoubleClick={(_, n) => {
	const childCount = compositionChildCount.get(n.id) ?? 0;
	if (childCount > 0) diveInto(n.id);
}}
```

- [ ] **Step 4: Run E2E target in headed project environment when available**

Run: `pnpm --filter @zet-plane/web exec playwright test e2e/canvas.spec.ts --project=chromium`

Expected: updated tests pass when the dev server and seeded backend are available.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/graph/components/GraphCanvas.tsx apps/web/src/features/graph/components/Pill.tsx apps/web/e2e/canvas.spec.ts
git commit -m "feat(web): move graph context into workbench chrome"
```

---

### Task 6: Staging Lane In Canvas

**Files:**
- Create: `apps/web/src/features/graph/components/StagingLane.tsx`
- Modify: `apps/web/src/features/graph/components/GraphCanvas.tsx`
- Modify: `apps/web/src/features/graph/styles.css`
- Modify: `apps/web/e2e/canvas.spec.ts`

- [ ] **Step 1: Add staging lane component**

Create a custom React Flow node:

```tsx
import type { Node, NodeProps } from "@xyflow/react";
import type { NodeResponse } from "@zet-plane/contracts";

export type StagingLaneData = {
	nodes: NodeResponse[];
	selectedNodeId: string | null;
	onSelect: (id: string) => void;
};

export type StagingLaneNode = Node<StagingLaneData>;

export function StagingLane({ data }: NodeProps<StagingLaneNode>) {
	return (
		<section className="zp-staging-lane" aria-label="Staging lane">
			<header className="zp-staging-lane__header">
				<span>Staging</span>
				<span>{data.nodes.length}</span>
			</header>
			<div className="zp-staging-lane__items">
				{data.nodes.length === 0 ? (
					<div className="zp-staging-lane__empty">No unanchored nodes</div>
				) : (
					data.nodes.map((node) => (
						<button
							key={node.id}
							type="button"
							className={data.selectedNodeId === node.id ? "zp-staging-lane__item zp-staging-lane__item--selected" : "zp-staging-lane__item"}
							onClick={() => data.onSelect(node.id)}
						>
							<span className="zp-staging-lane__marker">unanchored</span>
							<span>{node.title}</span>
						</button>
					))
				)}
			</div>
		</section>
	);
}
```

- [ ] **Step 2: Add lane node in `GraphCanvas` only at top level**

Add `stagingLane` to `nodeTypes`. Compute lane position from layouted child bbox:

```ts
const stagingNodes = graph?.nodes.filter((node) => node.role === "staging_root" || node.type === "staging") ?? [];
const stagingLaneNode: Node | null =
	view.isTopLevel && graph
		? {
				id: "__staging_lane__",
				type: "stagingLane",
				position: { x: bbox.maxX + 96, y: bbox.minY },
				width: 280,
				height: Math.max(220, bbox.maxY - bbox.minY),
				data: { nodes: stagingNodes, selectedNodeId, onSelect: onSelectNode },
				draggable: false,
				selectable: false,
			}
		: null;
```

Append it to `xyNodes` when present.

- [ ] **Step 3: Update E2E**

Replace old `aside.zp-staging` checks with:

```ts
const staging = page.getByLabel("Staging lane");
await expect(staging).toBeVisible();
await expect(staging).toContainText("No unanchored nodes");
```

For focused sub-graph:

```ts
await expect(page.getByLabel("Staging lane")).not.toBeVisible();
```

- [ ] **Step 4: Run E2E target**

Run: `pnpm --filter @zet-plane/web exec playwright test e2e/canvas.spec.ts --project=chromium`

Expected: staging lane tests pass when services are running.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/graph/components/StagingLane.tsx apps/web/src/features/graph/components/GraphCanvas.tsx apps/web/src/features/graph/styles.css apps/web/e2e/canvas.spec.ts
git commit -m "feat(web): render staging as canvas lane"
```

---

### Task 7: Reduced Visual Color System

**Files:**
- Modify: `apps/web/src/features/graph/styles.css`
- Modify: `apps/web/src/features/graph/components/Pill.tsx`
- Modify: `apps/web/src/features/graph/components/DependencyEdge.tsx`
- Modify: `apps/web/src/features/graph/components/status-classes.ts`
- Modify: `apps/web/src/features/graph/components/status-classes.test.ts`
- Modify: `apps/web/src/features/graph/components/Pill.test.tsx`

- [ ] **Step 1: Update status class tests**

Replace edge status expectations with neutral/highlight semantics:

```ts
expect(edgeStateClass({ selected: false, dimmed: false, blocked: false })).toBe("zp-edge--neutral");
expect(edgeStateClass({ selected: true, dimmed: false, blocked: false })).toBe("zp-edge--selected");
expect(edgeStateClass({ selected: false, dimmed: true, blocked: false })).toBe("zp-edge--dim");
expect(edgeStateClass({ selected: false, dimmed: false, blocked: true })).toBe("zp-edge--blocked");
```

- [ ] **Step 2: Update Pill tests**

Add:

```ts
it("renders a compact status marker", () => {
	const { container } = renderPill(mkData());
	expect(container.querySelector(".zp-node-status")).not.toBeNull();
});

it("renders knowledge probe rail when knowledge categories are present", () => {
	renderPill(mkData({ knowledgeCount: 3, knowledgeCategories: ["decision", "pitfall"] }));
	expect(screen.getByLabelText("3 knowledge entries")).toBeInTheDocument();
});
```

Add `knowledgeCategories` to `PillData`.

- [ ] **Step 3: Implement compact status marker**

In `Pill`, render:

```tsx
<span className={`zp-node-status zp-node-status--${displayStatus}`} aria-label={`Status: ${displayStatus}`} />
```

Replace `K3` chip with probe rail when categories are available:

```tsx
{knowledgeCount > 0 && (
	<span className="zp-probe-rail" aria-label={`${knowledgeCount} knowledge entries`}>
		{knowledgeCategories.slice(0, 3).map((category) => (
			<i key={category} className={`zp-probe-dot zp-probe-dot--${category}`} />
		))}
		<span className="zp-probe-count">{knowledgeCount}</span>
	</span>
)}
```

- [ ] **Step 4: Implement CSS variables and neutral edges**

Add variables under `:root`:

```css
:root {
	--zp-surface-app: #eef3f8;
	--zp-surface-panel: #ffffff;
	--zp-surface-canvas: #f5f8fb;
	--zp-border-subtle: #d8e0ea;
	--zp-edge-neutral: #9aa9ba;
	--zp-edge-selected: #3b82f6;
	--zp-edge-dim: rgba(120, 137, 158, 0.28);
	--zp-type-scaffold: #b9892f;
	--zp-type-growth: #2f8c8c;
	--zp-type-knowledge: #8b6bd6;
	--zp-status-active: #3b82f6;
	--zp-status-blocked: #d66b4d;
	--zp-status-completed: #4f9565;
	--zp-status-archived: #9ca3af;
	--zp-glow-selected: rgba(59, 130, 246, 0.28);
}
```

Set `.zp-edge` default stroke to `var(--zp-edge-neutral)`, `.zp-edge--selected` to selected, and `.zp-edge--dim` opacity/stroke to dim.

- [ ] **Step 5: Run component tests**

Run: `pnpm --filter @zet-plane/web test -- src/features/graph/components/Pill.test.tsx src/features/graph/components/status-classes.test.ts`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/graph/styles.css apps/web/src/features/graph/components/Pill.tsx apps/web/src/features/graph/components/DependencyEdge.tsx apps/web/src/features/graph/components/status-classes.ts apps/web/src/features/graph/components/status-classes.test.ts apps/web/src/features/graph/components/Pill.test.tsx
git commit -m "feat(web): apply cool circuit graph styling"
```

---

### Task 8: One-Hop Edge Highlighting And Filters

**Files:**
- Modify: `apps/web/src/features/graph/components/GraphCanvas.tsx`
- Modify: `apps/web/src/features/graph/components/DependencyEdge.tsx`
- Modify: `apps/web/src/features/graph/domain/graph-workbench.test.ts`

- [ ] **Step 1: Ensure helper test covers one-hop only**

Add:

```ts
expect(getOneHopEdgeIds(edges, "middle")).toEqual(new Set(["in", "out"]));
expect(getOneHopEdgeIds(edges, "middle").has("two-hop")).toBe(false);
```

- [ ] **Step 2: Pass selected edge state to React Flow edges**

In `GraphCanvas`, compute:

```ts
const selectedOneHopEdgeIds = selectedNodeId ? getOneHopEdgeIds(graph.edges, selectedNodeId) : new Set<string>();
const hasSelectedNode = selectedNodeId !== null;
```

Set edge data:

```ts
data: {
	targetStatus,
	dimmed: hasSelectedNode && !selectedOneHopEdgeIds.has(e.id),
	selected: selectedOneHopEdgeIds.has(e.id),
	variant: "flow",
}
```

- [ ] **Step 3: Update `DependencyEdgeData`**

Add `selected: boolean` and render selected class:

```ts
const classes = ["zp-edge"];
if (data?.selected) classes.push("zp-edge--selected");
if (data?.dimmed) classes.push("zp-edge--dim");
if (data?.targetStatus === "blocked") classes.push("zp-edge--blocked");
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @zet-plane/web test -- src/features/graph/domain/graph-workbench.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/graph/components/GraphCanvas.tsx apps/web/src/features/graph/components/DependencyEdge.tsx apps/web/src/features/graph/domain/graph-workbench.test.ts
git commit -m "feat(web): highlight selected graph dependencies"
```

---

### Task 9: E2E And Final Verification

**Files:**
- Modify: `apps/web/e2e/canvas.spec.ts`
- Modify: any files required by failures from earlier tasks.

- [ ] **Step 1: Update knowledge toggle E2E**

Replace localStorage persistence expectations with URL behavior:

```ts
const toggle = page.getByRole("button", { name: /Knowledge nodes/ });
await expect(toggle).toHaveAttribute("aria-pressed", "false");
await toggle.click();
await expect(page).toHaveURL(/knowledge=nodes/);
await expect(toggle).toHaveAttribute("aria-pressed", "true");
await toggle.click();
await expect(page).not.toHaveURL(/knowledge=nodes/);
```

- [ ] **Step 2: Add view switch E2E**

```ts
await page.getByRole("button", { name: "Explore" }).click();
await expect(page).toHaveURL(/view=explore/);
await expect(page.getByRole("searchbox", { name: /Search/ })).toBeVisible();
await page.getByRole("button", { name: "Diagnose" }).click();
await expect(page).toHaveURL(/view=diagnose/);
```

- [ ] **Step 3: Run unit tests**

Run: `pnpm --filter @zet-plane/web test`

Expected: all web Vitest tests pass.

- [ ] **Step 4: Run lint**

Run: `pnpm --filter @zet-plane/web lint`

Expected: Biome reports no errors.

- [ ] **Step 5: Run e2e if local services are available**

Run: `pnpm --filter @zet-plane/web exec playwright test e2e/canvas.spec.ts --project=chromium`

Expected: Playwright passes against the seeded semantic demo. If backend or dev server is unavailable, record the blocker and the command output in the final handoff.

- [ ] **Step 6: Commit final test updates**

```bash
git add apps/web/e2e/canvas.spec.ts
git commit -m "test(web): update graph workbench coverage"
```

---

## Self-Review Notes

Spec coverage:

- URL state: Task 1.
- Workbench shell, top bar, left rail, persistent inspector: Task 4.
- Hero removal and leaf dive behavior: Task 5.
- Staging lane: Task 6.
- Cool circuit light visual language and CSS variables: Task 7.
- One-hop selected path highlighting: Task 8.
- E2E coverage and verification: Task 9.

Intentional v1 exclusions:

- Hover preview.
- Project-wide Attention Queue toggle.
- Advanced Diagnose impact algorithms.
- Final search backend and ranking.
- Advanced knowledge facets.
- Checkpoint resolution and knowledge revision mutation flows.
