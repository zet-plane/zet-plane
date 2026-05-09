import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ProjectRepository } from './repository/project.repository'
import { ProjectEventPublisher, PROJECT_EVENTS_QUEUE } from './events/project-event.publisher'
import { ProjectService } from './project.service'
import { ProjectController } from './project.controller'
import { PrismaService } from '../prisma/prisma.service'

@Module({
  imports: [
    BullModule.registerQueue({ name: PROJECT_EVENTS_QUEUE }),
  ],
  controllers: [ProjectController],
  providers: [
    PrismaService,
    ProjectRepository,
    ProjectEventPublisher,
    ProjectService,
  ],
  exports: [ProjectService],
})
export class ProjectModule {}
