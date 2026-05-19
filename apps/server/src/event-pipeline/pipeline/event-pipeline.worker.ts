import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { OrchestratorTaskType, OrchestratorSourceType, IncomingEventStatus } from '@generated/client'
import { OrchestratorTaskPublisher } from '../../orchestrator/ingress/orchestrator-task.publisher'
import { IncomingEventRepository } from '../repository/incoming-event.repository'
import { DeduplicationService } from './deduplication.service'
import { EnrichmentService, NoProjectMappingError } from './enrichment.service'
import { ROUTING_RULES, DEFAULT_ROUTE } from './routing-table'
import { INCOMING_EVENTS_QUEUE, type NormalizedEvent, type RouteTarget } from '../types'

@Processor(INCOMING_EVENTS_QUEUE, {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
} as any)
export class EventPipelineWorker extends WorkerHost {
  constructor(
    private readonly dedup: DeduplicationService,
    private readonly enrichment: EnrichmentService,
    private readonly repo: IncomingEventRepository,
    private readonly publisher: OrchestratorTaskPublisher,
  ) {
    super()
  }

  async process(job: Job<NormalizedEvent>): Promise<void> {
    const event = job.data

    // Step 1: Deduplication
    const dedupResult = await this.dedup.checkAndInsert(event)
    if (dedupResult.status === 'duplicate') return

    const { recordId } = dedupResult

    // Step 2: Enrichment
    let projectId: string
    try {
      projectId = await this.enrichment.resolveProjectId(event)
    } catch (err) {
      if (err instanceof NoProjectMappingError) {
        await this.repo.updateStatus(recordId, IncomingEventStatus.failed, {
          error: { reason: 'no_project_mapping' },
        })
        return
      }
      throw err
    }

    // Step 3: Route
    const target: RouteTarget = ROUTING_RULES[event.eventType] ?? DEFAULT_ROUTE

    // Step 4: Dispatch
    await this.dispatch(event, recordId, projectId, target)
    await this.repo.updateStatus(recordId, IncomingEventStatus.routed, { routedTo: target, projectId })
  }

  private async dispatch(
    event: NormalizedEvent,
    recordId: string,
    projectId: string,
    target: RouteTarget,
  ): Promise<void> {
    if (target === 'orchestrate') {
      await this.publisher.publish({
        projectId,
        type: OrchestratorTaskType.event_anchor,
        sourceType: OrchestratorSourceType.incoming_event,
        sourceId: recordId,
        input: { event },
      })
    }
    // 'direct' path reserved for future use
  }
}
