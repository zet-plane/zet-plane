# 知识沉淀引擎实现计划

> **给 Agent 执行者：** 必须使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 技能逐任务执行本计划。各步骤使用 checkbox（`- [ ]`）语法追踪进度。

**目标：** 实现知识沉淀引擎——一个被动的 NestJS 领域服务，管理知识条目生命周期、渐进式修订历史，以及基于 pgvector 的语义检索，所有条目均锚定到 Graph 节点。

**架构：** 镜像现有 Graph Engine 的模式：Repository（Prisma）→ Services（业务逻辑）→ Controller（HTTP 路由）→ EventPublisher（BullMQ）。`KnowledgeRepository` 处理所有 Prisma 操作（含 pgvector 原生 SQL）；`EntryService` 负责 status 流转和 reanchor 规则；`RevisionService` 负责 version 自增；`SearchService` 负责 embedding 写入和相似度查询。

**技术栈：** NestJS、TypeScript、Prisma 5（用 `Unsupported("vector(1536)")` 接入 pgvector）、BullMQ（事件）、Vitest（测试，不使用 NestJS Testing Module，直接实例化类 + mock）。

---

## 文件清单

| 操作 | 路径 | 职责 |
|---|---|---|
| 修改 | `apps/server/prisma/schema.prisma` | 添加 KnowledgeEntry、KnowledgeRevision 模型及新枚举 |
| 修改 | `apps/server/src/knowledge/index.ts` | 替换 TODO 占位为模块导出 |
| 新建 | `apps/server/src/knowledge/knowledge.module.ts` | NestJS 模块注册 |
| 新建 | `apps/server/src/knowledge/knowledge.controller.ts` | HTTP 路由 + DTO 校验 |
| 新建 | `apps/server/src/knowledge/knowledge.controller.spec.ts` | Controller 单元测试 |
| 新建 | `apps/server/src/knowledge/entry/entry.service.ts` | Status 流转、reanchor 逻辑 |
| 新建 | `apps/server/src/knowledge/entry/entry.service.spec.ts` | EntryService 单元测试 |
| 新建 | `apps/server/src/knowledge/revision/revision.service.ts` | Version 自增、revision 查询 |
| 新建 | `apps/server/src/knowledge/revision/revision.service.spec.ts` | RevisionService 单元测试 |
| 新建 | `apps/server/src/knowledge/search/search.service.ts` | Embedding 写入、pgvector 相似度搜索 |
| 新建 | `apps/server/src/knowledge/search/search.service.spec.ts` | SearchService 单元测试 |
| 新建 | `apps/server/src/knowledge/repository/knowledge.repository.ts` | 所有 Prisma 操作 |
| 新建 | `apps/server/src/knowledge/events/knowledge-event.publisher.ts` | BullMQ 事件发布 |
| 新建 | `apps/server/src/knowledge/events/knowledge-event.publisher.spec.ts` | Publisher 单元测试 |
| 修改 | `apps/server/src/app.module.ts` | 注册 KnowledgeModule |

---

## Task 1：Prisma Schema——添加 KnowledgeEntry 和 KnowledgeRevision

**文件：**
- 修改：`apps/server/prisma/schema.prisma`

- [ ] **Step 1：更新 schema.prisma**

将 `apps/server/prisma/schema.prisma` 的全部内容替换为：

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [vector]
}

model Node {
  id                   String                @id @default(uuid())
  projectId            String
  isProjectRoot        Boolean               @default(false)
  type                 NodeType
  title                String
  description          String?
  status               NodeStatus            @default(active)
  isCheckpoint         Boolean               @default(false)
  checkpointResolution CheckpointResolution?
  createdBy            CreatedBy
  createdAt            DateTime              @default(now())
  updatedAt            DateTime              @updatedAt

  @@index([projectId])
}

model Edge {
  id        String    @id @default(uuid())
  projectId String
  fromId    String
  toId      String
  type      EdgeType
  createdBy CreatedBy
  createdAt DateTime  @default(now())

  @@unique([fromId, toId, type])
  @@index([projectId])
  @@index([fromId])
  @@index([toId])
}

model KnowledgeEntry {
  id              String          @id @default(uuid())
  projectId       String
  nodeId          String
  category        EntryCategory
  title           String
  body            Json
  status          EntryStatus     @default(draft)
  embeddingStatus EmbeddingStatus @default(unindexed)
  embedding       Unsupported("vector(1536)")?
  createdBy       CreatedBy
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  revisions KnowledgeRevision[]

  @@index([projectId])
  @@index([nodeId])
}

model KnowledgeRevision {
  id         String         @id @default(uuid())
  entryId    String
  version    Int
  body       Json
  changeNote String?
  createdBy  CreatedBy
  createdAt  DateTime       @default(now())

  entry KnowledgeEntry @relation(fields: [entryId], references: [id])

  @@unique([entryId, version])
  @@index([entryId])
}

enum NodeType {
  scaffold
  growth
}

enum NodeStatus {
  active
  blocked
  completed
  archived
}

enum CheckpointResolution {
  continue
  loop
}

enum EdgeType {
  composition
  dependency
  reference
}

enum CreatedBy {
  human
  agent
}

enum EntryCategory {
  decision
  pitfall
  finding
  context
}

enum EntryStatus {
  draft
  published
  deprecated
}

enum EmbeddingStatus {
  unindexed
  indexed
}
```

- [ ] **Step 2：运行迁移**

```bash
cd apps/server
pnpm exec prisma migrate dev --name add-knowledge-engine
```

预期：迁移创建并应用，Prisma Client 重新生成。若本地 Postgres 尚未安装 pgvector 扩展，先执行 `CREATE EXTENSION IF NOT EXISTS vector;`。

- [ ] **Step 3：验证新枚举已生成**

```bash
grep -n "EntryCategory\|EntryStatus\|EmbeddingStatus" node_modules/.prisma/client/index.d.ts | head -20
```

预期：输出包含 `EntryCategory`、`EntryStatus`、`EmbeddingStatus` 枚举类型的行。

- [ ] **Step 4：提交**

```bash
git add apps/server/prisma/
git commit -m "feat(schema): add KnowledgeEntry and KnowledgeRevision models with pgvector"
```

---

## Task 2：KnowledgeEventPublisher

**文件：**
- 新建：`apps/server/src/knowledge/events/knowledge-event.publisher.ts`
- 新建：`apps/server/src/knowledge/events/knowledge-event.publisher.spec.ts`

- [ ] **Step 1：先写失败的测试**

新建 `apps/server/src/knowledge/events/knowledge-event.publisher.spec.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KnowledgeEventPublisher } from './knowledge-event.publisher'
import { EntryCategory, EntryStatus } from '@prisma/client'

describe('KnowledgeEventPublisher', () => {
  let publisher: KnowledgeEventPublisher
  const mockAdd = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    mockAdd.mockClear()
    publisher = new KnowledgeEventPublisher({ add: mockAdd } as any)
  })

  it('publishes knowledge.entry.created', async () => {
    await publisher.publish({
      type: 'knowledge.entry.created',
      payload: { entryId: 'e1', projectId: 'p1', nodeId: 'n1', category: EntryCategory.decision },
    })
    expect(mockAdd).toHaveBeenCalledWith('knowledge.entry.created', {
      entryId: 'e1', projectId: 'p1', nodeId: 'n1', category: EntryCategory.decision,
    })
  })

  it('publishes knowledge.entry.body_revised', async () => {
    await publisher.publish({
      type: 'knowledge.entry.body_revised',
      payload: { entryId: 'e1', projectId: 'p1', version: 2 },
    })
    expect(mockAdd).toHaveBeenCalledWith('knowledge.entry.body_revised', {
      entryId: 'e1', projectId: 'p1', version: 2,
    })
  })

  it('publishes knowledge.entry.status_changed', async () => {
    await publisher.publish({
      type: 'knowledge.entry.status_changed',
      payload: { entryId: 'e1', projectId: 'p1', status: EntryStatus.published, previousStatus: EntryStatus.draft },
    })
    expect(mockAdd).toHaveBeenCalledWith('knowledge.entry.status_changed', {
      entryId: 'e1', projectId: 'p1', status: EntryStatus.published, previousStatus: EntryStatus.draft,
    })
  })

  it('publishes knowledge.entry.reanchored', async () => {
    await publisher.publish({
      type: 'knowledge.entry.reanchored',
      payload: { entryId: 'e1', projectId: 'p1', previousNodeId: 'n1', newNodeId: 'n2' },
    })
    expect(mockAdd).toHaveBeenCalledWith('knowledge.entry.reanchored', {
      entryId: 'e1', projectId: 'p1', previousNodeId: 'n1', newNodeId: 'n2',
    })
  })

  it('publishes knowledge.entry.indexed', async () => {
    await publisher.publish({
      type: 'knowledge.entry.indexed',
      payload: { entryId: 'e1', projectId: 'p1' },
    })
    expect(mockAdd).toHaveBeenCalledWith('knowledge.entry.indexed', {
      entryId: 'e1', projectId: 'p1',
    })
  })
})
```

- [ ] **Step 2：运行测试，确认失败**

```bash
cd apps/server && pnpm test 2>&1 | grep -A3 "KnowledgeEventPublisher"
```

预期：FAIL — `Cannot find module './knowledge-event.publisher'`

- [ ] **Step 3：实现 KnowledgeEventPublisher**

新建 `apps/server/src/knowledge/events/knowledge-event.publisher.ts`：

```typescript
import { Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import type { EntryCategory, EntryStatus } from '@prisma/client'

export const KNOWLEDGE_EVENTS_QUEUE = 'knowledge-events'

export type KnowledgeJob =
  | { type: 'knowledge.entry.created'; payload: { entryId: string; projectId: string; nodeId: string; category: EntryCategory } }
  | { type: 'knowledge.entry.body_revised'; payload: { entryId: string; projectId: string; version: number } }
  | { type: 'knowledge.entry.status_changed'; payload: { entryId: string; projectId: string; status: EntryStatus; previousStatus: EntryStatus } }
  | { type: 'knowledge.entry.reanchored'; payload: { entryId: string; projectId: string; previousNodeId: string; newNodeId: string } }
  | { type: 'knowledge.entry.indexed'; payload: { entryId: string; projectId: string } }

@Injectable()
export class KnowledgeEventPublisher {
  constructor(@InjectQueue(KNOWLEDGE_EVENTS_QUEUE) private readonly queue: Queue) {}

  async publish(job: KnowledgeJob): Promise<void> {
    await this.queue.add(job.type, job.payload)
  }
}
```

- [ ] **Step 4：运行测试，确认通过**

```bash
cd apps/server && pnpm test 2>&1 | grep -A3 "KnowledgeEventPublisher"
```

预期：5 个测试全部通过。

- [ ] **Step 5：提交**

```bash
git add apps/server/src/knowledge/events/
git commit -m "feat(knowledge): add KnowledgeEventPublisher with 5 event types"
```

---

## Task 3：KnowledgeRepository——条目与修订 CRUD

**文件：**
- 新建：`apps/server/src/knowledge/repository/knowledge.repository.ts`
- 新建：`apps/server/src/knowledge/repository/knowledge.repository.spec.ts`

- [ ] **Step 1：先写失败的测试**

新建 `apps/server/src/knowledge/repository/knowledge.repository.spec.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KnowledgeRepository } from './knowledge.repository'
import { EntryCategory, EntryStatus, EmbeddingStatus, CreatedBy } from '@prisma/client'
import type { KnowledgeEntry, KnowledgeRevision } from '@prisma/client'

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'e1',
    projectId: 'p1',
    nodeId: 'n1',
    category: EntryCategory.decision,
    title: 'Test Entry',
    body: { summary: 'test' },
    status: EntryStatus.draft,
    embeddingStatus: EmbeddingStatus.unindexed,
    createdBy: CreatedBy.human,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeRevision(overrides: Partial<KnowledgeRevision> = {}): KnowledgeRevision {
  return {
    id: 'r1',
    entryId: 'e1',
    version: 1,
    body: { summary: 'test' },
    changeNote: null,
    createdBy: CreatedBy.human,
    createdAt: new Date(),
    ...overrides,
  }
}

describe('KnowledgeRepository', () => {
  let repo: KnowledgeRepository
  let mockPrisma: any

  beforeEach(() => {
    mockPrisma = {
      knowledgeEntry: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      knowledgeRevision: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        aggregate: vi.fn(),
      },
      $transaction: vi.fn(),
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
    }
    repo = new KnowledgeRepository(mockPrisma as any)
  })

  describe('createEntryWithRevision', () => {
    it('在事务内创建条目并写入 revision v1', async () => {
      const entry = makeEntry()
      const revision = makeRevision()
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
      mockPrisma.knowledgeEntry.create.mockResolvedValue(entry)
      mockPrisma.knowledgeRevision.create.mockResolvedValue(revision)

      const result = await repo.createEntryWithRevision({
        projectId: 'p1',
        nodeId: 'n1',
        category: EntryCategory.decision,
        title: 'Test Entry',
        body: { summary: 'test' },
        createdBy: CreatedBy.human,
      })

      expect(mockPrisma.$transaction).toHaveBeenCalled()
      expect(mockPrisma.knowledgeEntry.create).toHaveBeenCalledWith({
        data: {
          projectId: 'p1',
          nodeId: 'n1',
          category: EntryCategory.decision,
          title: 'Test Entry',
          body: { summary: 'test' },
          createdBy: CreatedBy.human,
        },
      })
      expect(mockPrisma.knowledgeRevision.create).toHaveBeenCalledWith({
        data: {
          entryId: entry.id,
          version: 1,
          body: { summary: 'test' },
          changeNote: undefined,
          createdBy: CreatedBy.human,
        },
      })
      expect(result).toEqual({ entry, revision })
    })
  })

  describe('findEntry', () => {
    it('找到时返回条目', async () => {
      const entry = makeEntry()
      mockPrisma.knowledgeEntry.findUnique.mockResolvedValue(entry)
      const result = await repo.findEntry('e1')
      expect(mockPrisma.knowledgeEntry.findUnique).toHaveBeenCalledWith({ where: { id: 'e1' } })
      expect(result).toEqual(entry)
    })

    it('找不到时返回 null', async () => {
      mockPrisma.knowledgeEntry.findUnique.mockResolvedValue(null)
      const result = await repo.findEntry('missing')
      expect(result).toBeNull()
    })
  })

  describe('listEntries', () => {
    it('无过滤条件时只按 projectId 查询', async () => {
      mockPrisma.knowledgeEntry.findMany.mockResolvedValue([])
      await repo.listEntries('p1', {})
      expect(mockPrisma.knowledgeEntry.findMany).toHaveBeenCalledWith({
        where: { projectId: 'p1' },
      })
    })

    it('应用 category、status、nodeId 过滤', async () => {
      mockPrisma.knowledgeEntry.findMany.mockResolvedValue([])
      await repo.listEntries('p1', {
        category: EntryCategory.decision,
        status: EntryStatus.published,
        nodeId: 'n1',
      })
      expect(mockPrisma.knowledgeEntry.findMany).toHaveBeenCalledWith({
        where: { projectId: 'p1', category: EntryCategory.decision, status: EntryStatus.published, nodeId: 'n1' },
      })
    })
  })

  describe('updateEntry', () => {
    it('更新指定字段', async () => {
      const updated = makeEntry({ title: 'New Title' })
      mockPrisma.knowledgeEntry.update.mockResolvedValue(updated)
      await repo.updateEntry('e1', { title: 'New Title' })
      expect(mockPrisma.knowledgeEntry.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { title: 'New Title' },
      })
    })
  })

  describe('appendRevision', () => {
    it('获取最大 version 后创建下一条修订', async () => {
      mockPrisma.knowledgeRevision.aggregate.mockResolvedValue({ _max: { version: 2 } })
      mockPrisma.knowledgeRevision.create.mockResolvedValue(makeRevision({ version: 3 }))

      const result = await repo.appendRevision({
        entryId: 'e1',
        body: { summary: 'v3' },
        changeNote: 'updated',
        createdBy: CreatedBy.agent,
      })

      expect(mockPrisma.knowledgeRevision.aggregate).toHaveBeenCalledWith({
        where: { entryId: 'e1' },
        _max: { version: true },
      })
      expect(mockPrisma.knowledgeRevision.create).toHaveBeenCalledWith({
        data: {
          entryId: 'e1',
          version: 3,
          body: { summary: 'v3' },
          changeNote: 'updated',
          createdBy: CreatedBy.agent,
        },
      })
      expect(result.version).toBe(3)
    })
  })

  describe('listRevisions', () => {
    it('按 version 升序返回修订记录', async () => {
      mockPrisma.knowledgeRevision.findMany.mockResolvedValue([])
      await repo.listRevisions('e1')
      expect(mockPrisma.knowledgeRevision.findMany).toHaveBeenCalledWith({
        where: { entryId: 'e1' },
        orderBy: { version: 'asc' },
      })
    })
  })

  describe('getRevision', () => {
    it('按 entryId + version 查找修订', async () => {
      const revision = makeRevision({ version: 2 })
      mockPrisma.knowledgeRevision.findUnique.mockResolvedValue(revision)
      const result = await repo.getRevision('e1', 2)
      expect(mockPrisma.knowledgeRevision.findUnique).toHaveBeenCalledWith({
        where: { entryId_version: { entryId: 'e1', version: 2 } },
      })
      expect(result).toEqual(revision)
    })
  })
})
```

- [ ] **Step 2：运行测试，确认失败**

```bash
cd apps/server && pnpm test 2>&1 | grep -E "FAIL|Cannot find"
```

预期：FAIL — `Cannot find module './knowledge.repository'`

- [ ] **Step 3：实现 KnowledgeRepository**

新建 `apps/server/src/knowledge/repository/knowledge.repository.ts`：

```typescript
import { Injectable } from '@nestjs/common'
import { Prisma, EntryCategory, EntryStatus, EmbeddingStatus, CreatedBy } from '@prisma/client'
import type { KnowledgeEntry, KnowledgeRevision } from '@prisma/client'
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
          body: data.body as any,
          createdBy: data.createdBy,
        },
      })
      const revision = await tx.knowledgeRevision.create({
        data: {
          entryId: entry.id,
          version: 1,
          body: data.body as any,
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
        body: data.body as any,
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
```

- [ ] **Step 4：运行测试，确认通过**

```bash
cd apps/server && pnpm test 2>&1 | grep -E "KnowledgeRepository|PASS|FAIL"
```

预期：9 个 KnowledgeRepository 测试全部通过。

- [ ] **Step 5：提交**

```bash
git add apps/server/src/knowledge/repository/
git commit -m "feat(knowledge): add KnowledgeRepository with entry, revision, and embedding operations"
```

---

## Task 4：EntryService

**文件：**
- 新建：`apps/server/src/knowledge/entry/entry.service.ts`
- 新建：`apps/server/src/knowledge/entry/entry.service.spec.ts`

- [ ] **Step 1：先写失败的测试**

新建 `apps/server/src/knowledge/entry/entry.service.spec.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { EntryService } from './entry.service'
import { EntryCategory, EntryStatus, EmbeddingStatus, CreatedBy } from '@prisma/client'
import type { KnowledgeEntry } from '@prisma/client'

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'e1',
    projectId: 'p1',
    nodeId: 'n1',
    category: EntryCategory.decision,
    title: 'Test',
    body: {},
    status: EntryStatus.draft,
    embeddingStatus: EmbeddingStatus.unindexed,
    createdBy: CreatedBy.human,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('EntryService', () => {
  let service: EntryService
  let mockRepo: any
  let mockPublisher: any

  beforeEach(() => {
    mockRepo = {
      createEntryWithRevision: vi.fn(),
      findEntry: vi.fn(),
      listEntries: vi.fn(),
      updateEntry: vi.fn(),
    }
    mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    service = new EntryService(mockRepo, mockPublisher)
  })

  describe('createEntry', () => {
    it('创建条目并发布 created 事件', async () => {
      const entry = makeEntry()
      const revision = { id: 'r1', entryId: 'e1', version: 1, body: {}, changeNote: null, createdBy: CreatedBy.human, createdAt: new Date() }
      mockRepo.createEntryWithRevision.mockResolvedValue({ entry, revision })

      await service.createEntry({
        projectId: 'p1', nodeId: 'n1', category: EntryCategory.decision,
        title: 'Test', body: {}, createdBy: CreatedBy.human,
      })

      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'knowledge.entry.created',
        payload: { entryId: 'e1', projectId: 'p1', nodeId: 'n1', category: EntryCategory.decision },
      })
    })
  })

  describe('updateFields', () => {
    it('条目不存在时抛出 NotFoundException', async () => {
      mockRepo.findEntry.mockResolvedValue(null)
      await expect(service.updateFields('missing', { title: 'X' })).rejects.toThrow(NotFoundException)
    })

    it('条目已 deprecated 时抛出 ConflictException', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry({ status: EntryStatus.deprecated }))
      await expect(service.updateFields('e1', { title: 'X' })).rejects.toThrow(ConflictException)
    })

    it('更新非 status 字段时不发布 status 事件', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry())
      mockRepo.updateEntry.mockResolvedValue(makeEntry({ title: 'New' }))
      await service.updateFields('e1', { title: 'New' })
      expect(mockRepo.updateEntry).toHaveBeenCalledWith('e1', { title: 'New' })
      expect(mockPublisher.publish).not.toHaveBeenCalled()
    })
  })

  describe('updateStatus', () => {
    it('published → draft 时抛出 ConflictException', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry({ status: EntryStatus.published }))
      await expect(service.updateStatus('e1', EntryStatus.draft)).rejects.toThrow(ConflictException)
    })

    it('deprecated 条目变更状态时抛出 ConflictException', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry({ status: EntryStatus.deprecated }))
      await expect(service.updateStatus('e1', EntryStatus.published)).rejects.toThrow(ConflictException)
    })

    it('合法流转时发布 status_changed 事件', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry({ status: EntryStatus.draft }))
      mockRepo.updateEntry.mockResolvedValue(makeEntry({ status: EntryStatus.published }))
      await service.updateStatus('e1', EntryStatus.published)
      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'knowledge.entry.status_changed',
        payload: { entryId: 'e1', projectId: 'p1', status: EntryStatus.published, previousStatus: EntryStatus.draft },
      })
    })

    it('允许 draft → deprecated', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry({ status: EntryStatus.draft }))
      mockRepo.updateEntry.mockResolvedValue(makeEntry({ status: EntryStatus.deprecated }))
      await service.updateStatus('e1', EntryStatus.deprecated)
      expect(mockRepo.updateEntry).toHaveBeenCalledWith('e1', { status: EntryStatus.deprecated })
    })

    it('允许 published → deprecated', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry({ status: EntryStatus.published }))
      mockRepo.updateEntry.mockResolvedValue(makeEntry({ status: EntryStatus.deprecated }))
      await service.updateStatus('e1', EntryStatus.deprecated)
      expect(mockRepo.updateEntry).toHaveBeenCalledWith('e1', { status: EntryStatus.deprecated })
    })
  })

  describe('reanchor', () => {
    it('deprecated 条目 reanchor 时抛出 ConflictException', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry({ status: EntryStatus.deprecated }))
      await expect(service.reanchor('e1', 'n2')).rejects.toThrow(ConflictException)
    })

    it('更新 nodeId 并发布 reanchored 事件', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry({ nodeId: 'n1' }))
      mockRepo.updateEntry.mockResolvedValue(makeEntry({ nodeId: 'n2' }))
      await service.reanchor('e1', 'n2')
      expect(mockRepo.updateEntry).toHaveBeenCalledWith('e1', { nodeId: 'n2' })
      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'knowledge.entry.reanchored',
        payload: { entryId: 'e1', projectId: 'p1', previousNodeId: 'n1', newNodeId: 'n2' },
      })
    })
  })

  describe('softDelete', () => {
    it('将 status 设为 deprecated', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry())
      mockRepo.updateEntry.mockResolvedValue(makeEntry({ status: EntryStatus.deprecated }))
      await service.softDelete('e1')
      expect(mockRepo.updateEntry).toHaveBeenCalledWith('e1', { status: EntryStatus.deprecated })
    })

    it('条目不存在时抛出 NotFoundException', async () => {
      mockRepo.findEntry.mockResolvedValue(null)
      await expect(service.softDelete('missing')).rejects.toThrow(NotFoundException)
    })
  })
})
```

- [ ] **Step 2：运行测试，确认失败**

```bash
cd apps/server && pnpm test 2>&1 | grep -E "EntryService|FAIL|Cannot find"
```

预期：FAIL — `Cannot find module './entry.service'`

- [ ] **Step 3：实现 EntryService**

新建 `apps/server/src/knowledge/entry/entry.service.ts`：

```typescript
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { EntryStatus } from '@prisma/client'
import type { KnowledgeEntry } from '@prisma/client'
import type { KnowledgeRepository, EntryCreateData, EntryListFilters } from '../repository/knowledge.repository'
import type { KnowledgeEventPublisher } from '../events/knowledge-event.publisher'

@Injectable()
export class EntryService {
  constructor(
    private readonly repo: KnowledgeRepository,
    private readonly publisher: KnowledgeEventPublisher,
  ) {}

  async createEntry(data: EntryCreateData): Promise<KnowledgeEntry> {
    const { entry } = await this.repo.createEntryWithRevision(data)
    await this.publisher.publish({
      type: 'knowledge.entry.created',
      payload: { entryId: entry.id, projectId: entry.projectId, nodeId: entry.nodeId, category: entry.category },
    })
    return entry
  }

  async getEntry(id: string): Promise<KnowledgeEntry> {
    return this.requireEntry(id)
  }

  async listEntries(projectId: string, filters: EntryListFilters): Promise<KnowledgeEntry[]> {
    return this.repo.listEntries(projectId, filters)
  }

  async updateFields(
    id: string,
    data: Partial<Pick<KnowledgeEntry, 'title' | 'category'>>,
  ): Promise<KnowledgeEntry> {
    const entry = await this.requireEntry(id)
    if (entry.status === EntryStatus.deprecated) {
      throw new ConflictException('ENTRY_DEPRECATED')
    }
    return this.repo.updateEntry(id, data)
  }

  async updateStatus(id: string, newStatus: EntryStatus): Promise<KnowledgeEntry> {
    const entry = await this.requireEntry(id)
    this.validateStatusTransition(entry.status, newStatus)
    const updated = await this.repo.updateEntry(id, { status: newStatus })
    await this.publisher.publish({
      type: 'knowledge.entry.status_changed',
      payload: { entryId: id, projectId: entry.projectId, status: newStatus, previousStatus: entry.status },
    })
    return updated
  }

  async reanchor(id: string, newNodeId: string): Promise<KnowledgeEntry> {
    const entry = await this.requireEntry(id)
    if (entry.status === EntryStatus.deprecated) {
      throw new ConflictException('ENTRY_DEPRECATED')
    }
    const updated = await this.repo.updateEntry(id, { nodeId: newNodeId })
    await this.publisher.publish({
      type: 'knowledge.entry.reanchored',
      payload: { entryId: id, projectId: entry.projectId, previousNodeId: entry.nodeId, newNodeId },
    })
    return updated
  }

  async softDelete(id: string): Promise<KnowledgeEntry> {
    await this.requireEntry(id)
    return this.repo.updateEntry(id, { status: EntryStatus.deprecated })
  }

  private async requireEntry(id: string): Promise<KnowledgeEntry> {
    const entry = await this.repo.findEntry(id)
    if (!entry) throw new NotFoundException(`Entry ${id} not found`)
    return entry
  }

  private validateStatusTransition(current: EntryStatus, next: EntryStatus): void {
    if (current === EntryStatus.deprecated) {
      throw new ConflictException('ENTRY_DEPRECATED')
    }
    if (current === EntryStatus.published && next === EntryStatus.draft) {
      throw new ConflictException('CANNOT_REVERT_TO_DRAFT')
    }
  }
}
```

- [ ] **Step 4：运行测试，确认通过**

```bash
cd apps/server && pnpm test 2>&1 | grep -E "EntryService|passed|failed"
```

预期：9 个 EntryService 测试全部通过。

- [ ] **Step 5：提交**

```bash
git add apps/server/src/knowledge/entry/
git commit -m "feat(knowledge): add EntryService with status transitions and reanchor logic"
```

---

## Task 5：RevisionService

**文件：**
- 新建：`apps/server/src/knowledge/revision/revision.service.ts`
- 新建：`apps/server/src/knowledge/revision/revision.service.spec.ts`

- [ ] **Step 1：先写失败的测试**

新建 `apps/server/src/knowledge/revision/revision.service.spec.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundException, ConflictException } from '@nestjs/common'
import { RevisionService } from './revision.service'
import { EntryStatus, EmbeddingStatus, EntryCategory, CreatedBy } from '@prisma/client'
import type { KnowledgeEntry, KnowledgeRevision } from '@prisma/client'

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'e1', projectId: 'p1', nodeId: 'n1',
    category: EntryCategory.decision, title: 'Test', body: {},
    status: EntryStatus.draft, embeddingStatus: EmbeddingStatus.unindexed,
    createdBy: CreatedBy.human, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
}

function makeRevision(overrides: Partial<KnowledgeRevision> = {}): KnowledgeRevision {
  return {
    id: 'r1', entryId: 'e1', version: 1, body: {},
    changeNote: null, createdBy: CreatedBy.human, createdAt: new Date(),
    ...overrides,
  }
}

describe('RevisionService', () => {
  let service: RevisionService
  let mockRepo: any
  let mockPublisher: any

  beforeEach(() => {
    mockRepo = {
      findEntry: vi.fn(),
      appendRevision: vi.fn(),
      listRevisions: vi.fn(),
      getRevision: vi.fn(),
    }
    mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    service = new RevisionService(mockRepo, mockPublisher)
  })

  describe('appendRevision', () => {
    it('条目不存在时抛出 NotFoundException', async () => {
      mockRepo.findEntry.mockResolvedValue(null)
      await expect(
        service.appendRevision('missing', { body: {}, createdBy: CreatedBy.human }),
      ).rejects.toThrow(NotFoundException)
    })

    it('条目已 deprecated 时抛出 ConflictException', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry({ status: EntryStatus.deprecated }))
      await expect(
        service.appendRevision('e1', { body: {}, createdBy: CreatedBy.human }),
      ).rejects.toThrow(ConflictException)
    })

    it('追加修订并发布 body_revised 事件', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry())
      const revision = makeRevision({ version: 2 })
      mockRepo.appendRevision.mockResolvedValue(revision)

      await service.appendRevision('e1', { body: { v: 2 }, changeNote: 'update', createdBy: CreatedBy.agent })

      expect(mockRepo.appendRevision).toHaveBeenCalledWith({
        entryId: 'e1',
        body: { v: 2 },
        changeNote: 'update',
        createdBy: CreatedBy.agent,
      })
      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'knowledge.entry.body_revised',
        payload: { entryId: 'e1', projectId: 'p1', version: 2 },
      })
    })
  })

  describe('listRevisions', () => {
    it('条目不存在时抛出 NotFoundException', async () => {
      mockRepo.findEntry.mockResolvedValue(null)
      await expect(service.listRevisions('missing')).rejects.toThrow(NotFoundException)
    })

    it('返回有效条目的修订列表', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry())
      mockRepo.listRevisions.mockResolvedValue([makeRevision()])
      const result = await service.listRevisions('e1')
      expect(result).toHaveLength(1)
    })
  })

  describe('getRevision', () => {
    it('修订不存在时抛出 NotFoundException', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry())
      mockRepo.getRevision.mockResolvedValue(null)
      await expect(service.getRevision('e1', 99)).rejects.toThrow(NotFoundException)
    })

    it('找到时返回修订', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry())
      const revision = makeRevision({ version: 1 })
      mockRepo.getRevision.mockResolvedValue(revision)
      const result = await service.getRevision('e1', 1)
      expect(result).toEqual(revision)
    })
  })
})
```

- [ ] **Step 2：运行测试，确认失败**

```bash
cd apps/server && pnpm test 2>&1 | grep -E "RevisionService|FAIL|Cannot find"
```

预期：FAIL — `Cannot find module './revision.service'`

- [ ] **Step 3：实现 RevisionService**

新建 `apps/server/src/knowledge/revision/revision.service.ts`：

```typescript
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { EntryStatus } from '@prisma/client'
import type { KnowledgeRevision, CreatedBy } from '@prisma/client'
import type { KnowledgeRepository } from '../repository/knowledge.repository'
import type { KnowledgeEventPublisher } from '../events/knowledge-event.publisher'

type AppendRevisionInput = {
  body: unknown
  changeNote?: string
  createdBy: CreatedBy
}

@Injectable()
export class RevisionService {
  constructor(
    private readonly repo: KnowledgeRepository,
    private readonly publisher: KnowledgeEventPublisher,
  ) {}

  async appendRevision(entryId: string, input: AppendRevisionInput): Promise<KnowledgeRevision> {
    const entry = await this.repo.findEntry(entryId)
    if (!entry) throw new NotFoundException(`Entry ${entryId} not found`)
    if (entry.status === EntryStatus.deprecated) {
      throw new ConflictException('ENTRY_DEPRECATED')
    }
    const revision = await this.repo.appendRevision({
      entryId,
      body: input.body,
      changeNote: input.changeNote,
      createdBy: input.createdBy,
    })
    await this.publisher.publish({
      type: 'knowledge.entry.body_revised',
      payload: { entryId, projectId: entry.projectId, version: revision.version },
    })
    return revision
  }

  async listRevisions(entryId: string): Promise<KnowledgeRevision[]> {
    const entry = await this.repo.findEntry(entryId)
    if (!entry) throw new NotFoundException(`Entry ${entryId} not found`)
    return this.repo.listRevisions(entryId)
  }

  async getRevision(entryId: string, version: number): Promise<KnowledgeRevision> {
    const entry = await this.repo.findEntry(entryId)
    if (!entry) throw new NotFoundException(`Entry ${entryId} not found`)
    const revision = await this.repo.getRevision(entryId, version)
    if (!revision) throw new NotFoundException(`Revision v${version} not found for entry ${entryId}`)
    return revision
  }
}
```

- [ ] **Step 4：运行测试，确认通过**

```bash
cd apps/server && pnpm test 2>&1 | grep -E "RevisionService|passed|failed"
```

预期：6 个 RevisionService 测试全部通过。

- [ ] **Step 5：提交**

```bash
git add apps/server/src/knowledge/revision/
git commit -m "feat(knowledge): add RevisionService with append and query operations"
```

---

## Task 6：SearchService

**文件：**
- 新建：`apps/server/src/knowledge/search/search.service.ts`
- 新建：`apps/server/src/knowledge/search/search.service.spec.ts`

- [ ] **Step 1：先写失败的测试**

新建 `apps/server/src/knowledge/search/search.service.spec.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundException, ConflictException } from '@nestjs/common'
import { SearchService } from './search.service'
import { EntryStatus, EmbeddingStatus, EntryCategory, CreatedBy } from '@prisma/client'
import type { KnowledgeEntry } from '@prisma/client'

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'e1', projectId: 'p1', nodeId: 'n1',
    category: EntryCategory.decision, title: 'Test', body: {},
    status: EntryStatus.published, embeddingStatus: EmbeddingStatus.unindexed,
    createdBy: CreatedBy.human, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
}

describe('SearchService', () => {
  let service: SearchService
  let mockRepo: any
  let mockPublisher: any

  beforeEach(() => {
    mockRepo = {
      findEntry: vi.fn(),
      updateEntry: vi.fn(),
      updateEmbedding: vi.fn(),
      searchByVector: vi.fn(),
    }
    mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    service = new SearchService(mockRepo, mockPublisher)
  })

  describe('storeEmbedding', () => {
    it('条目不存在时抛出 NotFoundException', async () => {
      mockRepo.findEntry.mockResolvedValue(null)
      await expect(service.storeEmbedding('missing', [0.1, 0.2])).rejects.toThrow(NotFoundException)
    })

    it('条目已 deprecated 时抛出 ConflictException', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry({ status: EntryStatus.deprecated }))
      await expect(service.storeEmbedding('e1', [0.1])).rejects.toThrow(ConflictException)
    })

    it('写入 embedding 并发布 indexed 事件', async () => {
      mockRepo.findEntry.mockResolvedValue(makeEntry())
      mockRepo.updateEmbedding.mockResolvedValue(undefined)

      await service.storeEmbedding('e1', [0.1, 0.2, 0.3])

      expect(mockRepo.updateEmbedding).toHaveBeenCalledWith('e1', [0.1, 0.2, 0.3])
      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'knowledge.entry.indexed',
        payload: { entryId: 'e1', projectId: 'p1' },
      })
    })
  })

  describe('search', () => {
    it('未传 options 时使用默认值调用 searchByVector', async () => {
      mockRepo.searchByVector.mockResolvedValue([])
      await service.search('p1', [0.1, 0.2], {})
      expect(mockRepo.searchByVector).toHaveBeenCalledWith('p1', [0.1, 0.2], {}, 10, 0)
    })

    it('将 limit 和 threshold 传递给 repository', async () => {
      mockRepo.searchByVector.mockResolvedValue([])
      await service.search('p1', [0.1], { limit: 5, threshold: 0.7 })
      expect(mockRepo.searchByVector).toHaveBeenCalledWith('p1', [0.1], {}, 5, 0.7)
    })

    it('将 filters 传递给 repository', async () => {
      mockRepo.searchByVector.mockResolvedValue([])
      const filters = { category: [EntryCategory.decision], status: [EntryStatus.published] }
      await service.search('p1', [0.1], { filters })
      expect(mockRepo.searchByVector).toHaveBeenCalledWith('p1', [0.1], filters, 10, 0)
    })

    it('返回 repository 的搜索结果', async () => {
      const results = [{ id: 'e1', score: 0.9 }]
      mockRepo.searchByVector.mockResolvedValue(results)
      const output = await service.search('p1', [0.1], {})
      expect(output).toEqual(results)
    })
  })
})
```

- [ ] **Step 2：运行测试，确认失败**

```bash
cd apps/server && pnpm test 2>&1 | grep -E "SearchService|FAIL|Cannot find"
```

预期：FAIL — `Cannot find module './search.service'`

- [ ] **Step 3：实现 SearchService**

新建 `apps/server/src/knowledge/search/search.service.ts`：

```typescript
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { EntryStatus } from '@prisma/client'
import type { KnowledgeRepository, SearchFilter, SearchResult } from '../repository/knowledge.repository'
import type { KnowledgeEventPublisher } from '../events/knowledge-event.publisher'

type SearchOptions = {
  filters?: SearchFilter
  limit?: number
  threshold?: number
}

@Injectable()
export class SearchService {
  constructor(
    private readonly repo: KnowledgeRepository,
    private readonly publisher: KnowledgeEventPublisher,
  ) {}

  async storeEmbedding(entryId: string, vector: number[]): Promise<void> {
    const entry = await this.repo.findEntry(entryId)
    if (!entry) throw new NotFoundException(`Entry ${entryId} not found`)
    if (entry.status === EntryStatus.deprecated) {
      throw new ConflictException('ENTRY_DEPRECATED')
    }
    await this.repo.updateEmbedding(entryId, vector)
    await this.publisher.publish({
      type: 'knowledge.entry.indexed',
      payload: { entryId, projectId: entry.projectId },
    })
  }

  async search(projectId: string, queryVector: number[], options: SearchOptions): Promise<SearchResult[]> {
    return this.repo.searchByVector(
      projectId,
      queryVector,
      options.filters ?? {},
      options.limit ?? 10,
      options.threshold ?? 0,
    )
  }
}
```

- [ ] **Step 4：运行测试，确认通过**

```bash
cd apps/server && pnpm test 2>&1 | grep -E "SearchService|passed|failed"
```

预期：6 个 SearchService 测试全部通过。

- [ ] **Step 5：提交**

```bash
git add apps/server/src/knowledge/search/
git commit -m "feat(knowledge): add SearchService with embedding write and pgvector search"
```

---

## Task 7：KnowledgeController

**文件：**
- 新建：`apps/server/src/knowledge/knowledge.controller.ts`
- 新建：`apps/server/src/knowledge/knowledge.controller.spec.ts`

- [ ] **Step 1：先写失败的测试**

新建 `apps/server/src/knowledge/knowledge.controller.spec.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KnowledgeController } from './knowledge.controller'
import { EntryCategory, EntryStatus, EmbeddingStatus, CreatedBy } from '@prisma/client'
import type { KnowledgeEntry } from '@prisma/client'

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'e1', projectId: 'p1', nodeId: 'n1',
    category: EntryCategory.decision, title: 'Test', body: {},
    status: EntryStatus.draft, embeddingStatus: EmbeddingStatus.unindexed,
    createdBy: CreatedBy.human, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
}

describe('KnowledgeController', () => {
  let controller: KnowledgeController
  let mockEntryService: any
  let mockRevisionService: any
  let mockSearchService: any

  beforeEach(() => {
    mockEntryService = {
      createEntry: vi.fn(),
      getEntry: vi.fn(),
      listEntries: vi.fn(),
      updateFields: vi.fn(),
      updateStatus: vi.fn(),
      reanchor: vi.fn(),
      softDelete: vi.fn(),
    }
    mockRevisionService = {
      appendRevision: vi.fn(),
      listRevisions: vi.fn(),
      getRevision: vi.fn(),
    }
    mockSearchService = {
      storeEmbedding: vi.fn(),
      search: vi.fn(),
    }
    controller = new KnowledgeController(mockEntryService, mockRevisionService, mockSearchService)
  })

  it('createEntry 代理到 entryService', async () => {
    const entry = makeEntry()
    mockEntryService.createEntry.mockResolvedValue(entry)
    const body = { nodeId: 'n1', category: EntryCategory.decision, title: 'Test', body: {}, createdBy: CreatedBy.human }
    const result = await controller.createEntry('p1', body)
    expect(mockEntryService.createEntry).toHaveBeenCalledWith({ projectId: 'p1', ...body })
    expect(result).toEqual(entry)
  })

  it('listEntries 传递 projectId 和过滤条件', async () => {
    mockEntryService.listEntries.mockResolvedValue([])
    await controller.listEntries('p1', EntryCategory.decision, 'n1', EntryStatus.published)
    expect(mockEntryService.listEntries).toHaveBeenCalledWith('p1', {
      category: EntryCategory.decision, nodeId: 'n1', status: EntryStatus.published,
    })
  })

  it('getEntry 代理到 entryService', async () => {
    const entry = makeEntry()
    mockEntryService.getEntry.mockResolvedValue(entry)
    const result = await controller.getEntry('e1')
    expect(mockEntryService.getEntry).toHaveBeenCalledWith('e1')
    expect(result).toEqual(entry)
  })

  it('updateEntry 对非 status 字段调用 updateFields', async () => {
    mockEntryService.updateFields.mockResolvedValue(makeEntry({ title: 'New' }))
    await controller.updateEntry('e1', { title: 'New' })
    expect(mockEntryService.updateFields).toHaveBeenCalledWith('e1', { title: 'New' })
  })

  it('updateEntry 传入 status 时调用 updateStatus', async () => {
    mockEntryService.updateStatus.mockResolvedValue(makeEntry({ status: EntryStatus.published }))
    await controller.updateEntry('e1', { status: EntryStatus.published })
    expect(mockEntryService.updateStatus).toHaveBeenCalledWith('e1', EntryStatus.published)
  })

  it('updateEntry 传入 nodeId 时调用 reanchor', async () => {
    mockEntryService.reanchor.mockResolvedValue(makeEntry({ nodeId: 'n2' }))
    await controller.updateEntry('e1', { nodeId: 'n2' })
    expect(mockEntryService.reanchor).toHaveBeenCalledWith('e1', 'n2')
  })

  it('deleteEntry 调用 softDelete', async () => {
    mockEntryService.softDelete.mockResolvedValue(makeEntry({ status: EntryStatus.deprecated }))
    await controller.deleteEntry('e1')
    expect(mockEntryService.softDelete).toHaveBeenCalledWith('e1')
  })

  it('updateBody 调用 revisionService.appendRevision', async () => {
    const revision = { id: 'r1', entryId: 'e1', version: 2, body: {}, changeNote: null, createdBy: CreatedBy.human, createdAt: new Date() }
    mockRevisionService.appendRevision.mockResolvedValue(revision)
    await controller.updateBody('e1', { body: { v: 2 }, createdBy: CreatedBy.agent })
    expect(mockRevisionService.appendRevision).toHaveBeenCalledWith('e1', { body: { v: 2 }, createdBy: CreatedBy.agent })
  })

  it('listRevisions 代理到 revisionService', async () => {
    mockRevisionService.listRevisions.mockResolvedValue([])
    await controller.listRevisions('e1')
    expect(mockRevisionService.listRevisions).toHaveBeenCalledWith('e1')
  })

  it('getRevision 将 version 解析为数字', async () => {
    const revision = { id: 'r1', entryId: 'e1', version: 1, body: {}, changeNote: null, createdBy: CreatedBy.human, createdAt: new Date() }
    mockRevisionService.getRevision.mockResolvedValue(revision)
    await controller.getRevision('e1', '1')
    expect(mockRevisionService.getRevision).toHaveBeenCalledWith('e1', 1)
  })

  it('storeEmbedding 代理到 searchService', async () => {
    mockSearchService.storeEmbedding.mockResolvedValue(undefined)
    await controller.storeEmbedding('e1', { vector: [0.1, 0.2] })
    expect(mockSearchService.storeEmbedding).toHaveBeenCalledWith('e1', [0.1, 0.2])
  })

  it('search 将 projectId 传递给 searchService', async () => {
    mockSearchService.search.mockResolvedValue([])
    await controller.search('p1', { vector: [0.1], limit: 5, threshold: 0.8, filters: {} })
    expect(mockSearchService.search).toHaveBeenCalledWith('p1', [0.1], { limit: 5, threshold: 0.8, filters: {} })
  })
})
```

- [ ] **Step 2：运行测试，确认失败**

```bash
cd apps/server && pnpm test 2>&1 | grep -E "KnowledgeController|FAIL|Cannot find"
```

预期：FAIL — `Cannot find module './knowledge.controller'`

- [ ] **Step 3：实现 KnowledgeController**

新建 `apps/server/src/knowledge/knowledge.controller.ts`：

```typescript
import { Controller, Post, Patch, Get, Delete, Param, Body, Query, BadRequestException } from '@nestjs/common'
import { EntryCategory, EntryStatus, CreatedBy } from '@prisma/client'
import { EntryService } from './entry/entry.service'
import { RevisionService } from './revision/revision.service'
import { SearchService } from './search/search.service'
import type { SearchFilter } from './repository/knowledge.repository'

@Controller()
export class KnowledgeController {
  constructor(
    private readonly entryService: EntryService,
    private readonly revisionService: RevisionService,
    private readonly searchService: SearchService,
  ) {}

  // ── 条目 ──────────────────────────────────────────────────────────────

  @Post('projects/:id/entries')
  createEntry(
    @Param('id') projectId: string,
    @Body() body: { nodeId: string; category: EntryCategory; title: string; body: unknown; changeNote?: string; createdBy: CreatedBy },
  ) {
    return this.entryService.createEntry({ projectId, ...body })
  }

  @Get('projects/:id/entries')
  listEntries(
    @Param('id') projectId: string,
    @Query('category') category?: EntryCategory,
    @Query('nodeId') nodeId?: string,
    @Query('status') status?: EntryStatus,
  ) {
    return this.entryService.listEntries(projectId, { category, nodeId, status })
  }

  @Get('entries/:id')
  getEntry(@Param('id') id: string) {
    return this.entryService.getEntry(id)
  }

  @Patch('entries/:id')
  async updateEntry(
    @Param('id') id: string,
    @Body() body: { title?: string; category?: EntryCategory; status?: EntryStatus; nodeId?: string },
  ) {
    const { status, nodeId, ...fields } = body
    if (status !== undefined) {
      if (nodeId !== undefined || Object.values(fields).some(v => v !== undefined)) {
        throw new BadRequestException('Cannot mix status, nodeId, or field updates in a single request')
      }
      return this.entryService.updateStatus(id, status)
    }
    if (nodeId !== undefined) {
      if (Object.values(fields).some(v => v !== undefined)) {
        throw new BadRequestException('Cannot mix nodeId with field updates in a single request')
      }
      return this.entryService.reanchor(id, nodeId)
    }
    return this.entryService.updateFields(id, fields)
  }

  @Delete('entries/:id')
  deleteEntry(@Param('id') id: string) {
    return this.entryService.softDelete(id)
  }

  // ── 修订历史 ──────────────────────────────────────────────────────────

  @Patch('entries/:id/body')
  updateBody(
    @Param('id') id: string,
    @Body() body: { body: unknown; changeNote?: string; createdBy: CreatedBy },
  ) {
    return this.revisionService.appendRevision(id, body)
  }

  @Get('entries/:id/revisions')
  listRevisions(@Param('id') id: string) {
    return this.revisionService.listRevisions(id)
  }

  @Get('entries/:id/revisions/:version')
  getRevision(@Param('id') id: string, @Param('version') version: string) {
    return this.revisionService.getRevision(id, parseInt(version, 10))
  }

  // ── 语义检索 ──────────────────────────────────────────────────────────

  @Patch('entries/:id/embedding')
  storeEmbedding(@Param('id') id: string, @Body() body: { vector: number[] }) {
    return this.searchService.storeEmbedding(id, body.vector)
  }

  @Post('projects/:id/entries/search')
  search(
    @Param('id') projectId: string,
    @Body() body: { vector: number[]; filters?: SearchFilter; limit?: number; threshold?: number },
  ) {
    const { vector, filters, limit, threshold } = body
    return this.searchService.search(projectId, vector, { filters, limit, threshold })
  }
}
```

- [ ] **Step 4：运行测试，确认通过**

```bash
cd apps/server && pnpm test 2>&1 | grep -E "KnowledgeController|passed|failed"
```

预期：11 个 KnowledgeController 测试全部通过。

- [ ] **Step 5：提交**

```bash
git add apps/server/src/knowledge/knowledge.controller.ts apps/server/src/knowledge/knowledge.controller.spec.ts
git commit -m "feat(knowledge): add KnowledgeController with all entry, revision, and search routes"
```

---

## Task 8：KnowledgeModule + AppModule 注册

**文件：**
- 新建：`apps/server/src/knowledge/knowledge.module.ts`
- 修改：`apps/server/src/knowledge/index.ts`
- 修改：`apps/server/src/app.module.ts`

- [ ] **Step 1：创建 KnowledgeModule**

新建 `apps/server/src/knowledge/knowledge.module.ts`：

```typescript
import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { KnowledgeController } from './knowledge.controller'
import { EntryService } from './entry/entry.service'
import { RevisionService } from './revision/revision.service'
import { SearchService } from './search/search.service'
import { KnowledgeRepository } from './repository/knowledge.repository'
import { KnowledgeEventPublisher, KNOWLEDGE_EVENTS_QUEUE } from './events/knowledge-event.publisher'
import { PrismaService } from '../prisma/prisma.service'

@Module({
  imports: [
    BullModule.registerQueue({ name: KNOWLEDGE_EVENTS_QUEUE }),
  ],
  controllers: [KnowledgeController],
  providers: [
    PrismaService,
    KnowledgeRepository,
    KnowledgeEventPublisher,
    EntryService,
    RevisionService,
    SearchService,
  ],
})
export class KnowledgeModule {}
```

- [ ] **Step 2：更新 knowledge/index.ts**

将 `apps/server/src/knowledge/index.ts` 替换为：

```typescript
export { KnowledgeModule } from './knowledge.module'
export { KnowledgeEventPublisher, KNOWLEDGE_EVENTS_QUEUE } from './events/knowledge-event.publisher'
export type { KnowledgeJob } from './events/knowledge-event.publisher'
```

- [ ] **Step 3：在 AppModule 注册 KnowledgeModule**

将 `apps/server/src/app.module.ts` 替换为：

```typescript
import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { GraphModule } from './graph/graph.module'
import { KnowledgeModule } from './knowledge/knowledge.module'

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    GraphModule,
    KnowledgeModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 4：运行全部测试**

```bash
cd apps/server && pnpm test
```

预期：所有 spec 文件测试全部通过，0 个失败。

- [ ] **Step 5：编译验证 TypeScript**

```bash
cd apps/server && pnpm build 2>&1 | tail -5
```

预期：编译成功，无错误。

- [ ] **Step 6：提交**

```bash
git add apps/server/src/knowledge/knowledge.module.ts \
        apps/server/src/knowledge/index.ts \
        apps/server/src/app.module.ts
git commit -m "feat(knowledge): wire KnowledgeModule into AppModule, knowledge engine complete"
```

---

## 完成

全部任务完成，知识沉淀引擎完整实现：

- **Prisma**：`KnowledgeEntry` + `KnowledgeRevision` 数据模型，支持 pgvector
- **Repository**：条目 CRUD、修订追加与查询、原生 SQL embedding 写入与相似度搜索
- **EntryService**：status 流转（draft→published→deprecated），reanchor 含事件发布
- **RevisionService**：version 安全自增，含 body_revised 事件，修订查询
- **SearchService**：embedding 存储，pgvector 余弦相似度搜索 + 结构化过滤
- **Controller**：12 条路由全部接入
- **Events**：5 种领域事件通过 BullMQ 发布，与 GraphEventPublisher 模式对称
