import { Injectable } from '@nestjs/common'
import type { Project, Node } from '@generated/client'
import { PrismaService } from '../../prisma/prisma.service'
import type { PrismaTx } from '../../prisma/prisma.service'

export type ProjectCreateData = { name: string; description?: string }
export type ProjectUpdateData = { name?: string; description?: string }

@Injectable()
export class ProjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createWithRootTx(
    data: ProjectCreateData,
    nodeInit: (tx: PrismaTx, projectId: string) => Promise<Node>,
  ): Promise<{ project: Project; rootNode: Node }> {
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({ data })
      const rootNode = await nodeInit(tx, project.id)
      return { project, rootNode }
    })
  }

  async findById(id: string): Promise<Project | null> {
    return this.prisma.project.findUnique({ where: { id } })
  }

  async list(): Promise<Project[]> {
    return this.prisma.project.findMany()
  }

  async update(id: string, data: ProjectUpdateData): Promise<Project> {
    return this.prisma.project.update({ where: { id }, data })
  }

  async removeWithCascade(id: string): Promise<{ counts: { nodes: number; edges: number; entries: number } }> {
    return this.prisma.$transaction(async (tx) => {
      const [nodeCount, edgeCount, entryCount] = await Promise.all([
        tx.node.count({ where: { projectId: id } }),
        tx.edge.count({ where: { projectId: id } }),
        tx.knowledgeEntry.count({ where: { projectId: id } }),
      ])

      const entryIds = (
        await tx.knowledgeEntry.findMany({ where: { projectId: id }, select: { id: true } })
      ).map(e => e.id)

      if (entryIds.length > 0) {
        await tx.knowledgeRevision.deleteMany({ where: { entryId: { in: entryIds } } })
      }
      await tx.knowledgeEntry.deleteMany({ where: { projectId: id } })
      await tx.edge.deleteMany({ where: { projectId: id } })
      await tx.node.deleteMany({ where: { projectId: id } })
      await tx.project.delete({ where: { id } })

      return { counts: { nodes: nodeCount, edges: edgeCount, entries: entryCount } }
    })
  }
}
