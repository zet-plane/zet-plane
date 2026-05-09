import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ProjectRepository } from './repository/project.repository'
import { ProjectEventPublisher, PROJECT_EVENTS_QUEUE } from './events/project-event.publisher'
import { PrismaService } from '../prisma/prisma.service'

@Module({
  imports: [
    BullModule.registerQueue({ name: PROJECT_EVENTS_QUEUE }),
  ],
  providers: [
    PrismaService,
    ProjectRepository,
    ProjectEventPublisher,
  ],
  exports: [],
})
export class ProjectModule {}
