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

	return (
		<div className="grid h-full grid-cols-[1fr_360px]">
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
			<aside className="border-l border-border bg-background">
				<DetailPanel
					projectId={projectId}
					nodes={graph?.nodes ?? []}
					edges={graph?.edges ?? []}
					selectedNodeId={selectedNodeId}
					onSelectNode={setSelectedNodeId}
				/>
			</aside>
		</div>
	);
}

export const Route = createFileRoute("/projects/$projectId/graph")({
	validateSearch: (raw) => graphSearchSchema.parse(raw),
	component: GraphRoute,
});
