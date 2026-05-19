import { Injectable } from '@nestjs/common'
import { IncomingEventStatus, EventSource, Prisma } from '@generated/client'
import { PrismaService } from '../../prisma/prisma.service'
import type { NormalizedEvent } from '../types'

@Injectable()
export class IncomingEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByIdempotencyKey(key: string) {
    return this.prisma.incomingEvent.findUnique({ where: { idempotencyKey: key } })
  }

  async insert(event: NormalizedEvent) {
    return this.prisma.incomingEvent.create({
      data: {
        source: event.source as EventSource,
        idempotencyKey: event.idempotencyKey,
        eventType: event.eventType,
        payload: event.payload as Prisma.JsonValue,
        status: IncomingEventStatus.processing,
      },
    })
  }

  async updateStatus(
    id: string,
    status: IncomingEventStatus,
    extras: { projectId?: string; routedTo?: string; error?: Prisma.JsonValue } = {},
  ): Promise<void> {
    await this.prisma.incomingEvent.update({ where: { id }, data: { status, ...extras } })
  }

  async findSourceMapping(source: string, sourceKey: string) {
    return this.prisma.projectSourceMapping.findUnique({
      where: { uk_project_source_mappings_source_key: { source: source as EventSource, sourceKey } },
    })
  }
}
