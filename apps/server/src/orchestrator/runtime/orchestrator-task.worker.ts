import { Logger } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { ORCHESTRATOR_TASKS_QUEUE } from '../types'
import { AgentRuntimeService } from './agent-runtime.service'

@Processor(ORCHESTRATOR_TASKS_QUEUE)
export class OrchestratorTaskWorker extends WorkerHost {
  private readonly logger = new Logger(OrchestratorTaskWorker.name)

  constructor(private readonly runtime: AgentRuntimeService) {
    super()
  }

  async process(job: Job<{ taskId: string }>): Promise<void> {
    this.logger.log(`Processing task ${job.data.taskId}`)
    await this.runtime.execute(job.data.taskId)
  }
}
