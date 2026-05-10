import { Injectable, NotFoundException, ConflictException, forwardRef, Inject } from '@nestjs/common'
import { EntryStatus } from '@generated/client'
import type { KnowledgeEntry } from '@generated/client'
import { KnowledgeRepository } from '../repository/knowledge.repository'
import type { EntryCreateInput, EntryListFilters } from '../repository/knowledge.repository'
import { KnowledgeEventPublisher } from '../events/knowledge-event.publisher'
import { ProjectService } from '../../project/project.service'
import { GraphService } from '../../graph/graph.service'

@Injectable()
export class EntryService {
  constructor(
    private readonly repo: KnowledgeRepository,
    private readonly publisher: KnowledgeEventPublisher,
    @Inject(forwardRef(() => ProjectService)) private readonly projectService: ProjectService,
    @Inject(forwardRef(() => GraphService)) private readonly graphService: GraphService,
  ) {}

  async createEntry(data: EntryCreateInput): Promise<KnowledgeEntry> {
    await this.projectService.assertExists(data.projectId)
    const stagingNode = data.nodeId ? null : await this.graphService.findStagingNode(data.projectId)
    if (!data.nodeId && !stagingNode) throw new ConflictException('PROJECT_STAGING_NOT_INITIALIZED')
    const nodeId = data.nodeId ?? stagingNode!.id
    if (data.nodeId) {
      await this.assertNodeInProject(data.nodeId, data.projectId)
    }
    const { entry } = await this.repo.createEntryWithRevision({ ...data, nodeId })
    await this.publisher.publish({
      type: 'knowledge.entry.created',
      payload: { entryId: entry.id, projectId: entry.projectId, nodeId: entry.nodeId, category: entry.category },
    })
    return entry
  }

  async getEntry(id: string): Promise<KnowledgeEntry> {
    return this.requireEntry(id)
  }

  async listEntries(projectId: string, filters: EntryListFilters): Promise<KnowledgeEntry[]> {
    return this.repo.listEntries(projectId, filters)
  }

  async updateFields(
    id: string,
    data: Partial<Pick<KnowledgeEntry, 'title' | 'category'>>,
  ): Promise<KnowledgeEntry> {
    const entry = await this.requireEntry(id)
    await this.projectService.assertExists(entry.projectId)
    if (entry.status === EntryStatus.deprecated) {
      throw new ConflictException('ENTRY_DEPRECATED')
    }
    return this.repo.updateEntry(id, data)
  }

  async updateStatus(id: string, newStatus: EntryStatus): Promise<KnowledgeEntry> {
    const entry = await this.requireEntry(id)
    await this.projectService.assertExists(entry.projectId)
    this.validateStatusTransition(entry.status, newStatus)
    const updated = await this.repo.updateEntry(id, { status: newStatus })
    await this.publisher.publish({
      type: 'knowledge.entry.status_changed',
      payload: { entryId: id, projectId: entry.projectId, status: newStatus, previousStatus: entry.status },
    })
    return updated
  }

  async reanchor(id: string, newNodeId: string): Promise<KnowledgeEntry> {
    const entry = await this.requireEntry(id)
    await this.projectService.assertExists(entry.projectId)
    if (entry.status === EntryStatus.deprecated) {
      throw new ConflictException('ENTRY_DEPRECATED')
    }
    await this.assertNodeInProject(newNodeId, entry.projectId)
    const updated = await this.repo.updateEntry(id, { nodeId: newNodeId })
    await this.publisher.publish({
      type: 'knowledge.entry.reanchored',
      payload: { entryId: id, projectId: entry.projectId, previousNodeId: entry.nodeId, newNodeId },
    })
    return updated
  }

  async softDelete(id: string): Promise<KnowledgeEntry> {
    const entry = await this.requireEntry(id)
    await this.projectService.assertExists(entry.projectId)
    return this.repo.updateEntry(id, { status: EntryStatus.deprecated })
  }

  private async requireEntry(id: string): Promise<KnowledgeEntry> {
    const entry = await this.repo.findEntry(id)
    if (!entry) throw new NotFoundException(`Entry ${id} not found`)
    return entry
  }

  private async assertNodeInProject(nodeId: string, projectId: string): Promise<void> {
    const node = await this.repo.findNode(nodeId)
    if (!node || node.projectId !== projectId) {
      throw new NotFoundException(`Node ${nodeId} not found in project ${projectId}`)
    }
  }

  private validateStatusTransition(current: EntryStatus, next: EntryStatus): void {
    if (current === EntryStatus.deprecated) {
      throw new ConflictException('ENTRY_DEPRECATED')
    }
    if (current === EntryStatus.published && next === EntryStatus.draft) {
      throw new ConflictException('CANNOT_REVERT_TO_DRAFT')
    }
  }
}
