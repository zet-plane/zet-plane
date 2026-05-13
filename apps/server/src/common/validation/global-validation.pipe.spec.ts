import { describe, expect, it } from 'vitest'
import { IsString, MinLength } from 'class-validator'
import { createZodDto, ZodValidationException } from 'nestjs-zod'
import { z } from 'zod'
import { GlobalValidationPipe } from './global-validation.pipe'

class LegacyDto {
  @IsString()
  @MinLength(1)
  name!: string
}

class ZodDto extends createZodDto(z.object({ title: z.string().min(1) })) {}

describe('GlobalValidationPipe', () => {
  it('validates legacy class-validator DTOs', async () => {
    const pipe = new GlobalValidationPipe()

    await expect(pipe.transform({ name: 'P' }, { type: 'body', metatype: LegacyDto })).resolves.toEqual({ name: 'P' })
    await expect(pipe.transform({ name: '' }, { type: 'body', metatype: LegacyDto })).rejects.toThrow()
  })

  it('validates nestjs-zod DTOs', () => {
    const pipe = new GlobalValidationPipe()

    expect(pipe.transform({ title: 'Node' }, { type: 'body', metatype: ZodDto })).toEqual({ title: 'Node' })
    expect(() => pipe.transform({ title: '' }, { type: 'body', metatype: ZodDto })).toThrow(ZodValidationException)
  })
})
