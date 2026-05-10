import { Controller, Post, Get, Patch, Delete, Param, Body, HttpCode, HttpStatus, UsePipes, ValidationPipe } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiResponse } from '@nestjs/swagger'
import { ProjectService } from './project.service'
import { CreateProjectDto, UpdateProjectDto, ProjectEntity } from './dto/project.dto'

@ApiTags('projects')
@Controller('projects')
@UsePipes(new ValidationPipe({ transform: true }))
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @ApiOperation({ summary: 'Create a project and its root node' })
  @ApiBody({ type: CreateProjectDto })
  @ApiResponse({ status: 201, type: ProjectEntity })
  create(@Body() body: CreateProjectDto) {
    return this.projectService.create(body)
  }

  @Get()
  @ApiOperation({ summary: 'List all projects' })
  @ApiResponse({ status: 200, type: [ProjectEntity] })
  list() {
    return this.projectService.list()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a project by ID' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({ status: 200, type: ProjectEntity })
  @ApiResponse({ status: 404, description: 'Project not found' })
  findById(@Param('id') id: string) {
    return this.projectService.findById(id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update project name or description' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiBody({ type: UpdateProjectDto })
  @ApiResponse({ status: 200, type: ProjectEntity })
  @ApiResponse({ status: 404, description: 'Project not found' })
  update(@Param('id') id: string, @Body() body: UpdateProjectDto) {
    return this.projectService.update(id, body)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Hard delete a project and all its data' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Project not found' })
  remove(@Param('id') id: string) {
    return this.projectService.remove(id)
  }
}
