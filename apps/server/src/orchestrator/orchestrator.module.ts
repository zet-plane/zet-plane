import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { forwardRef } from '@nestjs/common'
import { join } from 'node:path'
import { PrismaService } from '../prisma/prisma.service'
import { KnowledgeEventPublisher, KNOWLEDGE_EVENTS_QUEUE } from '../knowledge/events/knowledge-event.publisher'
import { GRAPH_EVENTS_QUEUE } from '../graph/events/graph-event.publisher'
import { ORCHESTRATOR_TASKS_QUEUE } from './types'
import { OrchestratorTaskRepository } from './repository/orchestrator-task.repository'
import { OrchestratorTaskPublisher } from './ingress/orchestrator-task.publisher'
import {
  OrchestratorRouterService,
  OrchestratorGraphEventWorker,
  OrchestratorKnowledgeEventWorker,
} from './ingress/orchestrator-router.service'
import { TaskSchedulerService } from './ingress/task-scheduler.service'
import { PromptBuilderService } from './prompt/prompt-builder.service'
import { AgentRuntimeService } from './runtime/agent-runtime.service'
import { OrchestratorTraceConfigService } from './runtime/orchestrator-trace-config.service'
import { TaskRunnerService } from './runtime/task-runner.service'
import { OrchestratorTaskWorker } from './runtime/orchestrator-task.worker'
import { ContextBuilderService } from './context/context-builder.service'
import { GraphContextReader } from './context/graph-context.reader'
import { KnowledgeContextReader } from './context/knowledge-context.reader'
import { SkillRegistry } from './skill/skill-registry'
import { LlmProviderRegistry } from './llm/llm-provider.registry'
import { GraphModule } from '../graph/graph.module'
import { KnowledgeModule } from '../knowledge/knowledge.module'
import { ProjectModule } from '../project/project.module'

const SKILLS_DIR = join(__dirname, '../../skills/orchestrator')

@Module({
  imports: [
    forwardRef(() => GraphModule),
    forwardRef(() => KnowledgeModule),
    forwardRef(() => ProjectModule),
    BullModule.registerQueue(
      { name: ORCHESTRATOR_TASKS_QUEUE },
      { name: GRAPH_EVENTS_QUEUE },
      { name: KNOWLEDGE_EVENTS_QUEUE },
    ),
  ],
  providers: [
    PrismaService,
    KnowledgeEventPublisher,
    // orchestrator
    OrchestratorTaskRepository,
    OrchestratorTaskPublisher,
    OrchestratorRouterService,
    OrchestratorGraphEventWorker,
    OrchestratorKnowledgeEventWorker,
    TaskSchedulerService,
    PromptBuilderService,
    AgentRuntimeService,
    OrchestratorTraceConfigService,
    TaskRunnerService,
    OrchestratorTaskWorker,
    ContextBuilderService,
    GraphContextReader,
    KnowledgeContextReader,
    LlmProviderRegistry,
    {
      provide: SkillRegistry,
      useFactory: () => new SkillRegistry(SKILLS_DIR),
    },
  ],
  exports: [OrchestratorTaskRepository, OrchestratorTaskPublisher],
})
export class OrchestratorModule {}
