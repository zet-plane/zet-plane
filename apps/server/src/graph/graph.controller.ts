import { Controller, Post, Patch, Get, Delete, Param, Body, BadRequestException, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiResponse } from '@nestjs/swagger'
import { createZodDto, ZodResponse } from 'nestjs-zod'
import { NodeType, CreatedBy } from '@generated/client'
import type { Edge, Node } from '@generated/client'
import {
  createNodeEndpoint,
  deleteNodeEndpoint,
  getNodeSubgraphEndpoint,
  listNodesEndpoint,
  replaceNodeEdgesEndpoint,
  resolveCheckpointEndpoint,
  updateNodeEndpoint,
  type DeleteNodeResponse,
  type EdgeResponse,
  type NodeResponse,
  type SubgraphResponse,
} from '@zet-plane/contracts'
import { GraphService } from './graph.service'
import { CreateEdgeDto, EdgeEntity } from './dto/edge.dto'

class CreateNodeDto extends createZodDto(createNodeEndpoint.request) {}
class CreateNodeParamsDto extends createZodDto(createNodeEndpoint.params) {}
class CreateNodeResponseDto extends createZodDto(createNodeEndpoint.response) {}
class ListNodesParamsDto extends createZodDto(listNodesEndpoint.params) {}
class ListNodesResponseDto extends createZodDto(listNodesEndpoint.response) {}
class NodeParamsDto extends createZodDto(updateNodeEndpoint.params) {}
class SubgraphResponseDto extends createZodDto(getNodeSubgraphEndpoint.response) {}
class UpdateNodeDto extends createZodDto(updateNodeEndpoint.request) {}
class UpdateNodeResponseDto extends createZodDto(updateNodeEndpoint.response) {}
class ResolveCheckpointDto extends createZodDto(resolveCheckpointEndpoint.request) {}
class ResolveCheckpointResponseDto extends createZodDto(resolveCheckpointEndpoint.response) {}
class DeleteNodeDto extends createZodDto(deleteNodeEndpoint.request) {}
class DeleteNodeResponseDto extends createZodDto(deleteNodeEndpoint.response) {}
class ReplaceNodeEdgesDto extends createZodDto(replaceNodeEdgesEndpoint.request) {}
class ReplaceNodeEdgesResponseDto extends createZodDto(replaceNodeEdgesEndpoint.response) {}

function toNodeResponse(node: Node): NodeResponse {
  return {
    id: node.id,
    projectId: node.projectId,
    isProjectRoot: node.isProjectRoot,
    role: node.role,
    type: node.type,
    title: node.title,
    description: node.description,
    status: node.status,
    isCheckpoint: node.isCheckpoint,
    checkpointResolution: node.checkpointResolution,
    createdBy: node.createdBy,
    createdAt: node.createdAt.toISOString(),
    updatedAt: node.updatedAt.toISOString(),
  }
}

function toEdgeResponse(edge: Edge): EdgeResponse {
  return {
    id: edge.id,
    projectId: edge.projectId,
    fromId: edge.fromId,
    toId: edge.toId,
    type: edge.type,
    createdBy: edge.createdBy,
    createdAt: edge.createdAt.toISOString(),
  }
}

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
    return toNodeResponse(node)
  }

  @Get('projects/:id/nodes')
  @ApiOperation({ summary: 'List all nodes in a project' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ZodResponse({ status: 200, type: ListNodesResponseDto })
  async listNodes(@Param() params: ListNodesParamsDto): Promise<NodeResponse[]> {
    const nodes = await this.graphService.listProjectNodes(params.id)
    return nodes.map(toNodeResponse)
  }

  @Get('nodes/:id/subgraph')
  @ApiOperation({ summary: 'Get a node subgraph (all descendants and their edges)' })
  @ApiParam({ name: 'id', description: 'Node ID' })
  @ZodResponse({ status: 200, type: SubgraphResponseDto })
  @ApiResponse({ status: 404, description: 'Node not found' })
  async getSubgraph(@Param() params: NodeParamsDto): Promise<SubgraphResponse> {
    const subgraph = await this.graphService.getSubgraph(params.id)
    return {
      nodes: subgraph.nodes.map(toNodeResponse),
      edges: subgraph.edges.map(toEdgeResponse),
    }
  }

  @Patch('nodes/:id')
  @ApiOperation({ summary: 'Update node fields or transition status (mutually exclusive)' })
  @ApiParam({ name: 'id', description: 'Node ID' })
  @ApiBody({ type: UpdateNodeDto })
  @ZodResponse({ status: 200, type: UpdateNodeResponseDto })
  @ApiResponse({ status: 400, description: 'Cannot mix status with field updates in a single request' })
  @ApiResponse({ status: 404, description: 'Node not found' })
  @ApiResponse({ status: 409, description: 'Invalid status transition or node archived' })
  async updateNode(
    @Param() params: NodeParamsDto,
    @Body() body: UpdateNodeDto,
  ): Promise<NodeResponse> {
    const { status, ...rest } = body
    if (status !== undefined) {
      if (Object.keys(rest).some(k => rest[k as keyof typeof rest] !== undefined)) {
        throw new BadRequestException('Cannot mix status update with field updates in a single request')
      }
      const node = await this.graphService.updateStatus(params.id, status)
      return toNodeResponse(node)
    }
    const node = await this.graphService.updateNode(params.id, rest)
    return toNodeResponse(node)
  }

  @Patch('nodes/:id/resolution')
  @ApiOperation({ summary: 'Resolve a blocked checkpoint node' })
  @ApiParam({ name: 'id', description: 'Node ID' })
  @ApiBody({ type: ResolveCheckpointDto })
  @ZodResponse({ status: 200, type: ResolveCheckpointResponseDto })
  @ApiResponse({ status: 404, description: 'Node not found' })
  @ApiResponse({ status: 409, description: 'Node is not a blocked checkpoint' })
  async resolveCheckpoint(
    @Param() params: NodeParamsDto,
    @Body() body: ResolveCheckpointDto,
  ): Promise<NodeResponse> {
    const node = await this.graphService.resolveCheckpoint(params.id, body.resolution)
    return toNodeResponse(node)
  }

  @Delete('nodes/:id')
  @ApiOperation({ summary: 'Delete a node with configurable child-handling strategy' })
  @ApiParam({ name: 'id', description: 'Node ID' })
  @ApiBody({ type: DeleteNodeDto, required: false })
  @ZodResponse({ status: 200, type: DeleteNodeResponseDto })
  @ApiResponse({ status: 404, description: 'Node not found' })
  @ApiResponse({ status: 409, description: 'Cannot delete project root, or child nodes are blocked' })
  async deleteNode(
    @Param() params: NodeParamsDto,
    @Body() body?: DeleteNodeDto,
  ): Promise<DeleteNodeResponse> {
    return this.graphService.deleteNode(params.id, body?.strategy)
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
  @ApiBody({ type: ReplaceNodeEdgesDto })
  @ZodResponse({ status: 200, type: ReplaceNodeEdgesResponseDto })
  @ApiResponse({ status: 404, description: 'Node not found' })
  @ApiResponse({ status: 409, description: 'Replacement would introduce a cycle' })
  async replaceEdges(
    @Param() params: NodeParamsDto,
    @Body() body: ReplaceNodeEdgesDto,
  ): Promise<EdgeResponse> {
    const edge = await this.graphService.replaceNodeEdges(params.id, body.type, body.newFromId, body.projectId, body.createdBy)
    return toEdgeResponse(edge)
  }
}
