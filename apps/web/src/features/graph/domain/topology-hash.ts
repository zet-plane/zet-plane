import type { ProjectGraph } from "./types";

export function topologyHash(graph: ProjectGraph): string {
	const nodes = graph.nodes
		.map((node) => node.id)
		.sort()
		.join("|");

	const edges = graph.edges
		.map((edge) => `${edge.id}:${edge.fromId}>${edge.toId}:${edge.type}`)
		.sort()
		.join("|");

	return `${nodes}#${edges}`;
}
