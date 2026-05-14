import type { EdgeResponse, NodeResponse } from "@zet-plane/contracts";

export type ProjectGraph = {
  nodes: NodeResponse[];
  edges: EdgeResponse[];
};

export type AggregatedStatus = {
  worst: NodeResponse["status"] | null;
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

export type LayoutedGraph = {
  nodes: LayoutedNode[];
  edges: EdgeResponse[];
};
