import { Controller, Post, Patch, Get, Delete, Param, Body, BadRequestException, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiResponse } from '@nestjs/swagger'
import { createZodDto, ZodResponse } from 'nestjs-zod'
import { NodeType, CreatedBy } from '@generated/client'
import { createNodeEndpoint, NodeResponse } from '@zet-plane/contracts'
import { GraphService } from './graph.service'
import {
  UpdateNodeDto,
  ResolveCheckpointDto,
  DeleteNodeDto,
  NodeEntity,
  SubgraphEntity,
  DeleteNodeResultEntity,
} from './dto/node.dto'
import { CreateEdgeDto, ReplaceEdgesDto, EdgeEntity } from './dto/edge.dto'

class CreateNodeDto extends createZodDto(createNodeEndpoint.request) {}
class CreateNodeParamsDto extends createZodDto(createNodeEndpoint.params) {}
class CreateNodeResponseDto extends createZodDto(createNodeEndpoint.response) {}

@ApiTags('graph')
@Controller()
export class GraphController {
  constructor(private readonly graphService: GraphService) {}

  // ── Nodes ─────────────────────────────────────────────────────────────

  @Post('projects/:id/nodes')
  @ApiOperation({ summary: 'Create a node in a project' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ZodResponse({ status: 201, type: CreateNodeResponseDto })
  async createNode(
    @Param() params: CreateNodeParamsDto,
    @Body() body: CreateNodeDto,
  ): Promise<NodeResponse> {
    const node = await this.graphService.createNode({
      projectId: params.id,
      title: body.title,
      description: body.description,
      parentNodeId: body.parentId,
      type: NodeType.scaffold,
      createdBy: CreatedBy.human,
    })
    return {
      id: node.id,
      projectId: node.projectId,
      title: node.title,
      status: node.status as NodeResponse['status'],
      description: node.description,
      isProjectRoot: node.isProjectRoot,
      createdAt: node.createdAt.toISOString(),
      updatedAt: node.updatedAt.toISOString(),
    }
  }

  @Get('projects/:id/nodes')
  @ApiOperation({ summary: 'List all nodes in a project' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({ status: 200, type: [NodeEntity] })
  listNodes(@Param('id') projectId: string) {
    return this.graphService.listProjectNodes(projectId)
  }

  @Get('nodes/:id/subgraph')
  @ApiOperation({ summary: 'Get a node subgraph (all descendants and their edges)' })
  @ApiParam({ name: 'id', description: 'Node ID' })
  @ApiResponse({ status: 200, type: SubgraphEntity })
  @ApiResponse({ status: 404, description: 'Node not found' })
  getSubgraph(@Param('id') nodeId: string) {
    return this.graphService.getSubgraph(nodeId)
  }

  @Patch('nodes/:id')
  @ApiOperation({ summary: 'Update node fields or transition status (mutually exclusive)' })
  @ApiParam({ name: 'id', description: 'Node ID' })
  @ApiBody({ type: UpdateNodeDto })
  @ApiResponse({ status: 200, type: NodeEntity })
  @ApiResponse({ status: 400, description: 'Cannot mix status with field updates in a single request' })
  @ApiResponse({ status: 404, description: 'Node not found' })
  @ApiResponse({ status: 409, description: 'Invalid status transition or node archived' })
  async updateNode(
    @Param('id') nodeId: string,
    @Body() body: UpdateNodeDto,
  ) {
    const { status, ...rest } = body
    if (status !== undefined) {
      if (Object.keys(rest).some(k => rest[k as keyof typeof rest] !== undefined)) {
        throw new BadRequestException('Cannot mix status update with field updates in a single request')
      }
      return this.graphService.updateStatus(nodeId, status)
    }
    return this.graphService.updateNode(nodeId, rest)
  }

  @Patch('nodes/:id/resolution')
  @ApiOperation({ summary: 'Resolve a blocked checkpoint node' })
  @ApiParam({ name: 'id', description: 'Node ID' })
  @ApiBody({ type: ResolveCheckpointDto })
  @ApiResponse({ status: 200, type: NodeEntity })
  @ApiResponse({ status: 404, description: 'Node not found' })
  @ApiResponse({ status: 409, description: 'Node is not a blocked checkpoint' })
  resolveCheckpoint(
    @Param('id') nodeId: string,
    @Body() body: ResolveCheckpointDto,
  ) {
    return this.graphService.resolveCheckpoint(nodeId, body.resolution)
  }

  @Delete('nodes/:id')
  @ApiOperation({ summary: 'Delete a node with configurable child-handling strategy' })
  @ApiParam({ name: 'id', description: 'Node ID' })
  @ApiBody({ type: DeleteNodeDto, required: false })
  @ApiResponse({ status: 200, type: DeleteNodeResultEntity })
  @ApiResponse({ status: 404, description: 'Node not found' })
  @ApiResponse({ status: 409, description: 'Cannot delete project root, or child nodes are blocked' })
  deleteNode(
    @Param('id') nodeId: string,
    @Body() body?: DeleteNodeDto,
  ) {
    return this.graphService.deleteNode(nodeId, body?.strategy)
  }

  // ── Edges ─────────────────────────────────────────────────────────────

  @Post('projects/:projectId/edges')
  @ApiOperation({ summary: 'Create an edge between two nodes' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiBody({ type: CreateEdgeDto })
  @ApiResponse({ status: 201, type: EdgeEntity })
  @ApiResponse({ status: 404, description: 'Source or target node not found' })
  @ApiResponse({ status: 409, description: 'Edge already exists or would introduce a cycle' })
  createEdge(
    @Param('projectId') projectId: string,
    @Body() body: CreateEdgeDto,
  ) {
    return this.graphService.createEdge({ projectId, ...body })
  }

  @Get('projects/:id/edges')
  @ApiOperation({ summary: 'List all edges in a project' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({ status: 200, type: [EdgeEntity] })
  listEdges(@Param('id') projectId: string) {
    return this.graphService.listProjectEdges(projectId)
  }

  @Delete('edges/:id')
  @ApiOperation({ summary: 'Delete an edge' })
  @ApiParam({ name: 'id', description: 'Edge ID' })
  @ApiResponse({ status: 204, description: 'Edge deleted' })
  @ApiResponse({ status: 404, description: 'Edge not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteEdge(@Param('id') edgeId: string) {
    return this.graphService.deleteEdge(edgeId)
  }

  @Patch('nodes/:id/edges')
  @ApiOperation({ summary: "Replace a node's incoming edge of a given type" })
  @ApiParam({ name: 'id', description: 'Node ID' })
  @ApiBody({ type: ReplaceEdgesDto })
  @ApiResponse({ status: 200, type: EdgeEntity })
  @ApiResponse({ status: 404, description: 'Node not found' })
  @ApiResponse({ status: 409, description: 'Replacement would introduce a cycle' })
  replaceEdges(
    @Param('id') nodeId: string,
    @Body() body: ReplaceEdgesDto,
  ) {
    return this.graphService.replaceNodeEdges(nodeId, body.type, body.newFromId, body.projectId, body.createdBy)
  }
}
