import { describe, expect, it } from "vitest";
import { edgeStatusClass, nodeStatusClass } from "./status-classes";

describe("nodeStatusClass", () => {
	it("returns zp-pill-- prefixed class for each status", () => {
		expect(nodeStatusClass("active")).toBe("zp-pill--active");
		expect(nodeStatusClass("blocked")).toBe("zp-pill--blocked");
		expect(nodeStatusClass("completed")).toBe("zp-pill--completed");
		expect(nodeStatusClass("archived")).toBe("zp-pill--archived");
	});
});

describe("edgeStatusClass", () => {
	it("returns blocked for blocked or archived targets", () => {
		expect(edgeStatusClass("blocked")).toBe("zp-edge--blocked");
		expect(edgeStatusClass("archived")).toBe("zp-edge--blocked");
	});
	it("returns completed for completed targets", () => {
		expect(edgeStatusClass("completed")).toBe("zp-edge--completed");
	});
	it("returns active for active targets", () => {
		expect(edgeStatusClass("active")).toBe("zp-edge--active");
	});
});
