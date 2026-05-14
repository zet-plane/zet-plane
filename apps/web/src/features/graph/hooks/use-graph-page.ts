import { useNavigate, useSearch } from "@tanstack/react-router";
import { useProjectGraph } from "./use-project-graph";

export function useGraphPage(projectId: string) {
  const { data, isLoading, error, isFetching, dataUpdatedAt, refetch } = useProjectGraph(projectId);
  const search = useSearch({ from: "/projects/$projectId/graph" });
  const navigate = useNavigate({ from: "/projects/$projectId/graph" });

  const setSelectedNodeId = (id: string | null) =>
    navigate({ search: (prev) => ({ ...prev, nodeId: id ?? undefined }) });

  return {
    graph: data,
    isLoading,
    error,
    isFetching,
    dataUpdatedAt,
    refetch,
    selectedNodeId: search.nodeId ?? null,
    setSelectedNodeId,
  };
}
