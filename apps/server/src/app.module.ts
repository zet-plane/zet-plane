import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { BullModule } from '@nestjs/bullmq'
import { GraphModule } from './graph/graph.module'
import { AppConfigModule } from './config/app-config.module'
import { AppConfig } from './config/app-config'
import { KnowledgeModule } from './knowledge/knowledge.module'
import { ProjectModule } from './project/project.module'

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
})
export class AppModule {}
