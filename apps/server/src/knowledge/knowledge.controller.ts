import { Controller, Post, Patch, Get, Delete, Param, Body, Query, BadRequestException, UsePipes, ValidationPipe } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiResponse, ApiQuery } from '@nestjs/swagger'
import { EntryCategory, EntryStatus } from '@generated/client'
import { EntryService } from './entry/entry.service'
import { RevisionService } from './revision/revision.service'
import { SearchService } from './search/search.service'
import {
  CreateEntryDto,
  UpdateEntryDto,
  UpdateBodyDto,
  KnowledgeEntryEntity,
  KnowledgeRevisionEntity,
} from './dto/entry.dto'
import { StoreEmbeddingDto, SearchDto, SearchResultEntity } from './dto/search.dto'

@ApiTags('knowledge')
@Controller()
@UsePipes(new ValidationPipe({ transform: true }))
export class KnowledgeController {
  constructor(
    private readonly entryService: EntryService,
    private readonly revisionService: RevisionService,
    private readonly searchService: SearchService,
  ) {}

  @Post('projects/:id/entries')
  @ApiOperation({ summary: 'Create a knowledge entry anchored to a graph node' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiBody({ type: CreateEntryDto })
  @ApiResponse({ status: 201, type: KnowledgeEntryEntity })
  createEntry(
    @Param('id') projectId: string,
    @Body() body: CreateEntryDto,
  ) {
    return this.entryService.createEntry({ projectId, ...body })
  }

  @Get('projects/:id/entries')
  @ApiOperation({ summary: 'List knowledge entries in a project' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiQuery({ name: 'category', enum: EntryCategory, enumName: 'EntryCategory', required: false })
  @ApiQuery({ name: 'nodeId', required: false, description: 'Filter by anchor node ID' })
  @ApiQuery({ name: 'status', enum: EntryStatus, enumName: 'EntryStatus', required: false })
  @ApiResponse({ status: 200, type: [KnowledgeEntryEntity] })
  listEntries(
    @Param('id') projectId: string,
    @Query('category') category?: EntryCategory,
    @Query('nodeId') nodeId?: string,
    @Query('status') status?: EntryStatus,
  ) {
    return this.entryService.listEntries(projectId, { category, nodeId, status })
  }

  @Get('entries/:id')
  @ApiOperation({ summary: 'Get a knowledge entry by ID' })
  @ApiParam({ name: 'id', description: 'Entry ID' })
  @ApiResponse({ status: 200, type: KnowledgeEntryEntity })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  getEntry(@Param('id') id: string) {
    return this.entryService.getEntry(id)
  }

  @Patch('entries/:id')
  @ApiOperation({ summary: 'Update entry fields, transition status, or reanchor to another node' })
  @ApiParam({ name: 'id', description: 'Entry ID' })
  @ApiBody({ type: UpdateEntryDto })
  @ApiResponse({ status: 200, type: KnowledgeEntryEntity })
  @ApiResponse({ status: 400, description: 'Cannot mix status, nodeId, or field updates in a single request' })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  @ApiResponse({ status: 409, description: 'Entry deprecated or invalid status transition' })
  async updateEntry(
    @Param('id') id: string,
    @Body() body: UpdateEntryDto,
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
  @ApiOperation({ summary: 'Soft-delete a knowledge entry (sets status to deprecated)' })
  @ApiParam({ name: 'id', description: 'Entry ID' })
  @ApiResponse({ status: 200, type: KnowledgeEntryEntity })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  deleteEntry(@Param('id') id: string) {
    return this.entryService.softDelete(id)
  }

  @Patch('entries/:id/body')
  @ApiOperation({ summary: 'Append a new body revision to a knowledge entry' })
  @ApiParam({ name: 'id', description: 'Entry ID' })
  @ApiBody({ type: UpdateBodyDto })
  @ApiResponse({ status: 200, type: KnowledgeRevisionEntity })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  @ApiResponse({ status: 409, description: 'Entry deprecated' })
  updateBody(
    @Param('id') id: string,
    @Body() body: UpdateBodyDto,
  ) {
    return this.revisionService.appendRevision(id, body)
  }

  @Get('entries/:id/revisions')
  @ApiOperation({ summary: 'List all revisions of a knowledge entry' })
  @ApiParam({ name: 'id', description: 'Entry ID' })
  @ApiResponse({ status: 200, type: [KnowledgeRevisionEntity] })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  listRevisions(@Param('id') id: string) {
    return this.revisionService.listRevisions(id)
  }

  @Get('entries/:id/revisions/:version')
  @ApiOperation({ summary: 'Get a specific revision of a knowledge entry' })
  @ApiParam({ name: 'id', description: 'Entry ID' })
  @ApiParam({ name: 'version', description: 'Revision version number' })
  @ApiResponse({ status: 200, type: KnowledgeRevisionEntity })
  @ApiResponse({ status: 404, description: 'Entry or revision not found' })
  getRevision(@Param('id') id: string, @Param('version') version: string) {
    return this.revisionService.getRevision(id, parseInt(version, 10))
  }

  @Patch('entries/:id/embedding')
  @ApiOperation({ summary: 'Store a precomputed embedding vector for an entry' })
  @ApiParam({ name: 'id', description: 'Entry ID' })
  @ApiBody({ type: StoreEmbeddingDto })
  @ApiResponse({ status: 204, description: 'Embedding stored successfully' })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  @ApiResponse({ status: 409, description: 'Entry deprecated' })
  storeEmbedding(@Param('id') id: string, @Body() body: StoreEmbeddingDto) {
    return this.searchService.storeEmbedding(id, body.vector)
  }

  @Post('projects/:id/entries/search')
  @ApiOperation({ summary: 'Semantic vector search over knowledge entries' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiBody({ type: SearchDto })
  @ApiResponse({ status: 200, type: [SearchResultEntity] })
  search(
    @Param('id') projectId: string,
    @Body() body: SearchDto,
  ) {
    const { vector, filters, limit, threshold } = body
    return this.searchService.search(projectId, vector, { filters, limit, threshold })
  }
}
