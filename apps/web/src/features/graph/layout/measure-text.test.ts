import { beforeEach, describe, expect, it, vi } from "vitest";

const { prepareMock, layoutMock } = vi.hoisted(() => ({
	prepareMock: vi.fn(),
	layoutMock: vi.fn(),
}));

vi.mock("@chenglou/pretext", () => ({
	prepare: prepareMock,
	layout: layoutMock,
}));

import { measureNodeText, resetMeasureCache } from "./measure-text";

describe("measureNodeText", () => {
	const originalGetContext = HTMLCanvasElement.prototype.getContext;

	beforeEach(() => {
		prepareMock.mockReset();
		layoutMock.mockReset();
		resetMeasureCache();
		HTMLCanvasElement.prototype.getContext = originalGetContext;
	});

	it("returns positive integer dimensions", () => {
		const prepared = { prepared: true };
		prepareMock.mockReturnValue(prepared);
		layoutMock.mockReturnValue({
			height: 0.4,
			lineCount: 1,
		});
		const input = {
			text: "Alpha",
			font: "600 14px Inter",
			maxWidth: 180,
			lineHeight: 20,
		};

		expect(measureNodeText(input)).toEqual({ width: 35, height: 1 });
		expect(prepareMock).toHaveBeenCalledWith(input.text, input.font);
		expect(layoutMock).toHaveBeenCalledWith(
			prepared,
			input.maxWidth,
			input.lineHeight,
		);
	});

	it("caches identical calls and does not rerun prepare", () => {
		prepareMock.mockReturnValue({ prepared: true });
		layoutMock.mockReturnValue({
			height: 24,
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
		expect(prepareMock).toHaveBeenCalledTimes(1);
		expect(layoutMock).toHaveBeenCalledTimes(1);
	});

	it("does not cache different text values together", () => {
		prepareMock.mockReturnValue({ prepared: true });
		layoutMock.mockReturnValue({
			height: 24,
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

		expect(prepareMock).toHaveBeenCalledTimes(2);
		expect(layoutMock).toHaveBeenCalledTimes(2);
	});

	it("measures shorter text narrower than longer text without pretext width", () => {
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
		prepareMock.mockReturnValue({ prepared: true });
		layoutMock.mockReturnValue({
			height: 20,
			lineCount: 1,
		});

		const short = measureNodeText({
			text: "Tiny",
			font: "600 14px Inter",
			maxWidth: 180,
			lineHeight: 20,
		});
		const long = measureNodeText({
			text: "A much longer node title",
			font: "600 14px Inter",
			maxWidth: 180,
			lineHeight: 20,
		});

		expect(short.width).toBeLessThan(long.width);
		expect(long.width).toBeLessThanOrEqual(180);
	});
});
