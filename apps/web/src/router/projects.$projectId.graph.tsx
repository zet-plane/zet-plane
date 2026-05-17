import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { canvasView } from "@/features/graph/domain/canvas-view";
import { DetailPanel } from "@/features/graph/components/DetailPanel";
import { GraphCanvas } from "@/features/graph/components/GraphCanvas";
import { Legend } from "@/features/graph/components/Legend";
import { UpdatedAgo } from "@/features/graph/components/UpdatedAgo";
import { useGraphPage } from "@/features/graph/hooks/use-graph-page";
import { useCanvasNavigation } from "@/features/graph/hooks/use-canvas-navigation";
import { graphSearchSchema } from "@/lib/schemas/graph-search";

function GraphRoute() {
	const { projectId } = Route.useParams();
	const {
		graph,
		isLoading,
		error,
		isFetching,
		dataUpdatedAt,
		refetch,
		selectedNodeId,
		setSelectedNodeId,
	} = useGraphPage(projectId);
	const { focusedNodeId, diveInto } = useCanvasNavigation();

	const view = useMemo(() => {
		if (!graph) return null;
		try {
			return canvasView(graph, focusedNodeId);
		} catch {
			return null;
		}
	}, [graph, focusedNodeId]);

	const visibleIds = useMemo(() => {
		const set = new Set<string>();
		if (!view) return set;
		set.add(view.hero.id);
		for (const c of view.children) set.add(c.id);
		for (const s of view.peripheralStubs) set.add(s.external.id);
		return set;
	}, [view]);

	const compositionParent = useMemo(() => {
		const map = new Map<string, string>();
		if (!graph) return map;
		for (const e of graph.edges) {
			if (e.type === "composition") map.set(e.toId, e.fromId);
		}
		return map;
	}, [graph]);

	// Smart selection for the detail panel: when the detail is showing the
	// current sub-graph hero and the user clicks one of its dependency links
	// that doesn't render in this sub-graph, focus on the target's composition
	// parent so the target appears as a sibling in that layer (instead of
	// diving into the target and making it the new sub-graph root).
	const onDetailSelect = useCallback(
		(id: string) => {
			const detailShowsHero = view !== null && selectedNodeId === view.hero.id;
			const isExternal = !visibleIds.has(id);
			if (detailShowsHero && isExternal) {
				const parent = compositionParent.get(id);
				if (parent) diveInto(parent);
			}
			setSelectedNodeId(id);
		},
		[
			view,
			selectedNodeId,
			visibleIds,
			compositionParent,
			diveInto,
			setSelectedNodeId,
		],
	);

	const detailOpen = selectedNodeId !== null;

	return (
		<div
			className="grid h-full"
			style={{
				gridTemplateColumns: detailOpen ? "1fr 360px" : "1fr 0px",
				transition: "grid-template-columns 180ms ease",
			}}
		>
			<div className="relative h-full">
				<GraphCanvas
					graph={graph}
					isLoading={isLoading}
					error={error}
					onRetry={refetch}
					selectedNodeId={selectedNodeId}
					onSelectNode={setSelectedNodeId}
				/>
				<Legend />
				<UpdatedAgo
					updatedAtMs={dataUpdatedAt}
					onRefresh={refetch}
					isFetching={isFetching}
				/>
			</div>
			<aside
				className="overflow-hidden border-l border-border bg-background"
				aria-hidden={!detailOpen}
			>
				{detailOpen && (
					<div className="flex h-full flex-col">
						<div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs text-muted-foreground">
							<span>Details</span>
							<button
								type="button"
								onClick={() => setSelectedNodeId(null)}
								className="rounded p-1 hover:bg-accent"
								aria-label="Close details"
							>
								✕
							</button>
						</div>
						<div className="flex-1 overflow-hidden">
							<DetailPanel
								projectId={projectId}
								nodes={graph?.nodes ?? []}
								edges={graph?.edges ?? []}
								selectedNodeId={selectedNodeId}
								onSelectNode={onDetailSelect}
							/>
						</div>
					</div>
				)}
			</aside>
		</div>
	);
}

export const Route = createFileRoute("/projects/$projectId/graph")({
	validateSearch: (raw) => graphSearchSchema.parse(raw),
	component: GraphRoute,
});
