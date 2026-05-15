import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ConflictException, HttpException } from '@nestjs/common'
import { ZodSerializationException, ZodValidationException } from 'nestjs-zod'
import { z } from 'zod'
import { DomainExceptionFilter } from './domain-exception.filter'
import { DomainException } from './domain-exception'

function makeHost(sendMock: ReturnType<typeof vi.fn>) {
  const res = { status: vi.fn().mockReturnThis(), send: sendMock }
  return {
    switchToHttp: () => ({ getResponse: () => res }),
  } as any
}

describe('DomainExceptionFilter', () => {
  let filter: DomainExceptionFilter
  let send: ReturnType<typeof vi.fn>

  beforeEach(() => {
    filter = new DomainExceptionFilter()
    send = vi.fn()
  })

  it('handles DomainException with correct status and error envelope', () => {
    const host = makeHost(send)
    filter.catch(new DomainException('NOT_FOUND', 'Resource missing', 404), host)
    expect(host.switchToHttp().getResponse().status).toHaveBeenCalledWith(404)
    expect(send).toHaveBeenCalledWith({ code: 'NOT_FOUND', message: 'Resource missing', details: undefined })
  })

  it('handles ZodValidationException with 400 + VALIDATION_ERROR code', () => {
    const host = makeHost(send)
    const zodError = new z.ZodError([])
    const exc = new ZodValidationException(zodError)
    filter.catch(exc, host)
    expect(host.switchToHttp().getResponse().status).toHaveBeenCalledWith(400)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    )
  })

  it('handles HttpException with HTTP_ERROR code', () => {
    const host = makeHost(send)
    filter.catch(new HttpException('Not found', 404), host)
    expect(host.switchToHttp().getResponse().status).toHaveBeenCalledWith(404)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ code: 'HTTP_ERROR' }))
  })

  it('preserves object HttpException responses as details with a string message', () => {
    const host = makeHost(send)
    filter.catch(new ConflictException({ error: 'HAS_ACTIVE_CHILDREN', affectedNodes: ['n1'] }), host)
    expect(host.switchToHttp().getResponse().status).toHaveBeenCalledWith(409)
    expect(send).toHaveBeenCalledWith({
      code: 'HTTP_ERROR',
      message: 'Conflict Exception',
      details: { error: 'HAS_ACTIVE_CHILDREN', affectedNodes: ['n1'] },
    })
  })

  it('handles ZodSerializationException without leaking response details', () => {
    const host = makeHost(send)
    filter.catch(new ZodSerializationException(new z.ZodError([])), host)
    expect(host.switchToHttp().getResponse().status).toHaveBeenCalledWith(500)
    expect(send).toHaveBeenCalledWith({ code: 'INTERNAL_ERROR', message: 'Internal server error' })
  })

  it('handles unknown exception with 500 + INTERNAL_ERROR', () => {
    const host = makeHost(send)
    filter.catch(new Error('boom'), host)
    expect(host.switchToHttp().getResponse().status).toHaveBeenCalledWith(500)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ code: 'INTERNAL_ERROR' }))
  })
})
