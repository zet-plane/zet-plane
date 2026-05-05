import { Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import type { EdgeType, NodeStatus } from '@generated/client'
import type { DeleteStrategy } from '../repository/graph.repository'

export const GRAPH_EVENTS_QUEUE = 'graph-events'

export type GraphJob =
  | { type: 'graph.edge.created'; payload: { edgeId: string; fromId: string; toId: string; edgeType: EdgeType; projectId: string } }
  | { type: 'graph.node.checkpoint_elevated'; payload: { nodeId: string; cyclePath: string[]; projectId: string } }
  | { type: 'graph.node.status_changed'; payload: { nodeId: string; status: NodeStatus; previousStatus: NodeStatus; projectId: string } }
  | { type: 'graph.checkpoint.resolved'; payload: { nodeId: string; resolution: 'continue' | 'loop'; projectId: string } }
  | { type: 'graph.node.deleted'; payload: { nodeId: string; strategy: DeleteStrategy; affectedNodeIds: string[]; projectId: string } }

@Injectable()
export class GraphEventPublisher {
  constructor(@InjectQueue(GRAPH_EVENTS_QUEUE) private readonly queue: Queue) {}

  async publish(job: GraphJob): Promise<void> {
    await this.queue.add(job.type, job.payload)
  }
}
