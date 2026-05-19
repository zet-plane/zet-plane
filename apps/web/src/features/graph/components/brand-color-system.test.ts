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
