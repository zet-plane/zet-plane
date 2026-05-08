import { Injectable } from '@nestjs/common'
import { Prisma, EntryCategory, EntryStatus, EmbeddingStatus, CreatedBy } from '@generated/client'
import type { KnowledgeEntry, KnowledgeRevision } from '@generated/client'
import { PrismaService } from '../../prisma/prisma.service'

export type EntryCreateData = {
  projectId: string
  nodeId: string
  category: EntryCategory
  title: string
  body: unknown
  changeNote?: string
  createdBy: CreatedBy
}

export type EntryListFilters = {
  category?: EntryCategory
  status?: EntryStatus
  nodeId?: string
}

export type RevisionAppendData = {
  entryId: string
  body: unknown
  changeNote?: string
  createdBy: CreatedBy
}

export type SearchFilter = {
  category?: EntryCategory[]
  status?: EntryStatus[]
  nodeId?: string[]
}

export type SearchResult = {
  id: string
  projectId: string
  nodeId: string
  category: EntryCategory
  title: string
  body: unknown
  status: EntryStatus
  embeddingStatus: EmbeddingStatus
  createdBy: CreatedBy
  createdAt: Date
  updatedAt: Date
  score: number
}

@Injectable()
export class KnowledgeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createEntryWithRevision(
    data: EntryCreateData,
  ): Promise<{ entry: KnowledgeEntry; revision: KnowledgeRevision }> {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.knowledgeEntry.create({
        data: {
          projectId: data.projectId,
          nodeId: data.nodeId,
          category: data.category,
          title: data.title,
          body: data.body as Prisma.InputJsonValue,
          createdBy: data.createdBy,
        },
      })
      const revision = await tx.knowledgeRevision.create({
        data: {
          entryId: entry.id,
          version: 1,
          body: data.body as Prisma.InputJsonValue,
          changeNote: data.changeNote,
          createdBy: data.createdBy,
        },
      })
      return { entry, revision }
    })
  }

  async findEntry(id: string): Promise<KnowledgeEntry | null> {
    return this.prisma.knowledgeEntry.findUnique({ where: { id } })
  }

  async listEntries(projectId: string, filters: EntryListFilters): Promise<KnowledgeEntry[]> {
    const where: Record<string, unknown> = { projectId }
    if (filters.category !== undefined) where.category = filters.category
    if (filters.status !== undefined) where.status = filters.status
    if (filters.nodeId !== undefined) where.nodeId = filters.nodeId
    return this.prisma.knowledgeEntry.findMany({ where })
  }

  async updateEntry(
    id: string,
    data: Partial<Pick<KnowledgeEntry, 'title' | 'status' | 'category' | 'nodeId' | 'embeddingStatus'>>,
  ): Promise<KnowledgeEntry> {
    return this.prisma.knowledgeEntry.update({ where: { id }, data })
  }

  async appendRevision(data: RevisionAppendData): Promise<KnowledgeRevision> {
    const { _max } = await this.prisma.knowledgeRevision.aggregate({
      where: { entryId: data.entryId },
      _max: { version: true },
    })
    const nextVersion = (_max.version ?? 0) + 1
    return this.prisma.knowledgeRevision.create({
      data: {
        entryId: data.entryId,
        version: nextVersion,
        body: data.body as Prisma.InputJsonValue,
        changeNote: data.changeNote,
        createdBy: data.createdBy,
      },
    })
  }

  async listRevisions(entryId: string): Promise<KnowledgeRevision[]> {
    return this.prisma.knowledgeRevision.findMany({
      where: { entryId },
      orderBy: { version: 'asc' },
    })
  }

  async getRevision(entryId: string, version: number): Promise<KnowledgeRevision | null> {
    return this.prisma.knowledgeRevision.findUnique({
      where: { entryId_version: { entryId, version } },
    })
  }

  async updateEmbedding(id: string, vector: number[]): Promise<void> {
    const vectorStr = `[${vector.join(',')}]`
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "KnowledgeEntry"
      SET embedding = ${vectorStr}::vector,
          "embeddingStatus" = 'indexed',
          "updatedAt" = NOW()
      WHERE id = ${id}
    `)
  }

  async searchByVector(
    projectId: string,
    queryVector: number[],
    filters: SearchFilter,
    limit: number,
    threshold: number,
  ): Promise<SearchResult[]> {
    const vectorStr = `[${queryVector.join(',')}]`

    const conditions: Prisma.Sql[] = [
      Prisma.sql`"projectId" = ${projectId}`,
      Prisma.sql`"embeddingStatus" = 'indexed'`,
      Prisma.sql`embedding IS NOT NULL`,
      Prisma.sql`(1 - (embedding <=> ${vectorStr}::vector)) >= ${threshold}`,
    ]
    if (filters.category?.length) {
      conditions.push(Prisma.sql`category::text = ANY(ARRAY[${Prisma.join(filters.category.map(c => Prisma.sql`${c}`), ',')}]::text[])`)
    }
    if (filters.status?.length) {
      conditions.push(Prisma.sql`status::text = ANY(ARRAY[${Prisma.join(filters.status.map(s => Prisma.sql`${s}`), ',')}]::text[])`)
    }
    if (filters.nodeId?.length) {
      conditions.push(Prisma.sql`"nodeId" = ANY(ARRAY[${Prisma.join(filters.nodeId.map(n => Prisma.sql`${n}`), ',')}]::text[])`)
    }

    const whereClause = Prisma.join(conditions, ' AND ')

    return this.prisma.$queryRaw<SearchResult[]>(Prisma.sql`
      SELECT id, "projectId", "nodeId", category, title, body, status,
             "embeddingStatus", "createdBy", "createdAt", "updatedAt",
             (1 - (embedding <=> ${vectorStr}::vector)) AS score
      FROM "KnowledgeEntry"
      WHERE ${whereClause}
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `)
  }
}
