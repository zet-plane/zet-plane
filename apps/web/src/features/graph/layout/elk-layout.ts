import ELK, {
	type ElkExtendedEdge,
	type ElkNode,
	type LayoutOptions,
} from "elkjs/lib/elk.bundled.js";

export type LayoutInputNode = {
	id: string;
	width: number;
	height: number;
	parentId: string | null;
};

export type LayoutInputEdge = {
	id: string;
	fromId: string;
	toId: string;
};

export type LayoutInput = {
	nodes: LayoutInputNode[];
	edges: LayoutInputEdge[];
};

export type LayoutOutput = {
	nodes: {
		id: string;
		position: { x: number; y: number };
		width: number;
		height: number;
	}[];
};

const elk = new ELK();
const ELK_ROOT_ID = "__zet-plane-elk-root__";

const COMMON_OPTIONS: LayoutOptions = {
	"elk.algorithm": "layered",
	"elk.direction": "DOWN",
	"elk.hierarchyHandling": "INCLUDE_CHILDREN",
	"elk.layered.spacing.nodeNodeBetweenLayers": "48",
	"elk.spacing.nodeNode": "32",
	"elk.padding": "[top=32,left=24,right=24,bottom=24]",
};

function toElkEdge(edge: LayoutInputEdge): ElkExtendedEdge {
	return {
		id: edge.id,
		sources: [edge.fromId],
		targets: [edge.toId],
	};
}

function createGraph(input: LayoutInput): ElkNode {
	const graph: ElkNode = {
		id: ELK_ROOT_ID,
		layoutOptions: COMMON_OPTIONS,
		children: [],
		edges: input.edges.map(toElkEdge),
	};

	const nodesById = new Map<string, ElkNode>();

	for (const node of input.nodes) {
		const elkNode: ElkNode = {
			id: node.id,
			width: node.width,
			height: node.height,
			children: [],
		};

		nodesById.set(node.id, elkNode);
	}

	for (const node of input.nodes) {
		const elkNode = nodesById.get(node.id);

		if (elkNode === undefined) {
			continue;
		}

		if (node.parentId === null) {
			graph.children!.push(elkNode);
			continue;
		}

		const parentNode = nodesById.get(node.parentId);

		if (parentNode === undefined) {
			graph.children!.push(elkNode);
			continue;
		}

		parentNode.children ??= [];
		parentNode.children.push(elkNode);
	}

	return graph;
}

function collectNodes(node: ElkNode, acc: LayoutOutput["nodes"]): void {
	if (node.id !== ELK_ROOT_ID) {
		acc.push({
			id: node.id,
			position: {
				x: Math.max(0, Math.round(node.x ?? 0)),
				y: Math.max(0, Math.round(node.y ?? 0)),
			},
			width: Math.max(1, Math.round(node.width ?? 1)),
			height: Math.max(1, Math.round(node.height ?? 1)),
		});
	}

	for (const child of node.children ?? []) {
		collectNodes(child, acc);
	}
}

export async function layoutGraph(input: LayoutInput): Promise<LayoutOutput> {
	const result = await elk.layout(createGraph(input));
	const nodes: LayoutOutput["nodes"] = [];

	collectNodes(result, nodes);

	return { nodes };
}
