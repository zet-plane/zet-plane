import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { EntryStatus } from '@generated/client'
import type { KnowledgeRevision, CreatedBy } from '@generated/client'
import { KnowledgeRepository } from '../repository/knowledge.repository'
import { KnowledgeEventPublisher } from '../events/knowledge-event.publisher'

type AppendRevisionInput = {
  body: unknown
  changeNote?: string
  createdBy: CreatedBy
}

@Injectable()
export class RevisionService {
  constructor(
    private readonly repo: KnowledgeRepository,
    private readonly publisher: KnowledgeEventPublisher,
  ) {}

  async appendRevision(entryId: string, input: AppendRevisionInput): Promise<KnowledgeRevision> {
    const entry = await this.repo.findEntry(entryId)
    if (!entry) throw new NotFoundException(`Entry ${entryId} not found`)
    if (entry.status === EntryStatus.deprecated) {
      throw new ConflictException('ENTRY_DEPRECATED')
    }
    const revision = await this.repo.appendRevision({
      entryId,
      body: input.body,
      changeNote: input.changeNote,
      createdBy: input.createdBy,
    })
    await this.publisher.publish({
      type: 'knowledge.entry.body_revised',
      payload: { entryId, projectId: entry.projectId, version: revision.version },
    })
    return revision
  }

  async listRevisions(entryId: string): Promise<KnowledgeRevision[]> {
    const entry = await this.repo.findEntry(entryId)
    if (!entry) throw new NotFoundException(`Entry ${entryId} not found`)
    return this.repo.listRevisions(entryId)
  }

  async getRevision(entryId: string, version: number): Promise<KnowledgeRevision> {
    const entry = await this.repo.findEntry(entryId)
    if (!entry) throw new NotFoundException(`Entry ${entryId} not found`)
    const revision = await this.repo.getRevision(entryId, version)
    if (!revision) throw new NotFoundException(`Revision v${version} not found for entry ${entryId}`)
    return revision
  }
}
