import { Controller, Post, Patch, Get, Delete, Param, Body, Query, BadRequestException } from '@nestjs/common'
import { NodeType, CreatedBy, NodeStatus, EdgeType } from '@prisma/client'
import { NodeService } from './node/node.service'
import { EdgeService } from './edge/edge.service'
import type { DeleteStrategy } from './repository/graph.repository'

@Controller()
export class GraphController {
  constructor(
    private readonly nodeService: NodeService,
    private readonly edgeService: EdgeService,
  ) {}

  // ── Project init ──────────────────────────────────────────────────────

  @Post('projects/:id/init')
  initProject(@Param('id') projectId: string) {
    return this.nodeService.initProjectRoot(projectId)
  }

  // ── Nodes ─────────────────────────────────────────────────────────────

  @Post('projects/:id/nodes')
  createNode(
    @Param('id') projectId: string,
    @Body() body: { type: NodeType; title: string; description?: string; createdBy: CreatedBy },
  ) {
    return this.nodeService.createNode({ projectId, ...body })
  }

  @Get('projects/:id/nodes')
  listNodes(@Param('id') projectId: string) {
    return this.nodeService.listProjectNodes(projectId)
  }

  @Get('nodes/:id/subgraph')
  getSubgraph(@Param('id') nodeId: string) {
    return this.nodeService.getSubgraph(nodeId)
  }

  @Patch('nodes/:id')
  async updateNode(
    @Param('id') nodeId: string,
    @Body() body: { title?: string; description?: string; isCheckpoint?: boolean; status?: NodeStatus },
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
  resolveCheckpoint(
    @Param('id') nodeId: string,
    @Body() body: { resolution: 'continue' | 'loop' },
  ) {
    return this.nodeService.resolveCheckpoint(nodeId, body.resolution)
  }

  @Delete('nodes/:id')
  deleteNode(
    @Param('id') nodeId: string,
    @Query('strategy') strategy?: DeleteStrategy,
  ) {
    return this.nodeService.deleteNode(nodeId, strategy)
  }

  // ── Edges ─────────────────────────────────────────────────────────────

  @Post('projects/:projectId/edges')
  createEdge(
    @Param('projectId') projectId: string,
    @Body() body: { fromId: string; toId: string; type: EdgeType; createdBy: CreatedBy },
  ) {
    return this.edgeService.createEdge({ projectId, ...body })
  }

  @Get('projects/:id/edges')
  listEdges(@Param('id') projectId: string) {
    return this.edgeService.listProjectEdges(projectId)
  }

  @Delete('edges/:id')
  deleteEdge(@Param('id') edgeId: string) {
    return this.edgeService.deleteEdge(edgeId)
  }

  @Patch('nodes/:id/edges')
  replaceEdges(
    @Param('id') nodeId: string,
    @Body() body: { type: EdgeType; newFromId: string; projectId: string; createdBy: CreatedBy },
  ) {
    return this.edgeService.replaceNodeEdges(nodeId, body.type, body.newFromId, body.projectId, body.createdBy)
  }
}
