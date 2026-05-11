import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common'
import { APP_FILTER, APP_PIPE } from '@nestjs/core'
import { HttpLoggerMiddleware } from './common/http-logger.middleware'
import { ConfigModule } from '@nestjs/config'
import { BullModule } from '@nestjs/bullmq'
import { ZodValidationPipe } from 'nestjs-zod'
import { GraphModule } from './graph/graph.module'
import { AppConfigModule } from './config/app-config.module'
import { AppConfig } from './config/app-config'
import { KnowledgeModule } from './knowledge/knowledge.module'
import { ProjectModule } from './project/project.module'
import { DomainExceptionFilter } from './common/exceptions'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AppConfigModule,
    BullModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (cfg: AppConfig) => {
        const { hostname, port } = new URL(cfg.redis.url)
        return { connection: { host: hostname, port: Number(port) || 6379 } }
      },
    }),
    GraphModule,
    KnowledgeModule,
    ProjectModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpLoggerMiddleware).forRoutes('*')
  }
}
