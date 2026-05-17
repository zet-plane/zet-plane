import { Module, forwardRef } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { KnowledgeController } from './knowledge.controller'
import { EntryService } from './entry/entry.service'
import { RevisionService } from './revision/revision.service'
import { SearchService } from './search/search.service'
import { KnowledgeRepository } from './repository/knowledge.repository'
import { KnowledgeEventPublisher, KNOWLEDGE_EVENTS_QUEUE } from './events/knowledge-event.publisher'
import { PrismaService } from '../prisma/prisma.service'
import { ProjectModule } from '../project/project.module'
import { GraphModule } from '../graph/graph.module'

@Module({
  imports: [
    BullModule.registerQueue({ name: KNOWLEDGE_EVENTS_QUEUE }),
    forwardRef(() => ProjectModule),
    forwardRef(() => GraphModule),
  ],
  controllers: [KnowledgeController],
  providers: [
    PrismaService,
    KnowledgeRepository,
    KnowledgeEventPublisher,
    EntryService,
    RevisionService,
    SearchService,
  ],
  exports: [
    KnowledgeRepository,
    KnowledgeEventPublisher,
    EntryService,
    RevisionService,
    SearchService,
  ],
})
export class KnowledgeModule {}
