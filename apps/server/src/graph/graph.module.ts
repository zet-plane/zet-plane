import { Module, forwardRef } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { GraphController } from './graph.controller'
import { GraphService } from './graph.service'
import { CycleDetectorService } from './cycle/cycle-detector.service'
import { GraphEventPublisher, GRAPH_EVENTS_QUEUE } from './events/graph-event.publisher'
import { GraphEventWorker } from './events/graph-event.worker'
import { GraphRepository } from './repository/graph.repository'
import { PrismaService } from '../prisma/prisma.service'
import { ProjectModule } from '../project/project.module'

@Module({
  imports: [
    BullModule.registerQueue({ name: GRAPH_EVENTS_QUEUE }),
    forwardRef(() => ProjectModule),
  ],
  controllers: [GraphController],
  providers: [
    PrismaService,
    GraphRepository,
    CycleDetectorService,
    GraphEventPublisher,
    GraphEventWorker,
    GraphService,
  ],
  exports: [
    GraphService,
    GraphRepository,
    CycleDetectorService,
    GraphEventPublisher,
  ],
})
export class GraphModule {}
