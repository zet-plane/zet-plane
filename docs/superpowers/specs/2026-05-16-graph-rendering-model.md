# Graph Rendering Model — Scaffold-Led, Growth-Dominant

**Date**: 2026-05-16
**Status**: Pending implementation (frontend only)
**Supersedes**: the structural-edge composition rendering introduced in commits `0211381` and `070f2bf`, and the `ContainerCard` / `NodeCard` split that preceded them.
**Backend impact**: none in this round. Backend changes are recorded in §7 as deferred follow-ups.

---

## 1. Problem

The frontend's current Graph view treats Scaffold and Growth nodes as visually peer concepts — both render as rectangular cards differing only by border style (solid vs dashed) — and the renderer also picks a `ContainerCard` vs `NodeCard` based on whether a node has composition children. This produces two related distortions:

1. **Visual weight is wrong.** Scaffold nodes are conceptually *milestones* — the rail that leads the project — while Growth nodes are *the work* that emerges from events the Orchestrator ingests. The dominant population is Growth; Scaffolds are rare and structural. The current rendering gives them roughly equal weight, which obscures the rail.
2. **Containment is overloaded.** `composition` is treated as both (a) a semantic part-of relationship in the data, and (b) a visual containment in the frontend. The visual containment manifests as `ContainerCard` boxes that try to render a Graph inside another node, which is cluttered and reads as a parallel concept to Sub-Graph (a first-class concept in [Knowledge Engine design §2.1](./2026-05-05-knowledge-engine-design.md#21)). Recent commits attempted to escape ContainerCard by rendering composition as visible structural edges instead — but the underlying conflation persisted.

The fix is to give Scaffold and Growth distinct silhouettes, collapse "composition" and "Sub-Graph" into one concept (you dive in), and remove inline composition rendering entirely.

## 2. Concept model

### 2.1 Type as intent

`NodeType` carries *intent*, not provenance or topology:

| Type | Intent | Typical creator |
|---|---|---|
| `scaffold` | Pre-committed milestone in the planned flow. The rail that leads the project. | Human, via UI |
| `growth` | Actual work that emerged from events. | Orchestrator, from ingested events |
| `staging` | Growth that cannot yet be anchored to a node. Holding pen. | Orchestrator |

Notes:
- `createdBy: human | agent` (already in the schema) records provenance independently. Intent and provenance are not the same axis.
- `isCheckpoint` remains an orthogonal boolean on Scaffold nodes that require explicit human resolution before flow continues. A Scaffold may or may not be a checkpoint; a Growth is never a checkpoint in practice.

### 2.2 Type is set-once

There is no `promote` / `convert` endpoint. Scaffolds are made deliberately at creation time; you do not drift into one. If a Growth later turns out to be milestone-worthy, the human creates a Scaffold and re-points the relevant relationships — type itself is immutable on the node.

### 2.3 Composition = Sub-Graph (Option P)

The KE spec talks about "Sub-Graphs" at the Graph level; the schema models `EdgeType.composition` at the node level. These are the **same concept** under the rendering model:

- A node with composition children is the root of a sub-graph.
- "Diving into" that node opens its sub-graph as a new canvas.
- Composition edges are never rendered as visible lines in the canvas — containment is implied by being on the canvas.

This collapses the previously two-headed concept into one and obsoletes both `ContainerCard` and the "render composition as structural edges" approach.

### 2.4 Composition rule (Rule I)

Allowed composition relationships:

| Parent | Allowed children |
|---|---|
| `scaffold` | `scaffold`, `growth` |
| `growth` | `growth` only |
| `staging` | (n/a — staging nodes live in the staging region, not as parents in the main graph) |

Rationale: A Scaffold may decompose into sub-milestones (sub-Scaffolds) or into work (Growth). Growth *cannot* contain Scaffold, because milestones are pre-committed and never emerge from inside emergent work.

The rule is enforced only on the frontend in this round (creation UI prevents the illegal case). Server-side enforcement is deferred (see §7, B-1).

### 2.5 Edge types (unchanged)

Per [2026-05-07-drop-reference-edge.md](./2026-05-07-drop-reference-edge.md), only two edge types exist:

| Type | Rendered? |
|---|---|
| `composition` | No — implied by canvas context |
| `dependency` | Yes — visible lines between siblings, and dashed when the target is a knowledge node |

Knowledge entries hang off their anchor node via `dependency` edges, distinguished by dashed styling — no new edge type is introduced.

## 3. Canvas anatomy

Every canvas — top-level and sub-graph alike — has the same recursive shape, with one variation at the top level (the staging region). The regions are:

1. **Breadcrumb rail** at the top of the canvas chrome. Each segment is clickable to jump back. Example: `Project › Auth Refactor Phase › Investigate Session Timeout Bug`.
2. **Hero token** below the breadcrumb. Renders the *direct parent* of the current view.
   - Top-level canvas: the project-header hero (see §4.2). Distinct from a Scaffold pill — larger title, no flag-tab notch, no aggregate bar.
   - Sub-graph canvas: a scaled-up Pill of the dived-in Scaffold, but **without an aggregate bar** (its children are visible right below, so the bar would be redundant noise).
3. **Children area** — the composition children of the direct parent, laid out hierarchically (top-down by dependency order).
4. **Dependency edges** drawn between siblings in the children area. Composition edges from hero → children are *not drawn*.
5. **Staging region** — right-side panel, ~280px, on the top-level canvas only. Lists unanchored Growth nodes rendered as ordinary Pills.
6. **Peripheral stubs** — a faded margin band at the canvas edge for nodes outside the current sub-graph that have cross-boundary dependency edges into this canvas's siblings. Reduced opacity, smaller size, `↗` affordance to jump to the node's home canvas.
7. **Knowledge nodes** — small violet Pills (see §4.4) connected to their anchor by dashed dependency edges. Hidden by default; revealed by a toggle in the canvas chrome (toggle state persisted in `localStorage`; no per-user backend storage yet).

### 3.1 Layout regime

Auto-layout (dagre-style), hierarchical, top-to-bottom by dependency order. If `a` depends on `b`, `a` sits below `b`. Layouting builds on the existing [layout/use-layouted-graph](../../../apps/web/src/features/graph/layout/) machinery.

Manual placement is not supported in this round.

## 4. Visual idiom

### 4.1 Sibling Pill

The single node primitive on the canvas. Capsule shape with no hard border; depth comes from a soft shadow; status drives a tinted background fill.

**Scaffold pill** — wider, heavier shadow, gold flag-tab notch on the left edge. When `isCheckpoint`, the notch carries a filled `⚑` glyph.

**Growth pill** — compact symmetric capsule, lighter visual weight, with a small teal accent dot prefix.

Common elements on both:
- **Title** (truncated with ellipsis, full text in hover-peek).
- **Knowledge chip** (`K3`) — trailing chip showing direct knowledge-entry count on the node.
- **Dive-in glyph** (`↳5`) — trailing, clickable; enters the sub-graph rooted at this node. Only present when the node has composition children.
- **Aggregate bar** — thin colored band along the pill's bottom edge, present only when the node has composition children. Proportions of `active / blocked / completed` from the existing [domain/aggregate-status](../../../apps/web/src/features/graph/domain/aggregate-status.ts) machinery. The pill's own background tint is driven by *worst-of-children* status (current behavior).

**Hover-peek** — a tooltip-anchored panel reveals the numeric aggregate breakdown plus the top 3 children by name. Replaces today's inline `0 blocked / 1 active / 3 completed` text line.

### 4.2 Project-header hero (top-level canvas only)

Distinct from Scaffold pill silhouette so it does not read as a milestone:
- Larger title (project name) in heavier weight.
- No flag-tab notch.
- No aggregate bar.
- Project-meta line: creation date, total node count (optional in v1; can defer).

### 4.3 Sub-graph hero

Scaled-up Scaffold pill — same silhouette (flag-tab notch, gold accent), enlarged title, no aggregate bar (children visible on the canvas).

### 4.4 Knowledge pill

Smaller than a regular Pill (~70% scale). Violet accent dot prefix. Title = knowledge entry title. Trailing chip = entry category (`decision` / `pitfall` / `finding` / `context`). Connected to its anchor by a dashed dependency edge. Hidden by default; toggled in canvas chrome.

### 4.5 Interaction summary

| Gesture | Effect |
|---|---|
| Click pill | Select (drives `DetailPanel`) |
| Click `↳N` glyph on pill | Dive into that node's sub-graph |
| Click breadcrumb segment | Jump back up to that ancestor's canvas |
| Hover pill | Peek tooltip with full title + aggregate breakdown + top children |
| Toggle "show knowledge" in chrome | Reveal/hide kA nodes and their dashed edges; state persisted in localStorage |
| Click `↗` on peripheral stub | Jump to the stub node's home canvas |

## 5. Replaces / deletes

The following frontend artifacts are obsoleted by this spec:

- [`ContainerCard.tsx`](../../../apps/web/src/features/graph/components/ContainerCard.tsx) — deleted. Single `NodeCard` (rendering the Pill) covers all cases.
- The visible-composition-edges direction introduced in commits `0211381` and `070f2bf` is rolled back; composition stops being rendered entirely.
- The border-style differentiation (`zp-node--scaffold` solid vs `zp-node--growth` dashed) in [`styles.css`](../../../apps/web/src/features/graph/styles.css) is replaced by silhouette-based differentiation (flag-tab notch on Scaffold).
- The inline `0 blocked / 1 active / 3 completed` aggregate text on `NodeCard` and `ContainerCard` is replaced by the bottom aggregate-bar + hover-peek combo.

## 6. Non-goals

Out of scope for this rendering-model spec:

- Backend changes (deferred to §7).
- Event-pipeline / Orchestrator behavior. Whether and how the Orchestrator decides a node is Growth vs Scaffold is its own concern.
- Search UI (separate feature; one of the two info-retrieval paths described by the user but unrelated to canvas rendering).
- Manual node placement and persisted layout.
- Cross-graph drag-and-drop (moving a node from staging to a parent).
- A per-user preferences backend (we use localStorage until user auth exists).
- Promotion / demotion endpoints — there will be no `convert-type` operation.

## 7. Backend follow-ups (deferred, do not implement in this round)

Recorded here for future planning; **not part of this implementation**:

| Ref | Item | Notes |
|---|---|---|
| B-1 | Server-side enforcement of Rule I (reject `growth` parent + `scaffold` child) | Add to `NodeService.createNode` validators and to edge creation. Symmetric to existing `validateStatusTransition`. |
| B-2 | Confirm `graph.controller.ts:98` `NodeType.scaffold` default is intentional under axis B | Documented as correct; no code change. |
| B-3 | No promotion endpoint | Confirmed; record in changelog only. |
| B-4 | Cosmetic: rename `EdgeType.composition` → `subgraph` | Defer until the new model is widely understood. Pure naming. |

## 8. Open questions for v1.1

- Should the breadcrumb show all ancestors or compress middle segments (`Project › … › Current`) when deep?
- Should peripheral stubs show on which canvas they live (small subtitle), or just title?
- Should the staging panel be collapsible?
- Knowledge-toggle: should it remember per-graph (not just globally)?

These do not block v1; they refine UX after the new model is in the user's hands.
