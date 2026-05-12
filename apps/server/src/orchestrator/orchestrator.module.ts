import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ScheduleModule } from '@nestjs/schedule'
import { join } from 'node:path'
import { PrismaService } from '../prisma/prisma.service'
import { GraphRepository } from '../graph/repository/graph.repository'
import { NodeService } from '../graph/node/node.service'
import { EdgeService } from '../graph/edge/edge.service'
import { GraphEventPublisher, GRAPH_EVENTS_QUEUE } from '../graph/events/graph-event.publisher'
import { CycleDetectorService } from '../graph/cycle/cycle-detector.service'
import { EntryService } from '../knowledge/entry/entry.service'
import { RevisionService } from '../knowledge/revision/revision.service'
import { SearchService } from '../knowledge/search/search.service'
import { KnowledgeRepository } from '../knowledge/repository/knowledge.repository'
import { KnowledgeEventPublisher, KNOWLEDGE_EVENTS_QUEUE } from '../knowledge/events/knowledge-event.publisher'
import { ORCHESTRATOR_TASKS_QUEUE } from './types'
import { OrchestratorTaskRepository } from './repository/orchestrator-task.repository'
import { OrchestratorTaskPublisher } from './ingress/orchestrator-task.publisher'
import {
  OrchestratorRouterService,
  OrchestratorGraphEventWorker,
  OrchestratorKnowledgeEventWorker,
} from './ingress/orchestrator-router.service'
import { TaskSchedulerService } from './ingress/task-scheduler.service'
import { AgentRuntimeService } from './runtime/agent-runtime.service'
import { TaskRunnerService } from './runtime/task-runner.service'
import { OrchestratorTaskWorker } from './runtime/orchestrator-task.worker'
import { ContextBuilderService } from './context/context-builder.service'
import { GraphContextReader } from './context/graph-context.reader'
import { KnowledgeContextReader } from './context/knowledge-context.reader'
import { SkillRegistry } from './llm/skill-registry'

const SKILLS_DIR = join(__dirname, '../../skills/orchestrator')

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.registerQueue(
      { name: ORCHESTRATOR_TASKS_QUEUE },
      { name: GRAPH_EVENTS_QUEUE },
      { name: KNOWLEDGE_EVENTS_QUEUE },
    ),
  ],
  providers: [
    PrismaService,
    // graph domain
    GraphRepository,
    CycleDetectorService,
    GraphEventPublisher,
    NodeService,
    EdgeService,
    // knowledge domain
    KnowledgeRepository,
    KnowledgeEventPublisher,
    EntryService,
    RevisionService,
    SearchService,
    // orchestrator
    OrchestratorTaskRepository,
    OrchestratorTaskPublisher,
    OrchestratorRouterService,
    OrchestratorGraphEventWorker,
    OrchestratorKnowledgeEventWorker,
    TaskSchedulerService,
    AgentRuntimeService,
    TaskRunnerService,
    OrchestratorTaskWorker,
    ContextBuilderService,
    GraphContextReader,
    KnowledgeContextReader,
    {
      provide: SkillRegistry,
      useFactory: () => new SkillRegistry(SKILLS_DIR),
    },
  ],
  exports: [OrchestratorTaskRepository, OrchestratorTaskPublisher],
})
export class OrchestratorModule {}
