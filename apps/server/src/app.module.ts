import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common'
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { ZodSerializerInterceptor } from 'nestjs-zod'
import { HttpLoggerMiddleware } from './common/http-logger.middleware'
import { ConfigModule } from '@nestjs/config'
import { BullModule } from '@nestjs/bullmq'
import { ScheduleModule } from '@nestjs/schedule'
import { GraphModule } from './graph/graph.module'
import { AppConfigModule } from './config/app-config.module'
import { AppConfig } from './config/app-config'
import { KnowledgeModule } from './knowledge/knowledge.module'
import { ProjectModule } from './project/project.module'
import { DomainExceptionFilter } from './common/exceptions'
import { GlobalValidationPipe } from './common/validation/global-validation.pipe'
import { OrchestratorModule } from './orchestrator/orchestrator.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
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
    OrchestratorModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: GlobalValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpLoggerMiddleware).forRoutes('*')
  }
}
