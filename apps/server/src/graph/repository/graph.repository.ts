import { Injectable, NotFoundException } from '@nestjs/common'
import { NodeType, NodeStatus, EdgeType, CreatedBy, CheckpointResolution } from '@prisma/client'
import type { Node, Edge } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

export type DeleteStrategy = 'block' | 'cascade' | 'reparent-to-parent' | 'reparent-to-root'

export class HasCompositionChildrenError extends Error {
  constructor(readonly affectedNodes: string[]) {
    super('HAS_COMPOSITION_CHILDREN')
  }
}

export class AmbiguousParentError extends Error {
  constructor(readonly parents: string[]) {
    super('AMBIGUOUS_PARENT')
  }
}

export type NodeCreateData = {
  projectId: string
  type: NodeType
  title: string
  description?: string
  createdBy: CreatedBy
}

export type EdgeCreateData = {
  projectId: string
  fromId: string
  toId: string
  type: EdgeType
  createdBy: CreatedBy
}

@Injectable()
export class GraphRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Node ────────────────────────────────────────────────────────────────

  async findNode(id: string): Promise<Node | null> {
    return this.prisma.node.findUnique({ where: { id } })
  }

  async findProjectRoot(projectId: string): Promise<Node | null> {
    return this.prisma.node.findFirst({ where: { projectId, isProjectRoot: true } })
  }

  async initProjectRoot(projectId: string): Promise<Node> {
    const existing = await this.findProjectRoot(projectId)
    if (existing) return existing
    return this.prisma.node.create({
      data: {
        projectId,
        isProjectRoot: true,
        type: NodeType.scaffold,
        title: '[Project Root]',
        createdBy: CreatedBy.human,
      },
    })
  }

  async createNode(data: NodeCreateData): Promise<Node> {
    const root = await this.findProjectRoot(data.projectId)
    if (!root) throw new NotFoundException(`Project root not found for projectId=${data.projectId}`)
    return this.prisma.$transaction(async (tx) => {
      const node = await tx.node.create({ data })
      await tx.edge.create({
        data: { projectId: data.projectId, fromId: root.id, toId: node.id, type: EdgeType.composition, createdBy: data.createdBy },
      })
      return node
    })
  }

  async updateNode(
    id: string,
    data: Partial<Pick<Node, 'title' | 'description' | 'status' | 'isCheckpoint' | 'checkpointResolution'>>,
  ): Promise<Node> {
    const node = await this.prisma.node.findUnique({ where: { id } })
    if (!node) throw new NotFoundException(`Node ${id} not found`)
    return this.prisma.node.update({ where: { id }, data })
  }

  async listProjectNodes(projectId: string): Promise<Node[]> {
    return this.prisma.node.findMany({ where: { projectId, isProjectRoot: false } })
  }

  async getSubgraph(nodeId: string): Promise<{ nodes: Node[]; edges: Edge[] }> {
    const visitedIds = new Set<string>()
    const queue = [nodeId]
    while (queue.length > 0) {
      const current = queue.shift()!
      if (visitedIds.has(current)) continue
      visitedIds.add(current)
      const childEdges = await this.prisma.edge.findMany({ where: { fromId: current, type: EdgeType.composition } })
      for (const e of childEdges) queue.push(e.toId)
    }
    const ids = [...visitedIds]
    const [nodes, edges] = await Promise.all([
      this.prisma.node.findMany({ where: { id: { in: ids } } }),
      this.prisma.edge.findMany({ where: { fromId: { in: ids } } }),
    ])
    return { nodes, edges }
  }

  // ── Edge ────────────────────────────────────────────────────────────────

  async findEdge(id: string): Promise<Edge | null> {
    return this.prisma.edge.findUnique({ where: { id } })
  }

  async listProjectEdges(projectId: string): Promise<Edge[]> {
    return this.prisma.edge.findMany({ where: { projectId } })
  }

  async createEdge(
    data: EdgeCreateData,
    resolveCheckpoint: (allEdges: Edge[]) => { cyclePath: string[] | null; checkpointNodeId: string | null },
  ): Promise<{ edge: Edge; cyclePath: string[] | null; checkpointNodeId: string | null }> {
    return this.prisma.$transaction(async (tx) => {
      const edge = await tx.edge.create({ data })
      const allEdges = await tx.edge.findMany({ where: { projectId: data.projectId } })
      const { cyclePath, checkpointNodeId } = resolveCheckpoint(allEdges)
      if (checkpointNodeId) {
        await tx.node.update({
          where: { id: checkpointNodeId },
          data: { isCheckpoint: true, status: NodeStatus.blocked },
        })
      }
      return { edge, cyclePath, checkpointNodeId }
    })
  }

  async deleteEdge(id: string): Promise<void> {
    const edge = await this.prisma.edge.findUnique({ where: { id } })
    if (!edge) throw new NotFoundException(`Edge ${id} not found`)
    await this.prisma.edge.delete({ where: { id } })
  }

  async replaceNodeEdges(
    nodeId: string,
    type: EdgeType,
    newFromId: string,
    projectId: string,
    createdBy: CreatedBy,
  ): Promise<Edge> {
    return this.prisma.$transaction(async (tx) => {
      await tx.edge.deleteMany({ where: { toId: nodeId, type } })
      return tx.edge.create({ data: { projectId, fromId: newFromId, toId: nodeId, type, createdBy } })
    })
  }

  // ── Validation queries ───────────────────────────────────────────────────

  async findCompositionChildren(nodeId: string): Promise<Node[]> {
    const edges = await this.prisma.edge.findMany({ where: { fromId: nodeId, type: EdgeType.composition } })
    if (!edges.length) return []
    return this.prisma.node.findMany({ where: { id: { in: edges.map(e => e.toId) } } })
  }

  async findDependencyTargets(nodeId: string): Promise<Node[]> {
    const edges = await this.prisma.edge.findMany({ where: { fromId: nodeId, type: EdgeType.dependency } })
    if (!edges.length) return []
    return this.prisma.node.findMany({ where: { id: { in: edges.map(e => e.toId) } } })
  }

  async findCompositionParents(nodeId: string): Promise<Node[]> {
    const edges = await this.prisma.edge.findMany({ where: { toId: nodeId, type: EdgeType.composition } })
    if (!edges.length) return []
    return this.prisma.node.findMany({ where: { id: { in: edges.map(e => e.fromId) } } })
  }

  // ── Delete strategies ────────────────────────────────────────────────────

  async deleteNodeWithStrategy(
    nodeId: string,
    projectId: string,
    strategy: DeleteStrategy,
  ): Promise<string[]> {
    switch (strategy) {
      case 'block': return this.deleteBlock(nodeId)
      case 'cascade': return this.deleteCascade(nodeId)
      case 'reparent-to-parent': return this.deleteReparentToParent(nodeId, projectId)
      case 'reparent-to-root': return this.deleteReparentToRoot(nodeId, projectId)
    }
  }

  private async deleteBlock(nodeId: string): Promise<string[]> {
    const children = await this.findCompositionChildren(nodeId)
    if (children.length > 0) {
      throw new HasCompositionChildrenError(children.map(c => c.id))
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.edge.deleteMany({ where: { OR: [{ fromId: nodeId }, { toId: nodeId }] } })
      await tx.node.update({ where: { id: nodeId }, data: { status: NodeStatus.archived } })
    })
    return []
  }

  private async deleteCascade(nodeId: string): Promise<string[]> {
    const affectedIds: string[] = []
    const queue = [nodeId]
    while (queue.length) {
      const current = queue.shift()!
      const children = await this.findCompositionChildren(current)
      for (const child of children) {
        affectedIds.push(child.id)
        queue.push(child.id)
      }
    }
    await this.prisma.$transaction(async (tx) => {
      const allIds = [nodeId, ...affectedIds]
      await tx.edge.deleteMany({
        where: { OR: [{ fromId: { in: allIds } }, { toId: { in: allIds } }] },
      })
      await tx.node.updateMany({ where: { id: { in: allIds } }, data: { status: NodeStatus.archived } })
    })
    return affectedIds
  }

  private async deleteReparentToParent(nodeId: string, projectId: string): Promise<string[]> {
    const parents = await this.findCompositionParents(nodeId)
    if (parents.length !== 1) {
      throw new AmbiguousParentError(parents.map(p => p.id))
    }
    const parent = parents[0]
    const children = await this.findCompositionChildren(nodeId)
    await this.prisma.$transaction(async (tx) => {
      await tx.edge.deleteMany({ where: { OR: [{ fromId: nodeId }, { toId: nodeId }] } })
      for (const child of children) {
        await tx.edge.create({
          data: { projectId, fromId: parent.id, toId: child.id, type: EdgeType.composition, createdBy: CreatedBy.human },
        })
      }
      await tx.node.update({ where: { id: nodeId }, data: { status: NodeStatus.archived } })
    })
    return children.map(c => c.id)
  }

  private async deleteReparentToRoot(nodeId: string, projectId: string): Promise<string[]> {
    const root = await this.findProjectRoot(projectId)
    if (!root) throw new NotFoundException('Project root not found')
    const children = await this.findCompositionChildren(nodeId)
    await this.prisma.$transaction(async (tx) => {
      await tx.edge.deleteMany({ where: { OR: [{ fromId: nodeId }, { toId: nodeId }] } })
      for (const child of children) {
        await tx.edge.create({
          data: { projectId, fromId: root.id, toId: child.id, type: EdgeType.composition, createdBy: CreatedBy.human },
        })
      }
      await tx.node.update({ where: { id: nodeId }, data: { status: NodeStatus.archived } })
    })
    return children.map(c => c.id)
  }
}
