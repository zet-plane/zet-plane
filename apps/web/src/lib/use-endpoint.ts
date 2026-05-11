import { useMutation, useQuery } from '@tanstack/react-query'
import { apiCall } from './api-client'
import type { z } from 'zod'

type EndpointDef = {
  method: string
  path: string
  params?: z.ZodType
  request?: z.ZodType
  response: z.ZodType
  errors: Record<number, z.ZodType>
}

export function useEndpointMutation<T extends EndpointDef>(endpoint: T) {
  return useMutation({
    mutationFn: (args: Parameters<typeof apiCall<T>>[1]) => apiCall(endpoint, args),
  })
}

export function useEndpointQuery<T extends EndpointDef>(
  endpoint: T,
  args: Parameters<typeof apiCall<T>>[1],
) {
  return useQuery({
    queryKey: [endpoint.path, args?.params, args?.body],
    queryFn: () => apiCall(endpoint, args),
  })
}
