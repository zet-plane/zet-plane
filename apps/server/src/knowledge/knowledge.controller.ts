import { Controller, Post, Patch, Get, Delete, Param, Body, Query, BadRequestException, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger'
import { createZodDto, ZodResponse } from 'nestjs-zod'
import type { KnowledgeEntry, KnowledgeRevision } from '@generated/client'
import type { SearchResult } from './repository/knowledge.repository'
import {
  createEntryEndpoint,
  deleteEntryEndpoint,
  getEntryEndpoint,
  getEntryRevisionEndpoint,
  listEntriesEndpoint,
  listEntryRevisionsEndpoint,
  searchEntriesEndpoint,
  storeEntryEmbeddingEndpoint,
  updateEntryBodyEndpoint,
  updateEntryEndpoint,
  type KnowledgeEntryResponse,
  type KnowledgeRevisionResponse,
  type SearchResultResponse,
} from '@zet-plane/contracts'
import { EntryService } from './entry/entry.service'
import { RevisionService } from './revision/revision.service'
import { SearchService } from './search/search.service'

class ProjectParamsDto extends createZodDto(createEntryEndpoint.params) {}
class CreateEntryDto extends createZodDto(createEntryEndpoint.request) {}
class CreateEntryResponseDto extends createZodDto(createEntryEndpoint.response) {}
class ListEntriesQueryDto extends createZodDto(listEntriesEndpoint.query) {}
class ListEntriesResponseDto extends createZodDto(listEntriesEndpoint.response) {}
class EntryParamsDto extends createZodDto(getEntryEndpoint.params) {}
class EntryResponseDto extends createZodDto(getEntryEndpoint.response) {}
class UpdateEntryDto extends createZodDto(updateEntryEndpoint.request) {}
class UpdateEntryResponseDto extends createZodDto(updateEntryEndpoint.response) {}
class DeleteEntryResponseDto extends createZodDto(deleteEntryEndpoint.response) {}
class UpdateBodyDto extends createZodDto(updateEntryBodyEndpoint.request) {}
class RevisionResponseDto extends createZodDto(updateEntryBodyEndpoint.response) {}
class ListRevisionsResponseDto extends createZodDto(listEntryRevisionsEndpoint.response) {}
class RevisionParamsDto extends createZodDto(getEntryRevisionEndpoint.params) {}
class StoreEmbeddingDto extends createZodDto(storeEntryEmbeddingEndpoint.request) {}
class SearchDto extends createZodDto(searchEntriesEndpoint.request) {}
class SearchResponseDto extends createZodDto(searchEntriesEndpoint.response) {}

function toEntryResponse(entry: KnowledgeEntry): KnowledgeEntryResponse {
  return {
    id: entry.id,
    projectId: entry.projectId,
    nodeId: entry.nodeId,
    category: entry.category,
    title: entry.title,
    body: entry.body,
    status: entry.status,
    embeddingStatus: entry.embeddingStatus,
    createdBy: entry.createdBy,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  }
}

function toRevisionResponse(revision: KnowledgeRevision): KnowledgeRevisionResponse {
  return {
    id: revision.id,
    entryId: revision.entryId,
    version: revision.version,
    body: revision.body,
    changeNote: revision.changeNote,
    createdBy: revision.createdBy,
    createdAt: revision.createdAt.toISOString(),
  }
}

function toSearchResultResponse(result: SearchResult): SearchResultResponse {
  return {
    id: result.id,
    projectId: result.projectId,
    nodeId: result.nodeId,
    category: result.category,
    title: result.title,
    body: result.body,
    status: result.status,
    embeddingStatus: result.embeddingStatus,
    createdBy: result.createdBy,
    createdAt: result.createdAt.toISOString(),
    updatedAt: result.updatedAt.toISOString(),
    score: result.score,
  }
}

@ApiTags('knowledge')
@Controller()
export class KnowledgeController {
  constructor(
    private readonly entryService: EntryService,
    private readonly revisionService: RevisionService,
    private readonly searchService: SearchService,
  ) {}

  @Post('projects/:id/entries')
  @ApiOperation({ summary: 'Create a knowledge entry anchored to a graph node' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ZodResponse({ status: 201, type: CreateEntryResponseDto })
  async createEntry(
    @Param() params: ProjectParamsDto,
    @Body() body: CreateEntryDto,
  ): Promise<KnowledgeEntryResponse> {
    const entry = await this.entryService.createEntry({ projectId: params.id, ...body })
    return toEntryResponse(entry)
  }

  @Get('projects/:id/entries')
  @ApiOperation({ summary: 'List knowledge entries in a project' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ZodResponse({ status: 200, type: ListEntriesResponseDto })
  async listEntries(
    @Param() params: ProjectParamsDto,
    @Query() query: ListEntriesQueryDto,
  ): Promise<KnowledgeEntryResponse[]> {
    const entries = await this.entryService.listEntries(params.id, query)
    return entries.map(toEntryResponse)
  }

  @Get('entries/:id')
  @ApiOperation({ summary: 'Get a knowledge entry by ID' })
  @ApiParam({ name: 'id', description: 'Entry ID' })
  @ZodResponse({ status: 200, type: EntryResponseDto })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  async getEntry(@Param() params: EntryParamsDto): Promise<KnowledgeEntryResponse> {
    const entry = await this.entryService.getEntry(params.id)
    return toEntryResponse(entry)
  }

  @Patch('entries/:id')
  @ApiOperation({ summary: 'Update entry fields, transition status, or reanchor to another node' })
  @ApiParam({ name: 'id', description: 'Entry ID' })
  @ZodResponse({ status: 200, type: UpdateEntryResponseDto })
  @ApiResponse({ status: 400, description: 'Cannot mix status, nodeId, or field updates in a single request' })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  @ApiResponse({ status: 409, description: 'Entry deprecated or invalid status transition' })
  async updateEntry(
    @Param() params: EntryParamsDto,
    @Body() body: UpdateEntryDto,
  ): Promise<KnowledgeEntryResponse> {
    const { status, nodeId, ...fields } = body
    if (status !== undefined) {
      if (nodeId !== undefined || Object.values(fields).some(v => v !== undefined)) {
        throw new BadRequestException('Cannot mix status, nodeId, or field updates in a single request')
      }
      const entry = await this.entryService.updateStatus(params.id, status)
      return toEntryResponse(entry)
    }
    if (nodeId !== undefined) {
      if (Object.values(fields).some(v => v !== undefined)) {
        throw new BadRequestException('Cannot mix nodeId with field updates in a single request')
      }
      const entry = await this.entryService.reanchor(params.id, nodeId)
      return toEntryResponse(entry)
    }
    const entry = await this.entryService.updateFields(params.id, fields)
    return toEntryResponse(entry)
  }

  @Delete('entries/:id')
  @ApiOperation({ summary: 'Soft-delete a knowledge entry (sets status to deprecated)' })
  @ApiParam({ name: 'id', description: 'Entry ID' })
  @ZodResponse({ status: 200, type: DeleteEntryResponseDto })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  async deleteEntry(@Param() params: EntryParamsDto): Promise<KnowledgeEntryResponse> {
    const entry = await this.entryService.softDelete(params.id)
    return toEntryResponse(entry)
  }

  @Patch('entries/:id/body')
  @ApiOperation({ summary: 'Append a new body revision to a knowledge entry' })
  @ApiParam({ name: 'id', description: 'Entry ID' })
  @ZodResponse({ status: 200, type: RevisionResponseDto })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  @ApiResponse({ status: 409, description: 'Entry deprecated' })
  async updateBody(
    @Param() params: EntryParamsDto,
    @Body() body: UpdateBodyDto,
  ): Promise<KnowledgeRevisionResponse> {
    const revision = await this.revisionService.appendRevision(params.id, body)
    return toRevisionResponse(revision)
  }

  @Get('entries/:id/revisions')
  @ApiOperation({ summary: 'List all revisions of a knowledge entry' })
  @ApiParam({ name: 'id', description: 'Entry ID' })
  @ZodResponse({ status: 200, type: ListRevisionsResponseDto })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  async listRevisions(@Param() params: EntryParamsDto): Promise<KnowledgeRevisionResponse[]> {
    const revisions = await this.revisionService.listRevisions(params.id)
    return revisions.map(toRevisionResponse)
  }

  @Get('entries/:id/revisions/:version')
  @ApiOperation({ summary: 'Get a specific revision of a knowledge entry' })
  @ApiParam({ name: 'id', description: 'Entry ID' })
  @ApiParam({ name: 'version', description: 'Revision version number' })
  @ZodResponse({ status: 200, type: RevisionResponseDto })
  @ApiResponse({ status: 404, description: 'Entry or revision not found' })
  async getRevision(@Param() params: RevisionParamsDto): Promise<KnowledgeRevisionResponse> {
    const revision = await this.revisionService.getRevision(params.id, params.version)
    return toRevisionResponse(revision)
  }

  @Patch('entries/:id/embedding')
  @ApiOperation({ summary: 'Store a precomputed embedding vector for an entry' })
  @ApiParam({ name: 'id', description: 'Entry ID' })
  @ApiResponse({ status: 204, description: 'Embedding stored successfully' })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  @ApiResponse({ status: 409, description: 'Entry deprecated' })
  @HttpCode(HttpStatus.NO_CONTENT)
  storeEmbedding(@Param() params: EntryParamsDto, @Body() body: StoreEmbeddingDto) {
    return this.searchService.storeEmbedding(params.id, body.vector)
  }

  @Post('projects/:id/entries/search')
  @ApiOperation({ summary: 'Semantic vector search over knowledge entries' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ZodResponse({ status: 200, type: SearchResponseDto })
  async search(
    @Param() params: ProjectParamsDto,
    @Body() body: SearchDto,
  ): Promise<SearchResultResponse[]> {
    const { vector, filters, limit, threshold } = body
    const results = await this.searchService.search(params.id, vector, { filters, limit, threshold })
    return results.map(toSearchResultResponse)
  }
}
