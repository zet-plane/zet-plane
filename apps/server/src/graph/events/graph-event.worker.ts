import { Logger } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { GRAPH_EVENTS_QUEUE } from './graph-event.publisher'

@Processor(GRAPH_EVENTS_QUEUE)
export class GraphEventWorker extends WorkerHost {
  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'graph.edge.created':
        Logger.log(`[graph-event] ${job.name} payload=${JSON.stringify(job.data)}`)
        break
      case 'graph.node.checkpoint_elevated':
        Logger.log(`[graph-event] ${job.name} payload=${JSON.stringify(job.data)}`)
        break
      case 'graph.node.status_changed':
        Logger.log(`[graph-event] ${job.name} payload=${JSON.stringify(job.data)}`)
        break
      case 'graph.checkpoint.resolved':
        Logger.log(`[graph-event] ${job.name} payload=${JSON.stringify(job.data)}`)
        break
      case 'graph.node.deleted':
        Logger.log(`[graph-event] ${job.name} payload=${JSON.stringify(job.data)}`)
        break
      default:
        Logger.log(`[graph-event] unknown job type: ${job.name} payload=${JSON.stringify(job.data)}`)
    }
  }
}
