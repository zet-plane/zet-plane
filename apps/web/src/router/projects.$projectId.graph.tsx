import { createFileRoute } from "@tanstack/react-router";
import { GraphWorkbench } from "@/features/graph/components/GraphWorkbench";
import { useGraphPage } from "@/features/graph/hooks/use-graph-page";
import { useProjectEntries } from "@/features/graph/hooks/use-project-entries";
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
		view,
		query,
		knowledgeNodesVisible,
		selectedNodeId,
		setView,
		setQuery,
		setKnowledgeNodesVisible,
		setSelectedNodeId,
	} = useGraphPage(projectId);
	const entries = useProjectEntries(projectId);

	return (
		<GraphWorkbench
			projectId={projectId}
			graph={graph}
			entries={entries.data ?? []}
			isLoading={isLoading}
			error={error}
			isFetching={isFetching}
			dataUpdatedAt={dataUpdatedAt}
			onRetry={refetch}
			view={view}
			query={query}
			knowledgeNodesVisible={knowledgeNodesVisible}
			selectedNodeId={selectedNodeId}
			onSelectNode={setSelectedNodeId}
			onViewChange={setView}
			onQueryChange={setQuery}
			onKnowledgeNodesVisibleChange={setKnowledgeNodesVisible}
		/>
	);
}

export const Route = createFileRoute("/projects/$projectId/graph")({
	validateSearch: (raw) => graphSearchSchema.parse(raw),
	component: GraphRoute,
});
