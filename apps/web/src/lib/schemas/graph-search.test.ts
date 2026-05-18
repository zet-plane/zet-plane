import { describe, expect, it } from "vitest";
import { graphSearchSchema } from "./graph-search";

describe("graphSearchSchema", () => {
	it("defaults missing view to diagnose", () => {
		expect(graphSearchSchema.parse({})).toEqual({ view: "diagnose" });
	});

	it("accepts explore view, query, focus, nodeId, and knowledge nodes mode", () => {
		expect(
			graphSearchSchema.parse({
				view: "explore",
				query: "redis ttl",
				focus: "n-parent",
				nodeId: "n-child",
				knowledge: "nodes",
			}),
		).toEqual({
			view: "explore",
			query: "redis ttl",
			focus: "n-parent",
			nodeId: "n-child",
			knowledge: "nodes",
		});
	});

	it("falls back to diagnose for unknown view values", () => {
		expect(graphSearchSchema.parse({ view: "inspect" })).toEqual({
			view: "diagnose",
		});
	});

	it("strips unknown knowledge values by returning summary mode", () => {
		expect(graphSearchSchema.parse({ knowledge: "all" })).toEqual({
			view: "diagnose",
		});
	});

	it("accepts a nodeId and focus", () => {
		expect(graphSearchSchema.parse({ nodeId: "n1", focus: "n2" })).toEqual({
			view: "diagnose",
			nodeId: "n1",
			focus: "n2",
		});
	});

	it("strips unknown keys", () => {
		expect(graphSearchSchema.parse({ nodeId: "n1", zoom: 2 })).toEqual({
			view: "diagnose",
			nodeId: "n1",
		});
	});

	it("rejects non-string nodeId", () => {
		expect(() => graphSearchSchema.parse({ nodeId: 5 })).toThrow();
	});

	it("rejects an empty nodeId", () => {
		expect(() => graphSearchSchema.parse({ nodeId: "" })).toThrow();
	});

	it("rejects non-string focus", () => {
		expect(() => graphSearchSchema.parse({ focus: 5 })).toThrow();
	});

	it("rejects an empty focus", () => {
		expect(() => graphSearchSchema.parse({ focus: "" })).toThrow();
	});
});
