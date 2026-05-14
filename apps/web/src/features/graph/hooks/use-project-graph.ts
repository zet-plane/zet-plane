import { useQueries } from "@tanstack/react-query";
import { listEdgesEndpoint, listNodesEndpoint } from "@zet-plane/contracts";
import { apiCall } from "@/lib/api-client";
import type { ProjectGraph } from "../domain/types";

export function useProjectGraph(projectId: string) {
  const [nodesQ, edgesQ] = useQueries({
    queries: [
      {
        queryKey: ["project", projectId, "nodes"],
        queryFn: () => apiCall(listNodesEndpoint, { params: { id: projectId } }),
      },
      {
        queryKey: ["project", projectId, "edges"],
        queryFn: () => apiCall(listEdgesEndpoint, { params: { id: projectId } }),
      },
    ],
  });

  const data: ProjectGraph | undefined =
    nodesQ.data && edgesQ.data
      ? {
          nodes: nodesQ.data,
          edges: edgesQ.data,
        }
      : undefined;

  return {
    data,
    error: nodesQ.error ?? edgesQ.error ?? null,
    isLoading: nodesQ.isLoading || edgesQ.isLoading,
    isFetching: nodesQ.isFetching || edgesQ.isFetching,
    dataUpdatedAt: Math.max(nodesQ.dataUpdatedAt, edgesQ.dataUpdatedAt),
    refetch: async () => {
      await Promise.all([nodesQ.refetch(), edgesQ.refetch()]);
    },
  };
}
