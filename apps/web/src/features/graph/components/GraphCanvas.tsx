import {
	Background,
	Controls,
	type Edge,
	MiniMap,
	type Node,
	ReactFlow,
	ReactFlowProvider,
	useReactFlow,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import "@xyflow/react/dist/style.css";
import { useGraphViewStore } from "@/stores/graph-view.store";
import type { ProjectGraph } from "../domain/types";
import { useLayoutedGraph } from "../layout/use-layouted-graph";
import { CompositionEdge } from "./CompositionEdge";
import { DependencyEdge } from "./DependencyEdge";
import { EmptyState, ErrorState, LoadingState } from "./EmptyState";
import { NodeCard, type NodeCardData } from "./NodeCard";

const nodeTypes = { node: NodeCard };
const edgeTypes = { composition: CompositionEdge, dependency: DependencyEdge };

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

function CanvasInner({
	graph,
	isLoading,
	error,
	onRetry,
	selectedNodeId,
	onSelectNode,
}: Props) {
	const {
		data: layouted,
		isLayouting,
		error: layoutErr,
	} = useLayoutedGraph(graph);
	const hoveredNodeId = useGraphViewStore((s) => s.hoveredNodeId);
	const setHoveredNodeId = useGraphViewStore((s) => s.setHoveredNodeId);
	const rfApi = useReactFlow();
	const initialCenterDone = useRef(false);

	const focusId = hoveredNodeId ?? selectedNodeId;
	const focusEdgeIds = useMemo(() => {
		if (!focusId || !graph) return new Set<string>();
		const ids = new Set<string>();
		for (const e of graph.edges) {
			if (e.fromId === focusId || e.toId === focusId) ids.add(e.id);
		}
		return ids;
	}, [focusId, graph]);

	const nodesById = useMemo(
		() => new Map(graph?.nodes.map((n) => [n.id, n]) ?? []),
		[graph],
	);

	const onNodeClick = useCallback(
		(_: unknown, n: Node) => onSelectNode(n.id),
		[onSelectNode],
	);
	const onPaneClick = useCallback(() => onSelectNode(null), [onSelectNode]);
	const onNodeMouseEnter = useCallback(
		(_: unknown, n: Node) => setHoveredNodeId(n.id),
		[setHoveredNodeId],
	);
	const onNodeMouseLeave = useCallback(
		() => setHoveredNodeId(null),
		[setHoveredNodeId],
	);

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
		const data: NodeCardData = {
			node: n,
			knowledgeCount: 0,
			selected: selectedNodeId === n.id,
			dimmed: focusId !== null && focusId !== n.id,
		};
		return {
			id: n.id,
			type: "node",
			position: n.position,
			width: n.width,
			height: n.height,
			data: data as Record<string, unknown>,
			selectable: true,
			draggable: false,
		};
	});

	const xyEdges: Edge[] = layouted.edges
		.filter((e) => e.type === "composition" || e.type === "dependency")
		.map((e) => {
			const target = nodesById.get(e.toId);
			const dimmed = focusId !== null && !focusEdgeIds.has(e.id);
			if (e.type === "composition") {
				return {
					id: e.id,
					source: e.fromId,
					target: e.toId,
					type: "composition",
					data: { dimmed } as Record<string, unknown>,
				};
			}
			return {
				id: e.id,
				source: e.fromId,
				target: e.toId,
				type: "dependency",
				data: {
					targetStatus: target?.status ?? "active",
					dimmed,
				} as Record<string, unknown>,
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
