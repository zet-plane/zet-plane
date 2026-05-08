import { Global, Module } from '@nestjs/common'
import { AppConfig } from './app-config'

@Global()
@Module({
  providers: [{ provide: AppConfig, useFactory: () => AppConfig.load() }],
  exports: [AppConfig],
})
export class AppConfigModule {}
