import { Injectable, forwardRef, Inject } from '@nestjs/common'
import type { Project } from '@generated/client'
import { ProjectRepository } from './repository/project.repository'
import type { ProjectCreateData, ProjectUpdateData } from './repository/project.repository'
import { GraphService } from '../graph/graph.service'
import { NotFoundDomainException } from '../common/exceptions'

@Injectable()
export class ProjectService {
  constructor(
    private readonly repo: ProjectRepository,
    @Inject(forwardRef(() => GraphService)) private readonly graphService: GraphService,
  ) {}

  async create(data: ProjectCreateData): Promise<Project> {
    const { project } = await this.repo.createWithRootTx(
      data,
      (tx, projectId) =>
        this.graphService.initProjectGraphInternal(projectId, tx),
    )
    return project
  }

  async findById(id: string): Promise<Project> {
    const project = await this.repo.findById(id)
    if (!project) throw new NotFoundDomainException('PROJECT_NOT_FOUND', 'Project not found')
    return project
  }

  async list(): Promise<Project[]> {
    return this.repo.list()
  }

  async update(id: string, data: ProjectUpdateData): Promise<Project> {
    await this.assertExists(id)
    return this.repo.update(id, data)
  }

  async remove(id: string): Promise<void> {
    await this.assertExists(id)
    await this.repo.removeWithCascade(id)
  }

  async assertExists(id: string): Promise<void> {
    const project = await this.repo.findById(id)
    if (!project) throw new NotFoundDomainException('PROJECT_NOT_FOUND', 'Project not found')
  }
}
