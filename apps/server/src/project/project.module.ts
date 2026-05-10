import { Module, forwardRef } from '@nestjs/common'
import { GraphModule } from '../graph/graph.module'
import { ProjectRepository } from './repository/project.repository'
import { ProjectService } from './project.service'
import { ProjectController } from './project.controller'
import { PrismaService } from '../prisma/prisma.service'

@Module({
  imports: [forwardRef(() => GraphModule)],
  controllers: [ProjectController],
  providers: [PrismaService, ProjectRepository, ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
