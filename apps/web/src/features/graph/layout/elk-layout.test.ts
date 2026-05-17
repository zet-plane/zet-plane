import { describe, expect, it } from "vitest";
import { type LayoutInput, layoutGraph } from "./elk-layout";

describe("layoutGraph", () => {
	it("lays out a dependency target below its source", async () => {
		const input: LayoutInput = {
			nodes: [
				{ id: "a", width: 120, height: 48, parentId: null },
				{ id: "b", width: 120, height: 48, parentId: null },
			],
			edges: [{ id: "e1", fromId: "a", toId: "b" }],
		};

		const result = await layoutGraph(input);
		const source = result.nodes.find((node) => node.id === "a");
		const target = result.nodes.find((node) => node.id === "b");

		expect(source).toBeDefined();
		expect(target).toBeDefined();
		expect(target!.position.y).toBeGreaterThan(source!.position.y);
	});

	it("lays out composition descendants below their source without parent containers", async () => {
		const input: LayoutInput = {
			nodes: [
				{ id: "root", width: 160, height: 64, parentId: null },
				{ id: "event", width: 140, height: 52, parentId: null },
				{ id: "branch", width: 140, height: 52, parentId: null },
			],
			edges: [
				{ id: "c1", fromId: "root", toId: "event" },
				{ id: "c2", fromId: "event", toId: "branch" },
			],
		};

		const result = await layoutGraph(input);
		const root = result.nodes.find((node) => node.id === "root");
		const event = result.nodes.find((node) => node.id === "event");
		const branch = result.nodes.find((node) => node.id === "branch");

		expect(root).toBeDefined();
		expect(event).toBeDefined();
		expect(branch).toBeDefined();
		expect(event!.position.y).toBeGreaterThan(root!.position.y);
		expect(branch!.position.y).toBeGreaterThan(event!.position.y);
		expect(root!.height).toBe(64);
	});

	it("keeps child positions non-negative when a parent is provided", async () => {
		const input: LayoutInput = {
			nodes: [
				{ id: "parent", width: 240, height: 120, parentId: null },
				{ id: "child", width: 100, height: 40, parentId: "parent" },
			],
			edges: [],
		};

		const result = await layoutGraph(input);
		const child = result.nodes.find((node) => node.id === "child");

		expect(child).toBeDefined();
		expect(child!.position.x).toBeGreaterThanOrEqual(0);
		expect(child!.position.y).toBeGreaterThanOrEqual(0);
	});

	it("preserves a real node with id root in the output", async () => {
		const input: LayoutInput = {
			nodes: [{ id: "root", width: 160, height: 64, parentId: null }],
			edges: [],
		};

		const result = await layoutGraph(input);

		expect(result.nodes).toEqual([
			expect.objectContaining({
				id: "root",
				width: expect.any(Number),
				height: expect.any(Number),
				position: {
					x: expect.any(Number),
					y: expect.any(Number),
				},
			}),
		]);
	});
});
