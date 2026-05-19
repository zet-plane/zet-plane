import { Module, forwardRef } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { OrchestratorModule } from '../orchestrator/orchestrator.module'
import { PrismaService } from '../prisma/prisma.service'
import { AppConfig } from '../config/app-config'
import { INCOMING_EVENTS_QUEUE } from './types'
import { AdapterRegistry } from './adapters/adapter.registry'
import { GithubAdapter } from './adapters/github.adapter'
import { FeishuAdapter } from './adapters/feishu.adapter'
import { ClaudeHookAdapter } from './adapters/claude-hook.adapter'
import { ManualAdapter } from './adapters/manual.adapter'
import { WebhookController } from './webhook/webhook.controller'
import { IncomingEventRepository } from './repository/incoming-event.repository'
import { DeduplicationService } from './pipeline/deduplication.service'
import { EnrichmentService } from './pipeline/enrichment.service'
import { EventPipelineWorker } from './pipeline/event-pipeline.worker'

@Module({
  imports: [
    BullModule.registerQueue({ name: INCOMING_EVENTS_QUEUE }),
    forwardRef(() => OrchestratorModule),
  ],
  controllers: [WebhookController],
  providers: [
    PrismaService,
    IncomingEventRepository,
    DeduplicationService,
    EnrichmentService,
    EventPipelineWorker,
    GithubAdapter,
    FeishuAdapter,
    ClaudeHookAdapter,
    ManualAdapter,
    {
      provide: AdapterRegistry,
      useFactory: (
        github: GithubAdapter,
        feishu: FeishuAdapter,
        claudeHook: ClaudeHookAdapter,
        manual: ManualAdapter,
      ) => {
        const registry = new AdapterRegistry()
        registry.register(github)
        registry.register(feishu)
        registry.register(claudeHook)
        registry.register(manual)
        return registry
      },
      inject: [GithubAdapter, FeishuAdapter, ClaudeHookAdapter, ManualAdapter],
    },
  ],
  exports: [],
})
export class EventPipelineModule {}
