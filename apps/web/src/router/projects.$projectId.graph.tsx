import { createFileRoute } from "@tanstack/react-router";
import { DetailPanel } from "@/features/graph/components/DetailPanel";
import { GraphCanvas } from "@/features/graph/components/GraphCanvas";
import { Legend } from "@/features/graph/components/Legend";
import { UpdatedAgo } from "@/features/graph/components/UpdatedAgo";
import { useGraphPage } from "@/features/graph/hooks/use-graph-page";
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
								onSelectNode={setSelectedNodeId}
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
