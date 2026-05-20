# Zet Plane Brand Color System

**Date**: 2026-05-19
**Status**: Draft for user review
**Scope**: Product visual system, with first application in the Graph Workbench
**Builds on**: [Graph Workbench Redesign](./2026-05-18-graph-workbench-redesign-design.md)

---

## 1. Problem

The current graph color system has too many independent saturated colors. Status,
node type, knowledge category, selection, canvas grid, and chrome all compete for
attention. The result weakens both the product identity and the graph diagnosis
workflow.

Zet Plane needs a brand color system that is logical, elegant, and extensible. It
should feel like a mature AI workbench while preserving the product metaphor:
semantic work flowing through a circuit-blueprint graph.

## 2. Brand Direction

The brand direction is **Flowing Circuit Blueprint**.

Zet Plane should borrow RAGFlow's product clarity, density, and workbench
legibility, but not its executable operator-editor semantics. The graph is a
semantic observer and diagnostic surface, not a block-programming canvas.

Visual principles:

- surfaces are quiet, cool, and work-focused;
- the canvas carries the blueprint metaphor;
- signal flow appears through dependency paths, selection, and related states;
- semantic colors are disciplined accents, not competing backgrounds;
- color expresses hierarchy and attention before decoration.

## 3. Color Architecture

The system has four layers.

### 3.1 Foundation

Foundation colors define the product's calm workbench character.

| Token | Hex | Purpose |
|---|---:|---|
| `fg.strong` | `#172b43` | Primary text, strongest non-black anchor |
| `fg.default` | `#52677d` | Secondary text and labels |
| `fg.muted` | `#5a6f84` | Small muted text that still meets contrast |
| `ui.muted` | `#7b91a6` | Muted non-text UI marks |
| `surface.app` | `#eef6fc` | App background |
| `surface.panel` | `#ffffff` | Sidebars, top bar, inspector, cards |
| `surface.canvas` | `#f8fcff` | Graph canvas base |
| `border.subtle` | `#d4e4f2` | Decorative panel dividers and low-emphasis separators |
| `border.control` | `#6f8eaa` | Required control boundaries and meaningful outlines |
| `grid.blueprint` | `rgb(80 142 196 / 0.16)` | Canvas grid only |

Foundation colors may occupy large areas.

### 3.2 Signal

Signal colors are the brand's active identity. They should feel like current
moving through a blueprint, not like generic SaaS blue.

| Token | Hex | Purpose |
|---|---:|---|
| `signal.blue` | `#257fc1` | Primary selection, active path, focused graph signal |
| `signal.strong` | `#1f6fa8` | Accessible signal foreground and filled-control color |
| `signal.soft` | `#e5f0f9` | Subtle selected backgrounds and hover fills |
| `signal.glow` | `rgb(37 127 193 / 0.24)` | Selected/related path glow |
| `signal.flow` | `#39bfe2` | Bright flow highlight for selected paths only |
| `edge.neutral` | `#6f8eaa` | Default dependency edge |
| `edge.dim` | `rgb(111 142 170 / 0.32)` | Non-relevant dependency edge |

Signal blue is the product's primary brand accent. It may be used at medium
area only when it marks interaction or graph flow. It should not become a large
flat background.

### 3.3 Status

Status colors are operational signals. They must stay lower in priority than
selection unless the user is diagnosing a problem.

| Token | Hex | Purpose |
|---|---:|---|
| `status.active` | `#257fc1` | Active status marker, aligned with signal blue |
| `status.blocked` | `#d75f8d` | Blocked marker and blocked dependency path |
| `status.blockedSoft` | `#f8e2eb` | Soft blocked background |
| `status.completed` | `#218f78` | Completed marker |
| `status.completedSoft` | `#dff5ef` | Soft completed background |
| `status.archived` | `#6f8eaa` | Archived marker |
| `status.archivedSoft` | `#edf4fa` | Soft archived background |

Status color is small-area by default: self-status dots, thin internal-status
rings, edge highlights, compact badges, and diagnostic accents. Node bodies
should not be filled by status color. When a status color is used for normal-size
text or a filled control, use a stronger foreground token rather than the marker
color.

The status layer intentionally keeps independent hues for readability, but it
does not define the brand personality. The brand remains blueprint-blue; status
colors are restrained operational cues.

### 3.4 Semantic Families

Semantic family colors identify graph meaning. They should be stable but quiet.

| Token | Hex | Purpose |
|---|---:|---|
| `semantic.scaffold` | `#5f8fb8` | Scaffold arc marker, module marker, checkpoint adjacency |
| `semantic.growth` | `#28a98b` | Growth marker and optional tiny type cue |
| `semantic.knowledge` | `#4c68c9` | Knowledge probe rail and knowledge node family |
| `semantic.knowledgeSoft` | `#e8effb` | Knowledge probe background |
| `semantic.staging` | `#9fb4c9` | Staging lane marker and unanchored cue |

These colors should not become equal-weight node backgrounds. Type is expressed
through silhouette, edge tabs, and compact markers first; color is a supporting
cue.

## 4. Usage Rules

### 4.0 Opacity Scale

Transparency must use a shared alpha scale. Do not introduce ad-hoc values such
as `0.13`, `0.22`, or `0.28` in component CSS.

| Token | Alpha | Purpose |
|---|---:|---|
| `alpha.04` | `0.04` | Barely visible tint |
| `alpha.08` | `0.08` | Hover tint and quiet wash |
| `alpha.12` | `0.12` | Selected soft background |
| `alpha.16` | `0.16` | Blueprint grid and light trace hints |
| `alpha.24` | `0.24` | Glow and related-path aura |
| `alpha.32` | `0.32` | Dimmed edge or muted overlay |
| `alpha.48` | `0.48` | Disabled or strongly de-emphasized object |
| `alpha.64` | `0.64` | Scrim or foreground overlay |

The preferred CSS form is role plus channel plus alpha:

```css
:root {
  --zp-rgb-signal-blue: 37 127 193;
  --zp-alpha-16: 0.16;
  --zp-color-grid-blueprint: rgb(80 142 196 / var(--zp-alpha-16));
  --zp-color-signal-glow: rgb(var(--zp-rgb-signal-blue) / var(--zp-alpha-24));
}
```

This keeps translucency consistent and makes future dark-mode remapping easier.

### 4.1 Area Budget

Color area is the main control mechanism.

Large areas:

- app background;
- panel surfaces;
- canvas base;
- subtle borders and grid.

Medium areas:

- selected path;
- active hover or selected control background;
- focused region accents.

Small areas:

- status dots;
- internal status rings;
- node type tabs;
- knowledge probe dots;
- blocked edges;
- compact diagnostic badges.

No status, type, or knowledge family color should fill a full node surface in
normal state.

### 4.2 Interaction Hierarchy

Selection wins over status. Related graph flow wins over static type identity.
Blocked wins only in diagnostic contexts or on a path that explains the selected
state.

Priority order:

1. selected or focused object;
2. directly related incoming/outgoing dependency paths;
3. blocked diagnostic path;
4. filtered match;
5. node type identity;
6. passive status marker;
7. default structure.

### 4.3 Blueprint Restraint

The canvas may use a subtle engineering grid and low-contrast trace hints.
It must not become a decorative circuit-board texture. The graph edges are the
actual circuit metaphor.

Acceptable:

- faint blue grid;
- neutral dependency traces;
- selected path glow;
- compact signal markers.

Avoid:

- strong PCB backgrounds;
- neon glow as default decoration;
- many independent saturated node colors;
- colorful RAGFlow-style operator ports.

## 5. First Application: Graph Workbench

The Graph Workbench should apply the brand system as follows.

### 5.1 Workbench Chrome

Top bar, left rail, inspector, and legend use `surface.panel`, `fg.strong`,
`fg.default`, `fg.muted`, and `border.subtle`. They should read as mature product chrome:
clear, quiet, and scan-friendly.

RAGFlow is a reference for density and clarity, not for visual semantics.

### 5.2 Canvas

Canvas uses `surface.canvas` and `grid.blueprint`. The grid is visible enough to
create orientation but faint enough that dependency edges remain dominant.

Default edges use `edge.neutral`. Dimmed edges use `edge.dim`. Selected and
related paths use `signal.blue`, optionally with `signal.glow`.

### 5.3 Nodes

Nodes use a neutral surface. Status is a compact compound marker: the center dot
reflects the node's own status, while an optional outer ring summarizes internal
or child-node status. Type is expressed by shape and small accents:

- scaffold: subtle gray-blue arc marker or module cue;
- growth: capsule silhouette with small teal marker;
- staging: neutral lane item with unanchored cue;
- knowledge: indigo probe or compact knowledge pill.

### 5.4 Knowledge

Knowledge should not introduce a rainbow. `semantic.knowledge` is the common
family color. Categories are differentiated mainly by labels, ordering, and
inspector grouping. `pitfall` may borrow blocked coral only when it participates
in diagnosis.

## 6. Token Contract

Implementation should distinguish **palette values** from **role tokens**.
Components should depend on role tokens, not palette names. This is the dark-mode
contract: a future dark theme may change role values without renaming component
variables.

Role-token naming:

```text
--zp-color-<role>-<slot>
--zp-rgb-<role>-<slot>
--zp-alpha-<step>
```

Light-theme role examples:

```css
:root {
  --zp-color-fg-strong: #172b43;
  --zp-color-fg-default: #52677d;
  --zp-color-fg-muted: #5a6f84;
  --zp-color-ui-muted: #7b91a6;

  --zp-color-surface-app: #eef6fc;
  --zp-color-surface-panel: #ffffff;
  --zp-color-surface-canvas: #f8fcff;

  --zp-color-border-subtle: #d4e4f2;
  --zp-color-border-control: #6f8eaa;

  --zp-color-accent-signal: #257fc1;
  --zp-color-accent-signal-strong: #1f6fa8;
  --zp-color-accent-signal-soft: #e5f0f9;
  --zp-rgb-accent-signal: 37 127 193;

  --zp-color-status-blocked: #d75f8d;
  --zp-color-status-completed: #218f78;
  --zp-color-semantic-knowledge: #4c68c9;

  --zp-alpha-08: 0.08;
  --zp-alpha-16: 0.16;
  --zp-alpha-24: 0.24;
}
```

Graph-specific tokens should alias brand tokens where possible:

```css
:root {
  --zp-edge-selected: var(--zp-color-accent-signal);
  --zp-edge-selected-glow: rgb(var(--zp-rgb-accent-signal) / var(--zp-alpha-24));
  --zp-status-active: var(--zp-color-accent-signal);
  --zp-accent-knowledge: var(--zp-color-semantic-knowledge);
}
```

Avoid role names that encode light-theme assumptions, such as `whitePanel`,
`darkText`, or `blue600`. Palette scale names may exist internally, but component
CSS should consume semantic roles.

## 7. Accessibility And Contrast

The color system targets WCAG 2.2 contrast rules:

- normal text: at least `4.5:1`;
- large text: at least `3:1`;
- meaningful non-text graphics and UI component boundaries: at least `3:1`;
- decorative dividers, disabled controls, and non-essential textures may sit
  below `3:1` when they are not the only way to understand or operate the UI.

Initial light-theme contrast checks:

| Pair | Ratio | Result | Use |
|---|---:|---|---|
| `fg.strong` on `surface.panel` | `14.35:1` | Pass AA text | Primary text |
| `fg.strong` on `surface.canvas` | `13.92:1` | Pass AA text | Canvas labels |
| `fg.default` on `surface.panel` | `5.84:1` | Pass AA text | Body and labels |
| `fg.default` on `surface.canvas` | `5.66:1` | Pass AA text | Canvas text |
| `fg.muted` on `surface.panel` | `5.20:1` | Pass AA text | Small muted labels |
| `fg.muted` on `surface.app` | `4.76:1` | Pass AA text | App-level labels |
| `signal.strong` on `surface.panel` | `5.39:1` | Pass AA text | Link/focus text |
| white text on `signal.strong` | `5.39:1` | Pass AA text | Filled active controls |
| `signal.blue` on `surface.canvas` | `4.17:1` | Pass non-text | Edges and markers |
| `status.blocked` on `surface.canvas` | `3.44:1` | Pass non-text | Blocked markers |
| `status.completed` on `surface.canvas` | `3.87:1` | Pass non-text | Completed markers |
| `status.archived` on `surface.canvas` | `3.32:1` | Pass non-text | Archived markers |
| `edge.neutral` on `surface.canvas` | `3.32:1` | Pass non-text | Default dependency edge |
| `border.subtle` on `surface.panel` | `1.30:1` | Decorative only | Non-essential dividers |
| `border.control` on `surface.panel` | `3.43:1` | Pass non-text | Input/control boundary |

Rules for implementation:

- Use `fg.muted`, not `ui.muted`, for readable small text.
- Use `signal.strong`, not `signal.blue`, when blue is used as normal-size text
  or as a filled control background with white text.
- Use `border.control` when a boundary is the only visible control affordance.
- Use `border.subtle` only for decorative panel separation.
- Re-run contrast checks whenever changing any foundation, signal, status, or
  semantic color.

Reference: WCAG 2.2 Success Criteria
[1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)
and
[1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast).

## 8. Acceptance Criteria

- The product has a named color direction: Flowing Circuit Blueprint.
- The system defines foundation, signal, status, and semantic family colors.
- Signal blue becomes the primary brand accent.
- Status and semantic colors are constrained by area and priority rules.
- Transparency uses the shared `alpha.*` scale.
- Component CSS consumes role tokens that can be remapped for dark mode.
- Text and meaningful non-text graphics have documented WCAG contrast checks.
- Graph nodes default to neutral surfaces instead of status-colored bodies.
- Dependency edges carry most of the flow metaphor.
- Knowledge uses one restrained family color instead of independent category
  colors.
- RAGFlow is treated as a density and clarity reference, not a node-editor
  visual model.

## 9. Non-Goals

- Dark theme design.
- Marketing website color system.
- Iconography redesign.
- Full typography redesign.
- Advanced animation design for flowing traces.

Those can build on this system later, but the first implementation should focus
on stable tokens and graph workbench application.
