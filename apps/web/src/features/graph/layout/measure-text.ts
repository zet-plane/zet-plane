import { layout, prepare } from "@chenglou/pretext";

type MeasureNodeTextInput = {
	text: string;
	font: string;
	maxWidth: number;
	lineHeight: number;
};

type MeasureNodeTextOutput = {
	width: number;
	height: number;
};

const measureCache = new Map<string, MeasureNodeTextOutput>();

function getApproximateCharWidth(font: string): number {
	const fontSizeMatch = /(\d+(?:\.\d+)?)px/.exec(font);
	const fontSize =
		fontSizeMatch === null ? 14 : Number.parseFloat(fontSizeMatch[1]);

	if (!Number.isFinite(fontSize) || fontSize <= 0) {
		return 7;
	}

	return fontSize * 0.5;
}

function toPositiveInteger(value: number): number {
	if (!Number.isFinite(value) || value <= 0) {
		return 1;
	}

	return Math.max(1, Math.ceil(value));
}

function measureTextWidthWithCanvas(text: string, font: string): number | null {
	if (typeof document === "undefined") {
		return null;
	}

	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d");

	if (context === null) {
		return null;
	}

	context.font = font;

	return context.measureText(text).width;
}

function getMeasuredWidth(
	text: string,
	font: string,
	maxWidth: number,
): number {
	const canvasWidth = measureTextWidthWithCanvas(text, font);

	if (canvasWidth !== null && Number.isFinite(canvasWidth) && canvasWidth > 0) {
		return Math.min(maxWidth, canvasWidth);
	}

	return Math.min(maxWidth, text.length * getApproximateCharWidth(font));
}

export function measureNodeText({
	text,
	font,
	maxWidth,
	lineHeight,
}: MeasureNodeTextInput): MeasureNodeTextOutput {
	const key = `${maxWidth}|${lineHeight}|${font}|${text}`;
	const cached = measureCache.get(key);

	if (cached !== undefined) {
		return cached;
	}

	const prepared = prepare(text, font);
	const result = layout(prepared, maxWidth, lineHeight) as Record<
		string,
		unknown
	>;
	const measured = {
		width: toPositiveInteger(getMeasuredWidth(text, font, maxWidth)),
		height: toPositiveInteger(
			typeof result.height === "number" ? result.height : lineHeight,
		),
	};

	measureCache.set(key, measured);

	return measured;
}

export function resetMeasureCache(): void {
	measureCache.clear();
}
