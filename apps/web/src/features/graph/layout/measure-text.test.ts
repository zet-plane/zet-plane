import { beforeEach, describe, expect, it, vi } from "vitest";

const { prepareWithSegmentsMock, measureLineStatsMock } = vi.hoisted(() => ({
	prepareWithSegmentsMock: vi.fn(),
	measureLineStatsMock: vi.fn(),
}));

vi.mock("@chenglou/pretext", () => ({
	prepareWithSegments: prepareWithSegmentsMock,
	measureLineStats: measureLineStatsMock,
}));

import { measureNodeText, resetMeasureCache } from "./measure-text";

describe("measureNodeText", () => {
	const originalGetContext = HTMLCanvasElement.prototype.getContext;

	beforeEach(() => {
		prepareWithSegmentsMock.mockReset();
		measureLineStatsMock.mockReset();
		resetMeasureCache();
		HTMLCanvasElement.prototype.getContext = originalGetContext;
	});

	it("returns positive integer dimensions", () => {
		const prepared = { prepared: true };
		prepareWithSegmentsMock.mockReturnValue(prepared);
		measureLineStatsMock.mockReturnValue({
			maxLineWidth: 83.4,
			lineCount: 1,
		});
		const input = {
			text: "Alpha",
			font: "600 14px Inter",
			maxWidth: 180,
			lineHeight: 20,
		};

		expect(measureNodeText(input)).toEqual({ width: 84, height: 20 });
		expect(prepareWithSegmentsMock).toHaveBeenCalledWith(
			input.text,
			input.font,
		);
		expect(measureLineStatsMock).toHaveBeenCalledWith(prepared, input.maxWidth);
	});

	it("caches identical calls and does not rerun prepare", () => {
		prepareWithSegmentsMock.mockReturnValue({ prepared: true });
		measureLineStatsMock.mockReturnValue({
			maxLineWidth: 96,
			lineCount: 2,
		});

		const input = {
			text: "Repeated",
			font: "600 14px Inter",
			maxWidth: 180,
			lineHeight: 20,
		};

		const first = measureNodeText(input);
		const second = measureNodeText(input);

		expect(first).toEqual(second);
		expect(prepareWithSegmentsMock).toHaveBeenCalledTimes(1);
		expect(measureLineStatsMock).toHaveBeenCalledTimes(1);
	});

	it("does not cache different text values together", () => {
		prepareWithSegmentsMock.mockReturnValue({ prepared: true });
		measureLineStatsMock.mockReturnValue({
			maxLineWidth: 96,
			lineCount: 2,
		});

		measureNodeText({
			text: "Alpha",
			font: "600 14px Inter",
			maxWidth: 180,
			lineHeight: 20,
		});
		measureNodeText({
			text: "Beta",
			font: "600 14px Inter",
			maxWidth: 180,
			lineHeight: 20,
		});

		expect(prepareWithSegmentsMock).toHaveBeenCalledTimes(2);
		expect(measureLineStatsMock).toHaveBeenCalledTimes(2);
	});

	it("uses pretext line width instead of canvas width", () => {
		HTMLCanvasElement.prototype.getContext = vi.fn((contextId: string) => {
			if (contextId !== "2d") {
				return null;
			}

			return {
				font: "",
				measureText: (value: string) => ({
					width: value.length * 10,
				}),
			} as CanvasRenderingContext2D;
		}) as typeof HTMLCanvasElement.prototype.getContext;
		prepareWithSegmentsMock.mockReturnValue({ prepared: true });
		measureLineStatsMock.mockReturnValue({
			maxLineWidth: 123.2,
			lineCount: 1,
		});

		const measured = measureNodeText({
			text: "Tiny",
			font: "600 14px Inter",
			maxWidth: 180,
			lineHeight: 20,
		});

		expect(measured.width).toBe(124);
	});

	it("uses pretext line count to calculate height", () => {
		prepareWithSegmentsMock.mockReturnValue({ prepared: true });
		measureLineStatsMock.mockReturnValue({
			maxLineWidth: 160,
			lineCount: 3,
		});

		const measured = measureNodeText({
			text: "A long title that wraps",
			font: "600 14px Inter",
			maxWidth: 180,
			lineHeight: 20,
		});

		expect(measured).toEqual({ width: 160, height: 60 });
	});
});
