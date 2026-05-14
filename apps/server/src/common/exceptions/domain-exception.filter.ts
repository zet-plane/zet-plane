import { Catch, ExceptionFilter, ArgumentsHost, HttpException, Logger } from '@nestjs/common'
import { ZodSerializationException, ZodValidationException } from 'nestjs-zod'
import { ZodError } from 'zod'

import { DomainException } from './domain-exception'

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = host.switchToHttp().getResponse<any>()

    if (exception instanceof DomainException) {
      return res.status(exception.status).send({
        code: exception.code,
        message: exception.message,
        details: exception.details,
      })
    }

    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError()
      return res.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: zodError instanceof ZodError ? zodError.issues : zodError,
      })
    }

    if (exception instanceof ZodSerializationException) {
      const zodError = exception.getZodError()
      const message = zodError instanceof Error ? zodError.message : String(zodError)
      this.logger.error(`Response serialization failed: ${message}`)
      return res.status(500).send({
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      })
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const resp = exception.getResponse()
      const message = getHttpExceptionMessage(resp, exception.message)
      return res.status(status).send({
        code: 'HTTP_ERROR',
        message,
        details: typeof resp === 'object' ? resp : undefined,
      })
    }

    this.logger.error('Unhandled exception', exception)
    return res.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    })
  }
}

function getHttpExceptionMessage(response: string | object, fallback: string): string {
  if (typeof response === 'string') return response

  const message = (response as { message?: unknown }).message
  if (typeof message === 'string') return message
  if (Array.isArray(message)) return message.join('; ')

  return fallback
}
