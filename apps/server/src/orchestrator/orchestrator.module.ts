// apps/server/src/orchestrator/orchestrator.module.ts
import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ORCHESTRATOR_TASKS_QUEUE } from './types'
import { PrismaService } from '../prisma/prisma.service'
import { OrchestratorTaskRepository } from './repository/orchestrator-task.repository'
import { OrchestratorTaskPublisher } from './ingress/orchestrator-task.publisher'
import { AgentRuntimeService } from './runtime/agent-runtime.service'
import { TaskRunnerService } from './runtime/task-runner.service'
import { OrchestratorTaskWorker } from './runtime/orchestrator-task.worker'

@Module({
  imports: [
    BullModule.registerQueue({ name: ORCHESTRATOR_TASKS_QUEUE }),
  ],
  providers: [
    PrismaService,
    OrchestratorTaskRepository,
    OrchestratorTaskPublisher,
    TaskRunnerService,
    AgentRuntimeService,
    OrchestratorTaskWorker,
  ],
  exports: [OrchestratorTaskRepository, OrchestratorTaskPublisher],
})
export class OrchestratorModule {}
