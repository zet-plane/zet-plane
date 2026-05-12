// apps/server/src/orchestrator/orchestrator.module.ts
import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { join } from 'node:path'
import { ORCHESTRATOR_TASKS_QUEUE } from './types'
import { PrismaService } from '../prisma/prisma.service'
import { OrchestratorTaskRepository } from './repository/orchestrator-task.repository'
import { OrchestratorTaskPublisher } from './ingress/orchestrator-task.publisher'
import { AgentRuntimeService } from './runtime/agent-runtime.service'
import { TaskRunnerService } from './runtime/task-runner.service'
import { OrchestratorTaskWorker } from './runtime/orchestrator-task.worker'
import { SkillRegistry } from './llm/skill-registry'
import { GraphRepository } from '../graph/repository/graph.repository'
import { CycleDetectorService } from '../graph/cycle/cycle-detector.service'
import { GraphEventPublisher, GRAPH_EVENTS_QUEUE } from '../graph/events/graph-event.publisher'
import { KnowledgeRepository } from '../knowledge/repository/knowledge.repository'
import { KnowledgeEventPublisher, KNOWLEDGE_EVENTS_QUEUE } from '../knowledge/events/knowledge-event.publisher'
import { ContextBuilderService } from './context/context-builder.service'
import { GraphContextReader } from './context/graph-context.reader'
import { KnowledgeContextReader } from './context/knowledge-context.reader'

@Module({
  imports: [
    BullModule.registerQueue(
      { name: ORCHESTRATOR_TASKS_QUEUE },
      { name: GRAPH_EVENTS_QUEUE },
      { name: KNOWLEDGE_EVENTS_QUEUE },
    ),
  ],
  providers: [
    PrismaService,
    OrchestratorTaskRepository,
    OrchestratorTaskPublisher,
    TaskRunnerService,
    AgentRuntimeService,
    OrchestratorTaskWorker,
    {
      provide: SkillRegistry,
      useFactory: () => new SkillRegistry(join(__dirname, '../../skills/orchestrator')),
    },
    GraphRepository,
    CycleDetectorService,
    GraphEventPublisher,
    KnowledgeRepository,
    KnowledgeEventPublisher,
    ContextBuilderService,
    GraphContextReader,
    KnowledgeContextReader,
  ],
  exports: [OrchestratorTaskRepository, OrchestratorTaskPublisher],
})
export class OrchestratorModule {}
