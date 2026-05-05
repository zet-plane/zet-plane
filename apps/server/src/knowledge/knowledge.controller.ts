import { Controller, Post, Patch, Get, Delete, Param, Body, Query, BadRequestException } from '@nestjs/common'
import { EntryCategory, EntryStatus, CreatedBy } from '@generated/client'
import { EntryService } from './entry/entry.service'
import { RevisionService } from './revision/revision.service'
import { SearchService } from './search/search.service'
import type { SearchFilter } from './repository/knowledge.repository'

@Controller()
export class KnowledgeController {
  constructor(
    private readonly entryService: EntryService,
    private readonly revisionService: RevisionService,
    private readonly searchService: SearchService,
  ) {}

  @Post('projects/:id/entries')
  createEntry(
    @Param('id') projectId: string,
    @Body() body: { nodeId: string; category: EntryCategory; title: string; body: unknown; changeNote?: string; createdBy: CreatedBy },
  ) {
    return this.entryService.createEntry({ projectId, ...body })
  }

  @Get('projects/:id/entries')
  listEntries(
    @Param('id') projectId: string,
    @Query('category') category?: EntryCategory,
    @Query('nodeId') nodeId?: string,
    @Query('status') status?: EntryStatus,
  ) {
    return this.entryService.listEntries(projectId, { category, nodeId, status })
  }

  @Get('entries/:id')
  getEntry(@Param('id') id: string) {
    return this.entryService.getEntry(id)
  }

  @Patch('entries/:id')
  async updateEntry(
    @Param('id') id: string,
    @Body() body: { title?: string; category?: EntryCategory; status?: EntryStatus; nodeId?: string },
  ) {
    const { status, nodeId, ...fields } = body
    if (status !== undefined) {
      if (nodeId !== undefined || Object.values(fields).some(v => v !== undefined)) {
        throw new BadRequestException('Cannot mix status, nodeId, or field updates in a single request')
      }
      return this.entryService.updateStatus(id, status)
    }
    if (nodeId !== undefined) {
      if (Object.values(fields).some(v => v !== undefined)) {
        throw new BadRequestException('Cannot mix nodeId with field updates in a single request')
      }
      return this.entryService.reanchor(id, nodeId)
    }
    return this.entryService.updateFields(id, fields)
  }

  @Delete('entries/:id')
  deleteEntry(@Param('id') id: string) {
    return this.entryService.softDelete(id)
  }

  @Patch('entries/:id/body')
  updateBody(
    @Param('id') id: string,
    @Body() body: { body: unknown; changeNote?: string; createdBy: CreatedBy },
  ) {
    return this.revisionService.appendRevision(id, body)
  }

  @Get('entries/:id/revisions')
  listRevisions(@Param('id') id: string) {
    return this.revisionService.listRevisions(id)
  }

  @Get('entries/:id/revisions/:version')
  getRevision(@Param('id') id: string, @Param('version') version: string) {
    return this.revisionService.getRevision(id, parseInt(version, 10))
  }

  @Patch('entries/:id/embedding')
  storeEmbedding(@Param('id') id: string, @Body() body: { vector: number[] }) {
    return this.searchService.storeEmbedding(id, body.vector)
  }

  @Post('projects/:id/entries/search')
  search(
    @Param('id') projectId: string,
    @Body() body: { vector: number[]; filters?: SearchFilter; limit?: number; threshold?: number },
  ) {
    const { vector, filters, limit, threshold } = body
    return this.searchService.search(projectId, vector, { filters, limit, threshold })
  }
}
