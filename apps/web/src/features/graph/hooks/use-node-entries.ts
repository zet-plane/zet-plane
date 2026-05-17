import { useQuery } from "@tanstack/react-query";
import { listEntriesEndpoint } from "@zet-plane/contracts";
import { apiCall } from "@/lib/api-client";

export function useNodeEntries(
	projectId: string,
	nodeId: string | null | undefined,
) {
	return useQuery({
		queryKey: ["project", projectId, "entries", { nodeId }],
		queryFn: () =>
			apiCall(listEntriesEndpoint, {
				params: { id: projectId },
				query: { nodeId: nodeId ?? undefined },
			}),
		enabled: Boolean(nodeId),
	});
}
