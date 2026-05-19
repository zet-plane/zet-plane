import { Injectable } from '@nestjs/common'
import { IncomingEventRepository } from '../repository/incoming-event.repository'
import type { NormalizedEvent } from '../types'

export class NoProjectMappingError extends Error {
  constructor(source: string, hint: string) {
    super(`no project_source_mapping for ${source}:${hint}`)
    this.name = 'NoProjectMappingError'
  }
}

@Injectable()
export class EnrichmentService {
  constructor(private readonly repo: IncomingEventRepository) {}

  async resolveProjectId(event: NormalizedEvent): Promise<string> {
    const mapping = await this.repo.findSourceMapping(event.source, event.sourceProjectHint)
    if (!mapping) throw new NoProjectMappingError(event.source, event.sourceProjectHint)
    return mapping.projectId
  }
}
