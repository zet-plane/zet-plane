import type {
	EdgeResponse,
	KnowledgeEntryResponse,
	NodeResponse,
} from "@zet-plane/contracts";

import { aggregateStatus } from "./aggregate-status";
import { canvasView } from "./canvas-view";
import type { ProjectGraph } from "./types";

export type KnowledgeSummary = {
	count: number;
	pitfallCount: number;
	categories: KnowledgeEntryResponse["category"][];
};

export type AttentionGroup = {
	label: "Blocked" | "Blocked inside" | "Checkpoints" | "Staging";
	nodes: NodeResponse[];
};

export type ContextGraphSummary = {
	nodeCount: number;
	blockedCount: number;
	checkpointCount: number;
	stagingCount: number;
	dependencyCount: number;
	evidenceCount: number;
	pitfallCount: number;
	categories: KnowledgeEntryResponse["category"][];
};

export type GraphWorkbenchFilters = {
	status: NodeResponse["status"] | null;
	type: NodeResponse["type"] | null;
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

export function isLeafNode(
	graph: ProjectGraph,
	nodeId: NodeResponse["id"],
): boolean {
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

export function getOneHopNodeIds(
	edges: EdgeResponse[],
	nodeId: NodeResponse["id"],
): Set<NodeResponse["id"]> {
	const ids = new Set<NodeResponse["id"]>([nodeId]);
	for (const edge of edges) {
		if (edge.type !== "dependency") continue;
		if (edge.fromId === nodeId) ids.add(edge.toId);
		else if (edge.toId === nodeId) ids.add(edge.fromId);
	}
	return ids;
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
		pitfallCount: matching.filter((entry) => entry.category === "pitfall")
			.length,
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

export function getContextNodeIds(
	graph: ProjectGraph,
	focusedNodeId: NodeResponse["id"] | null,
): Set<NodeResponse["id"]> {
	const view = canvasView(graph, focusedNodeId);
	const ids = new Set<NodeResponse["id"]>([view.hero.id]);

	for (const child of view.children) {
		ids.add(child.id);
	}

	for (const stub of view.peripheralStubs) {
		ids.add(stub.external.id);
	}

	if (view.isTopLevel) {
		for (const node of graph.nodes) {
			if (node.role === "staging_root" || node.type === "staging") {
				ids.add(node.id);
			}
		}
	}

	return ids;
}

export function getContextNodes(
	graph: ProjectGraph,
	focusedNodeId: NodeResponse["id"] | null,
): NodeResponse[] {
	const ids = getContextNodeIds(graph, focusedNodeId);
	return graph.nodes.filter((node) => ids.has(node.id));
}

export function buildAttentionGroups(
	graph: ProjectGraph,
	focusedNodeId: NodeResponse["id"] | null,
	filters: GraphWorkbenchFilters = { status: null, type: null },
): AttentionGroup[] {
	const heroId = canvasView(graph, focusedNodeId).hero.id;
	const contextNodes = getContextNodes(graph, focusedNodeId).filter(
		(node) => node.id !== heroId,
	);
	const aggregateById = aggregateStatus(graph);
	const filteredNodes = contextNodes.filter((node) =>
		nodeMatchesFilters(node, filters),
	);
	const blocked = filteredNodes.filter((node) => node.status === "blocked");
	const blockedInside = filteredNodes.filter(
		(node) =>
			node.status !== "blocked" &&
			!node.isProjectRoot &&
			node.role !== "project_root" &&
			aggregateById.get(node.id)?.worst === "blocked",
	);
	const blockedInsideIds = new Set(blockedInside.map((node) => node.id));
	const checkpoints = filteredNodes.filter(
		(node) =>
			node.isCheckpoint &&
			node.status !== "blocked" &&
			!blockedInsideIds.has(node.id),
	);
	const staging = filteredNodes.filter(
		(node) => node.role === "staging_root" || node.type === "staging",
	);

	const groups: AttentionGroup[] = [
		{ label: "Blocked", nodes: blocked },
		{ label: "Blocked inside", nodes: blockedInside },
		{ label: "Checkpoints", nodes: checkpoints },
		{ label: "Staging", nodes: staging },
	];

	return groups.filter((group) => group.nodes.length > 0);
}

export function nodeMatchesFilters(
	node: NodeResponse,
	filters: Partial<GraphWorkbenchFilters>,
): boolean {
	if (filters.status != null && node.status !== filters.status) return false;
	if (filters.type != null && node.type !== filters.type) return false;
	return true;
}

export function getContextGraphSummary(
	graph: ProjectGraph,
	entries: KnowledgeEntryResponse[],
	focusedNodeId: NodeResponse["id"] | null,
): ContextGraphSummary {
	const contextIds = getContextNodeIds(graph, focusedNodeId);
	const nodes = graph.nodes.filter((node) => contextIds.has(node.id));
	const contextEntries = entries.filter((entry) =>
		contextIds.has(entry.nodeId),
	);
	const categories = Array.from(
		new Set(contextEntries.map((entry) => entry.category)),
	).sort();

	return {
		nodeCount: nodes.length,
		blockedCount: nodes.filter((node) => node.status === "blocked").length,
		checkpointCount: nodes.filter((node) => node.isCheckpoint).length,
		stagingCount: nodes.filter(
			(node) => node.role === "staging_root" || node.type === "staging",
		).length,
		dependencyCount: graph.edges.filter(
			(edge) =>
				edge.type === "dependency" &&
				contextIds.has(edge.fromId) &&
				contextIds.has(edge.toId),
		).length,
		evidenceCount: contextEntries.length,
		pitfallCount: contextEntries.filter((entry) => entry.category === "pitfall")
			.length,
		categories,
	};
}
