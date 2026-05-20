import type { EdgeResponse, NodeResponse } from "@zet-plane/contracts";

export type ProjectGraph = {
	nodes: NodeResponse[];
	edges: EdgeResponse[];
};

export type AggregateWorstStatus = Exclude<NodeResponse["status"], "archived">;

export type AggregatedStatus = {
	worst: AggregateWorstStatus | null;
	counts: {
		blocked: number;
		active: number;
		completed: number;
		archived: number;
	};
};

export type LayoutedNode = NodeResponse & {
	width: number;
	height: number;
	position: { x: number; y: number };
	parentId: NodeResponse["id"] | null;
};

export type LayoutedAuxiliaryNode = {
	id: string;
	width: number;
	height: number;
	position: { x: number; y: number };
	parentId: string | null;
};

export type LayoutedGraph = {
	nodes: LayoutedNode[];
	edges: EdgeResponse[];
	auxiliaryNodes?: LayoutedAuxiliaryNode[];
};
