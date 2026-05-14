import { useMemo, useCallback } from "react";
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useProjectGraph } from "../hooks/use-project-graph";
import { useLayoutedGraph } from "../layout/use-layouted-graph";
import { aggregateStatus } from "../domain/aggregate-status";
import { useGraphViewStore } from "@/stores/graph-view.store";
import { NodeCard, type NodeCardData } from "./NodeCard";
import { ContainerCard, type ContainerCardData } from "./ContainerCard";
import { DependencyEdge } from "./DependencyEdge";
import { EmptyState, LoadingState, ErrorState } from "./EmptyState";

const nodeTypes = { node: NodeCard, container: ContainerCard };
const edgeTypes = { dependency: DependencyEdge };

type Props = { projectId: string };

export function GraphCanvas({ projectId }: Props) {
  const { data: graph, isLoading, error } = useProjectGraph(projectId);
  const { data: layouted, isLayouting, error: layoutErr } = useLayoutedGraph(graph);
  const search = useSearch({ from: "/projects/$projectId/graph" });
  const navigate = useNavigate({ from: "/projects/$projectId/graph" });
  const hoveredNodeId = useGraphViewStore((s) => s.hoveredNodeId);
  const setHoveredNodeId = useGraphViewStore((s) => s.setHoveredNodeId);

  const aggregation = useMemo(() => (graph ? aggregateStatus(graph) : new Map()), [graph]);
  const isContainer = useMemo(() => {
    const set = new Set<string>();
    if (layouted) for (const n of layouted.nodes) if (n.parentId) set.add(n.parentId);
    return set;
  }, [layouted]);

  const focusId = hoveredNodeId ?? search.nodeId ?? null;
  const focusOutgoing = useMemo(() => {
    if (!focusId || !graph) return new Set<string>();
    const ids = new Set<string>();
    for (const e of graph.edges) {
      if (e.type === "dependency" && (e.fromId === focusId || e.toId === focusId)) ids.add(e.id);
    }
    return ids;
  }, [focusId, graph]);

  const nodesById = useMemo(() => new Map(graph?.nodes.map((n) => [n.id, n]) ?? []), [graph]);

  const onNodeClick = useCallback(
    (_: unknown, n: Node) => {
      navigate({ search: (prev) => ({ ...prev, nodeId: n.id }) });
    },
    [navigate],
  );
  const onPaneClick = useCallback(() => {
    navigate({ search: (prev) => ({ ...prev, nodeId: undefined }) });
  }, [navigate]);
  const onNodeMouseEnter = useCallback((_: unknown, n: Node) => setHoveredNodeId(n.id), [setHoveredNodeId]);
  const onNodeMouseLeave = useCallback(() => setHoveredNodeId(null), [setHoveredNodeId]);

  if (isLoading) return <LoadingState message="Loading graph…" />;
  if (error) return <ErrorState error={error} />;
  if (layoutErr) return <ErrorState error={layoutErr} />;
  if (isLayouting || !layouted) return <LoadingState message="Laying out…" />;
  if (layouted.nodes.length === 0) return <EmptyState />;

  const xyNodes: Node[] = layouted.nodes.map((n) => {
    const isParent = isContainer.has(n.id);
    const data: NodeCardData | ContainerCardData = isParent
      ? {
          node: n,
          aggregation: aggregation.get(n.id) ?? { worst: null, counts: { blocked: 0, active: 0, completed: 0, archived: 0 } },
          knowledgeCount: 0,
          selected: search.nodeId === n.id,
          dimmed: focusId !== null && focusId !== n.id,
        }
      : {
          node: n,
          knowledgeCount: 0,
          selected: search.nodeId === n.id,
          dimmed: focusId !== null && focusId !== n.id,
        };
    return {
      id: n.id,
      type: isParent ? "container" : "node",
      position: n.position,
      width: n.width,
      height: n.height,
      parentId: n.parentId ?? undefined,
      extent: n.parentId ? ("parent" as const) : undefined,
      data: data as Record<string, unknown>,
      selectable: true,
      draggable: false,
    };
  });

  const xyEdges: Edge[] = layouted.edges
    .filter((e) => e.type === "dependency")
    .map((e) => {
      const target = nodesById.get(e.toId);
      const dimmed = focusId !== null && !focusOutgoing.has(e.id);
      return {
        id: e.id,
        source: e.fromId,
        target: e.toId,
        type: "dependency",
        data: { targetStatus: target?.status ?? "active", dimmed },
      };
    });

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={xyNodes}
        edges={xyEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <MiniMap zoomable pannable />
      </ReactFlow>
    </div>
  );
}

GraphCanvas.displayName = "GraphCanvas";
