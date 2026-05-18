import { useNavigate, useSearch } from "@tanstack/react-router";
import type { GraphView } from "@/lib/schemas/graph-search";
import { useProjectGraph } from "./use-project-graph";

export function useGraphPage(projectId: string) {
	const { data, isLoading, error, isFetching, dataUpdatedAt, refetch } =
		useProjectGraph(projectId);
	const search = useSearch({ from: "/projects/$projectId/graph" });
	const navigate = useNavigate({ from: "/projects/$projectId/graph" });

	const setSelectedNodeId = (id: string | null) =>
		navigate({ search: (prev) => ({ ...prev, nodeId: id ?? undefined }) });
	const setView = (view: GraphView) =>
		navigate({ search: (prev) => ({ ...prev, view }) });
	const setQuery = (query: string) =>
		navigate({
			search: (prev) => ({
				...prev,
				query: query.length > 0 ? query : undefined,
			}),
		});
	const setKnowledgeNodesVisible = (visible: boolean) =>
		navigate({
			search: (prev) => ({
				...prev,
				knowledge: visible ? "nodes" : undefined,
			}),
		});

	return {
		graph: data,
		isLoading,
		error,
		isFetching,
		dataUpdatedAt,
		refetch,
		view: search.view,
		query: search.query ?? "",
		knowledgeNodesVisible: search.knowledge === "nodes",
		selectedNodeId: search.nodeId ?? null,
		setView,
		setQuery,
		setKnowledgeNodesVisible,
		setSelectedNodeId,
	};
}
