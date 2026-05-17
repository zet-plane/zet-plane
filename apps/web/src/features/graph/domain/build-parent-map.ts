import type { NodeResponse } from "@zet-plane/contracts";

import type { ProjectGraph } from "./types";

export function buildParentMap(
	graph: ProjectGraph,
): Map<NodeResponse["id"], NodeResponse["id"]> {
	const map = new Map<NodeResponse["id"], NodeResponse["id"]>();
	const nodeIds = new Set(graph.nodes.map((n) => n.id));

	for (const edge of graph.edges) {
		if (edge.type !== "composition") continue;
		if (!nodeIds.has(edge.fromId)) continue;

		const existingParentId = map.get(edge.toId);

		if (existingParentId !== undefined && existingParentId !== edge.fromId) {
			throw new Error(
				`Duplicate composition parent for child ${edge.toId}: ${existingParentId} and ${edge.fromId}`,
			);
		}

		map.set(edge.toId, edge.fromId);
	}

	return map;
}
