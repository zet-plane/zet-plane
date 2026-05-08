import { Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import type { EntryCategory, EntryStatus } from '@generated/client'

export const KNOWLEDGE_EVENTS_QUEUE = 'knowledge-events'

export type KnowledgeJob =
  | { type: 'knowledge.entry.created'; payload: { entryId: string; projectId: string; nodeId: string; category: EntryCategory } }
  | { type: 'knowledge.entry.body_revised'; payload: { entryId: string; projectId: string; version: number } }
  | { type: 'knowledge.entry.status_changed'; payload: { entryId: string; projectId: string; status: EntryStatus; previousStatus: EntryStatus } }
  | { type: 'knowledge.entry.reanchored'; payload: { entryId: string; projectId: string; previousNodeId: string; newNodeId: string } }
  | { type: 'knowledge.entry.indexed'; payload: { entryId: string; projectId: string } }

@Injectable()
export class KnowledgeEventPublisher {
  constructor(@InjectQueue(KNOWLEDGE_EVENTS_QUEUE) private readonly queue: Queue) {}

  async publish(job: KnowledgeJob): Promise<void> {
    await this.queue.add(job.type, job.payload)
  }
}
