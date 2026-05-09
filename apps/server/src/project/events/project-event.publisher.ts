import { Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'

export const PROJECT_EVENTS_QUEUE = 'project-events'

export type ProjectJob =
  | { type: 'project.created'; payload: { projectId: string; rootNodeId: string } }
  | { type: 'project.deleted'; payload: { projectId: string; cascadedCounts: { nodes: number; edges: number; entries: number } } }

@Injectable()
export class ProjectEventPublisher {
  constructor(@InjectQueue(PROJECT_EVENTS_QUEUE) private readonly queue: Queue) {}

  async publish(job: ProjectJob): Promise<void> {
    await this.queue.add(job.type, job.payload)
  }
}
