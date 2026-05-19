import type {
	EdgeResponse,
	KnowledgeEntryResponse,
	NodeResponse,
} from "@zet-plane/contracts";
import { describe, expect, it } from "vitest";
import {
	buildAttentionGroups,
	buildCompositionParentMap,
	countCompositionChildren,
	getContextGraphSummary,
	getContextNodeIds,
	getKnowledgeSummary,
	getNodeById,
	getOneHopEdgeIds,
	isLeafNode,
} from "./graph-workbench";
import type { ProjectGraph } from "./types";

const mkNode = (
	id: string,
	overrides: Partial<{
		isProjectRoot: boolean;
		type: NodeResponse["type"];
		title: string;
		status: NodeResponse["status"];
		isCheckpoint: boolean;
		role: NodeResponse["role"];
	}> = {},
): NodeResponse => ({
	id,
	projectId: "p",
	isProjectRoot: overrides.isProjectRoot ?? false,
	role:
		overrides.role ?? (overrides.isProjectRoot ? "project_root" : "regular"),
	type: overrides.type ?? "growth",
	title: overrides.title ?? id,
	description: null,
	status: overrides.status ?? "active",
	isCheckpoint: overrides.isCheckpoint ?? false,
	checkpointResolution: null,
	createdBy: "human",
	createdAt: "2026-05-16T00:00:00.000Z",
	updatedAt: "2026-05-16T00:00:00.000Z",
});

const mkEdge = (
	id: string,
	fromId: string,
	toId: string,
	type: EdgeResponse["type"],
): EdgeResponse => ({
	id,
	projectId: "p",
	fromId,
	toId,
	type,
	createdBy: "human",
	createdAt: "2026-05-16T00:00:00.000Z",
});

const mkEntry = (
	id: string,
	nodeId: string,
	category: KnowledgeEntryResponse["category"],
): KnowledgeEntryResponse => ({
	id,
	projectId: "p",
	nodeId,
	category,
	title: id,
	body: {},
	status: "published",
	embeddingStatus: "indexed",
	createdBy: "human",
	createdAt: "2026-05-16T00:00:00.000Z",
	updatedAt: "2026-05-16T00:00:00.000Z",
});

describe("graphWorkbench helpers", () => {
	it("builds composition parent ids by child id", () => {
		const graph: ProjectGraph = {
			nodes: [mkNode("parent"), mkNode("leaf")],
			edges: [mkEdge("e-parent", "parent", "leaf", "composition")],
		};

		expect(buildCompositionParentMap(graph).get("leaf")).toBe("parent");
	});

	it("counts direct composition children by parent id", () => {
		const graph: ProjectGraph = {
			nodes: [mkNode("parent"), mkNode("leaf"), mkNode("dependent")],
			edges: [
				mkEdge("e-child", "parent", "leaf", "composition"),
				mkEdge("e-dependency", "parent", "dependent", "dependency"),
			],
		};

		expect(countCompositionChildren(graph).get("parent")).toBe(1);
	});

	it("detects whether a node has no composition children", () => {
		const graph: ProjectGraph = {
			nodes: [mkNode("parent"), mkNode("leaf")],
			edges: [mkEdge("e-parent", "parent", "leaf", "composition")],
		};

		expect(isLeafNode(graph, "leaf")).toBe(true);
		expect(isLeafNode(graph, "parent")).toBe(false);
	});

	it("summarizes knowledge entries with sorted categories", () => {
		const entries = [
			mkEntry("e1", "n1", "pitfall"),
			mkEntry("e2", "n1", "decision"),
			mkEntry("e3", "n2", "finding"),
		];

		expect(getKnowledgeSummary(entries, "n1")).toEqual({
			count: 2,
			pitfallCount: 1,
			categories: ["decision", "pitfall"],
		});
	});

	it("returns one-hop dependency edge ids for a node", () => {
		const graph: ProjectGraph = {
			nodes: [
				mkNode("n1"),
				mkNode("source"),
				mkNode("target"),
				mkNode("child"),
			],
			edges: [
				mkEdge("e-in", "source", "n1", "dependency"),
				mkEdge("e-out", "n1", "target", "dependency"),
				mkEdge("e-compose", "n1", "child", "composition"),
				mkEdge("e-other", "source", "target", "dependency"),
			],
		};

		expect(getOneHopEdgeIds(graph.edges, "n1")).toEqual(
			new Set(["e-in", "e-out"]),
		);
	});

	it("returns only direct incoming and outgoing dependencies for a middle node", () => {
		const graph: ProjectGraph = {
			nodes: [
				mkNode("source"),
				mkNode("middle"),
				mkNode("target"),
				mkNode("two-hop-target"),
			],
			edges: [
				mkEdge("in", "source", "middle", "dependency"),
				mkEdge("out", "middle", "target", "dependency"),
				mkEdge("two-hop", "target", "two-hop-target", "dependency"),
			],
		};

		expect(getOneHopEdgeIds(graph.edges, "middle")).toEqual(
			new Set(["in", "out"]),
		);
		expect(getOneHopEdgeIds(graph.edges, "middle").has("two-hop")).toBe(false);
	});

	it("returns the matching node or null when no node id is selected", () => {
		const nodes = [mkNode("n1"), mkNode("n2")];

		expect(getNodeById(nodes, "n2")?.id).toBe("n2");
		expect(getNodeById(nodes, null)).toBeNull();
		expect(getNodeById(nodes, undefined)).toBeNull();
		expect(getNodeById(nodes, "missing")).toBeNull();
	});

	it("returns the nodes represented by the current focused canvas context", () => {
		const graph: ProjectGraph = {
			nodes: [
				mkNode("root", { isProjectRoot: true }),
				mkNode("parent", { type: "scaffold" }),
				mkNode("visible-child"),
				mkNode("external"),
				mkNode("staging", { type: "staging", role: "staging_root" }),
				mkNode("unrelated-blocked", { status: "blocked" }),
			],
			edges: [
				mkEdge("c-parent", "root", "parent", "composition"),
				mkEdge("c-child", "parent", "visible-child", "composition"),
				mkEdge("d-external", "visible-child", "external", "dependency"),
			],
		};

		expect(getContextNodeIds(graph, "parent")).toEqual(
			new Set(["parent", "visible-child", "external"]),
		);
		expect(getContextNodeIds(graph, null)).toEqual(
			new Set(["root", "parent", "staging"]),
		);
	});

	it("builds grouped attention items from the current context only", () => {
		const graph: ProjectGraph = {
			nodes: [
				mkNode("root", { isProjectRoot: true }),
				mkNode("parent", { type: "scaffold" }),
				mkNode("blocked-child", { status: "blocked" }),
				mkNode("checkpoint-child", { isCheckpoint: true }),
				mkNode("staging-child", { type: "staging", role: "staging_root" }),
				mkNode("outside-blocked", { status: "blocked" }),
			],
			edges: [
				mkEdge("c-parent", "root", "parent", "composition"),
				mkEdge("c-blocked", "parent", "blocked-child", "composition"),
				mkEdge("c-checkpoint", "parent", "checkpoint-child", "composition"),
			],
		};

		expect(buildAttentionGroups(graph, "parent")).toEqual([
			{ label: "Blocked", nodes: [graph.nodes[2]] },
			{ label: "Checkpoints", nodes: [graph.nodes[3]] },
		]);
		expect(
			buildAttentionGroups(graph, null).find(
				(group) => group.label === "Staging",
			)?.nodes,
		).toEqual([graph.nodes[4]]);
	});

	it("summarizes the current context instead of the whole graph", () => {
		const entries = [
			mkEntry("e-visible", "visible", "decision"),
			mkEntry("e-hidden", "hidden", "pitfall"),
		];
		const graph: ProjectGraph = {
			nodes: [
				mkNode("root", { isProjectRoot: true }),
				mkNode("parent", { type: "scaffold" }),
				mkNode("visible", { status: "blocked" }),
				mkNode("hidden", { status: "blocked" }),
			],
			edges: [
				mkEdge("c-parent", "root", "parent", "composition"),
				mkEdge("c-visible", "parent", "visible", "composition"),
				mkEdge("d-visible", "visible", "parent", "dependency"),
				mkEdge("d-hidden", "hidden", "root", "dependency"),
			],
		};

		expect(getContextGraphSummary(graph, entries, "parent")).toEqual({
			nodeCount: 2,
			blockedCount: 1,
			checkpointCount: 0,
			stagingCount: 0,
			dependencyCount: 1,
			evidenceCount: 1,
			pitfallCount: 0,
			categories: ["decision"],
		});
	});
});
