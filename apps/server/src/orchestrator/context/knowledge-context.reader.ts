import { Injectable } from '@nestjs/common'
import { KnowledgeRepository } from '../../knowledge/repository/knowledge.repository'
import type { KnowledgeEntrySnapshot } from '../types'

@Injectable()
export class KnowledgeContextReader {
  constructor(private readonly knowledgeRepo: KnowledgeRepository) {}

  async getRelatedEntries(projectId: string, nodeIds: string[]): Promise<KnowledgeEntrySnapshot[]> {
    if (!nodeIds.length) return []
    const entries = await this.knowledgeRepo.listEntries(projectId, {
      nodeIds,
      statusNot: 'deprecated',
    })
    return entries.map((e) => ({
      id: e.id,
      projectId: e.projectId,
      nodeId: e.nodeId,
      category: e.category,
      title: e.title,
      body: e.body,
      status: e.status,
    }))
  }
}
