import { describe, expect, it } from "vitest";
import {
	formatAppDateTime,
	formatAppRelativeTime,
	getUpdatedAgoRelativeTime,
} from "./format";

describe("localized formatting", () => {
	it("formats relative updated time as Intl parts", () => {
		expect(getUpdatedAgoRelativeTime(2)).toEqual({ kind: "now" });
		expect(getUpdatedAgoRelativeTime(30)).toEqual({
			kind: "relative",
			value: -30,
			unit: "second",
		});
		expect(getUpdatedAgoRelativeTime(125)).toEqual({
			kind: "relative",
			value: -2,
			unit: "minute",
		});
		expect(getUpdatedAgoRelativeTime(7200)).toEqual({
			kind: "relative",
			value: -2,
			unit: "hour",
		});
	});

	it("uses Intl.RelativeTimeFormat for each app language", () => {
		expect(formatAppRelativeTime("en", 125)).toBe("2 minutes ago");
		expect(formatAppRelativeTime("zh-CN", 125)).toBe("2分钟前");
	});

	it("uses Intl.DateTimeFormat for app dates", () => {
		const date = new Date("2026-05-19T12:34:00.000Z");

		expect(formatAppDateTime("en", date)).toContain("2026");
		expect(formatAppDateTime("zh-CN", date)).toContain("2026");
	});
});
