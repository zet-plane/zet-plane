# Graph Workbench Redesign — Diagnose / Explore Read-Only Modes

**Date**: 2026-05-18
**Status**: Draft for user review
**Scope**: Web frontend graph page only
**Builds on**: [Graph Rendering Model — Scaffold-Led, Growth-Dominant](./2026-05-16-graph-rendering-model.md)
**Backend impact**: none in this round

---

## 1. Problem

The current graph page has the right core model: a semantic project graph made of `scaffold`, `growth`, `staging`, dependency edges, sub-graph dive-in, and knowledge anchored to nodes. The page is still shaped like a prototype viewer:

- Global navigation takes too much permanent horizontal space.
- The graph canvas, staging list, legend, refresh state, and detail panel are separate UI islands instead of one coherent workbench.
- The right panel reads like a record viewer, while users need semantic diagnosis and knowledge interpretation.
- The page does not yet distinguish two major read-only workflows: diagnosing project state and exploring learned knowledge.

RAGFlow's agent canvas is useful as a reference for workbench density and layout structure, but Zet Plane must not become a RAGFlow-style executable operator editor. Zet Plane nodes are project semantics, not runnable blocks with configurable ports.

## 2. Product Position

For this phase, Graph is a **read-only semantic observer**.

It should reserve the structure needed for a future constrained project workbench, but visible actions must stay read-only:

- navigate graph layers;
- select nodes;
- inspect diagnosis and evidence;
- filter or highlight;
- search or browse reserved affordances;
- refresh graph data.

It must not expose graph mutation, drag-to-connect, free node creation, dependency rewiring, or staging anchoring in this phase.

## 3. View Model

The graph route hosts two modes over the same underlying graph:

```text
/projects/:projectId/graph?view=diagnose|explore&nodeId=...&focus=...&query=...
```

Both modes share:

- the same `ProjectGraph`;
- the same recursive `canvasView` model;
- the same node and edge primitives;
- the same selected node and focused sub-graph URL state.

The modes differ only by view preset: left rail content, default highlights, visible toggles, and inspector organization.

### 3.1 Diagnose

Diagnose answers:

> What currently needs attention, why, and where should I look next?

Default emphasis:

- blocked nodes;
- active checkpoints;
- staging growth;
- status filters;
- dependency impact;
- recent signals when event data becomes available.

The primary navigation object is an **Attention Queue** in the left rail. Status chips are secondary filters, not the main organizing model.

### 3.2 Explore

Explore answers:

> What has this project learned, and how did the knowledge attach to the project structure?

Default emphasis:

- knowledge density;
- knowledge category summaries;
- evidence attached to selected nodes;
- search and history affordances.

Search is intentionally only a **reserved surface** in this spec. The UI may provide a query input and a reserved results region, but the backend search strategy, ranking, and result grouping are deferred.

## 4. Layout

The graph page becomes a single workbench:

```text
Top bar:
  Project dropdown | current graph context | Diagnose / Explore switch | view toggles | refresh

Left rail:
  Diagnose: Attention Queue + status filters
  Explore: Search / 回溯入口 reserve + knowledge facets

Center:
  React Flow semantic canvas

Right:
  Persistent Inspector for the selected semantic object or current graph context
```

### 4.1 Top Bar

Global navigation should move out of the permanent left sidebar and into compact controls:

- project dropdown / switcher;
- current focused graph context, derived from the root project or focused node;
- current route or mode switcher;
- `Diagnose` / `Explore` segmented control;
- refresh state;
- mode-specific toggles, such as knowledge visibility or layout fit.

The top bar is chrome for the workbench. It should not read like a marketing header.

Top bar order should be: project dropdown first, current graph context second, `Diagnose` / `Explore` switch after that, then toggles and refresh on the right.

Breadcrumb belongs in the top bar's current graph context area. It should be compact and clickable. The canvas should not render a separate breadcrumb rail.

Deep breadcrumbs should collapse the middle path: `Project / ... / Parent / Current`. The collapsed segment can open a compact menu later; v1 only needs to preserve the root, immediate parent, and current focus labels where space allows.

### 4.2 Left Rail

The left rail is **collapsible and default-visible**.

Target behavior:

- default width around 280-320px;
- collapsed state keeps a narrow icon rail;
- narrow viewports may auto-collapse;
- collapse state is local UI state, not URL state;
- refresh returns to the default expanded state.
- collapse control lives in the rail header;
- collapsed state keeps an icon rail with an explicit expand control.

Legend should be retained in v1 but moved out of the main visual path. It should live as a collapsed canvas/top-bar help surface rather than a large always-open panel.

Responsive behavior:

- desktop: top bar, default-visible left rail, canvas, and persistent right inspector are all visible;
- narrow screens: left rail defaults to the collapsed icon rail, and the right inspector becomes a drawer/sheet triggered by selection or context controls;
- canvas remains the primary surface on narrow screens.

Diagnose rail:

- Attention Queue grouped by `Blocked`, `Blocked inside`, `Checkpoints`, `Staging`, and later `Signals`;
- status/type filter chips;
- item click selects the node in the current canvas context when it is visible as a child or peripheral satellite;
- parent-canvas navigation is explicit, not automatic, when the node is already represented in the current canvas.

Status/type filters affect both the canvas and the Attention Queue. They filter by the node's own `status` and `type`, not by subtree aggregate state. They should highlight matching nodes and dim non-matching nodes instead of hard-hiding graph elements, so dependency context and spatial memory remain intact. The queue should list only matching attention items. Subtree aggregate problems surface as `Blocked inside` items rather than making an active container match `Status: blocked`.

Attention Queue ordering:

- group order follows diagnostic severity: `Blocked`, `Blocked inside`, `Checkpoints`, `Staging`, then later `Signals`;
- items within each group follow the current graph/layout order, preserving spatial memory with the canvas.

Attention Queue scope defaults to the current focused graph context. At project root this is project-wide; after diving into a scaffold or growth node, it follows that sub-graph context. For the first implementation, the queue should only list problems that are represented in the current canvas: direct children, peripheral satellite nodes, and the staging lane. A future `Project-wide` toggle is useful, but it is deferred from the first implementation.

Explore rail:

- search input;
- reserved result region;
- knowledge facets such as category and status;
- no commitment yet to server-side search, semantic search, or trace replay.
- search/backtracking affordances are project-wide by default, but search mechanics, ranking, result grouping, and backend API shape are deferred from this spec.

Knowledge facets should preserve graph context. On the canvas, they highlight or dim knowledge summaries and their anchor nodes. In the left rail and inspector evidence lists, they may filter concrete knowledge rows.

### 4.3 Center Canvas

The canvas remains the main surface. It uses the existing recursive sub-graph model:

- top-bar context identifies the current graph layer;
- composition is implied by the current canvas context;
- dependency edges are visible among siblings;
- peripheral stubs show cross-boundary dependency relationships;
- external dependency nodes render in a satellite band around the direct children area and can be selected in place;
- manual placement is not part of this spec.

The existing hero pill is removed in v1. It duplicates the top-bar context and persistent inspector summary, and it consumes canvas space. The current focused graph identity should live in the workbench chrome, not as a large node-like token inside the canvas.

The current focus node itself is not repeated as a canvas node. At project root, the project root node is represented by top-bar context and inspector summary; the canvas renders its direct children. In sub-graphs, the focused scaffold/growth node is likewise represented by context chrome, and the canvas renders its direct children plus relevant satellites and regions.

Leaf nodes should not expose dive-in affordances. If a node has no direct composition children, it should not show a `dive` button and double-click should not enter it as a focus. If a user reaches an empty focus through an old/shared/manual URL, the app should not auto-redirect. It should show a light empty canvas state, keep the focus node explained in the inspector, and offer an explicit return to the parent canvas. Queue, dependency, and satellite navigation to a leaf node should navigate to its parent canvas and select the leaf node, rather than focusing the leaf node itself.

React Flow remains appropriate for this structure. Current React Flow docs support the needed custom nodes, custom edges, controls, viewport interactions, and overlay panels.

### 4.4 Right Inspector

The right inspector is a persistent explanation surface. It is not the home for the primary queue.

When a node is selected, the inspector changes by mode:

- Diagnose: semantic diagnosis, current meaning, flow impact, checkpoint state, dependency effects, and relevant signals.
- Explore: knowledge evidence, category summaries, related knowledge, and revision history affordances.

When the selected node is a peripheral satellite external to the current focused graph, the inspector must say so explicitly. It should show the node's home path or composition parent and provide an explicit jump action to that home canvas. The node is still selectable in the current context because its cross-boundary dependency matters here.

When no node is selected, the inspector explains the current focused graph context:

- at root focus, the context is the project;
- at scaffold/growth focus, the context is that process or work sub-graph.

In Diagnose, this context state shows the current graph's diagnosis summary. In Explore, it shows the current focused graph's knowledge summary. Search guidance stays secondary because search/backtracking entry points belong in the left rail. The main Diagnose queue still lives in the left rail.

Inspector density should follow a compact workbench panel, not a long-form report. Prefer metrics, relationship rows, evidence rows, badges, and short labels over paragraphs. Long explanations belong in expandable rows or detail affordances.

The Diagnose context summary prioritizes risk metrics:

- blocked count;
- active checkpoint count;
- staging count;
- affected dependency edge count.

Status distribution (`active / blocked / completed / archived`) and structural counts (`children`, dependency edges, knowledge entries) are secondary context below the risk summary.

The first version should avoid presenting a precise downstream reachability count. Until impact semantics are defined, `Impacted` means affected or problematic dependency links inside the current graph context.

## 5. Canvas Semantics

### 5.0 Visual Style

The visual style is **RAGFlow-like workbench structure with a restrained circuit-board metaphor**.

Use RAGFlow as a reference for:

- compact AI workbench density;
- clear top toolbar and side panels;
- readable light-theme surfaces;
- practical controls rather than decorative chrome.

Use the circuit-board metaphor only inside the graph canvas:

- dependency edges read like signal traces;
- nodes read like semantic components;
- staging reads like an unmounted / unanchored lane;
- knowledge reads like probes or test points.

The style must not become a dark PCB dashboard, neon theme, or decorative texture. The graph remains a production analysis tool.

Base palette direction: **Cool circuit light**.

- app background: cool light gray / blue-gray;
- panel surfaces: white or very light blue-gray;
- canvas background: pale cool gray with subtle grid/trace texture;
- default dependency edges: neutral blue-gray;
- scaffold accent: muted amber, used sparingly;
- growth accent: teal;
- knowledge accent: violet;
- active status marker: blue;
- blocked status marker: coral or red-orange;
- completed status marker: green;
- archived status marker: gray.

Glow is an interaction state, not a default decoration. Nodes and related dependency traces may glow only for selected, hover, related, or filtered-highlight states.

Canvas background intensity should sit between faint and medium, leaning faint. Use a subtle engineering-grid / dot-grid treatment for orientation, with optional very low-contrast trace hints. Avoid obvious circuit-board texture or decorative background lines that compete with graph edges.

Implement the palette through CSS variables, not hard-coded component colors. Variables should cover at least:

- app, panel, canvas, border, and muted surfaces;
- node type accents for scaffold, growth, staging, and knowledge;
- status markers for active, blocked, completed, and archived;
- dependency edge default, selected, dimmed, and blocked/highlight states;
- glow colors and shadow strengths;
- canvas grid/trace colors.

This keeps the color system themeable and allows the visual language to evolve without rewriting component logic.

V1 implements only the variable-backed light theme. Dark mode is not part of this implementation, but the variable structure should not block a future dark/circuit theme.

### 5.1 Node Primitive

Keep a compact semantic-node idiom, but let type drive silhouette:

- scaffold: module chip;
- growth: capsule pill;
- knowledge: probe dot / test point.

Do not switch to RAGFlow-style rectangular operator nodes. Rectangular operator blocks would imply executable configuration and port wiring, which is not the current product model.

Reduce semantic color area. Status should no longer dominate the full Pill background. Prefer a neutral Pill surface with status expressed through a compact badge, stripe, dot, or bottom aggregate/status bar. This leaves room for Diagnose/Explore highlight and dim states without turning the canvas into competing color blocks.

The node surface may carry a very subtle type tint for `scaffold`, `growth`, `staging`, and `knowledge`, but this should be restrained. Type remains the stable visual identity; status is a small marker. Diagnose and Explore should use the same base node color rules.

The scaffold flag-tab silhouette should remain, but it should be visually lighter than the current strong gold block. It identifies scaffold intent. Checkpoint is an additional marker layered on top of scaffold, not the only reason a scaffold gets the flag-tab shape.

Dependency edges should also reduce semantic color area. Default dependency edges are neutral structural lines. Status color appears only for selected paths, filtered diagnostic issues, blocked relationships, or other explicit highlight states. This avoids a canvas full of competing status-colored curves.

For v1, selected-path highlighting is one-hop only: selecting a node highlights its direct incoming and outgoing dependency edges and dims unrelated edges. Do not compute multi-hop downstream impact paths in this phase.

Long-term density strategy:

- default canvas node = compact Pill;
- hover or selected state = richer preview;
- full semantic explanation = right inspector.

Mode-specific richer preview, when implemented later:

- Diagnose preview: blocked count, checkpoint marker, dependency impact, recent signal summary when available.
- Explore preview: knowledge count, category markers, recent or high-signal evidence summary.

The first implementation should not include hover preview. It should keep canvas nodes compact, strengthen selected/highlight styling, and rely on the persistent inspector for richer information.

### 5.2 Staging Region

Staging is a **graph region**, not an external panel and not merely a queue list.

It should render as a right-side lane inside the canvas:

- visible as a full lane only at project root;
- labeled as `Staging`;
- contains unanchored growth nodes using the growth capsule silhouette;
- staging nodes carry a compact unanchored marker rather than a separate node shape;
- visually separate from the main flow;
- not part of the main ELK sibling layout;
- positioned to the right of the main graph bounding box;
- fixed lane width in the canvas coordinate system;
- nodes stack vertically inside the lane;
- overflow is handled within the lane rather than expanding the main graph layout.

Inside a non-root focused sub-graph, the full staging lane is hidden. A staging node that has dependency relevance to the current sub-graph may still appear as a peripheral satellite node.

The Diagnose left rail may include staging items in its Attention Queue, but the canonical visual home of staging is the graph's right-side lane.

No staging anchoring action is exposed or reserved as a near-term edit action.

### 5.3 Knowledge Display

Explore should not default to rendering every knowledge entry as a canvas node.

Default behavior:

- canvas shows knowledge summaries on anchor nodes as a compact probe rail: up to three category dots plus a count;
- inspector shows concrete evidence entries;
- an advanced `Show knowledge nodes` toggle may reveal explicit knowledge pills, but this is not the default Explore presentation.

Knowledge category color should remain restrained. Use violet as the common knowledge family color. `pitfall` may use a warning accent because it matters for diagnosis; `decision`, `finding`, and `context` should stay within the violet family and rely on tooltip/inspector labels for exact category meaning.

Diagnose may show knowledge only when it explains a problem or checkpoint. Knowledge should support diagnosis, not dominate it.

The existing Knowledge toggle should be retained with narrower meaning: it controls explicit knowledge nodes on the canvas. It does not control the default knowledge summaries on anchor nodes. The toggle defaults off.

Because explicit knowledge nodes materially change the shared canvas, this state belongs in the URL rather than localStorage. Absence of the param means summary-only mode. A value such as `knowledge=nodes` means explicit knowledge nodes are visible.

`knowledge=nodes` applies in both Diagnose and Explore. Diagnose does not turn it on by default, but it should honor the URL state when present.

## 6. Inspector Content

### 6.1 Diagnose Inspector

The Diagnose inspector is semantic, not a database record viewer.

Recommended structure:

1. Node identity: title, type, status, checkpoint marker.
2. Current meaning: short explanation of what this node represents in the project.
3. Flow impact: incoming and outgoing dependencies, blocked chain, affected downstream nodes.
4. Checkpoint state: resolution status and human decision context when applicable.
5. Evidence: knowledge or signals that explain the current state.
6. Meta: created by, created at, updated at, collapsed or visually secondary.

### 6.2 Explore Inspector

The Explore inspector treats the selected node as an anchor for learning.

Recommended structure:

1. Node identity and local graph context.
2. Knowledge summary: count, categories, status breakdown.
3. Evidence list: decisions, findings, pitfalls, and context entries.
4. Related nodes through dependency and composition context.
5. Revision affordance area reserved for future knowledge revision.
6. Raw metadata secondary.

## 7. Future Constrained Editing

This spec reserves only two future edit families:

| Ref | Future action | Surface |
|---|---|---|
| A | Checkpoint resolution | Diagnose inspector |
| F | Knowledge revision | Explore inspector |

The following are not reserved as primary edit surfaces:

- staging anchoring;
- dependency rewiring;
- manual scaffold/growth creation;
- arbitrary status updates;
- freeform drag-and-drop graph editing.

This keeps the future workbench constrained around human judgment and knowledge correction rather than turning Graph into a general graph editor.

## 8. Route And State

Use route search params for shareable state:

| Param | Meaning |
|---|---|
| `view` | `diagnose` or `explore`; default `diagnose`; unknown values fall back to `diagnose` |
| `nodeId` | selected node |
| `focus` | current sub-graph root |
| `query` | Explore search text or reserved search state |
| `knowledge` | optional explicit knowledge-node mode; absent means summary-only, `nodes` means show explicit knowledge nodes |

Switching between Diagnose and Explore must preserve `nodeId` and `focus` so users can move between diagnosis and learning without losing graph context.

Both modes should enter the same default canvas. They must not auto-jump to different graph locations unless the URL explicitly asks for it.

The route schema should validate `view` as a finite enum. Invalid or missing values should resolve to `diagnose` instead of sending the user to an error page.

## 9. Non-Goals

Out of scope for this redesign:

- backend API changes;
- event/trace replay UI;
- finalized search backend, ranking, or result grouping;
- full RAGFlow-style workflow editing;
- node creation;
- dependency rewiring;
- staging anchoring;
- persisted manual layout;
- per-user preference backend.

## 10. Acceptance Criteria

- The graph page has a compact top workbench bar instead of a full-width permanent global sidebar.
- The same route supports `view=diagnose` and `view=explore`.
- The left rail is default-visible, collapsible, and mode-specific.
- Diagnose left rail shows an Attention Queue concept with status filters as secondary controls.
- Explore left rail reserves a search/history surface without committing search semantics.
- The center canvas remains the semantic graph, not an operator editor.
- Staging appears as a right-side canvas lane, not as an external panel.
- The right inspector is mode-specific and semantic.
- The right inspector is persistent; `nodeId` changes its content but does not control whether the inspector exists.
- Knowledge is summarized on canvas by default and expanded in the Explore inspector.
- No graph mutation controls are visible in this phase.

## 11. First Implementation Boundary

The first implementation should be a thin vertical slice of the final workbench:

- top workbench bar;
- removal of the large hero pill in favor of top-bar current graph context;
- `Diagnose` / `Explore` mode switch backed by URL state;
- default-visible collapsible left rail;
- persistent right inspector with lightweight semantic organization;
- basic context summaries for the current focused graph;
- basic Diagnose Attention Queue for the current visible graph context;
- Explore search/backtracking input that writes `query` URL state and shows reserved-state guidance, without final search behavior;
- Staging rendered as a right-side canvas lane at project root, replacing the external panel;
- URL-backed `knowledge=nodes` toggle semantics;
- reduced semantic color area: status as compact node marker, not full Pill background;
- neutral default dependency edges with color reserved for selected/filter/diagnostic highlight states;
- selected/highlight/dim styling sufficient to support filters;
- staging lane nodes are selectable and use the same inspector path as other nodes, with no anchor/edit action exposed.
- desktop responsive baseline, with narrow-screen behavior allowed to be minimal but not broken.

The first implementation should explicitly defer:

- hover preview;
- project-wide Attention Queue toggle;
- advanced Diagnose impact algorithms;
- finalized Explore search mechanics, ranking, and backend API shape;
- advanced knowledge facets;
- constrained edit actions for checkpoint resolution and knowledge revision.

The v1 inspector should go beyond the current record-style `DetailPanel`, but it should not attempt the full future inspector. It should reuse existing graph and knowledge data to provide:

- current graph context summary when no node is selected;
- selected node identity;
- lightweight flow impact using incoming/outgoing dependencies;
- knowledge evidence attached to the selected node;
- external satellite marker and home-jump affordance when applicable.

## 12. Implementation Notes

This spec is compatible with the current frontend architecture:

- `GraphRoute` can own `view`, `nodeId`, and `focus` URL state.
- `GraphCanvas` can remain responsible for React Flow nodes/edges and receive a view preset.
- `StagingPanel` should be replaced by a canvas-region implementation.
- `DetailPanel` should be split or evolved into mode-specific inspectors.
- `Legend`, `UpdatedAgo`, and `KnowledgeToggle` should move into the workbench chrome or React Flow `Panel` locations where appropriate.
- Existing domain helpers such as `canvasView`, `aggregateStatus`, and `breadcrumb` remain useful.

The first implementation should preserve existing graph behavior before adding hover previews or advanced Explore search behavior.
