import { Injectable } from '@nestjs/common'
import { Prisma, OrchestratorTaskStatus, OrchestratorTaskType, OrchestratorSourceType } from '@generated/client'
import type { OrchestratorTask } from '@generated/client'
import { PrismaService } from '../../prisma/prisma.service'

export type CreateTaskData = {
  projectId: string
  type: OrchestratorTaskType
  sourceType: OrchestratorSourceType
  sourceId: string
  idempotencyKey: string
  input: Prisma.JsonValue
}

export type UpdateStatusExtra = {
  modelResult?: Prisma.JsonValue
  error?: Prisma.JsonValue
}

@Injectable()
export class OrchestratorTaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateTaskData): Promise<OrchestratorTask> {
    return this.prisma.orchestratorTask.create({
      data: {
        projectId: data.projectId,
        type: data.type,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        idempotencyKey: data.idempotencyKey,
        input: data.input as Prisma.InputJsonValue,
        status: OrchestratorTaskStatus.pending,
      },
    })
  }

  async findById(id: string): Promise<OrchestratorTask | null> {
    return this.prisma.orchestratorTask.findUnique({ where: { id } })
  }

  async findByIdempotencyKey(key: string): Promise<OrchestratorTask | null> {
    return this.prisma.orchestratorTask.findUnique({ where: { idempotencyKey: key } })
  }

  async updateStatus(
    id: string,
    status: OrchestratorTaskStatus,
    extra: UpdateStatusExtra = {},
  ): Promise<OrchestratorTask> {
    return this.prisma.orchestratorTask.update({
      where: { id },
      data: {
        status,
        ...(extra.modelResult !== undefined && { modelResult: extra.modelResult as Prisma.InputJsonValue }),
        ...(extra.error !== undefined && { error: extra.error as Prisma.InputJsonValue }),
      },
    })
  }

  async findRecentByProject(projectId: string, limit: number): Promise<OrchestratorTask[]> {
    return this.prisma.orchestratorTask.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  }
}
