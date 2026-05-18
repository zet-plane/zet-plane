import type {
	EdgeResponse,
	KnowledgeEntryResponse,
	NodeResponse,
} from "@zet-plane/contracts";

import type { ProjectGraph } from "./types";

export type KnowledgeSummary = {
	count: number;
	pitfallCount: number;
	categories: KnowledgeEntryResponse["category"][];
};

export function buildCompositionParentMap(
	graph: ProjectGraph,
): Map<NodeResponse["id"], NodeResponse["id"]> {
	const map = new Map<NodeResponse["id"], NodeResponse["id"]>();

	for (const edge of graph.edges) {
		if (edge.type === "composition") {
			map.set(edge.toId, edge.fromId);
		}
	}

	return map;
}

export function countCompositionChildren(
	graph: ProjectGraph,
): Map<NodeResponse["id"], number> {
	const counts = new Map<NodeResponse["id"], number>();

	for (const edge of graph.edges) {
		if (edge.type === "composition") {
			counts.set(edge.fromId, (counts.get(edge.fromId) ?? 0) + 1);
		}
	}

	return counts;
}

export function isLeafNode(graph: ProjectGraph, nodeId: NodeResponse["id"]): boolean {
	return (countCompositionChildren(graph).get(nodeId) ?? 0) === 0;
}

export function getOneHopEdgeIds(
	edges: EdgeResponse[],
	nodeId: NodeResponse["id"],
): Set<EdgeResponse["id"]> {
	return new Set(
		edges
			.filter(
				(edge) =>
					edge.type === "dependency" &&
					(edge.fromId === nodeId || edge.toId === nodeId),
			)
			.map((edge) => edge.id),
	);
}

export function getKnowledgeSummary(
	entries: KnowledgeEntryResponse[],
	nodeId: NodeResponse["id"],
): KnowledgeSummary {
	const matching = entries.filter((entry) => entry.nodeId === nodeId);
	const categories = Array.from(
		new Set(matching.map((entry) => entry.category)),
	).sort();

	return {
		count: matching.length,
		pitfallCount: matching.filter((entry) => entry.category === "pitfall").length,
		categories,
	};
}

export function getNodeById(
	nodes: NodeResponse[],
	nodeId: NodeResponse["id"] | null | undefined,
): NodeResponse | null {
	if (!nodeId) return null;

	return nodes.find((node) => node.id === nodeId) ?? null;
}
