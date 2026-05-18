import type { KnowledgeEntryResponse } from "@zet-plane/contracts";
import { useCallback, useMemo } from "react";
import { canvasView } from "../domain/canvas-view";
import { buildCompositionParentMap } from "../domain/graph-workbench";
import type { ProjectGraph } from "../domain/types";
import { useCanvasNavigation } from "../hooks/use-canvas-navigation";
import { GraphCanvas } from "./GraphCanvas";
import { GraphInspector } from "./GraphInspector";
import { GraphLeftRail } from "./GraphLeftRail";
import { GraphTopBar } from "./GraphTopBar";
import { Legend } from "./Legend";
import { UpdatedAgo } from "./UpdatedAgo";

type GraphView = "diagnose" | "explore";

type GraphWorkbenchProps = {
	projectId: string;
	graph: ProjectGraph | undefined;
	entries: KnowledgeEntryResponse[];
	isLoading: boolean;
	error: Error | null;
	isFetching: boolean;
	dataUpdatedAt: number;
	onRetry: () => void;
	view: GraphView;
	query: string;
	knowledgeNodesVisible: boolean;
	selectedNodeId: string | null;
	onSelectNode: (id: string | null) => void;
	onViewChange: (view: GraphView) => void;
	onQueryChange: (query: string) => void;
	onKnowledgeNodesVisibleChange: (visible: boolean) => void;
};

export function GraphWorkbench({
	projectId,
	graph,
	entries,
	isLoading,
	error,
	isFetching,
	dataUpdatedAt,
	onRetry,
	view,
	query,
	knowledgeNodesVisible,
	selectedNodeId,
	onSelectNode,
	onViewChange,
	onQueryChange,
	onKnowledgeNodesVisibleChange,
}: GraphWorkbenchProps) {
	const { focusedNodeId, diveInto } = useCanvasNavigation();

	const currentCanvasView = useMemo(() => {
		if (!graph) return null;
		try {
			return canvasView(graph, focusedNodeId);
		} catch {
			return null;
		}
	}, [graph, focusedNodeId]);

	const visibleIds = useMemo(() => {
		const ids = new Set<string>();
		if (!currentCanvasView) return ids;
		ids.add(currentCanvasView.hero.id);
		for (const child of currentCanvasView.children) ids.add(child.id);
		for (const stub of currentCanvasView.peripheralStubs) {
			ids.add(stub.external.id);
		}
		return ids;
	}, [currentCanvasView]);

	const compositionParent = useMemo(
		() => (graph ? buildCompositionParentMap(graph) : new Map<string, string>()),
		[graph],
	);

	const smartSelectNode = useCallback(
		(id: string | null) => {
			if (!id) {
				onSelectNode(null);
				return;
			}

			const detailShowsHero =
				currentCanvasView !== null && selectedNodeId === currentCanvasView.hero.id;
			const isExternal = !visibleIds.has(id);
			if (detailShowsHero && isExternal) {
				const parent = compositionParent.get(id);
				if (parent) diveInto(parent);
			}

			onSelectNode(id);
		},
		[
			compositionParent,
			currentCanvasView,
			diveInto,
			onSelectNode,
			selectedNodeId,
			visibleIds,
		],
	);

	return (
		<div className="zp-workbench flex h-full min-h-0 flex-col bg-background text-foreground">
			<GraphTopBar
				graph={graph}
				view={view}
				knowledgeNodesVisible={knowledgeNodesVisible}
				dataUpdatedAt={dataUpdatedAt}
				isFetching={isFetching}
				onRefresh={onRetry}
				onViewChange={onViewChange}
				onKnowledgeNodesVisibleChange={onKnowledgeNodesVisibleChange}
			/>
			<div className="zp-workbench__body flex min-h-0 flex-1 overflow-hidden">
				<GraphLeftRail
					graph={graph}
					view={view}
					query={query}
					selectedNodeId={selectedNodeId}
					onQueryChange={onQueryChange}
					onSelectNode={smartSelectNode}
				/>
				<div className="zp-workbench__canvas relative min-w-0 flex-1">
					<GraphCanvas
						graph={graph}
						entries={entries}
						isLoading={isLoading}
						error={error}
						onRetry={onRetry}
						selectedNodeId={selectedNodeId}
						onSelectNode={smartSelectNode}
					/>
					<Legend />
					<UpdatedAgo
						updatedAtMs={dataUpdatedAt}
						onRefresh={onRetry}
						isFetching={isFetching}
					/>
				</div>
				<GraphInspector
					projectId={projectId}
					graph={graph}
					entries={entries}
					view={view}
					selectedNodeId={selectedNodeId}
					onSelectNode={smartSelectNode}
				/>
			</div>
		</div>
	);
}
