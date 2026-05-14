import { useQuery } from "@tanstack/react-query";
import { listProjectsEndpoint } from "@zet-plane/contracts";
import { apiCall } from "@/lib/api-client";

export function useProjectsList() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => apiCall(listProjectsEndpoint),
  });
}
