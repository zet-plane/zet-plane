// apps/server/src/orchestrator/orchestrator.module.ts
import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ORCHESTRATOR_TASKS_QUEUE } from './types'
import { PrismaService } from '../prisma/prisma.service'
import { OrchestratorTaskRepository } from './repository/orchestrator-task.repository'

@Module({
  imports: [
    BullModule.registerQueue({ name: ORCHESTRATOR_TASKS_QUEUE }),
  ],
  providers: [PrismaService, OrchestratorTaskRepository],
  exports: [OrchestratorTaskRepository],
})
export class OrchestratorModule {}
