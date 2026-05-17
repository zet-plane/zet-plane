import { describe, expect, it } from "vitest";
import { topologyHash } from "./topology-hash";
import type { ProjectGraph } from "./types";

const g = (
	n: { id: string; pid?: string; title?: string }[],
	e: {
		id: string;
		from: string;
		to: string;
		type?: "composition" | "dependency";
	}[],
): ProjectGraph => ({
	nodes: n.map(({ id, title }) => ({
		id,
		projectId: "p",
		isProjectRoot: false,
		role: "regular",
		type: "scaffold",
		title: title ?? id,
		description: null,
		status: "active",
		isCheckpoint: false,
		checkpointResolution: null,
		createdBy: "human",
		createdAt: "2026-05-14T00:00:00Z",
		updatedAt: "2026-05-14T00:00:00Z",
	})),
	edges: e.map(({ id, from, to, type }) => ({
		id,
		projectId: "p",
		fromId: from,
		toId: to,
		type: type ?? "composition",
		createdBy: "human",
		createdAt: "2026-05-14T00:00:00Z",
	})),
});

describe("topologyHash", () => {
	it("is stable across array reorderings", () => {
		const a = g(
			[{ id: "n1" }, { id: "n2" }],
			[{ id: "e1", from: "n1", to: "n2" }],
		);
		const b = g(
			[{ id: "n2" }, { id: "n1" }],
			[{ id: "e1", from: "n1", to: "n2" }],
		);
		expect(topologyHash(a)).toBe(topologyHash(b));
	});

	it("changes when a node is added", () => {
		const a = g([{ id: "n1" }], []);
		const b = g([{ id: "n1" }, { id: "n2" }], []);
		expect(topologyHash(a)).not.toBe(topologyHash(b));
	});

	it("changes when an edge type changes", () => {
		const a = g(
			[{ id: "n1" }, { id: "n2" }],
			[{ id: "e1", from: "n1", to: "n2", type: "composition" }],
		);
		const b = g(
			[{ id: "n1" }, { id: "n2" }],
			[{ id: "e1", from: "n1", to: "n2", type: "dependency" }],
		);
		expect(topologyHash(a)).not.toBe(topologyHash(b));
	});

	it("does NOT change when only node title changes", () => {
		const a = g([{ id: "n1", title: "A" }], []);
		const b = g([{ id: "n1", title: "B" }], []);
		expect(topologyHash(a)).toBe(topologyHash(b));
	});
});
