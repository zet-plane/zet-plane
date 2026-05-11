import type { z } from 'zod'
import { AnyErrorResponse } from '@zet-plane/contracts'

export type EndpointDef = {
  method: string
  path: string
  params?: z.ZodType
  request?: z.ZodType
  response: z.ZodType
  errors: Record<number, z.ZodType>
}

export class ApiError<T extends EndpointDef> extends Error {
  status: number
  body: z.infer<T['errors'][keyof T['errors']]> | z.infer<typeof AnyErrorResponse>

  constructor(
    status: number,
    body: z.infer<T['errors'][keyof T['errors']]> | z.infer<typeof AnyErrorResponse>,
  ) {
    super((body as { message?: string }).message ?? 'API error')
    this.status = status
    this.body = body
  }
}

export async function apiCall<T extends EndpointDef>(
  endpoint: T,
  args: {
    params?: z.infer<NonNullable<T['params']>>
    body?: z.infer<NonNullable<T['request']>>
  } = {},
): Promise<z.infer<T['response']>> {
  const baseUrl = (import.meta.env?.VITE_API_BASE_URL as string | undefined) ?? ''
  const path = baseUrl + endpoint.path.replace(/:(\w+)/g, (_, k) => String((args.params as Record<string, unknown>)?.[k]))
  const res = await fetch(path, {
    method: endpoint.method,
    headers: { 'Content-Type': 'application/json' },
    body: args.body ? JSON.stringify(args.body) : undefined,
  })
  const json = await res.json() as unknown
  if (!res.ok) {
    const errSchema = endpoint.errors[res.status] ?? AnyErrorResponse
    throw new ApiError(res.status, errSchema.parse(json))
  }
  return endpoint.response.parse(json) as z.infer<T['response']>
}
