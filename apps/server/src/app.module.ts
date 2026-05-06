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
      useFactory: (cfg: ConfigService) => ({
        connection: cfg.getOrThrow<string>('REDIS_URL'),
      }),
    }),
    GraphModule,
  ],
})
export class AppModule {}
