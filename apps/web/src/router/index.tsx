import { createFileRoute } from "@tanstack/react-router";
import { ReactFlow, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { graphSearchSchema } from "@/lib/schemas/graph-search";

const initialNodes: Node[] = [
  { id: "1", position: { x: 100, y: 100 }, data: { label: "Project Root" } },
  { id: "2", position: { x: 300, y: 250 }, data: { label: "Task A" } },
];

const initialEdges: Edge[] = [
  { id: "e1-2", source: "1", target: "2" },
];

function GraphPage() {
  return (
    <div style={{ width: "100vw", height: "100vh" }} data-testid="graph-canvas">
      <ReactFlow nodes={initialNodes} edges={initialEdges} fitView />
    </div>
  );
}

export const Route = createFileRoute("/")({
  validateSearch: (raw) => graphSearchSchema.parse(raw),
  component: GraphPage,
});
