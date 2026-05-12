import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import { OrchestratorTaskPublisher } from './orchestrator-task.publisher'

@Injectable()
export class TaskSchedulerService {
  private readonly logger = new Logger(TaskSchedulerService.name)

  constructor(private readonly publisher: OrchestratorTaskPublisher) {}

  @Cron(CronExpression.EVERY_HOUR)
  async triggerGraphGrowthScan(): Promise<void> {
    // TODO: iterate over active projects from ProjectRepository when it exists
    this.logger.log('graph_growth scan triggered (no active projects wired yet)')
  }

  async triggerForProject(projectId: string): Promise<void> {
    const sourceId = `schedule:${projectId}:${new Date().toISOString().slice(0, 13)}`
    await this.publisher.publish({
      projectId,
      type: OrchestratorTaskType.graph_growth,
      sourceType: OrchestratorSourceType.schedule,
      sourceId,
      input: { projectId, scheduledAt: new Date().toISOString() },
    })
  }
}
