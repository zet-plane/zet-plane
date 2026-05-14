import { ReactFlow, Background, Controls, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useProjectGraph } from "../hooks/use-project-graph";
import { useLayoutedGraph } from "../layout/use-layouted-graph";

type Props = { projectId: string };

export function GraphCanvas({ projectId }: Props) {
  const { data: graph, isLoading, error } = useProjectGraph(projectId);
  const { data: layouted, isLayouting } = useLayoutedGraph(graph);

  if (isLoading) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading graph…</div>;
  if (error) return <div className="flex h-full items-center justify-center text-sm text-destructive">{error.message}</div>;
  if (isLayouting || !layouted) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Laying out…</div>;

  const nodes: Node[] = layouted.nodes.map((n) => ({
    id: n.id,
    position: n.position,
    data: { label: n.title },
    parentId: n.parentId ?? undefined,
    extent: n.parentId ? ("parent" as const) : undefined,
    width: n.width,
    height: n.height,
    style: n.parentId
      ? undefined
      : layouted.nodes.some((m) => m.parentId === n.id)
        ? { width: n.width, height: n.height, background: "rgba(0,0,0,0.02)", border: "1px solid var(--border)" }
        : undefined,
  }));

  const edges: Edge[] = layouted.edges
    .filter((e) => e.type === "dependency")
    .map((e) => ({ id: e.id, source: e.fromId, target: e.toId }));

  return (
    <div className="h-full w-full">
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
