import { Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { createHash } from 'node:crypto'
import { OrchestratorTaskType, OrchestratorSourceType, Prisma } from '@generated/client'
import { OrchestratorTaskRepository } from '../repository/orchestrator-task.repository'
import { ORCHESTRATOR_TASKS_QUEUE } from '../types'

export type PublishInput = {
  projectId: string
  type: OrchestratorTaskType
  sourceType: OrchestratorSourceType
  sourceId: string
  input: Prisma.JsonValue
}

export type PublishResult = {
  taskId: string
  created: boolean
}

@Injectable()
export class OrchestratorTaskPublisher {
  constructor(
    private readonly repo: OrchestratorTaskRepository,
    @InjectQueue(ORCHESTRATOR_TASKS_QUEUE) private readonly queue: Queue,
  ) {}

  async publish(input: PublishInput): Promise<PublishResult> {
    const idempotencyKey = this.buildKey(input.sourceType, input.sourceId, input.type)

    const existing = await this.repo.findByIdempotencyKey(idempotencyKey)
    if (existing) {
      return { taskId: existing.id, created: false }
    }

    const task = await this.repo.create({
      projectId: input.projectId,
      type: input.type,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      idempotencyKey,
      input: input.input,
    })

    // Enqueue after DB commit — never inside a transaction
    await this.queue.add('run', { taskId: task.id })

    return { taskId: task.id, created: true }
  }

  private buildKey(
    sourceType: OrchestratorSourceType,
    sourceId: string,
    taskType: OrchestratorTaskType,
  ): string {
    return createHash('sha256')
      .update(`${sourceType}:${sourceId}:${taskType}`)
      .digest('hex')
  }
}
