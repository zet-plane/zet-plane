import { describe, expect, it } from "vitest";
import { formatUpdatedAgo } from "./UpdatedAgo";

describe("formatUpdatedAgo", () => {
	it("renders 'just now' under 5 seconds", () => {
		expect(formatUpdatedAgo(2)).toBe("just now");
	});
	it("renders seconds under a minute", () => {
		expect(formatUpdatedAgo(30)).toBe("Updated 30s ago");
	});
	it("renders minutes under an hour", () => {
		expect(formatUpdatedAgo(125)).toBe("Updated 2m ago");
	});
	it("renders hours otherwise", () => {
		expect(formatUpdatedAgo(7200)).toBe("Updated 2h ago");
	});
});
