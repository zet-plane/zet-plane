# Zet Plane Brand Color System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Flowing Circuit Blueprint brand color system in the web Graph Workbench.

**Architecture:** Add a stable role-token contract in graph CSS, then make existing graph surfaces, nodes, knowledge probes, staging lane, legend, and edges consume those tokens. Keep the work scoped to the Graph Workbench and validate the system with CSS-token tests, contrast tests, component tests, and canvas e2e style assertions.

**Tech Stack:** React 19, Vite, Vitest, Testing Library, Playwright, React Flow, Tailwind CSS v4, plain CSS custom properties.

---

## File Structure

- Modify: `apps/web/src/features/graph/styles.css`
  - Owns the Graph Workbench token contract and all graph-specific visual styling.
  - Receives product role tokens, alpha tokens, RGB channels, graph aliases, and the applied A2 + A3 palette.
- Create: `apps/web/src/features/graph/components/brand-color-system.test.ts`
  - Reads `styles.css`, verifies required tokens exist, rejects legacy ad-hoc alpha values, and verifies WCAG contrast ratios from the spec.
- Modify: `apps/web/src/features/graph/components/Legend.tsx`
  - Changes legend inline swatches from old graph variables and hard-coded colors to the new role aliases.
- Modify: `apps/web/src/features/graph/components/Legend.test.tsx`
  - Verifies the legend renders the new token-backed swatches.
- Modify: `apps/web/e2e/canvas.spec.ts`
  - Adds browser-level computed-style assertions for the brand color system on real canvas nodes, edges, legend, and staging lane.
- Reference only: `docs/superpowers/specs/2026-05-19-zet-plane-brand-color-system-design.md`
  - Source of truth for token values, opacity scale, and contrast expectations.

Do not modify backend, route state, layout algorithms, or graph domain helpers in this plan.

---

### Task 1: Add CSS Token And Contrast Tests

**Files:**
- Create: `apps/web/src/features/graph/components/brand-color-system.test.ts`
- Reference: `docs/superpowers/specs/2026-05-19-zet-plane-brand-color-system-design.md`
- Reference: `apps/web/src/features/graph/styles.css`

- [ ] **Step 1: Write the failing token and contrast test**

Create `apps/web/src/features/graph/components/brand-color-system.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesPath = fileURLToPath(
	new URL("../styles.css", import.meta.url),
);
const styles = readFileSync(stylesPath, "utf8");

function hexToRgb(hex: string): [number, number, number] {
	const value = hex.replace("#", "");
	return [0, 2, 4].map((index) =>
		Number.parseInt(value.slice(index, index + 2), 16),
	) as [number, number, number];
}

function channelToLinear(channel: number) {
	const value = channel / 255;
	return value <= 0.04045
		? value / 12.92
		: ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
	const [red, green, blue] = hexToRgb(hex).map(channelToLinear);
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string) {
	const fg = luminance(foreground);
	const bg = luminance(background);
	return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
}

function expectRatio(
	foreground: string,
	background: string,
	minimum: number,
) {
	expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(minimum);
}

describe("brand color system tokens", () => {
	it("defines the role-token contract used by the graph workbench", () => {
		for (const token of [
			"--zp-color-fg-strong: #203047;",
			"--zp-color-fg-default: #53657b;",
			"--zp-color-fg-muted: #5f7084;",
			"--zp-color-ui-muted: #748497;",
			"--zp-color-surface-app: #edf3f8;",
			"--zp-color-surface-panel: #ffffff;",
			"--zp-color-surface-canvas: #f7fbff;",
			"--zp-color-border-subtle: #d8e2ed;",
			"--zp-color-border-control: #7289a1;",
			"--zp-color-accent-signal: #4f7fae;",
			"--zp-color-accent-signal-strong: #456f9d;",
			"--zp-color-accent-signal-soft: #dceaf6;",
			"--zp-rgb-accent-signal: 79 127 174;",
			"--zp-color-status-blocked: #c96f5b;",
			"--zp-color-status-completed: #6a9676;",
			"--zp-color-status-archived: #748497;",
			"--zp-color-semantic-scaffold: #b78a4a;",
			"--zp-color-semantic-growth: #4f8f93;",
			"--zp-color-semantic-knowledge: #6f72b8;",
			"--zp-color-semantic-knowledge-soft: #e8e8f6;",
		]) {
			expect(styles).toContain(token);
		}
	});

	it("defines the shared alpha scale and avoids legacy ad-hoc opacity values", () => {
		for (const token of [
			"--zp-alpha-04: 0.04;",
			"--zp-alpha-08: 0.08;",
			"--zp-alpha-12: 0.12;",
			"--zp-alpha-16: 0.16;",
			"--zp-alpha-24: 0.24;",
			"--zp-alpha-32: 0.32;",
			"--zp-alpha-48: 0.48;",
			"--zp-alpha-64: 0.64;",
		]) {
			expect(styles).toContain(token);
		}

		expect(styles).not.toMatch(/rgba\(/);
		expect(styles).not.toMatch(/0\.(1[034]|22|26|28)\b/);
	});

	it("keeps documented text and non-text contrast ratios above WCAG targets", () => {
		const colors = {
			fgStrong: "#203047",
			fgDefault: "#53657b",
			fgMuted: "#5f7084",
			surfaceApp: "#edf3f8",
			surfacePanel: "#ffffff",
			surfaceCanvas: "#f7fbff",
			borderControl: "#7289a1",
			signal: "#4f7fae",
			signalStrong: "#456f9d",
			blocked: "#c96f5b",
			completed: "#6a9676",
			archived: "#748497",
			edgeNeutral: "#7289a1",
		};

		expectRatio(colors.fgStrong, colors.surfacePanel, 4.5);
		expectRatio(colors.fgStrong, colors.surfaceCanvas, 4.5);
		expectRatio(colors.fgDefault, colors.surfacePanel, 4.5);
		expectRatio(colors.fgDefault, colors.surfaceCanvas, 4.5);
		expectRatio(colors.fgMuted, colors.surfacePanel, 4.5);
		expectRatio(colors.fgMuted, colors.surfaceApp, 4.5);
		expectRatio(colors.signalStrong, colors.surfacePanel, 4.5);
		expectRatio(colors.surfacePanel, colors.signalStrong, 4.5);

		expectRatio(colors.signal, colors.surfaceCanvas, 3);
		expectRatio(colors.blocked, colors.surfaceCanvas, 3);
		expectRatio(colors.completed, colors.surfaceCanvas, 3);
		expectRatio(colors.archived, colors.surfaceCanvas, 3);
		expectRatio(colors.edgeNeutral, colors.surfaceCanvas, 3);
		expectRatio(colors.borderControl, colors.surfacePanel, 3);
	});
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
pnpm --filter @zet-plane/web test apps/web/src/features/graph/components/brand-color-system.test.ts
```

Expected: FAIL because `styles.css` does not yet define the `--zp-color-*` role tokens and still contains legacy `rgba(...)` values.

- [ ] **Step 3: Commit**

Do not commit after the failing test alone. Continue to Task 2 so the commit is green.

---

### Task 2: Introduce The Brand Role Tokens In CSS

**Files:**
- Modify: `apps/web/src/features/graph/styles.css`
- Test: `apps/web/src/features/graph/components/brand-color-system.test.ts`

- [ ] **Step 1: Replace the existing `:root` token block**

In `apps/web/src/features/graph/styles.css`, replace the existing `:root { ... }` block at the top of the file with:

```css
:root {
	/* Zet Plane brand role tokens: Flowing Circuit Blueprint */
	--zp-color-fg-strong: #203047;
	--zp-color-fg-default: #53657b;
	--zp-color-fg-muted: #5f7084;
	--zp-color-ui-muted: #748497;

	--zp-color-surface-app: #edf3f8;
	--zp-color-surface-panel: #ffffff;
	--zp-color-surface-canvas: #f7fbff;

	--zp-color-border-subtle: #d8e2ed;
	--zp-color-border-control: #7289a1;

	--zp-color-accent-signal: #4f7fae;
	--zp-color-accent-signal-strong: #456f9d;
	--zp-color-accent-signal-soft: #dceaf6;
	--zp-rgb-accent-signal: 79 127 174;

	--zp-color-status-blocked: #c96f5b;
	--zp-color-status-blocked-soft: #f4e2dc;
	--zp-color-status-completed: #6a9676;
	--zp-color-status-completed-soft: #e1ede4;
	--zp-color-status-archived: #748497;
	--zp-color-status-archived-soft: #edf1f5;

	--zp-color-semantic-scaffold: #b78a4a;
	--zp-color-semantic-growth: #4f8f93;
	--zp-color-semantic-knowledge: #6f72b8;
	--zp-color-semantic-knowledge-soft: #e8e8f6;
	--zp-color-semantic-staging: #8fa0b4;

	--zp-alpha-04: 0.04;
	--zp-alpha-08: 0.08;
	--zp-alpha-12: 0.12;
	--zp-alpha-16: 0.16;
	--zp-alpha-24: 0.24;
	--zp-alpha-32: 0.32;
	--zp-alpha-48: 0.48;
	--zp-alpha-64: 0.64;

	--zp-color-grid-blueprint: rgb(128 157 188 / var(--zp-alpha-16));
	--zp-color-signal-glow: rgb(var(--zp-rgb-accent-signal) / var(--zp-alpha-24));
	--zp-color-signal-hover: rgb(var(--zp-rgb-accent-signal) / var(--zp-alpha-08));

	/* Graph aliases kept stable for existing component CSS. */
	--zp-surface-app: var(--zp-color-surface-app);
	--zp-surface-panel: var(--zp-color-surface-panel);
	--zp-surface-canvas: var(--zp-color-surface-canvas);
	--zp-border-subtle: var(--zp-color-border-subtle);
	--zp-border-control: var(--zp-color-border-control);

	--zp-edge-neutral: #7289a1;
	--zp-edge-selected: var(--zp-color-accent-signal);
	--zp-edge-selected-strong: var(--zp-color-accent-signal-strong);
	--zp-edge-dim: rgb(114 137 161 / var(--zp-alpha-32));
	--zp-edge-knowledge: var(--zp-color-semantic-knowledge);

	--zp-type-scaffold: var(--zp-color-semantic-scaffold);
	--zp-type-growth: var(--zp-color-semantic-growth);
	--zp-type-knowledge: var(--zp-color-semantic-knowledge);
	--zp-type-staging: var(--zp-color-semantic-staging);

	--zp-status-active: var(--zp-color-accent-signal);
	--zp-status-active-strong: var(--zp-color-accent-signal-strong);
	--zp-status-active-bg: var(--zp-color-accent-signal-soft);
	--zp-status-blocked: var(--zp-color-status-blocked);
	--zp-status-blocked-bg: var(--zp-color-status-blocked-soft);
	--zp-status-completed: var(--zp-color-status-completed);
	--zp-status-completed-bg: var(--zp-color-status-completed-soft);
	--zp-status-archived: var(--zp-color-status-archived);
	--zp-status-archived-bg: var(--zp-color-status-archived-soft);

	--zp-glow-selected: var(--zp-color-signal-glow);
	--zp-accent-scaffold: var(--zp-type-scaffold);
	--zp-accent-growth: var(--zp-type-growth);
	--zp-accent-knowledge: var(--zp-type-knowledge);
}
```

- [ ] **Step 2: Replace the canvas grid colors**

In `.zp-workbench__canvas`, replace the `background` declaration with:

```css
.zp-workbench__canvas {
	background:
		linear-gradient(var(--zp-color-grid-blueprint) 1px, transparent 1px),
		linear-gradient(90deg, var(--zp-color-grid-blueprint) 1px, transparent 1px),
		var(--zp-surface-canvas);
	background-size: 24px 24px;
}
```

- [ ] **Step 3: Remove legacy `rgba(...)` values from graph CSS**

Within `apps/web/src/features/graph/styles.css`, replace remaining `rgba(...)` color expressions with tokenized `rgb(... / var(--zp-alpha-*))` or opaque role tokens. Use these exact replacements:

```css
background: var(--zp-surface-panel);
box-shadow: 0 1px 2px rgb(35 48 66 / var(--zp-alpha-04)), 0 8px 20px rgb(35 48 66 / var(--zp-alpha-08));
```

```css
.zp-pill__dive:hover { background: var(--zp-color-signal-hover); color: var(--zp-color-accent-signal-strong); }
```

```css
.zp-node-status {
	box-shadow: 0 0 0 3px rgb(var(--zp-rgb-accent-signal) / var(--zp-alpha-12));
}
```

```css
.zp-node-status--blocked {
	box-shadow: 0 0 0 3px rgb(201 111 91 / var(--zp-alpha-12));
}
```

```css
.zp-node-status--completed {
	box-shadow: 0 0 0 3px rgb(106 150 118 / var(--zp-alpha-12));
}
```

```css
.zp-node-status--archived {
	box-shadow: 0 0 0 3px rgb(116 132 151 / var(--zp-alpha-16));
}
```

Use `rgb(255 255 255 / var(--zp-alpha-64))` only for light transparent surfaces that need translucency, and prefer opaque `var(--zp-surface-panel)` for panels.

- [ ] **Step 4: Run token test to verify it passes**

Run:

```bash
pnpm --filter @zet-plane/web test apps/web/src/features/graph/components/brand-color-system.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/graph/styles.css apps/web/src/features/graph/components/brand-color-system.test.ts
git commit -m "feat(web): add graph brand color tokens"
```

---

### Task 3: Apply Tokens To Nodes, Probes, Staging, And Edges

**Files:**
- Modify: `apps/web/src/features/graph/styles.css`
- Test: `apps/web/src/features/graph/components/Pill.test.tsx`
- Test: `apps/web/src/features/graph/components/status-classes.test.ts`
- Test: `apps/web/src/features/graph/components/brand-color-system.test.ts`

- [ ] **Step 1: Update neutral node surfaces and text**

In `apps/web/src/features/graph/styles.css`, update `.zp-pill`, title metadata, completed, and archived styles to use role tokens:

```css
.zp-pill {
	position: relative;
	display: inline-flex;
	align-items: center;
	gap: 10px;
	box-sizing: border-box;
	width: 100%;
	padding: 6px 12px;
	border-radius: 8px;
	font-size: 13px;
	background: var(--zp-surface-panel);
	box-shadow: 0 1px 2px rgb(35 48 66 / var(--zp-alpha-04)), 0 8px 20px rgb(35 48 66 / var(--zp-alpha-08));
	min-width: 140px;
	overflow: hidden;
	font-family: inherit;
	border: 1px solid var(--zp-border-subtle);
	color: var(--zp-color-fg-strong);
}

.zp-pill__dive {
	font-family: ui-monospace, monospace;
	font-size: 11px;
	color: var(--zp-color-fg-muted);
	margin-left: auto;
	padding: 1px 6px;
	cursor: pointer;
	background: transparent;
	border: 0;
	border-radius: 4px;
	line-height: 1;
}

.zp-pill--completed { color: var(--zp-color-fg-muted); }
.zp-pill--completed .zp-pill__title {
	text-decoration: line-through;
	text-decoration-color: var(--zp-status-archived);
}
.zp-pill--archived { color: var(--zp-color-ui-muted); }
```

- [ ] **Step 2: Update knowledge probe styling**

Replace the knowledge probe section in `styles.css` with:

```css
.zp-probe-rail {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	border-radius: 999px;
	border: 1px solid rgb(111 114 184 / var(--zp-alpha-24));
	background: var(--zp-color-semantic-knowledge-soft);
	padding: 1px 5px;
	flex: 0 0 auto;
}
.zp-probe-dot {
	width: 5px;
	height: 5px;
	border-radius: 999px;
	background: var(--zp-type-knowledge);
}
.zp-probe-dot--decision { background: var(--zp-type-knowledge); }
.zp-probe-dot--pitfall { background: var(--zp-status-blocked); }
.zp-probe-dot--finding { background: color-mix(in srgb, var(--zp-type-knowledge), var(--zp-status-completed) 28%); }
.zp-probe-dot--context { background: color-mix(in srgb, var(--zp-type-knowledge), white 12%); }
.zp-probe-count {
	font-family: ui-monospace, monospace;
	font-size: 10px;
	line-height: 1;
	color: var(--zp-color-semantic-knowledge);
}
```

- [ ] **Step 3: Update selection, knowledge pill, staging, toggles, and edges**

Replace the affected selectors with these token-backed versions:

```css
.zp-pill--selected {
	outline: 2px solid var(--zp-edge-selected);
	outline-offset: 2px;
	box-shadow: 0 0 0 5px var(--zp-glow-selected), 0 10px 24px rgb(35 48 66 / var(--zp-alpha-08));
}
.zp-pill.zp-pill--dimmed { opacity: var(--zp-alpha-48); }

.zp-pill--knowledge {
	background: var(--zp-color-semantic-knowledge-soft);
	font-size: 11.5px;
	min-width: 100px;
	padding: 3px 10px;
}

.zp-pill__jump-btn:hover { background: var(--zp-color-signal-hover); color: var(--zp-color-accent-signal-strong); }

.zp-hero {
	position: relative;
	display: inline-flex;
	align-items: center;
	gap: 12px;
	padding: 10px 18px;
	border-radius: 999px;
	background: var(--zp-status-active-bg);
	box-shadow: 0 3px 6px rgb(20 20 20 / var(--zp-alpha-08)), 0 6px 14px rgb(20 20 20 / var(--zp-alpha-08));
	font-size: 15px;
}
.zp-hero__eyebrow { font-size: 10px; color: var(--zp-color-ui-muted); letter-spacing: 0.08em; text-transform: uppercase; }
.zp-hero__desc { font-size: 12px; color: var(--zp-color-fg-default); margin-left: 10px; }
.zp-hero--project { background: var(--zp-surface-panel); box-shadow: 0 4px 10px rgb(20 20 20 / var(--zp-alpha-08)); }

.zp-breadcrumb { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--zp-color-fg-default); padding: 6px 10px; }
.zp-breadcrumb__seg:hover:not(:disabled) { background: rgb(32 48 71 / var(--zp-alpha-08)); }
.zp-breadcrumb__seg--current { color: var(--zp-color-fg-strong); font-weight: 600; cursor: default; }
.zp-breadcrumb__sep { color: var(--zp-color-ui-muted); }

.zp-staging__count { font-family: ui-monospace, monospace; font-size: 11px; color: var(--zp-color-fg-muted); }
.zp-staging__empty { font-size: 11px; color: var(--zp-color-ui-muted); }

.zp-staging-lane {
	box-sizing: border-box;
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	border: 1px dashed var(--zp-border-subtle);
	border-radius: 8px;
	background: rgb(255 255 255 / var(--zp-alpha-64));
	color: var(--zp-color-fg-strong);
	overflow: hidden;
}
.zp-staging-lane__empty {
	font-size: 11px;
	color: var(--zp-color-fg-muted);
}
.zp-staging-lane__item {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 2px;
	width: 100%;
	border: 1px solid var(--zp-border-subtle);
	border-radius: 6px;
	background: var(--zp-surface-panel);
	padding: 8px 10px;
	color: inherit;
	text-align: left;
	cursor: pointer;
}
.zp-staging-lane__item:hover,
.zp-staging-lane__item--selected {
	border-color: var(--zp-edge-selected);
	background: var(--zp-status-active-bg);
}
.zp-staging-lane__marker {
	font-size: 10px;
	color: var(--zp-type-staging);
	text-transform: uppercase;
}

.zp-chrome-toggle {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 4px 10px;
	border-radius: 6px;
	font-size: 11px;
	background: var(--zp-surface-panel);
	border: 1px solid var(--zp-border-subtle);
	cursor: pointer;
}
.zp-chrome-toggle[aria-pressed="true"] {
	background: var(--zp-color-semantic-knowledge-soft);
	border-color: var(--zp-type-knowledge);
}

.zp-edge { stroke: var(--zp-edge-neutral); }
.zp-edge--neutral { stroke: var(--zp-edge-neutral); }
.zp-edge--selected {
	stroke: var(--zp-edge-selected);
	filter: drop-shadow(0 0 4px var(--zp-glow-selected));
}
.zp-edge--blocked { stroke: var(--zp-status-blocked); }
.zp-edge--active { stroke: var(--zp-edge-selected); }
.zp-edge--completed { stroke: var(--zp-status-completed); }
.zp-edge--archived { stroke: var(--zp-status-archived); }
.zp-edge--dim { stroke: var(--zp-edge-dim); opacity: var(--zp-alpha-48); }
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm --filter @zet-plane/web test apps/web/src/features/graph/components/brand-color-system.test.ts apps/web/src/features/graph/components/Pill.test.tsx apps/web/src/features/graph/components/status-classes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/graph/styles.css
git commit -m "feat(web): apply brand colors to graph primitives"
```

---

### Task 4: Update Legend Swatches To Use Brand Tokens

**Files:**
- Modify: `apps/web/src/features/graph/components/Legend.tsx`
- Modify: `apps/web/src/features/graph/components/Legend.test.tsx`

- [ ] **Step 1: Write failing legend token assertions**

Update `apps/web/src/features/graph/components/Legend.test.tsx` to:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Legend } from "./Legend";

describe("Legend", () => {
	it("starts collapsed and expands on demand", () => {
		render(<Legend />);

		expect(screen.getByRole("button", { name: /Legend/ })).toBeInTheDocument();
		expect(screen.queryByText("Scaffold (flag-tab)")).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /Legend/ }));

		expect(screen.getByText("Scaffold (flag-tab)")).toBeInTheDocument();
	});

	it("renders swatches from the brand color token aliases", () => {
		const { container } = render(<Legend />);

		fireEvent.click(screen.getByRole("button", { name: /Legend/ }));

		expect(
			container.querySelector('[style*="var(--zp-status-active)"]'),
		).not.toBeNull();
		expect(
			container.querySelector('[style*="var(--zp-status-blocked)"]'),
		).not.toBeNull();
		expect(
			container.querySelector('[style*="var(--zp-status-completed)"]'),
		).not.toBeNull();
		expect(
			container.querySelector('[style*="var(--zp-status-archived)"]'),
		).not.toBeNull();
		expect(
			container.querySelector('[style*="var(--zp-color-semantic-knowledge-soft)"]'),
		).not.toBeNull();
	});
});
```

- [ ] **Step 2: Run legend test to verify it fails**

Run:

```bash
pnpm --filter @zet-plane/web test apps/web/src/features/graph/components/Legend.test.tsx
```

Expected: FAIL because `KnowledgeGlyph` still uses a hard-coded translucent violet color.

- [ ] **Step 3: Update `KnowledgeGlyph` and any old inline color**

In `apps/web/src/features/graph/components/Legend.tsx`, replace `KnowledgeGlyph` with:

```tsx
function KnowledgeGlyph() {
	return (
		<span
			className="inline-block h-2 w-5 rounded-full"
			style={{ background: "var(--zp-color-semantic-knowledge-soft)" }}
		/>
	);
}
```

Keep `ScaffoldGlyph` using `var(--zp-accent-scaffold)` and `GrowthGlyph` using `var(--zp-status-active-bg)` for now; they are graph aliases backed by the new role tokens.

- [ ] **Step 4: Run legend test to verify it passes**

Run:

```bash
pnpm --filter @zet-plane/web test apps/web/src/features/graph/components/Legend.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/graph/components/Legend.tsx apps/web/src/features/graph/components/Legend.test.tsx
git commit -m "feat(web): align graph legend with brand tokens"
```

---

### Task 5: Add Canvas E2E Style Assertions

**Files:**
- Modify: `apps/web/e2e/canvas.spec.ts`
- Test: `apps/web/e2e/canvas.spec.ts`

- [ ] **Step 1: Add a real-browser brand color assertion test**

Append this test inside `test.describe("Semantic demo canvas", () => { ... })` in `apps/web/e2e/canvas.spec.ts`, before the final composition-edges test:

```ts
	test("graph workbench applies the Flowing Circuit Blueprint color tokens", async ({
		page,
		baseURL,
	}) => {
		await page.goto(graphUrl(baseURL, DEMO_PROJECT_ID));
		await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10000 });

		const workbench = page.locator(".zp-workbench");
		await expect(workbench).toHaveCSS("background-color", "rgb(237, 243, 248)");

		const canvas = page.locator(".zp-workbench__canvas");
		await expect(canvas).toHaveCSS("background-color", "rgb(247, 251, 255)");

		const prd = page.locator(`[data-id="${PRD_ID}"]`);
		await expect(prd.locator(".zp-pill")).toHaveCSS(
			"color",
			"rgb(32, 48, 71)",
		);

		await prd.click();
		await expect(prd.locator(".zp-pill--selected")).toHaveCSS(
			"outline-color",
			"rgb(79, 127, 174)",
		);

		await page.getByRole("button", { name: /Legend/ }).click();
		await expect(page.getByText("Knowledge (violet)")).toBeVisible();

		const firstEdge = page.locator(".react-flow__edges path.zp-edge").first();
		await expect(firstEdge).toHaveCSS("stroke", "rgb(114, 137, 161)");
	});
```

- [ ] **Step 2: Run the e2e test to verify it passes**

Run:

```bash
pnpm --filter @zet-plane/web exec playwright test apps/web/e2e/canvas.spec.ts -g "Flowing Circuit Blueprint"
```

Expected: PASS when the web and server test environment is running. If the command reports the backend is unreachable, start the normal project dev stack in the same way existing canvas e2e tests require, then rerun this command.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/canvas.spec.ts
git commit -m "test(web): assert graph brand colors in canvas"
```

---

### Task 6: Full Verification And Final Polish

**Files:**
- Verify: `apps/web/src/features/graph/styles.css`
- Verify: `apps/web/src/features/graph/components/brand-color-system.test.ts`
- Verify: `apps/web/src/features/graph/components/Legend.test.tsx`
- Verify: `apps/web/e2e/canvas.spec.ts`

- [ ] **Step 1: Run formatting and lint checks**

Run:

```bash
pnpm --filter @zet-plane/web lint
```

Expected: PASS.

- [ ] **Step 2: Run graph-focused unit tests**

Run:

```bash
pnpm --filter @zet-plane/web test apps/web/src/features/graph/components/brand-color-system.test.ts apps/web/src/features/graph/components/Pill.test.tsx apps/web/src/features/graph/components/Legend.test.tsx apps/web/src/features/graph/components/status-classes.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run canvas e2e tests**

Run:

```bash
pnpm --filter @zet-plane/web exec playwright test apps/web/e2e/canvas.spec.ts
```

Expected: PASS when the existing canvas e2e environment is running. If it cannot reach the backend, record the backend error in the final handoff rather than claiming e2e passed.

- [ ] **Step 4: Check for forbidden legacy colors**

Run:

```bash
rg -n "rgba\\(|#3b82f6|#8b6bd6|#d66b4d|#9ca3af|0\\.(13|22|26|28)" apps/web/src/features/graph
```

Expected: no matches.

- [ ] **Step 5: Commit final cleanup if any files changed**

Only run this if Step 1-4 forced additional fixes:

```bash
git add apps/web/src/features/graph/styles.css apps/web/src/features/graph/components/brand-color-system.test.ts apps/web/src/features/graph/components/Legend.tsx apps/web/src/features/graph/components/Legend.test.tsx apps/web/e2e/canvas.spec.ts
git commit -m "chore(web): polish graph brand color rollout"
```

Expected: commit is created only if there were cleanup changes after previous task commits.

---

## Self-Review

Spec coverage:

- Foundation/signal/status/semantic family colors are implemented in Task 2.
- Shared opacity scale is tested and implemented in Task 1 and Task 2.
- Dark-mode-compatible role token naming is implemented in Task 2.
- WCAG contrast checks are implemented in Task 1.
- Neutral node surfaces, small status markers, knowledge family restraint, and edge-led flow metaphor are implemented in Task 3.
- Legend and real browser canvas assertions are covered in Task 4 and Task 5.

Plan hygiene scan:

- The plan contains no unresolved marker text, no open-ended implementation steps, and no unnamed files.
- Code steps include concrete snippets and commands.

Type and naming consistency:

- CSS role tokens use `--zp-color-*`, `--zp-rgb-*`, and `--zp-alpha-*`.
- Existing graph aliases remain available for current component CSS.
- Test names and file paths match the current repo structure.
