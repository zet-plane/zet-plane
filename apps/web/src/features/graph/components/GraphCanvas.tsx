import { useMemo, useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useLayoutedGraph } from "../layout/use-layouted-graph";
import { aggregateStatus } from "../domain/aggregate-status";
import { useGraphViewStore } from "@/stores/graph-view.store";
import type { ProjectGraph } from "../domain/types";
import { NodeCard, type NodeCardData } from "./NodeCard";
import { ContainerCard, type ContainerCardData } from "./ContainerCard";
import { DependencyEdge } from "./DependencyEdge";
import { EmptyState, LoadingState, ErrorState } from "./EmptyState";

const nodeTypes = { node: NodeCard, container: ContainerCard };
const edgeTypes = { dependency: DependencyEdge };

type Props = {
  graph: ProjectGraph | undefined;
  isLoading: boolean;
  error: Error | null;
  onRetry?: () => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
};

export function GraphCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ graph, isLoading, error, onRetry, selectedNodeId, onSelectNode }: Props) {
  const { data: layouted, isLayouting, error: layoutErr } = useLayoutedGraph(graph);
  const hoveredNodeId = useGraphViewStore((s) => s.hoveredNodeId);
  const setHoveredNodeId = useGraphViewStore((s) => s.setHoveredNodeId);
  const rfApi = useReactFlow();
  const initialCenterDone = useRef(false);

  const aggregation = useMemo(() => (graph ? aggregateStatus(graph) : new Map()), [graph]);
  const isContainer = useMemo(() => {
    const set = new Set<string>();
    if (layouted) for (const n of layouted.nodes) if (n.parentId) set.add(n.parentId);
    return set;
  }, [layouted]);

  const focusId = hoveredNodeId ?? selectedNodeId;
  const focusEdgeIds = useMemo(() => {
    if (!focusId || !graph) return new Set<string>();
    const ids = new Set<string>();
    for (const e of graph.edges) {
      if (e.type === "dependency" && (e.fromId === focusId || e.toId === focusId)) ids.add(e.id);
    }
    return ids;
  }, [focusId, graph]);

  const nodesById = useMemo(() => new Map(graph?.nodes.map((n) => [n.id, n]) ?? []), [graph]);

  const onNodeClick = useCallback((_: unknown, n: Node) => onSelectNode(n.id), [onSelectNode]);
  const onPaneClick = useCallback(() => onSelectNode(null), [onSelectNode]);
  const onNodeMouseEnter = useCallback((_: unknown, n: Node) => setHoveredNodeId(n.id), [setHoveredNodeId]);
  const onNodeMouseLeave = useCallback(() => setHoveredNodeId(null), [setHoveredNodeId]);

  useEffect(() => {
    if (initialCenterDone.current) return;
    if (!layouted) return;
    if (!selectedNodeId) {
      rfApi.fitView({ padding: 0.1 });
      initialCenterDone.current = true;
      return;
    }
    const target = layouted.nodes.find((n) => n.id === selectedNodeId);
    if (target) {
      rfApi.setCenter(
        target.position.x + target.width / 2,
        target.position.y + target.height / 2,
        { zoom: 1.2, duration: 400 },
      );
      initialCenterDone.current = true;
    }
  }, [layouted, selectedNodeId, rfApi]);

  if (isLoading) return <LoadingState message="Loading graph…" />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (layoutErr) return <ErrorState error={layoutErr} />;
  if (isLayouting || !layouted) return <LoadingState message="Laying out…" />;
  if (layouted.nodes.length <= 1) return <EmptyState rootOnly />;

  const xyNodes: Node[] = layouted.nodes.map((n) => {
    const isParent = isContainer.has(n.id);
    const data: NodeCardData | ContainerCardData = isParent
      ? {
          node: n,
          aggregation: aggregation.get(n.id) ?? {
            worst: null,
            counts: { blocked: 0, active: 0, completed: 0, archived: 0 },
          },
          knowledgeCount: 0,
          selected: selectedNodeId === n.id,
          dimmed: focusId !== null && focusId !== n.id,
        }
      : {
          node: n,
          knowledgeCount: 0,
          selected: selectedNodeId === n.id,
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
      const dimmed = focusId !== null && !focusEdgeIds.has(e.id);
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
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <MiniMap
          zoomable
          pannable
          nodeColor={(n) => {
            const d = n.data as { node?: { status?: string } } | undefined;
            const s = d?.node?.status;
            if (s === "blocked") return "var(--zp-status-blocked)";
            if (s === "completed") return "var(--zp-status-completed)";
            if (s === "archived") return "var(--zp-status-archived)";
            return "var(--zp-status-active)";
          }}
        />
      </ReactFlow>
    </div>
  );
}
