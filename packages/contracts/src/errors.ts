import { z } from 'zod'

export function makeErrorResponse<T extends z.ZodTypeAny>(code: T) {
  return z.object({
    code,
    message: z.string(),
    details: z.unknown().optional(),
  })
}

export const ValidationErrorResponse = makeErrorResponse(z.literal('VALIDATION_ERROR'))
export type ValidationErrorResponse = z.infer<typeof ValidationErrorResponse>

export const AnyErrorResponse = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
})
export type AnyErrorResponse = z.infer<typeof AnyErrorResponse>
