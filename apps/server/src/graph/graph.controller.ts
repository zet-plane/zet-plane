import { Controller, Post, Patch, Get, Delete, Param, Body, BadRequestException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiResponse } from '@nestjs/swagger'
import { NodeService } from './node/node.service'
import { EdgeService } from './edge/edge.service'
import {
  CreateNodeDto,
  UpdateNodeDto,
  ResolveCheckpointDto,
  DeleteNodeDto,
  NodeEntity,
  SubgraphEntity,
  DeleteNodeResultEntity,
} from './dto/node.dto'
import { CreateEdgeDto, ReplaceEdgesDto, EdgeEntity } from './dto/edge.dto'

@ApiTags('graph')
@Controller()
export class GraphController {
  constructor(
    private readonly nodeService: NodeService,
    private readonly edgeService: EdgeService,
  ) {}

  // ── Nodes ─────────────────────────────────────────────────────────────

  @Post('projects/:id/nodes')
  @ApiOperation({ summary: 'Create a node in a project' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiBody({ type: CreateNodeDto })
  @ApiResponse({ status: 201, type: NodeEntity })
  createNode(
    @Param('id') projectId: string,
    @Body() body: CreateNodeDto,
  ) {
    return this.nodeService.createNode({ projectId, ...body })
  }

  @Get('projects/:id/nodes')
  @ApiOperation({ summary: 'List all nodes in a project' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({ status: 200, type: [NodeEntity] })
  listNodes(@Param('id') projectId: string) {
    return this.nodeService.listProjectNodes(projectId)
  }

  @Get('nodes/:id/subgraph')
  @ApiOperation({ summary: 'Get a node subgraph (all descendants and their edges)' })
  @ApiParam({ name: 'id', description: 'Node ID' })
  @ApiResponse({ status: 200, type: SubgraphEntity })
  @ApiResponse({ status: 404, description: 'Node not found' })
  getSubgraph(@Param('id') nodeId: string) {
    return this.nodeService.getSubgraph(nodeId)
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
      return this.nodeService.updateStatus(nodeId, status)
    }
    return this.nodeService.updateNode(nodeId, rest)
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
    return this.nodeService.resolveCheckpoint(nodeId, body.resolution)
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
    return this.nodeService.deleteNode(nodeId, body?.strategy)
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
    return this.edgeService.createEdge({ projectId, ...body })
  }

  @Get('projects/:id/edges')
  @ApiOperation({ summary: 'List all edges in a project' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({ status: 200, type: [EdgeEntity] })
  listEdges(@Param('id') projectId: string) {
    return this.edgeService.listProjectEdges(projectId)
  }

  @Delete('edges/:id')
  @ApiOperation({ summary: 'Delete an edge' })
  @ApiParam({ name: 'id', description: 'Edge ID' })
  @ApiResponse({ status: 204, description: 'Edge deleted' })
  @ApiResponse({ status: 404, description: 'Edge not found' })
  deleteEdge(@Param('id') edgeId: string) {
    return this.edgeService.deleteEdge(edgeId)
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
    return this.edgeService.replaceNodeEdges(nodeId, body.type, body.newFromId, body.projectId, body.createdBy)
  }
}
