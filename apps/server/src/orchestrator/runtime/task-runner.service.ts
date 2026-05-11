import { Injectable } from '@nestjs/common'
import type { OrchestratorTask } from '../types'
import type { AgentInsight } from '../types'

@Injectable()
export class TaskRunnerService {
  async run(_task: OrchestratorTask): Promise<AgentInsight> {
    // Full routing implemented in Task 12
    throw new Error('TaskRunnerService.run not yet implemented')
  }
}
