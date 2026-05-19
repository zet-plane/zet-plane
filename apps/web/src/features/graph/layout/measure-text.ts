import { measureLineStats, prepareWithSegments } from "@chenglou/pretext";

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

function toPositiveInteger(value: number): number {
	if (!Number.isFinite(value) || value <= 0) {
		return 1;
	}

	return Math.max(1, Math.ceil(value));
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

	const prepared = prepareWithSegments(text, font);
	const result = measureLineStats(prepared, maxWidth);
	const measured = {
		width: toPositiveInteger(result.maxLineWidth),
		height: toPositiveInteger(result.lineCount * lineHeight),
	};

	measureCache.set(key, measured);

	return measured;
}

export function resetMeasureCache(): void {
	measureCache.clear();
}
