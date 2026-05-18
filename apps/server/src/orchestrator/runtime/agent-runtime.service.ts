import { Injectable } from '@nestjs/common'
import { OrchestratorTaskStatus, Prisma } from '@generated/client'
import { OrchestratorTaskRepository } from '../repository/orchestrator-task.repository'
import { TaskRunnerService } from './task-runner.service'
import { WaitingForApprovalSignal } from '../tools/write/notify-human.tool'
import { SkipSignal } from '../tools/write/skip.tool'
import { DomainServiceError } from '../tools/write/create-node.tool'
import type { AgentInsight } from '../types'

@Injectable()
export class AgentRuntimeService {
  constructor(
    private readonly repo: OrchestratorTaskRepository,
    private readonly runner: TaskRunnerService,
  ) {}

  async execute(taskId: string): Promise<void> {
    const task = await this.repo.findById(taskId)
    if (!task) throw new Error(`Task ${taskId} not found`)

    // Guard against BullMQ stall re-delivery: do not re-run a task already in a terminal state.
    // waiting_for_approval is DEPRECATED — checkpoint tasks no longer use it (they conclude via
    // the gate lifecycle). Kept here only to guard any legacy tasks that may already be in this
    // state. Remove once no tasks carry this status in production.
    if (
      task.status === OrchestratorTaskStatus.succeeded ||
      task.status === OrchestratorTaskStatus.waiting_for_approval
    ) {
      return
    }

    await this.repo.updateStatus(taskId, OrchestratorTaskStatus.running)

    try {
      const insight: AgentInsight = await this.runner.run(task)
      await this.repo.updateStatus(taskId, OrchestratorTaskStatus.succeeded, {
        modelResult: insight as unknown as Prisma.JsonValue,
      })
    } catch (err) {
      // DEPRECATED: WaitingForApprovalSignal / waiting_for_approval is no longer used by
      // checkpoint tasks. Checkpoint wait semantics live on the gate (blocked node), not the task.
      // This branch is kept only for backward compatibility until the status is fully removed.
      if (err instanceof WaitingForApprovalSignal) {
        await this.repo.updateStatus(taskId, OrchestratorTaskStatus.waiting_for_approval)
        return
      }
      if (err instanceof SkipSignal) {
        const insight: AgentInsight = {
          summary: err.reason,
          signalType: 'noise',
          confidence: 1,
          evidence: [],
        }
        await this.repo.updateStatus(taskId, OrchestratorTaskStatus.succeeded, {
          modelResult: insight as unknown as Prisma.JsonValue,
        })
        return
      }
      if (err instanceof DomainServiceError) {
        await this.repo.updateStatus(taskId, OrchestratorTaskStatus.failed, {
          error: { reason: err.reason },
        })
        return // no rethrow — no BullMQ retry
      }
      await this.repo.updateStatus(taskId, OrchestratorTaskStatus.failed, {
        error: { message: String(err) },
      })
      throw err // rethrow → BullMQ retries
    }
  }
}
