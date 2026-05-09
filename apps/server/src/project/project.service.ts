import { Injectable, NotFoundException, forwardRef, Inject } from '@nestjs/common'
import type { Project } from '@generated/client'
import { ProjectRepository } from './repository/project.repository'
import type { ProjectCreateData, ProjectUpdateData } from './repository/project.repository'
import { ProjectEventPublisher } from './events/project-event.publisher'
import { NodeService } from '../graph/node/node.service'

@Injectable()
export class ProjectService {
  constructor(
    private readonly repo: ProjectRepository,
    private readonly publisher: ProjectEventPublisher,
    @Inject(forwardRef(() => NodeService)) private readonly nodeService: NodeService,
  ) {}

  async create(data: ProjectCreateData): Promise<Project> {
    const { project, rootNode } = await this.repo.createWithRootTx(
      data,
      (tx, projectId) =>
        this.nodeService.initProjectRootInternal(projectId, tx),
    )
    await this.publisher.publish({
      type: 'project.created',
      payload: { projectId: project.id, rootNodeId: rootNode.id },
    })
    return project
  }

  async findById(id: string): Promise<Project> {
    const project = await this.repo.findById(id)
    if (!project) throw new NotFoundException('PROJECT_NOT_FOUND')
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
    const { counts } = await this.repo.removeWithCascade(id)
    await this.publisher.publish({
      type: 'project.deleted',
      payload: { projectId: id, cascadedCounts: counts },
    })
  }

  async assertExists(id: string): Promise<void> {
    const project = await this.repo.findById(id)
    if (!project) throw new NotFoundException('PROJECT_NOT_FOUND')
  }
}
