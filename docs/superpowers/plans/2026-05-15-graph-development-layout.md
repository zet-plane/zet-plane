# Graph Development Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the web graph canvas from nested composition containers to a top-down development graph where composition is a visible growth edge.

**Architecture:** Keep backend graph semantics unchanged. In the web layout layer, stop converting composition edges into React Flow parent nesting; instead feed composition and dependency edges into ELK as top-level graph edges. In the canvas layer, render all nodes as `NodeCard` and render `composition` with a new structural edge style distinct from `dependency`.

**Tech Stack:** React 19, @xyflow/react v12, ELK.js, Vitest, Testing Library React, TypeScript, CSS.

---

## File Structure

- Modify `apps/web/src/features/graph/layout/use-layouted-graph.ts`
  - Build layout input with every node as top-level (`parentId: null`).
  - Feed both `composition` and `dependency` edges to ELK.
  - Return layouted nodes with `parentId: null` to avoid React Flow nesting.

- Modify `apps/web/src/features/graph/layout/use-layouted-graph.test.tsx`
  - Assert composition edges are sent to ELK as layout edges.
  - Assert layouted child nodes do not receive `parentId`.

- Modify `apps/web/src/features/graph/layout/elk-layout.test.ts`
  - Replace container-sizing expectations with top-down composition layout expectations.

- Create `apps/web/src/features/graph/components/CompositionEdge.tsx`
  - Render a neutral structural edge for composition.
  - Support the existing focus dimming behavior.

- Modify `apps/web/src/features/graph/components/GraphCanvas.tsx`
  - Remove `ContainerCard` usage and container detection.
  - Register `composition` edge type.
  - Render composition edges in addition to dependency edges.

- Modify `apps/web/src/features/graph/styles.css`
  - Add structural edge CSS classes for composition.

## Task 1: Layout Hook Stops Creating Visual Parents

**Files:**
- Modify: `apps/web/src/features/graph/layout/use-layouted-graph.test.tsx`
- Modify: `apps/web/src/features/graph/layout/use-layouted-graph.ts`

- [ ] **Step 1: Write the failing hook test expectation**

In `apps/web/src/features/graph/layout/use-layouted-graph.test.tsx`, update the existing `"returns layouted graph data asynchronously"` test body so the two assertions at the end read:

```ts
expect(layoutGraphMock).toHaveBeenCalledWith({
	nodes: [
		expect.objectContaining({ id: "root", parentId: null }),
		expect.objectContaining({ id: "child", parentId: null }),
	],
	edges: [
		{ id: "e1", fromId: "root", toId: "child" },
		{ id: "e2", fromId: "root", toId: "child" },
	],
});
expect(result.current.data).toEqual({
	nodes: [
		expect.objectContaining({
			id: "root",
			parentId: null,
			position: { x: 0, y: 0 },
		}),
		expect.objectContaining({
			id: "child",
			parentId: null,
			position: { x: 24, y: 32 },
		}),
	],
	edges: graph.edges,
});
expect(result.current.error).toBeNull();
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --filter @zet-plane/web test -- src/features/graph/layout/use-layouted-graph.test.tsx
```

Expected: FAIL because the current hook still sends `child.parentId = "root"` and only sends dependency edge `e2` to `layoutGraph`.

- [ ] **Step 3: Implement top-level layout input**

In `apps/web/src/features/graph/layout/use-layouted-graph.ts`, remove the `buildParentMap` import:

```ts
import { topologyHash } from "../domain/topology-hash";
```

Update `createLayoutInput` to stop creating a parent map and to include both graph edge types:

```ts
function createLayoutInput(graph: ProjectGraph): LayoutInput {
	const nodes = graph.nodes.map((node) => {
		const textSize = measureNodeText({
			text: node.title,
			font: NODE_TITLE_FONT,
			maxWidth: NODE_TITLE_MAX_WIDTH,
			lineHeight: NODE_TITLE_LINE_HEIGHT,
		});

		return {
			id: node.id,
			width: Math.max(1, textSize.width + NODE_HORIZONTAL_PADDING * 2),
			height: Math.max(1, textSize.height + NODE_VERTICAL_PADDING * 2),
			parentId: null,
		};
	});
	const edges = graph.edges.map((edge) => ({
		id: edge.id,
		fromId: edge.fromId,
		toId: edge.toId,
	}));

	return { nodes, edges };
}
```

Update `mergeLayoutResult` to remove its `parentMap` parameter and return top-level nodes:

```ts
function mergeLayoutResult(
	graph: ProjectGraph,
	result: LayoutOutput,
): LayoutedGraph {
	const layoutById = new Map(result.nodes.map((node) => [node.id, node]));

	return {
		nodes: graph.nodes.map((node): LayoutedNode => {
			const layoutNode = layoutById.get(node.id);

			if (layoutNode === undefined) {
				throw new Error(`Missing layout result for node ${node.id}`);
			}

			return {
				...node,
				width: layoutNode.width,
				height: layoutNode.height,
				position: layoutNode.position,
				parentId: null,
			};
		}),
		edges: graph.edges,
	};
}
```

Update the `useMemo` call that merges layout results:

```ts
return mergeLayoutResult(graph, state.layoutResult);
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm --filter @zet-plane/web test -- src/features/graph/layout/use-layouted-graph.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add apps/web/src/features/graph/layout/use-layouted-graph.ts apps/web/src/features/graph/layout/use-layouted-graph.test.tsx
git commit -m "feat: layout graph composition as growth edges"
```

## Task 2: ELK Tests Cover Top-Down Composition Layout

**Files:**
- Modify: `apps/web/src/features/graph/layout/elk-layout.test.ts`

- [ ] **Step 1: Replace parent-container tests with composition growth tests**

In `apps/web/src/features/graph/layout/elk-layout.test.ts`, delete the tests named:

```ts
it("keeps child positions non-negative inside a parent", async () => {
	// delete this test
});

it("sizes parent nodes to contain their children", async () => {
	// delete this test
});
```

Add this test after `"lays out a dependency target below its source"`:

```ts
it("lays out composition descendants below their source without parent containers", async () => {
	const input: LayoutInput = {
		nodes: [
			{ id: "root", width: 160, height: 64, parentId: null },
			{ id: "event", width: 140, height: 52, parentId: null },
			{ id: "branch", width: 140, height: 52, parentId: null },
		],
		edges: [
			{ id: "c1", fromId: "root", toId: "event" },
			{ id: "c2", fromId: "event", toId: "branch" },
		],
	};

	const result = await layoutGraph(input);
	const root = result.nodes.find((node) => node.id === "root");
	const event = result.nodes.find((node) => node.id === "event");
	const branch = result.nodes.find((node) => node.id === "branch");

	expect(root).toBeDefined();
	expect(event).toBeDefined();
	expect(branch).toBeDefined();
	expect(event!.position.y).toBeGreaterThan(root!.position.y);
	expect(branch!.position.y).toBeGreaterThan(event!.position.y);
	expect(root!.height).toBeLessThan(120);
});
```

- [ ] **Step 2: Run ELK layout tests**

Run:

```bash
pnpm --filter @zet-plane/web test -- src/features/graph/layout/elk-layout.test.ts
```

Expected: PASS. The test should confirm downward layout without relying on parent container expansion.

- [ ] **Step 3: Commit Task 2**

Run:

```bash
git add apps/web/src/features/graph/layout/elk-layout.test.ts
git commit -m "test: cover top down composition layout"
```

## Task 3: Canvas Renders Composition As A Structural Edge

**Files:**
- Create: `apps/web/src/features/graph/components/CompositionEdge.tsx`
- Modify: `apps/web/src/features/graph/components/GraphCanvas.tsx`
- Modify: `apps/web/src/features/graph/styles.css`

- [ ] **Step 1: Add the composition edge component**

Create `apps/web/src/features/graph/components/CompositionEdge.tsx`:

```tsx
import {
	BaseEdge,
	type Edge,
	type EdgeProps,
	getBezierPath,
} from "@xyflow/react";

export type CompositionEdgeData = {
	dimmed: boolean;
};

export type CompositionEdgeType = Edge<CompositionEdgeData>;

export function CompositionEdge(props: EdgeProps<CompositionEdgeType>) {
	const {
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
		data,
		markerEnd,
	} = props;
	const [path] = getBezierPath({
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
	});
	const classes = ["zp-edge", "zp-edge--composition"];
	if (data?.dimmed) classes.push("zp-edge--dim");
	return (
		<BaseEdge
			id={props.id}
			path={path}
			className={classes.join(" ")}
			markerEnd={markerEnd}
		/>
	);
}
```

- [ ] **Step 2: Update GraphCanvas imports and edge registry**

In `apps/web/src/features/graph/components/GraphCanvas.tsx`, replace the component imports near the top:

```tsx
import { CompositionEdge } from "./CompositionEdge";
import { DependencyEdge } from "./DependencyEdge";
import { EmptyState, ErrorState, LoadingState } from "./EmptyState";
import { NodeCard, type NodeCardData } from "./NodeCard";
```

Remove these imports:

```tsx
import { aggregateStatus } from "../domain/aggregate-status";
import { ContainerCard, type ContainerCardData } from "./ContainerCard";
```

Update the type registries:

```tsx
const nodeTypes = { node: NodeCard };
const edgeTypes = { composition: CompositionEdge, dependency: DependencyEdge };
```

- [ ] **Step 3: Remove container state from CanvasInner**

In `GraphCanvas.tsx`, delete this aggregation block:

```tsx
const aggregation = useMemo(
	() => (graph ? aggregateStatus(graph) : new Map()),
	[graph],
);
const isContainer = useMemo(() => {
	const set = new Set<string>();
	if (layouted)
		for (const n of layouted.nodes) if (n.parentId) set.add(n.parentId);
	return set;
}, [layouted]);
```

- [ ] **Step 4: Focus both composition and dependency edges**

Replace `focusEdgeIds` with:

```tsx
const focusEdgeIds = useMemo(() => {
	if (!focusId || !graph) return new Set<string>();
	const ids = new Set<string>();
	for (const e of graph.edges) {
		if (e.fromId === focusId || e.toId === focusId) ids.add(e.id);
	}
	return ids;
}, [focusId, graph]);
```

- [ ] **Step 5: Render every node as NodeCard**

Replace the `xyNodes` mapping with:

```tsx
const xyNodes: Node[] = layouted.nodes.map((n) => {
	const data: NodeCardData = {
		node: n,
		knowledgeCount: 0,
		selected: selectedNodeId === n.id,
		dimmed: focusId !== null && focusId !== n.id,
	};
	return {
		id: n.id,
		type: "node",
		position: n.position,
		width: n.width,
		height: n.height,
		data: data as Record<string, unknown>,
		selectable: true,
		draggable: false,
	};
});
```

- [ ] **Step 6: Render both edge types**

Replace the `xyEdges` mapping with:

```tsx
const xyEdges: Edge[] = layouted.edges
	.filter((e) => e.type === "composition" || e.type === "dependency")
	.map((e) => {
		const target = nodesById.get(e.toId);
		const dimmed = focusId !== null && !focusEdgeIds.has(e.id);
		if (e.type === "composition") {
			return {
				id: e.id,
				source: e.fromId,
				target: e.toId,
				type: "composition",
				data: { dimmed },
			};
		}
		return {
			id: e.id,
			source: e.fromId,
			target: e.toId,
			type: "dependency",
			data: { targetStatus: target?.status ?? "active", dimmed },
		};
	});
```

- [ ] **Step 7: Add composition edge CSS**

In `apps/web/src/features/graph/styles.css`, add this after the existing `.zp-edge--active` rule:

```css
.zp-edge--composition {
	stroke: var(--zp-badge-neutral);
	stroke-width: 1.75;
}
```

- [ ] **Step 8: Run TypeScript build**

Run:

```bash
pnpm --filter @zet-plane/web build
```

Expected: PASS. If TypeScript complains about `Edge` data typing in `xyEdges`, keep the returned objects as plain `Edge[]` and cast only the `data` object values to `Record<string, unknown>`:

```ts
data: { dimmed } as Record<string, unknown>,
```

and

```ts
data: { targetStatus: target?.status ?? "active", dimmed } as Record<string, unknown>,
```

- [ ] **Step 9: Commit Task 3**

Run:

```bash
git add apps/web/src/features/graph/components/CompositionEdge.tsx apps/web/src/features/graph/components/GraphCanvas.tsx apps/web/src/features/graph/styles.css
git commit -m "feat: render composition as structural edges"
```

## Task 4: Full Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run web tests**

Run:

```bash
pnpm --filter @zet-plane/web test
```

Expected: PASS.

- [ ] **Step 2: Run web build**

Run:

```bash
pnpm --filter @zet-plane/web build
```

Expected: PASS.

- [ ] **Step 3: Inspect final diff**

Run:

```bash
git status --short
git diff --stat HEAD~3..HEAD
```

Expected: working tree clean, with changes limited to graph layout, graph canvas, styles, and tests.

- [ ] **Step 4: Run a manual browser check**

Run:

```bash
pnpm --filter @zet-plane/web dev
```

Open the project graph page and verify:

- Project Root is a card at the top, not a container.
- Child nodes are independent cards below it.
- Composition edges are visible.
- Dependency edges still render with status-aware styling.

Stop the dev server after the check.
