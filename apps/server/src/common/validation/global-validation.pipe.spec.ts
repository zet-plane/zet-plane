import { describe, expect, it } from 'vitest'
import { createZodDto, ZodValidationException } from 'nestjs-zod'
import { z } from 'zod'
import { GlobalValidationPipe } from './global-validation.pipe'

class ZodDto extends createZodDto(z.object({ title: z.string().min(1) })) {}

describe('GlobalValidationPipe', () => {
  it('passes through non-Zod DTOs and primitive params', () => {
    const pipe = new GlobalValidationPipe()

    expect(pipe.transform({ name: '' }, { type: 'body', metatype: class LegacyDto {} })).toEqual({ name: '' })
    expect(pipe.transform('abc', { type: 'param', metatype: String })).toBe('abc')
  })

  it('validates nestjs-zod DTOs', () => {
    const pipe = new GlobalValidationPipe()

    expect(pipe.transform({ title: 'Node' }, { type: 'body', metatype: ZodDto })).toEqual({ title: 'Node' })
    expect(() => pipe.transform({ title: '' }, { type: 'body', metatype: ZodDto })).toThrow(ZodValidationException)
  })
})
