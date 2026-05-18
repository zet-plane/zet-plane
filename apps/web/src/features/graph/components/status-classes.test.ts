import { describe, expect, it } from "vitest";
import { edgeStateClass, nodeStatusClass } from "./status-classes";

describe("nodeStatusClass", () => {
	it("returns zp-pill-- prefixed class for each status", () => {
		expect(nodeStatusClass("active")).toBe("zp-pill--active");
		expect(nodeStatusClass("blocked")).toBe("zp-pill--blocked");
		expect(nodeStatusClass("completed")).toBe("zp-pill--completed");
		expect(nodeStatusClass("archived")).toBe("zp-pill--archived");
	});
});

describe("edgeStateClass", () => {
	it("returns neutral, selected, dim, or blocked state classes", () => {
		expect(edgeStateClass({ selected: false, dimmed: false, blocked: false })).toBe("zp-edge--neutral");
		expect(edgeStateClass({ selected: true, dimmed: false, blocked: false })).toBe("zp-edge--selected");
		expect(edgeStateClass({ selected: false, dimmed: true, blocked: false })).toBe("zp-edge--dim");
		expect(edgeStateClass({ selected: false, dimmed: false, blocked: true })).toBe("zp-edge--blocked");
	});

	it("prioritizes selected, blocked, dimmed, then neutral", () => {
		expect(edgeStateClass({ selected: true, dimmed: true, blocked: true })).toBe("zp-edge--selected");
		expect(edgeStateClass({ selected: true, dimmed: true, blocked: false })).toBe("zp-edge--selected");
		expect(edgeStateClass({ selected: false, dimmed: true, blocked: true })).toBe("zp-edge--blocked");
		expect(edgeStateClass({ selected: false, dimmed: true, blocked: false })).toBe("zp-edge--dim");
	});
});
