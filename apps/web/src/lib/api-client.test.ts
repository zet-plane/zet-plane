import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { apiCall, ApiError, type EndpointDef } from './api-client'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('apiCall', () => {
  it('parses JSON responses with the endpoint response schema', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const endpoint = {
      method: 'GET',
      path: '/health',
      response: z.object({ ok: z.boolean() }),
      errors: {},
    } satisfies EndpointDef

    await expect(apiCall(endpoint)).resolves.toEqual({ ok: true })
  })

  it('returns undefined for 204 endpoints without a response schema', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    const endpoint = {
      method: 'DELETE',
      path: '/edges/:id',
      params: z.object({ id: z.string() }),
      errors: {},
    } satisfies EndpointDef

    await expect(apiCall(endpoint, { params: { id: 'edge-1' } })).resolves.toBeUndefined()
  })

  it('allows empty responses to be declared with z.void()', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    const endpoint = {
      method: 'DELETE',
      path: '/projects/:id',
      params: z.object({ id: z.string() }),
      response: z.void(),
      errors: {},
    } satisfies EndpointDef

    await expect(apiCall(endpoint, { params: { id: 'project-1' } })).resolves.toBeUndefined()
  })

  it('parses declared error envelopes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'EDGE_NOT_FOUND', message: 'Edge not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const endpoint = {
      method: 'DELETE',
      path: '/edges/:id',
      params: z.object({ id: z.string() }),
      errors: {
        404: z.object({
          code: z.literal('EDGE_NOT_FOUND'),
          message: z.string(),
        }),
      },
    } satisfies EndpointDef

    await expect(apiCall(endpoint, { params: { id: 'missing' } })).rejects.toMatchObject({
      status: 404,
      body: { code: 'EDGE_NOT_FOUND' },
    })
  })

  it('falls back to the generic error envelope when a declared error schema does not match', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'HTTP_ERROR', message: 'Unexpected server error' }), {
        status: 404,
        statusText: 'Not Found',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const endpoint = {
      method: 'DELETE',
      path: '/edges/:id',
      params: z.object({ id: z.string() }),
      errors: {
        404: z.object({
          code: z.literal('EDGE_NOT_FOUND'),
          message: z.string(),
        }),
      },
    } satisfies EndpointDef

    const promise = apiCall(endpoint, { params: { id: 'missing' } })

    await expect(promise).rejects.toMatchObject({
      status: 404,
      body: { code: 'HTTP_ERROR', message: 'Unexpected server error' },
    })
    await expect(promise).rejects.toBeInstanceOf(ApiError)
  })

  it('wraps malformed error bodies in ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'not the expected envelope' }), {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const endpoint = {
      method: 'POST',
      path: '/nodes',
      errors: {
        500: z.object({
          code: z.literal('INTERNAL_ERROR'),
          message: z.string(),
        }),
      },
    } satisfies EndpointDef

    const promise = apiCall(endpoint)

    await expect(promise).rejects.toMatchObject({
      status: 500,
      body: {
        code: 'HTTP_ERROR',
        message: 'Internal Server Error',
        details: { error: 'not the expected envelope' },
      },
    })
    await expect(promise).rejects.toBeInstanceOf(ApiError)
  })

  it('wraps non-JSON error bodies in ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html><body>Bad Gateway</body></html>', {
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'Content-Type': 'text/html' },
      }),
    )
    const endpoint = {
      method: 'GET',
      path: '/health',
      errors: {},
    } satisfies EndpointDef

    const promise = apiCall(endpoint)

    await expect(promise).rejects.toMatchObject({
      status: 502,
      body: {
        code: 'HTTP_ERROR',
        message: 'Bad Gateway',
        details: '<html><body>Bad Gateway</body></html>',
      },
    })
    await expect(promise).rejects.toBeInstanceOf(ApiError)
  })
})
