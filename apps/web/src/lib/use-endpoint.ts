import { useMutation, useQuery } from "@tanstack/react-query";
import { apiCall, type EndpointDef } from "./api-client";

export function useEndpointMutation<T extends EndpointDef>(endpoint: T) {
	return useMutation({
		mutationFn: (args: Parameters<typeof apiCall<T>>[1]) =>
			apiCall(endpoint, args),
	});
}

export function useEndpointQuery<T extends EndpointDef>(
	endpoint: T,
	args: Parameters<typeof apiCall<T>>[1],
) {
	return useQuery({
		queryKey: [endpoint.path, args?.params, args?.query, args?.body],
		queryFn: () => apiCall(endpoint, args),
	});
}
