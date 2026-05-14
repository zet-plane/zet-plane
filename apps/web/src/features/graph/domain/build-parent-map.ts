import type { NodeResponse } from "@zet-plane/contracts";

import type { ProjectGraph } from "./types";

export function buildParentMap(
  graph: ProjectGraph,
): Map<NodeResponse["id"], NodeResponse["id"]> {
  const map = new Map<NodeResponse["id"], NodeResponse["id"]>();

  for (const edge of graph.edges) {
    if (edge.type === "composition") {
      const existingParentId = map.get(edge.toId);

      if (existingParentId !== undefined) {
        throw new Error(
          `Duplicate composition parent for child ${edge.toId}: ${existingParentId} and ${edge.fromId}`,
        );
      }

      map.set(edge.toId, edge.fromId);
    }
  }

  return map;
}
