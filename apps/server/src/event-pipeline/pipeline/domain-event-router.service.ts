import { Injectable } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { GRAPH_EVENTS_QUEUE, type GraphJob } from '../../graph/events/graph-event.publisher'
import { KNOWLEDGE_EVENTS_QUEUE, type KnowledgeJob } from '../../knowledge/events/knowledge-event.publisher'
import { OrchestratorTaskPublisher } from '../../orchestrator/ingress/orchestrator-task.publisher'

@Injectable()
export class DomainEventRouterService {
  constructor(private readonly publisher: OrchestratorTaskPublisher) {}

  async handleGraphEvent(job: GraphJob): Promise<void> {
    switch (job.type) {
      case 'graph.node.checkpoint_elevated':
        await this.publisher.publish({
          projectId: job.payload.projectId,
          type: OrchestratorTaskType.checkpoint,
          sourceType: OrchestratorSourceType.graph_event,
          sourceId: job.payload.nodeId,
          input: job.payload,
        })
        break
      // other graph events not yet routed to orchestrator
    }
  }

  async handleKnowledgeEvent(job: KnowledgeJob): Promise<void> {
    switch (job.type) {
      case 'knowledge.entry.created':
        await this.publisher.publish({
          projectId: job.payload.projectId,
          type: OrchestratorTaskType.embedding,
          sourceType: OrchestratorSourceType.knowledge_event,
          sourceId: job.payload.entryId,
          input: job.payload,
        })
        break
      case 'knowledge.entry.body_revised':
        await this.publisher.publish({
          projectId: job.payload.projectId,
          type: OrchestratorTaskType.embedding,
          sourceType: OrchestratorSourceType.knowledge_event,
          sourceId: `${job.payload.entryId}:v${job.payload.version}`,
          input: job.payload,
        })
        break
    }
  }
}

@Processor(GRAPH_EVENTS_QUEUE)
export class GraphEventRouterWorker extends WorkerHost {
  constructor(private readonly router: DomainEventRouterService) {
    super()
  }

  async process(job: Job): Promise<void> {
    await this.router.handleGraphEvent({ type: job.name, payload: job.data } as GraphJob)
  }
}

@Processor(KNOWLEDGE_EVENTS_QUEUE)
export class KnowledgeEventRouterWorker extends WorkerHost {
  constructor(private readonly router: DomainEventRouterService) {
    super()
  }

  async process(job: Job): Promise<void> {
    await this.router.handleKnowledgeEvent({ type: job.name, payload: job.data } as KnowledgeJob)
  }
}
