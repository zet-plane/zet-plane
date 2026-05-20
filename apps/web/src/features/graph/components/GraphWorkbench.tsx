import type { KnowledgeEntryResponse } from "@zet-plane/contracts";
import { useCallback, useState } from "react";
import type { GraphWorkbenchFilters } from "../domain/graph-workbench";
import type { ProjectGraph } from "../domain/types";
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
	const [filters, setFilters] = useState<GraphWorkbenchFilters>({
		status: null,
		type: null,
	});

	const smartSelectNode = useCallback(
		(id: string | null) => {
			onSelectNode(id);
		},
		[onSelectNode],
	);
	const changeView = useCallback(
		(nextView: GraphView) => {
			if (nextView === "explore") {
				setFilters({ status: null, type: null });
			}
			onViewChange(nextView);
		},
		[onViewChange],
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
				onViewChange={changeView}
				onKnowledgeNodesVisibleChange={onKnowledgeNodesVisibleChange}
			/>
			<div className="zp-workbench__body flex min-h-0 flex-1 overflow-hidden">
				<GraphLeftRail
					graph={graph}
					view={view}
					query={query}
					selectedNodeId={selectedNodeId}
					onQueryChange={onQueryChange}
					filters={filters}
					onFiltersChange={setFilters}
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
						knowledgeNodesVisible={knowledgeNodesVisible}
						filters={filters}
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
