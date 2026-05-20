import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const stylesPath = join(process.cwd(), "src/features/graph/styles.css");
const styles = readFileSync(stylesPath, "utf8");

function hexToRgb(hex: string): [number, number, number] {
	const value = hex.replace("#", "");
	return [0, 2, 4].map((index) =>
		Number.parseInt(value.slice(index, index + 2), 16),
	) as [number, number, number];
}

function channelToLinear(channel: number) {
	const value = channel / 255;
	return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
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

function expectRatio(foreground: string, background: string, minimum: number) {
	expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(minimum);
}

describe("brand color system tokens", () => {
	it("defines the role-token contract used by the graph workbench", () => {
		for (const token of [
			"--zp-color-fg-strong: #172b43;",
			"--zp-color-fg-default: #52677d;",
			"--zp-color-fg-muted: #5a6f84;",
			"--zp-color-ui-muted: #7b91a6;",
			"--zp-color-surface-app: #eef6fc;",
			"--zp-color-surface-panel: #ffffff;",
			"--zp-color-surface-canvas: #f8fcff;",
			"--zp-color-border-subtle: #d4e4f2;",
			"--zp-color-border-control: #6f8eaa;",
			"--zp-color-accent-signal: #257fc1;",
			"--zp-color-accent-signal-strong: #1f6fa8;",
			"--zp-color-accent-signal-soft: #e5f0f9;",
			"--zp-rgb-accent-signal: 37 127 193;",
			"--zp-color-status-blocked: #d75f8d;",
			"--zp-color-status-completed: #218f78;",
			"--zp-color-status-archived: #6f8eaa;",
			"--zp-color-semantic-scaffold: #5f8fb8;",
			"--zp-color-semantic-growth: #28a98b;",
			"--zp-color-semantic-knowledge: #4c68c9;",
			"--zp-color-semantic-knowledge-soft: #e8effb;",
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

	it("keeps knowledge probe colors inside the restrained knowledge family", () => {
		expect(styles).toContain(
			".zp-probe-rail {\n\tdisplay: inline-flex;\n\talign-items: center;\n\tgap: 3px;\n\tborder-radius: 999px;\n\tborder: 1px solid rgb(var(--zp-rgb-semantic-knowledge) / var(--zp-alpha-24));\n\tbackground: var(--zp-color-semantic-knowledge-soft);",
		);
		expect(styles).toContain(
			".zp-probe-dot--decision {\n\tbackground: var(--zp-type-knowledge);",
		);
		expect(styles).toContain(
			".zp-probe-dot--finding {\n\tbackground: var(--zp-type-knowledge);",
		);
		expect(styles).not.toContain(
			".zp-probe-dot--decision {\n\tbackground: var(--zp-status-active);",
		);
		expect(styles).not.toContain(
			".zp-probe-dot--finding {\n\tbackground: var(--zp-status-completed);",
		);
	});

	it("renders internal node status as an outer ring around the self status dot", () => {
		expect(styles).toContain(".zp-status-badge {");
		expect(styles).toContain(
			"--zp-status-track: rgb(var(--zp-rgb-accent-signal) / var(--zp-alpha-12));",
		);
		expect(styles).toContain("--zp-segment-gap: 5deg;");
		expect(styles).toContain("background: var(--zp-status-track);");
		expect(styles).toContain(".zp-status-badge--with-internal::after");
		expect(styles).toContain("background: conic-gradient(");
		expect(styles).toMatch(
			/var\(--zp-status-active\)\s+0\s+max\(0deg,\s*calc\(var\(--zp-internal-active\) - var\(--zp-segment-gap\)\)\)/,
		);
		expect(styles).toContain("transparent");
		expect(styles).toContain("var(--zp-internal-active)");
		expect(styles).toContain("var(--zp-status-blocked)");
		expect(styles).toContain("var(--zp-status-completed)");
		expect(styles).toContain("var(--zp-status-archived)");
		expect(styles).toContain(".zp-status-badge::before");
		expect(styles).not.toContain("border: 1px solid var(--zp-surface-panel);");
		expect(styles).not.toContain(
			"border: 1px solid rgb(var(--zp-rgb-shadow) / var(--zp-alpha-12));",
		);
		expect(styles).not.toContain(".zp-pill__agg {\n\tposition: absolute;");
	});

	it("keeps documented text and non-text contrast ratios above WCAG targets", () => {
		const colors = {
			fgStrong: "#172b43",
			fgDefault: "#52677d",
			fgMuted: "#5a6f84",
			surfaceApp: "#eef6fc",
			surfacePanel: "#ffffff",
			surfaceCanvas: "#f8fcff",
			borderControl: "#6f8eaa",
			signal: "#257fc1",
			signalStrong: "#1f6fa8",
			blocked: "#d75f8d",
			completed: "#218f78",
			archived: "#6f8eaa",
			edgeNeutral: "#6f8eaa",
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
