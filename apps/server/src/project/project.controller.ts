import { Controller, Post, Get, Patch, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger'
import { createZodDto, ZodResponse } from 'nestjs-zod'
import type { Project } from '@generated/client'
import {
  createProjectEndpoint,
  deleteProjectEndpoint,
  getProjectEndpoint,
  listProjectsEndpoint,
  updateProjectEndpoint,
  type ProjectResponse,
} from '@zet-plane/contracts'
import { ProjectService } from './project.service'

class CreateProjectDto extends createZodDto(createProjectEndpoint.request) {}
class CreateProjectResponseDto extends createZodDto(createProjectEndpoint.response) {}
class ListProjectsResponseDto extends createZodDto(listProjectsEndpoint.response) {}
class ProjectParamsDto extends createZodDto(getProjectEndpoint.params) {}
class GetProjectResponseDto extends createZodDto(getProjectEndpoint.response) {}
class UpdateProjectDto extends createZodDto(updateProjectEndpoint.request) {}
class UpdateProjectResponseDto extends createZodDto(updateProjectEndpoint.response) {}
class DeleteProjectParamsDto extends createZodDto(deleteProjectEndpoint.params) {}

function toProjectResponse(project: Project): ProjectResponse {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  }
}

@ApiTags('projects')
@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @ApiOperation({ summary: 'Create a project and its root node' })
  @ZodResponse({ status: 201, type: CreateProjectResponseDto })
  async create(@Body() body: CreateProjectDto): Promise<ProjectResponse> {
    const project = await this.projectService.create(body)
    return toProjectResponse(project)
  }

  @Get()
  @ApiOperation({ summary: 'List all projects' })
  @ZodResponse({ status: 200, type: ListProjectsResponseDto })
  async list(): Promise<ProjectResponse[]> {
    const projects = await this.projectService.list()
    return projects.map(toProjectResponse)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a project by ID' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ZodResponse({ status: 200, type: GetProjectResponseDto })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async findById(@Param() params: ProjectParamsDto): Promise<ProjectResponse> {
    const project = await this.projectService.findById(params.id)
    return toProjectResponse(project)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update project name or description' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ZodResponse({ status: 200, type: UpdateProjectResponseDto })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async update(@Param() params: ProjectParamsDto, @Body() body: UpdateProjectDto): Promise<ProjectResponse> {
    const project = await this.projectService.update(params.id, body)
    return toProjectResponse(project)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Hard delete a project and all its data' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Project not found' })
  remove(@Param() params: DeleteProjectParamsDto) {
    return this.projectService.remove(params.id)
  }
}
