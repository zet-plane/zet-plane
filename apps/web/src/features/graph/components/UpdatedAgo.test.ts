import { describe, expect, it } from "vitest";
import { formatUpdatedAgo } from "./UpdatedAgo";

const t = (key: string, options?: Record<string, unknown>) => {
	if (key === "state.justNow") return "just now";
	if (key === "time.updatedAt") return `Updated ${options?.time}`;
	return key;
};

describe("formatUpdatedAgo", () => {
	it("renders 'just now' under 5 seconds", () => {
		expect(formatUpdatedAgo("en", 2, t)).toBe("just now");
	});
	it("renders seconds under a minute", () => {
		expect(formatUpdatedAgo("en", 30, t)).toBe("Updated 30 seconds ago");
	});
	it("renders minutes under an hour", () => {
		expect(formatUpdatedAgo("en", 125, t)).toBe("Updated 2 minutes ago");
	});
	it("renders hours otherwise", () => {
		expect(formatUpdatedAgo("en", 7200, t)).toBe("Updated 2 hours ago");
	});
});
