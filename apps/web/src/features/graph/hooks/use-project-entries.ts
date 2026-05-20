import { useQuery } from "@tanstack/react-query";
import { listEntriesEndpoint } from "@zet-plane/contracts";
import { apiCall } from "@/lib/api-client";

export function useProjectEntries(projectId: string) {
	return useQuery({
		queryKey: ["project", projectId, "entries"],
		queryFn: () =>
			apiCall(listEntriesEndpoint, {
				params: { id: projectId },
			}),
	});
}
