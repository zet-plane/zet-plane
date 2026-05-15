import { Injectable, NestMiddleware, Logger } from '@nestjs/common'

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP')

  use(req: any, res: any, next: () => void) {
    const { method, url } = req
    const ip = req.headers['x-forwarded-for'] ?? req.ip ?? req.socket?.remoteAddress ?? '-'
    const ua = req.headers['user-agent'] ?? '-'
    const contentType = req.headers['content-type'] ?? '-'
    const start = Date.now()

    res.on('finish', () => {
      const ms = Date.now() - start
      const status = res.statusCode
      const contentLength = res.getHeader?.('content-length') ?? '-'
      this.logger.log(
        `${method} ${url} ${status} +${ms}ms | ip=${ip} | ua=${ua} | req-ct=${contentType} | res-len=${contentLength}`,
      )
    })

    next()
  }
}
