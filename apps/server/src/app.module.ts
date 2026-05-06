import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { BullModule } from '@nestjs/bullmq'
import { GraphModule } from './graph/graph.module'
import { validateConfig } from './config/app.config'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateConfig,
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const { hostname, port } = new URL(cfg.getOrThrow<string>('REDIS_URL'))
        return { connection: { host: hostname, port: Number(port) || 6379 } }
      },
    }),
    GraphModule,
  ],
})
export class AppModule {}
