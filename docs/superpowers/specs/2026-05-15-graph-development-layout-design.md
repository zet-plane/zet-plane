# Graph Development Layout Design

## Context

The current graph canvas renders `composition` edges as React Flow parent nesting:

- `buildParentMap(graph)` turns each `composition` edge into a `parentId`.
- ELK receives those parent IDs and sizes parent nodes to contain their children.
- React Flow receives `parentId` and `extent: "parent"`, so children visually sit inside parent containers.

That makes the project look like overlapping containment regions. It hides the intended reading: a project starts at `Project Root` and expands downward as events create or reveal new work.

## Decision

Use a top-down development tree as the default canvas model.

`composition` keeps its business meaning as the structural parent/growth relationship, but the web canvas no longer renders it as visual containment. Instead, all graph nodes are independent cards in one layout plane, and `composition` is drawn as a visible downward edge.

## Visual Model

The graph should read as:

```text
Project Root
  ↓ composition
Event / work node
  ↓ composition
Expanded branch / downstream work
```

Rules:

- `Project Root` is positioned near the top by the layered layout.
- `composition` edges participate in layout and are visible on the canvas.
- `dependency` edges remain visible and keep a distinct style from `composition`.
- Nodes are not placed inside parent containers.
- There is no Venn-like or nested-card reading in the default graph view.

## Edge Semantics

`composition`:

- Means “this work developed from / belongs structurally under this parent”.
- Drives top-down placement.
- Uses a neutral structural edge style, such as a solid muted line with an arrow.

`dependency`:

- Means “source is blocked by or depends on target”.
- Keeps its existing dependency-specific style and status awareness.
- May cross between branches.

## Implementation Shape

Update the web canvas only. No backend contract change is required.

Expected code changes:

- In `use-layouted-graph.ts`, stop using `buildParentMap` to pass `parentId` into layout input.
- Feed both `composition` and `dependency` edges to ELK so the top-down layout sees the project growth structure.
- Return `parentId: null` for layouted canvas nodes, or otherwise avoid React Flow parent nesting.
- In `GraphCanvas.tsx`, remove container detection based on `parentId`.
- Render all nodes as regular graph cards, with a possible special visual treatment for `project_root`.
- Render `composition` edges in addition to `dependency` edges, with separate edge type/style.
- Keep aggregation logic available because it still uses `composition` business structure.

## Data And Fixture Direction

Demo or seed data should avoid a flat “root contains everything” reading. Prefer chains and branches that show development over time:

```text
Project Root
  → Kickoff event
    → Define scope
    → Build first workflow
      → Resolve blocker
  → Research branch
    → Validate assumption
```

The data does not need a new event entity for this change. Event-like labels or timestamps can live in node titles/descriptions/details until a dedicated event model exists.

## Acceptance Criteria

- A project with `composition` edges does not render children inside parent nodes.
- `Project Root` and its descendants appear as a downward branching graph.
- `composition` edges are visible and visually different from `dependency` edges.
- `dependency` edges continue to render and highlight based on focus/status.
- Existing aggregation/status behavior still uses the composition structure.
- Layout tests cover that composition edges influence downward placement without creating parent-sized containers.

## Non-Goals

- Changing the backend `composition` contract.
- Introducing a new event table or event API.
- Reworking the detail panel beyond showing the same selected node data.
- Building a separate timeline mode in this pass.
