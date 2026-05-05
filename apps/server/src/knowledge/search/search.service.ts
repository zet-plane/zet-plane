import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { EntryStatus } from '@generated/client'
import { KnowledgeRepository } from '../repository/knowledge.repository'
import type { SearchFilter, SearchResult } from '../repository/knowledge.repository'
import { KnowledgeEventPublisher } from '../events/knowledge-event.publisher'

type SearchOptions = {
  filters?: SearchFilter
  limit?: number
  threshold?: number
}

@Injectable()
export class SearchService {
  constructor(
    private readonly repo: KnowledgeRepository,
    private readonly publisher: KnowledgeEventPublisher,
  ) {}

  async storeEmbedding(entryId: string, vector: number[]): Promise<void> {
    const entry = await this.repo.findEntry(entryId)
    if (!entry) throw new NotFoundException(`Entry ${entryId} not found`)
    if (entry.status === EntryStatus.deprecated) {
      throw new ConflictException('ENTRY_DEPRECATED')
    }
    await this.repo.updateEmbedding(entryId, vector)
    await this.publisher.publish({
      type: 'knowledge.entry.indexed',
      payload: { entryId, projectId: entry.projectId },
    })
  }

  async search(projectId: string, queryVector: number[], options: SearchOptions): Promise<SearchResult[]> {
    return this.repo.searchByVector(
      projectId,
      queryVector,
      options.filters ?? {},
      options.limit ?? 10,
      options.threshold ?? 0,
    )
  }
}
