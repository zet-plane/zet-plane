// Single source of truth for Pill rendered dimensions.
//
// `.zp-pill` fills the React Flow wrapper width assigned from ELK. To stop the
// pill content from being clipped or crowding neighbors, the layout layer must
// reserve a width that matches what CSS needs to render. This module computes
// that width purely from props — no DOM.
//
// CSS drift is caught by `apps/web/e2e/pill-geometry.spec.ts`, which asserts
// `pill.offsetWidth <= measurePillSize(...).width` on representative pills.

import { measureNodeText } from "../layout/measure-text";

// `.zp-pill` defaults
export const PILL_PADDING_X = 12; // padding: 6px 12px
export const PILL_PADDING_Y = 6;
export const PILL_FLEX_GAP = 10; // gap: 10px
export const PILL_MIN_WIDTH = 140;

// `.zp-pill--scaffold`
export const PILL_PADDING_LEFT_SCAFFOLD = 20; // overrides padding-left

// `.zp-pill--growth`
export const PILL_PADDING_Y_GROWTH = 4;
// Growth `::before` is an inline 5px dot + 2px margin-right. It participates
// in inline content flow (not the flex row), but the flex container's first
// flex item is still `.zp-node-status`, so this dot effectively prepends extra
// width before the status dot.
export const PILL_GROWTH_DOT_WIDTH = 5 + 2;

// `.zp-status-badge` — always rendered by Pill.tsx, with optional internal ring
export const PILL_STATUS_BADGE_WIDTH = 19;

// `.zp-probe-rail` — rendered when knowledgeCount > 0
// 1px border each side + 5px padding each side + N×5px dots with 3px gaps +
// count text in 10px ui-monospace (~6px per digit, "+" for ≥10 fits in similar).
export const PILL_PROBE_RAIL_BORDER = 1;
export const PILL_PROBE_RAIL_PADDING_X = 5;
export const PILL_PROBE_DOT_WIDTH = 5;
export const PILL_PROBE_DOT_GAP = 3;
export const PILL_PROBE_RAIL_INNER_GAP = 3; // gap between dots and count
export const PILL_PROBE_COUNT_CHAR_WIDTH = 6;

// `.zp-pill__dive` — rendered when childCount > 0
// font-size 11px ui-monospace, padding 1px 6px. "↳" is ~9–10px at 11px;
// digits are ~7px.
export const PILL_DIVE_PADDING_X = 6;
export const PILL_DIVE_ARROW_WIDTH = 10;
export const PILL_DIVE_DIGIT_WIDTH = 7;

// Title — matches `.zp-pill__title` CSS computed from the base `.zp-pill` font.
// We bake the rendered font here so width changes if CSS font weights/sizes
// shift (and so the e2e check actually catches them).
export const PILL_TITLE_FONT_DEFAULT = '500 13px "Inter Variable"';
export const PILL_TITLE_FONT_SCAFFOLD = '500 13.5px "Inter Variable"';
export const PILL_TITLE_FONT_GROWTH = '500 12.5px "Inter Variable"';
export const PILL_TITLE_MAX_WIDTH = 220;
export const PILL_TITLE_LINE_HEIGHT = 18;

export type PillVariant = "scaffold" | "growth" | "default";

export type PillGeometryInput = {
	title: string;
	variant: PillVariant;
	knowledgeCount: number;
	childCount: number;
};

export type PillGeometryOutput = {
	width: number;
	height: number;
};

function titleFontFor(variant: PillVariant): string {
	if (variant === "scaffold") return PILL_TITLE_FONT_SCAFFOLD;
	if (variant === "growth") return PILL_TITLE_FONT_GROWTH;
	return PILL_TITLE_FONT_DEFAULT;
}

function paddingXLeft(variant: PillVariant): number {
	return variant === "scaffold" ? PILL_PADDING_LEFT_SCAFFOLD : PILL_PADDING_X;
}

function paddingYFor(variant: PillVariant): number {
	return variant === "growth" ? PILL_PADDING_Y_GROWTH : PILL_PADDING_Y;
}

function probeRailWidth(knowledgeCount: number): number {
	if (knowledgeCount <= 0) return 0;
	// Up to 3 category dots are rendered (Pill.tsx slices to 3).
	const dotCount = Math.min(3, knowledgeCount);
	const dotsWidth =
		dotCount * PILL_PROBE_DOT_WIDTH +
		Math.max(0, dotCount - 1) * PILL_PROBE_DOT_GAP;
	const digits = Math.max(1, String(knowledgeCount).length);
	const countWidth = digits * PILL_PROBE_COUNT_CHAR_WIDTH;
	return (
		PILL_PROBE_RAIL_BORDER * 2 +
		PILL_PROBE_RAIL_PADDING_X * 2 +
		dotsWidth +
		PILL_PROBE_RAIL_INNER_GAP +
		countWidth
	);
}

function diveButtonWidth(childCount: number): number {
	if (childCount <= 0) return 0;
	const digits = Math.max(1, String(childCount).length);
	return (
		PILL_DIVE_PADDING_X * 2 +
		PILL_DIVE_ARROW_WIDTH +
		digits * PILL_DIVE_DIGIT_WIDTH
	);
}

export function measurePillSize(input: PillGeometryInput): PillGeometryOutput {
	const text = measureNodeText({
		text: input.title,
		font: titleFontFor(input.variant),
		maxWidth: PILL_TITLE_MAX_WIDTH,
		lineHeight: PILL_TITLE_LINE_HEIGHT,
	});

	const showProbe = input.knowledgeCount > 0;
	const showDive = input.childCount > 0;

	const flexChildren = [
		PILL_STATUS_BADGE_WIDTH,
		text.width,
		showProbe ? probeRailWidth(input.knowledgeCount) : 0,
		showDive ? diveButtonWidth(input.childCount) : 0,
	].filter((w) => w > 0);
	const gaps = Math.max(0, flexChildren.length - 1) * PILL_FLEX_GAP;
	const flexInnerWidth = flexChildren.reduce((sum, w) => sum + w, 0) + gaps;

	const growthPrefix = input.variant === "growth" ? PILL_GROWTH_DOT_WIDTH : 0;
	const padX = paddingXLeft(input.variant) + PILL_PADDING_X;
	const innerWidth = flexInnerWidth + growthPrefix;
	const width = Math.max(PILL_MIN_WIDTH, innerWidth + padX);

	const padY = paddingYFor(input.variant);
	const height = text.height + padY * 2;

	return { width, height };
}
