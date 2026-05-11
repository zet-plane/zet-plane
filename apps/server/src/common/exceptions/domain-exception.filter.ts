import { Catch, ExceptionFilter, ArgumentsHost, HttpException, Logger } from '@nestjs/common'
import { ZodValidationException } from 'nestjs-zod'
import type { FastifyReply } from 'fastify'
import { DomainException } from './domain-exception'

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<FastifyReply>()

    if (exception instanceof DomainException) {
      return res.status(exception.status).send({
        code: exception.code,
        message: exception.message,
        details: exception.details,
      })
    }

    if (exception instanceof ZodValidationException) {
      return res.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: exception.getZodError().issues,
      })
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const resp = exception.getResponse()
      return res.status(status).send({
        code: 'HTTP_ERROR',
        message: typeof resp === 'string' ? resp : ((resp as any).message ?? exception.message),
      })
    }

    this.logger.error('Unhandled exception', exception)
    return res.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    })
  }
}
