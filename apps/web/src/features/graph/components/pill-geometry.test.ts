import { beforeEach, describe, expect, it, vi } from "vitest";

const { measureNodeTextMock } = vi.hoisted(() => ({
	measureNodeTextMock: vi.fn(),
}));

vi.mock("../layout/measure-text", () => ({
	measureNodeText: measureNodeTextMock,
}));

import {
	measurePillSize,
	PILL_MIN_WIDTH,
	PILL_PADDING_LEFT_SCAFFOLD,
	PILL_PADDING_X,
	PILL_STATUS_DOT_WIDTH,
	PILL_TITLE_FONT_DEFAULT,
	PILL_TITLE_FONT_GROWTH,
	PILL_TITLE_FONT_SCAFFOLD,
} from "./pill-geometry";

describe("measurePillSize", () => {
	beforeEach(() => {
		measureNodeTextMock.mockReset();
		measureNodeTextMock.mockReturnValue({ width: 100, height: 18 });
	});

	it("uses the default font for non-scaffold non-growth pills", () => {
		measurePillSize({
			title: "Some node",
			variant: "default",
			knowledgeCount: 0,
			childCount: 0,
			hasSummaryBar: false,
		});
		expect(measureNodeTextMock).toHaveBeenCalledWith(
			expect.objectContaining({ font: PILL_TITLE_FONT_DEFAULT }),
		);
	});

	it("uses the scaffold font for scaffold pills", () => {
		measurePillSize({
			title: "Scaffold",
			variant: "scaffold",
			knowledgeCount: 0,
			childCount: 0,
			hasSummaryBar: false,
		});
		expect(measureNodeTextMock).toHaveBeenCalledWith(
			expect.objectContaining({ font: PILL_TITLE_FONT_SCAFFOLD }),
		);
	});

	it("uses the growth font for growth pills", () => {
		measurePillSize({
			title: "Growth",
			variant: "growth",
			knowledgeCount: 0,
			childCount: 0,
			hasSummaryBar: false,
		});
		expect(measureNodeTextMock).toHaveBeenCalledWith(
			expect.objectContaining({ font: PILL_TITLE_FONT_GROWTH }),
		);
	});

	it("respects PILL_MIN_WIDTH for tiny content", () => {
		measureNodeTextMock.mockReturnValueOnce({ width: 5, height: 18 });
		const { width } = measurePillSize({
			title: "x",
			variant: "default",
			knowledgeCount: 0,
			childCount: 0,
			hasSummaryBar: false,
		});
		expect(width).toBe(PILL_MIN_WIDTH);
	});

	it("widens the pill when a probe rail is rendered", () => {
		const without = measurePillSize({
			title: "Wide enough title to exceed min width and prevent floor clamp",
			variant: "default",
			knowledgeCount: 0,
			childCount: 0,
			hasSummaryBar: false,
		});
		const withProbe = measurePillSize({
			title: "Wide enough title to exceed min width and prevent floor clamp",
			variant: "default",
			knowledgeCount: 2,
			childCount: 0,
			hasSummaryBar: false,
		});
		expect(withProbe.width).toBeGreaterThan(without.width);
	});

	it("widens the pill when a dive button is rendered", () => {
		const without = measurePillSize({
			title: "Wide enough title to exceed min width and prevent floor clamp",
			variant: "default",
			knowledgeCount: 0,
			childCount: 0,
			hasSummaryBar: false,
		});
		const withDive = measurePillSize({
			title: "Wide enough title to exceed min width and prevent floor clamp",
			variant: "default",
			knowledgeCount: 0,
			childCount: 3,
			hasSummaryBar: false,
		});
		expect(withDive.width).toBeGreaterThan(without.width);
	});

	it("scales probe width with knowledgeCount digit length", () => {
		const single = measurePillSize({
			title: "Wide enough title to exceed min width and prevent floor clamp",
			variant: "default",
			knowledgeCount: 1,
			childCount: 0,
			hasSummaryBar: false,
		});
		const triple = measurePillSize({
			title: "Wide enough title to exceed min width and prevent floor clamp",
			variant: "default",
			knowledgeCount: 999,
			childCount: 0,
			hasSummaryBar: false,
		});
		expect(triple.width).toBeGreaterThan(single.width);
	});

	it("adds scaffold left-pad overhead", () => {
		const def = measurePillSize({
			title: "Wide enough title to exceed min width and prevent floor clamp",
			variant: "default",
			knowledgeCount: 0,
			childCount: 0,
			hasSummaryBar: false,
		});
		const scaffold = measurePillSize({
			title: "Wide enough title to exceed min width and prevent floor clamp",
			variant: "scaffold",
			knowledgeCount: 0,
			childCount: 0,
			hasSummaryBar: false,
		});
		expect(scaffold.width).toBe(
			def.width + (PILL_PADDING_LEFT_SCAFFOLD - PILL_PADDING_X),
		);
	});

	it("adds growth prefix-dot width", () => {
		const def = measurePillSize({
			title: "Wide enough title to exceed min width and prevent floor clamp",
			variant: "default",
			knowledgeCount: 0,
			childCount: 0,
			hasSummaryBar: false,
		});
		const growth = measurePillSize({
			title: "Wide enough title to exceed min width and prevent floor clamp",
			variant: "growth",
			knowledgeCount: 0,
			childCount: 0,
			hasSummaryBar: false,
		});
		expect(growth.width).toBeGreaterThan(def.width);
	});

	it("includes the status dot in width", () => {
		measureNodeTextMock.mockReturnValueOnce({ width: 200, height: 18 });
		const { width } = measurePillSize({
			title: "long enough to dodge min width",
			variant: "default",
			knowledgeCount: 0,
			childCount: 0,
			hasSummaryBar: false,
		});
		// width = padX*2 + dot + gap + text  ⇒  width >= dot + text + padX*2
		expect(width).toBeGreaterThanOrEqual(200 + PILL_STATUS_DOT_WIDTH);
	});

	it("adds height for the summary bar", () => {
		const without = measurePillSize({
			title: "x",
			variant: "default",
			knowledgeCount: 0,
			childCount: 0,
			hasSummaryBar: false,
		});
		const withBar = measurePillSize({
			title: "x",
			variant: "default",
			knowledgeCount: 0,
			childCount: 0,
			hasSummaryBar: true,
		});
		expect(withBar.height).toBeGreaterThan(without.height);
	});

	it("uses tighter vertical padding for growth pills", () => {
		const def = measurePillSize({
			title: "x",
			variant: "default",
			knowledgeCount: 0,
			childCount: 0,
			hasSummaryBar: false,
		});
		const growth = measurePillSize({
			title: "x",
			variant: "growth",
			knowledgeCount: 0,
			childCount: 0,
			hasSummaryBar: false,
		});
		expect(growth.height).toBeLessThan(def.height);
	});
});
