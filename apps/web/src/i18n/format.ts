import type { AppLanguage } from "./languages";

type RelativeTimeParts =
	| { kind: "now" }
	| { kind: "relative"; value: number; unit: Intl.RelativeTimeFormatUnit };

export function getUpdatedAgoRelativeTime(
	secondsAgo: number,
): RelativeTimeParts {
	if (secondsAgo < 5) return { kind: "now" };
	if (secondsAgo < 60) {
		return { kind: "relative", value: -Math.floor(secondsAgo), unit: "second" };
	}
	if (secondsAgo < 3600) {
		return {
			kind: "relative",
			value: -Math.floor(secondsAgo / 60),
			unit: "minute",
		};
	}

	return {
		kind: "relative",
		value: -Math.floor(secondsAgo / 3600),
		unit: "hour",
	};
}

export function formatAppRelativeTime(
	language: AppLanguage,
	secondsAgo: number,
) {
	const parts = getUpdatedAgoRelativeTime(secondsAgo);
	if (parts.kind === "now") return null;

	return new Intl.RelativeTimeFormat(language, { numeric: "auto" }).format(
		parts.value,
		parts.unit,
	);
}

export function formatAppDateTime(language: AppLanguage, date: Date | string) {
	return new Intl.DateTimeFormat(language, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(date));
}

export function formatAppDate(language: AppLanguage, date: Date | string) {
	return new Intl.DateTimeFormat(language, {
		dateStyle: "medium",
	}).format(new Date(date));
}
