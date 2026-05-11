// apps/server/src/orchestrator/orchestrator.module.ts
import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ORCHESTRATOR_TASKS_QUEUE } from './types'

@Module({
  imports: [
    BullModule.registerQueue({ name: ORCHESTRATOR_TASKS_QUEUE }),
  ],
  providers: [],
})
export class OrchestratorModule {}
