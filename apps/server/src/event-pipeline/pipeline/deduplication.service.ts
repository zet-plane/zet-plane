import { Injectable } from '@nestjs/common'
import { IncomingEventStatus } from '@generated/client'
import { IncomingEventRepository } from '../repository/incoming-event.repository'
import type { NormalizedEvent } from '../types'

export type DedupResult = { status: 'new'; recordId: string } | { status: 'duplicate' }

@Injectable()
export class DeduplicationService {
  constructor(private readonly repo: IncomingEventRepository) {}

  async checkAndInsert(event: NormalizedEvent): Promise<DedupResult> {
    const existing = await this.repo.findByIdempotencyKey(event.idempotencyKey)
    if (existing) {
      await this.repo.updateStatus(existing.id, IncomingEventStatus.deduplicated)
      return { status: 'duplicate' }
    }
    const record = await this.repo.insert(event)
    return { status: 'new', recordId: record.id }
  }
}
