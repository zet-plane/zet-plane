import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { GraphController } from './graph.controller'
import { NodeService } from './node/node.service'
import { EdgeService } from './edge/edge.service'
import { CycleDetectorService } from './cycle/cycle-detector.service'
import { GraphEventPublisher, GRAPH_EVENTS_QUEUE } from './events/graph-event.publisher'
import { GraphEventWorker } from './events/graph-event.worker'
import { GraphRepository } from './repository/graph.repository'
import { PrismaService } from '../prisma/prisma.service'

@Module({
  imports: [
    BullModule.registerQueue({ name: GRAPH_EVENTS_QUEUE }),
  ],
  controllers: [GraphController],
  providers: [
    PrismaService,
    GraphRepository,
    CycleDetectorService,
    GraphEventPublisher,
    GraphEventWorker,
    NodeService,
    EdgeService,
  ],
})
export class GraphModule {}
