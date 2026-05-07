# Scaffold Graph Engine Implementation Plan

> **Superseded in part by [drop-reference-edge spec](../specs/2026-05-07-drop-reference-edge.md) (2026-05-07): the `reference` edge type has been removed.**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Scaffold Graph Engine——项目图结构的领域服务，包含节点/边 CRUD、状态护栏校验、环检测与 Checkpoint 升级、BullMQ 事件推送。

**Architecture:** 三层结构（Controller → Service → Repository），CycleDetectorService 为纯函数无 IO，GraphEventPublisher 是 BullMQ Job 的唯一出口，所有环检测和 Checkpoint 升级在同一 DB 事务内完成，Job 推送在事务提交后执行。

**Tech Stack:** NestJS 10, Prisma 5, BullMQ 5, @nestjs/bullmq, Vitest 1, TypeScript 5, PostgreSQL

**Spec:** [设计文档](../specs/2026-05-04-scaffold-graph-engine-design.md)

---

## 文件结构

```
apps/server/
├── prisma/
│   └── schema.prisma                              # MODIFY: 添加 Node/Edge 模型
├── src/
│   ├── prisma/
│   │   └── prisma.service.ts                      # CREATE: 全局 Prisma 提供者
│   ├── graph/
│   │   ├── graph.module.ts                        # CREATE: NestJS 模块声明
│   │   ├── graph.controller.ts                    # CREATE: 所有 HTTP 路由
│   │   ├── graph.controller.spec.ts               # CREATE: Controller 测试
│   │   ├── cycle/
│   │   │   ├── cycle-detector.service.ts          # CREATE: 纯 DFS 算法
│   │   │   └── cycle-detector.service.spec.ts     # CREATE: 算法单测
│   │   ├── events/
│   │   │   ├── graph-event.publisher.ts           # CREATE: BullMQ Job 出口
│   │   │   └── graph-event.publisher.spec.ts      # CREATE: Publisher 单测
│   │   ├── node/
│   │   │   ├── node.service.ts                    # CREATE: 节点 CRUD + 护栏
│   │   │   └── node.service.spec.ts               # CREATE: NodeService 单测
│   │   ├── edge/
│   │   │   ├── edge.service.ts                    # CREATE: 写边主流程
│   │   │   └── edge.service.spec.ts               # CREATE: EdgeService 单测
│   │   └── repository/
│   │       └── graph.repository.ts                # CREATE: Prisma 封装
│   └── app.module.ts                              # MODIFY: 注册 GraphModule
```

---

## Task 1: 依赖安装 + Prisma Schema + PrismaService

**Files:**
- Modify: `apps/server/package.json`
- Modify: `apps/server/prisma/schema.prisma`
- Create: `apps/server/src/prisma/prisma.service.ts`

- [ ] **Step 1: 安装 @nestjs/bullmq**

```bash
cd apps/server && pnpm add @nestjs/bullmq
```

Expected: `apps/server/package.json` 中出现 `"@nestjs/bullmq": "^..."`

- [ ] **Step 2: 替换 schema.prisma**

完整替换 `apps/server/prisma/schema.prisma` 内容：

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
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
  id        String   @id @default(uuid())
  projectId String
  fromId    String
  toId      String
  type      EdgeType
  createdBy CreatedBy
  createdAt DateTime @default(now())

  @@unique([fromId, toId, type])
  @@index([projectId])
  @@index([fromId])
  @@index([toId])
}

enum NodeType             { scaffold growth }
enum NodeStatus           { active blocked completed archived }
enum CheckpointResolution { continue loop }
enum EdgeType             { composition dependency reference }
enum CreatedBy            { human agent }
```

- [ ] **Step 3: 确认 DATABASE_URL 环境变量存在**

在 `apps/server/` 下创建 `.env`（本地开发用，已在 .gitignore 中）：

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/zet_plane_dev"
```

- [ ] **Step 4: 生成 Prisma Client + 执行迁移**

```bash
cd apps/server && pnpm prisma migrate dev --name init-graph
```

Expected: `Prisma Migrate: The migration "init-graph" has been applied`

- [ ] **Step 5: 创建 PrismaService**

创建 `apps/server/src/prisma/prisma.service.ts`：

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect()
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/server/prisma/ apps/server/src/prisma/ apps/server/package.json
git commit -m "feat: add prisma schema and PrismaService for graph engine"
```

---

## Task 2: CycleDetectorService（TDD）

**Files:**
- Create: `apps/server/src/graph/cycle/cycle-detector.service.ts`
- Create: `apps/server/src/graph/cycle/cycle-detector.service.spec.ts`

- [ ] **Step 1: 创建测试文件**

创建 `apps/server/src/graph/cycle/cycle-detector.service.spec.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { CycleDetectorService } from './cycle-detector.service'
import { EdgeType, CreatedBy } from '@prisma/client'
import type { Edge } from '@prisma/client'

function edge(fromId: string, toId: string, type: EdgeType = EdgeType.composition): Edge {
  return {
    id: `${fromId}->${toId}`,
    projectId: 'p1',
    fromId,
    toId,
    type,
    createdBy: CreatedBy.human,
    createdAt: new Date(),
  }
}

describe('CycleDetectorService', () => {
  const detector = new CycleDetectorService()

  describe('detect', () => {
    it('returns null when no cycle exists', () => {
      const edges = [edge('a', 'b'), edge('b', 'c')]
      expect(detector.detect('a', 'b', edges)).toBeNull()
    })

    it('detects a simple 3-node cycle', () => {
      // a→b, b→c already exist; adding c→a creates cycle
      const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')]
      const result = detector.detect('c', 'a', edges)
      expect(result).not.toBeNull()
      expect(result).toContain('c')
      expect(result).toContain('a')
    })

    it('detects a 2-node cycle (a→b, b→a)', () => {
      const edges = [edge('a', 'b'), edge('b', 'a')]
      const result = detector.detect('b', 'a', edges)
      expect(result).not.toBeNull()
      expect(result).toContain('a')
      expect(result).toContain('b')
    })

    it('ignores reference edges — reference edge does not create a cycle', () => {
      // a→b (reference) exists; adding b→a (composition)
      // reference edge should not count as flow constraint
      const edges = [edge('a', 'b', EdgeType.reference), edge('b', 'a')]
      const result = detector.detect('b', 'a', edges)
      expect(result).toBeNull()
    })

    it('detects cycle through dependency edges', () => {
      const edges = [edge('a', 'b', EdgeType.dependency), edge('b', 'a', EdgeType.dependency)]
      const result = detector.detect('b', 'a', edges)
      expect(result).not.toBeNull()
    })

    it('returns null for linear chain (no cycle)', () => {
      const edges = [edge('root', 'a'), edge('a', 'b'), edge('b', 'c'), edge('c', 'd')]
      expect(detector.detect('c', 'd', edges)).toBeNull()
    })
  })

  describe('findHighestInDegreeNode', () => {
    it('returns node with most in-edges within cycle path', () => {
      // cyclePath = [a, b, c]; b has 2 in-edges, a has 1, c has 0
      const cyclePath = ['a', 'b', 'c']
      const edges = [
        edge('x', 'b'), edge('y', 'b'), edge('z', 'a'),
      ]
      expect(detector.findHighestInDegreeNode(cyclePath, edges)).toBe('b')
    })

    it('uses DFS traversal order to break ties (first in path wins)', () => {
      // cyclePath = [a, b]; both have 1 in-edge — first in path (a) wins
      const cyclePath = ['a', 'b']
      const edges = [edge('x', 'a'), edge('y', 'b')]
      expect(detector.findHighestInDegreeNode(cyclePath, edges)).toBe('a')
    })

    it('returns first node when all nodes have zero in-edges', () => {
      const cyclePath = ['a', 'b', 'c']
      expect(detector.findHighestInDegreeNode(cyclePath, [])).toBe('a')
    })
  })
})
```

- [ ] **Step 2: 运行测试，确认 FAIL**

```bash
cd apps/server && pnpm test
```

Expected: FAIL — `Cannot find module './cycle-detector.service'`

- [ ] **Step 3: 创建实现文件**

创建 `apps/server/src/graph/cycle/cycle-detector.service.ts`：

```typescript
import { Injectable } from '@nestjs/common'
import { EdgeType } from '@prisma/client'
import type { Edge } from '@prisma/client'

@Injectable()
export class CycleDetectorService {
  detect(fromId: string, toId: string, edges: Edge[]): string[] | null {
    const graph = this.buildAdjacency(edges.filter(e => e.type !== EdgeType.reference))
    const path: string[] = []
    const visited = new Set<string>()

    const dfs = (nodeId: string): boolean => {
      if (nodeId === fromId) return true
      if (visited.has(nodeId)) return false
      visited.add(nodeId)
      path.push(nodeId)
      for (const neighbor of graph[nodeId] ?? []) {
        if (dfs(neighbor)) return true
      }
      path.pop()
      return false
    }

    return dfs(toId) ? [fromId, ...path] : null
  }

  findHighestInDegreeNode(cyclePath: string[], edges: Edge[]): string {
    const inDegree = new Map<string, number>()
    for (const nodeId of cyclePath) inDegree.set(nodeId, 0)
    for (const e of edges) {
      if (inDegree.has(e.toId)) {
        inDegree.set(e.toId, (inDegree.get(e.toId) ?? 0) + 1)
      }
    }
    // First node in DFS order wins on ties
    let max = -1
    let result = cyclePath[0]
    for (const nodeId of cyclePath) {
      const degree = inDegree.get(nodeId) ?? 0
      if (degree > max) { max = degree; result = nodeId }
    }
    return result
  }

  private buildAdjacency(edges: Edge[]): Record<string, string[]> {
    const graph: Record<string, string[]> = {}
    for (const e of edges) {
      if (!graph[e.fromId]) graph[e.fromId] = []
      graph[e.fromId].push(e.toId)
    }
    return graph
  }
}
```

- [ ] **Step 4: 运行测试，确认 PASS**

```bash
cd apps/server && pnpm test
```

Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/graph/cycle/
git commit -m "feat: add CycleDetectorService with DFS cycle detection"
```

---

## Task 3: GraphEventPublisher（TDD）

**Files:**
- Create: `apps/server/src/graph/events/graph-event.publisher.ts`
- Create: `apps/server/src/graph/events/graph-event.publisher.spec.ts`

- [ ] **Step 1: 创建测试文件**

创建 `apps/server/src/graph/events/graph-event.publisher.spec.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GraphEventPublisher } from './graph-event.publisher'
import { EdgeType, NodeStatus } from '@prisma/client'

describe('GraphEventPublisher', () => {
  let publisher: GraphEventPublisher
  const mockAdd = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    mockAdd.mockClear()
    publisher = new GraphEventPublisher({ add: mockAdd } as any)
  })

  it('publishes graph.edge.created with correct payload', async () => {
    await publisher.publish({
      type: 'graph.edge.created',
      payload: { edgeId: 'e1', fromId: 'a', toId: 'b', edgeType: EdgeType.composition, projectId: 'p1' },
    })
    expect(mockAdd).toHaveBeenCalledWith('graph.edge.created', {
      edgeId: 'e1', fromId: 'a', toId: 'b', edgeType: EdgeType.composition, projectId: 'p1',
    })
  })

  it('publishes graph.node.checkpoint_elevated with cyclePath', async () => {
    await publisher.publish({
      type: 'graph.node.checkpoint_elevated',
      payload: { nodeId: 'n1', cyclePath: ['n1', 'n2', 'n3'], projectId: 'p1' },
    })
    expect(mockAdd).toHaveBeenCalledWith('graph.node.checkpoint_elevated', {
      nodeId: 'n1', cyclePath: ['n1', 'n2', 'n3'], projectId: 'p1',
    })
  })

  it('publishes graph.node.status_changed with previous status', async () => {
    await publisher.publish({
      type: 'graph.node.status_changed',
      payload: { nodeId: 'n1', status: NodeStatus.completed, previousStatus: NodeStatus.active, projectId: 'p1' },
    })
    expect(mockAdd).toHaveBeenCalledWith('graph.node.status_changed', {
      nodeId: 'n1', status: NodeStatus.completed, previousStatus: NodeStatus.active, projectId: 'p1',
    })
  })

  it('publishes graph.checkpoint.resolved', async () => {
    await publisher.publish({
      type: 'graph.checkpoint.resolved',
      payload: { nodeId: 'n1', resolution: 'continue', projectId: 'p1' },
    })
    expect(mockAdd).toHaveBeenCalledWith('graph.checkpoint.resolved', {
      nodeId: 'n1', resolution: 'continue', projectId: 'p1',
    })
  })

  it('publishes graph.node.deleted with strategy and affected nodes', async () => {
    await publisher.publish({
      type: 'graph.node.deleted',
      payload: { nodeId: 'n1', strategy: 'cascade', affectedNodeIds: ['n2', 'n3'], projectId: 'p1' },
    })
    expect(mockAdd).toHaveBeenCalledWith('graph.node.deleted', {
      nodeId: 'n1', strategy: 'cascade', affectedNodeIds: ['n2', 'n3'], projectId: 'p1',
    })
  })
})
```

- [ ] **Step 2: 运行测试，确认 FAIL**

```bash
cd apps/server && pnpm test
```

Expected: FAIL — `Cannot find module './graph-event.publisher'`

- [ ] **Step 3: 创建实现文件**

创建 `apps/server/src/graph/events/graph-event.publisher.ts`：

```typescript
import { Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import type { EdgeType, NodeStatus } from '@prisma/client'

export const GRAPH_EVENTS_QUEUE = 'graph-events'

export type DeleteStrategy = 'block' | 'cascade' | 'reparent-to-parent' | 'reparent-to-root'

export type GraphJob =
  | { type: 'graph.edge.created'; payload: { edgeId: string; fromId: string; toId: string; edgeType: EdgeType; projectId: string } }
  | { type: 'graph.node.checkpoint_elevated'; payload: { nodeId: string; cyclePath: string[]; projectId: string } }
  | { type: 'graph.node.status_changed'; payload: { nodeId: string; status: NodeStatus; previousStatus: NodeStatus; projectId: string } }
  | { type: 'graph.checkpoint.resolved'; payload: { nodeId: string; resolution: 'continue' | 'loop'; projectId: string } }
  | { type: 'graph.node.deleted'; payload: { nodeId: string; strategy: DeleteStrategy; affectedNodeIds: string[]; projectId: string } }

@Injectable()
export class GraphEventPublisher {
  constructor(@InjectQueue(GRAPH_EVENTS_QUEUE) private readonly queue: Queue) {}

  async publish(job: GraphJob): Promise<void> {
    await this.queue.add(job.type, job.payload)
  }
}
```

- [ ] **Step 4: 运行测试，确认 PASS**

```bash
cd apps/server && pnpm test
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/graph/events/
git commit -m "feat: add GraphEventPublisher with BullMQ job types"
```

---

## Task 4: GraphRepository

**Files:**
- Create: `apps/server/src/graph/repository/graph.repository.ts`

> 注：Repository 层直接包装 Prisma，需要真实 DB 才能运行，不写 vitest 单测。集成测试由 E2E 阶段覆盖。

- [ ] **Step 1: 创建 GraphRepository**

创建 `apps/server/src/graph/repository/graph.repository.ts`：

```typescript
import { Injectable, NotFoundException } from '@nestjs/common'
import { NodeType, NodeStatus, EdgeType, CreatedBy, CheckpointResolution } from '@prisma/client'
import type { Node, Edge } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import type { DeleteStrategy } from '../events/graph-event.publisher'

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
      const err: any = new Error('HAS_COMPOSITION_CHILDREN')
      err.affectedNodes = children.map(c => c.id)
      throw err
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
      const err: any = new Error('AMBIGUOUS_PARENT')
      err.parents = parents.map(p => p.id)
      throw err
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/graph/repository/
git commit -m "feat: add GraphRepository with Prisma operations and delete strategies"
```

---

## Task 5: NodeService（TDD）

**Files:**
- Create: `apps/server/src/graph/node/node.service.ts`
- Create: `apps/server/src/graph/node/node.service.spec.ts`

- [ ] **Step 1: 创建测试文件**

创建 `apps/server/src/graph/node/node.service.spec.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConflictException } from '@nestjs/common'
import { NodeService } from './node.service'
import { NodeStatus, NodeType, CreatedBy, CheckpointResolution } from '@prisma/client'
import type { Node } from '@prisma/client'

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: 'n1',
    projectId: 'p1',
    isProjectRoot: false,
    type: NodeType.scaffold,
    title: 'Test Node',
    description: null,
    status: NodeStatus.active,
    isCheckpoint: false,
    checkpointResolution: null,
    createdBy: CreatedBy.human,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('NodeService', () => {
  let service: NodeService
  let mockRepo: any
  let mockPublisher: any

  beforeEach(() => {
    mockRepo = {
      findNode: vi.fn(),
      createNode: vi.fn(),
      updateNode: vi.fn(),
      listProjectNodes: vi.fn(),
      getSubgraph: vi.fn(),
      initProjectRoot: vi.fn(),
      findCompositionChildren: vi.fn(),
      findDependencyTargets: vi.fn(),
    }
    mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    service = new NodeService(mockRepo, mockPublisher)
  })

  describe('updateStatus', () => {
    it('throws 409 when node is archived', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.archived }))
      await expect(service.updateStatus('n1', NodeStatus.active)).rejects.toThrow(ConflictException)
    })

    it('throws 409 when setting completed on blocked node', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.blocked, isCheckpoint: true }))
      await expect(service.updateStatus('n1', NodeStatus.completed)).rejects.toThrow(ConflictException)
    })

    it('throws 409 when setting completed with incomplete composition children', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.active }))
      mockRepo.findCompositionChildren.mockResolvedValue([
        makeNode({ id: 'child1', status: NodeStatus.active }),
      ])
      await expect(service.updateStatus('n1', NodeStatus.completed)).rejects.toThrow(ConflictException)
    })

    it('allows completed when all composition children are completed', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.active }))
      mockRepo.findCompositionChildren.mockResolvedValue([
        makeNode({ id: 'child1', status: NodeStatus.completed }),
      ])
      mockRepo.updateNode.mockResolvedValue(makeNode({ status: NodeStatus.completed }))
      await service.updateStatus('n1', NodeStatus.completed)
      expect(mockRepo.updateNode).toHaveBeenCalledWith('n1', { status: NodeStatus.completed })
      expect(mockPublisher.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'graph.node.status_changed' }))
    })

    it('throws 409 when setting active with unresolved dependency', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.blocked }))
      mockRepo.findDependencyTargets.mockResolvedValue([
        makeNode({ id: 'dep1', status: NodeStatus.active }),
      ])
      await expect(service.updateStatus('n1', NodeStatus.active)).rejects.toThrow(ConflictException)
    })

    it('throws 409 when setting active directly on blocked node (must use resolution API)', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.blocked, isCheckpoint: true }))
      mockRepo.findDependencyTargets.mockResolvedValue([])
      await expect(service.updateStatus('n1', NodeStatus.active)).rejects.toThrow(ConflictException)
    })

    it('publishes status_changed job on successful update', async () => {
      const node = makeNode({ status: NodeStatus.active })
      mockRepo.findNode.mockResolvedValue(node)
      mockRepo.findCompositionChildren.mockResolvedValue([])
      mockRepo.updateNode.mockResolvedValue(makeNode({ status: NodeStatus.completed }))
      await service.updateStatus('n1', NodeStatus.completed)
      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'graph.node.status_changed',
        payload: { nodeId: 'n1', status: NodeStatus.completed, previousStatus: NodeStatus.active, projectId: 'p1' },
      })
    })
  })

  describe('resolveCheckpoint', () => {
    it('throws 409 when node is not blocked', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.active, isCheckpoint: true }))
      await expect(service.resolveCheckpoint('n1', 'continue')).rejects.toThrow(ConflictException)
    })

    it('throws 409 when node is not a checkpoint', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.blocked, isCheckpoint: false }))
      await expect(service.resolveCheckpoint('n1', 'loop')).rejects.toThrow(ConflictException)
    })

    it('sets status to active and publishes resolved job', async () => {
      mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.blocked, isCheckpoint: true }))
      mockRepo.updateNode.mockResolvedValue(makeNode({ status: NodeStatus.active }))
      await service.resolveCheckpoint('n1', 'continue')
      expect(mockRepo.updateNode).toHaveBeenCalledWith('n1', {
        checkpointResolution: CheckpointResolution.continue,
        status: NodeStatus.active,
      })
      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'graph.checkpoint.resolved',
        payload: { nodeId: 'n1', resolution: 'continue', projectId: 'p1' },
      })
    })
  })
})
```

- [ ] **Step 2: 运行测试，确认 FAIL**

```bash
cd apps/server && pnpm test
```

Expected: FAIL — `Cannot find module './node.service'`

- [ ] **Step 3: 创建实现文件**

创建 `apps/server/src/graph/node/node.service.ts`：

```typescript
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { NodeStatus, NodeType, CreatedBy, CheckpointResolution } from '@prisma/client'
import type { Node } from '@prisma/client'
import type { GraphRepository, NodeCreateData } from '../repository/graph.repository'
import type { GraphEventPublisher, DeleteStrategy } from '../events/graph-event.publisher'

@Injectable()
export class NodeService {
  constructor(
    private readonly repo: GraphRepository,
    private readonly publisher: GraphEventPublisher,
  ) {}

  async initProjectRoot(projectId: string): Promise<Node> {
    return this.repo.initProjectRoot(projectId)
  }

  async createNode(data: NodeCreateData): Promise<Node> {
    return this.repo.createNode(data)
  }

  async listProjectNodes(projectId: string): Promise<Node[]> {
    return this.repo.listProjectNodes(projectId)
  }

  async getSubgraph(nodeId: string): Promise<{ nodes: Node[]; edges: any[] }> {
    const node = await this.repo.findNode(nodeId)
    if (!node) throw new NotFoundException(`Node ${nodeId} not found`)
    return this.repo.getSubgraph(nodeId)
  }

  async updateNode(id: string, data: Partial<Pick<Node, 'title' | 'description' | 'isCheckpoint'>>): Promise<Node> {
    const node = await this.requireNode(id)
    if (node.status === NodeStatus.archived) {
      throw new ConflictException('NODE_ARCHIVED')
    }
    return this.repo.updateNode(id, data)
  }

  async updateStatus(nodeId: string, newStatus: NodeStatus): Promise<Node> {
    const node = await this.requireNode(nodeId)
    await this.validateStatusTransition(node, newStatus)
    const updated = await this.repo.updateNode(nodeId, { status: newStatus })
    await this.publisher.publish({
      type: 'graph.node.status_changed',
      payload: { nodeId, status: newStatus, previousStatus: node.status, projectId: node.projectId },
    })
    return updated
  }

  async resolveCheckpoint(nodeId: string, resolution: 'continue' | 'loop'): Promise<Node> {
    const node = await this.requireNode(nodeId)
    if (node.status !== NodeStatus.blocked || !node.isCheckpoint) {
      throw new ConflictException('Node must be blocked and isCheckpoint=true to resolve')
    }
    const updated = await this.repo.updateNode(nodeId, {
      checkpointResolution: resolution === 'continue' ? CheckpointResolution.continue : CheckpointResolution.loop,
      status: NodeStatus.active,
    })
    await this.publisher.publish({
      type: 'graph.checkpoint.resolved',
      payload: { nodeId, resolution, projectId: node.projectId },
    })
    return updated
  }

  async deleteNode(nodeId: string, strategy: DeleteStrategy = 'block'): Promise<{ affectedNodeIds: string[] }> {
    const node = await this.requireNode(nodeId)
    if (node.isProjectRoot) throw new ConflictException('Cannot delete project root node')
    try {
      const affectedNodeIds = await this.repo.deleteNodeWithStrategy(nodeId, node.projectId, strategy)
      await this.publisher.publish({
        type: 'graph.node.deleted',
        payload: { nodeId, strategy, affectedNodeIds, projectId: node.projectId },
      })
      return { affectedNodeIds }
    } catch (err: any) {
      if (err.message === 'HAS_COMPOSITION_CHILDREN') {
        throw new ConflictException({ error: 'HAS_ACTIVE_CHILDREN', affectedNodes: err.affectedNodes })
      }
      if (err.message === 'AMBIGUOUS_PARENT') {
        throw new ConflictException({ error: 'AMBIGUOUS_PARENT', parents: err.parents })
      }
      throw err
    }
  }

  private async requireNode(id: string): Promise<Node> {
    const node = await this.repo.findNode(id)
    if (!node) throw new NotFoundException(`Node ${id} not found`)
    return node
  }

  private async validateStatusTransition(node: Node, newStatus: NodeStatus): Promise<void> {
    if (node.status === NodeStatus.archived) {
      throw new ConflictException('NODE_ARCHIVED')
    }
    if (newStatus === NodeStatus.active && node.status === NodeStatus.blocked) {
      throw new ConflictException('USE_RESOLUTION_API')
    }
    if (newStatus === NodeStatus.completed) {
      if (node.status === NodeStatus.blocked) {
        throw new ConflictException('UNRESOLVED_CHECKPOINT')
      }
      const children = await this.repo.findCompositionChildren(node.id)
      const incomplete = children.filter(c => c.status !== NodeStatus.completed && c.status !== NodeStatus.archived)
      if (incomplete.length > 0) {
        throw new ConflictException('INCOMPLETE_CHILDREN')
      }
    }
    if (newStatus === NodeStatus.active) {
      const deps = await this.repo.findDependencyTargets(node.id)
      const unresolved = deps.filter(d => d.status !== NodeStatus.completed)
      if (unresolved.length > 0) {
        throw new ConflictException('UNRESOLVED_DEPENDENCY')
      }
    }
  }
}
```

- [ ] **Step 4: 运行测试，确认 PASS**

```bash
cd apps/server && pnpm test
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/graph/node/
git commit -m "feat: add NodeService with state validation guards"
```

---

## Task 6: EdgeService（TDD）

**Files:**
- Create: `apps/server/src/graph/edge/edge.service.ts`
- Create: `apps/server/src/graph/edge/edge.service.spec.ts`

- [ ] **Step 1: 创建测试文件**

创建 `apps/server/src/graph/edge/edge.service.spec.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { EdgeService } from './edge.service'
import { EdgeType, NodeStatus, NodeType, CreatedBy } from '@prisma/client'
import type { Node, Edge } from '@prisma/client'

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: 'n1', projectId: 'p1', isProjectRoot: false,
    type: NodeType.scaffold, title: 'Node', description: null,
    status: NodeStatus.active, isCheckpoint: false, checkpointResolution: null,
    createdBy: CreatedBy.human, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
}

describe('EdgeService', () => {
  let service: EdgeService
  let mockRepo: any
  let mockDetector: any
  let mockPublisher: any

  beforeEach(() => {
    mockRepo = {
      findNode: vi.fn(),
      findEdge: vi.fn(),
      listProjectEdges: vi.fn(),
      createEdge: vi.fn(),
      deleteEdge: vi.fn(),
      replaceNodeEdges: vi.fn(),
    }
    mockDetector = {
      detect: vi.fn().mockReturnValue(null),
      findHighestInDegreeNode: vi.fn(),
    }
    mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    service = new EdgeService(mockRepo, mockDetector, mockPublisher)
  })

  describe('createEdge', () => {
    it('throws 404 when fromNode does not exist', async () => {
      mockRepo.findNode.mockResolvedValue(null)
      await expect(
        service.createEdge({ projectId: 'p1', fromId: 'a', toId: 'b', type: EdgeType.composition, createdBy: CreatedBy.human })
      ).rejects.toThrow(NotFoundException)
    })

    it('throws 409 when fromNode is completed and type is composition', async () => {
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'a', status: NodeStatus.completed }))
        .mockResolvedValueOnce(makeNode({ id: 'b' }))
      await expect(
        service.createEdge({ projectId: 'p1', fromId: 'a', toId: 'b', type: EdgeType.composition, createdBy: CreatedBy.human })
      ).rejects.toThrow(ConflictException)
    })

    it('allows reference edge even when fromNode is completed', async () => {
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'a', status: NodeStatus.completed }))
        .mockResolvedValueOnce(makeNode({ id: 'b' }))
      const mockEdge = { id: 'e1', projectId: 'p1', fromId: 'a', toId: 'b', type: EdgeType.reference, createdBy: CreatedBy.human, createdAt: new Date() }
      mockRepo.createEdge.mockResolvedValue({ edge: mockEdge, cyclePath: null, checkpointNodeId: null })
      await service.createEdge({ projectId: 'p1', fromId: 'a', toId: 'b', type: EdgeType.reference, createdBy: CreatedBy.human })
      expect(mockRepo.createEdge).toHaveBeenCalled()
    })

    it('publishes graph.edge.created when no cycle', async () => {
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'a' }))
        .mockResolvedValueOnce(makeNode({ id: 'b' }))
      const mockEdge = { id: 'e1', projectId: 'p1', fromId: 'a', toId: 'b', type: EdgeType.composition, createdBy: CreatedBy.human, createdAt: new Date() }
      mockRepo.createEdge.mockResolvedValue({ edge: mockEdge, cyclePath: null, checkpointNodeId: null })
      await service.createEdge({ projectId: 'p1', fromId: 'a', toId: 'b', type: EdgeType.composition, createdBy: CreatedBy.human })
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'graph.edge.created' })
      )
    })

    it('publishes graph.node.checkpoint_elevated when cycle detected', async () => {
      mockRepo.findNode
        .mockResolvedValueOnce(makeNode({ id: 'a' }))
        .mockResolvedValueOnce(makeNode({ id: 'b' }))
      const mockEdge = { id: 'e1', projectId: 'p1', fromId: 'b', toId: 'a', type: EdgeType.composition, createdBy: CreatedBy.human, createdAt: new Date() }
      mockRepo.createEdge.mockResolvedValue({ edge: mockEdge, cyclePath: ['b', 'a'], checkpointNodeId: 'a' })
      await service.createEdge({ projectId: 'p1', fromId: 'b', toId: 'a', type: EdgeType.composition, createdBy: CreatedBy.human })
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'graph.node.checkpoint_elevated' })
      )
    })
  })
})
```

- [ ] **Step 2: 运行测试，确认 FAIL**

```bash
cd apps/server && pnpm test
```

Expected: FAIL — `Cannot find module './edge.service'`

- [ ] **Step 3: 创建实现文件**

创建 `apps/server/src/graph/edge/edge.service.ts`：

```typescript
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { EdgeType, NodeStatus, CreatedBy } from '@prisma/client'
import type { Edge } from '@prisma/client'
import type { GraphRepository, EdgeCreateData } from '../repository/graph.repository'
import type { CycleDetectorService } from '../cycle/cycle-detector.service'
import type { GraphEventPublisher, DeleteStrategy } from '../events/graph-event.publisher'

@Injectable()
export class EdgeService {
  constructor(
    private readonly repo: GraphRepository,
    private readonly detector: CycleDetectorService,
    private readonly publisher: GraphEventPublisher,
  ) {}

  async createEdge(data: EdgeCreateData): Promise<Edge> {
    const [fromNode, toNode] = await Promise.all([
      this.repo.findNode(data.fromId),
      this.repo.findNode(data.toId),
    ])
    if (!fromNode) throw new NotFoundException(`Node ${data.fromId} not found`)
    if (!toNode) throw new NotFoundException(`Node ${data.toId} not found`)
    if (fromNode.status === NodeStatus.archived) throw new ConflictException('NODE_ARCHIVED')
    if (toNode.status === NodeStatus.archived) throw new ConflictException('NODE_ARCHIVED')
    if (data.type !== EdgeType.reference && fromNode.status === NodeStatus.completed) {
      throw new ConflictException('COMPLETED_NODE_IMMUTABLE')
    }

    const { edge, cyclePath, checkpointNodeId } = await this.repo.createEdge(data, (allEdges) => {
      const path = this.detector.detect(data.fromId, data.toId, allEdges)
      if (!path) return { cyclePath: null, checkpointNodeId: null }
      const nodeId = this.detector.findHighestInDegreeNode(path, allEdges)
      return { cyclePath: path, checkpointNodeId: nodeId }
    })

    if (cyclePath && checkpointNodeId) {
      await this.publisher.publish({
        type: 'graph.node.checkpoint_elevated',
        payload: { nodeId: checkpointNodeId, cyclePath, projectId: data.projectId },
      })
    } else {
      await this.publisher.publish({
        type: 'graph.edge.created',
        payload: { edgeId: edge.id, fromId: data.fromId, toId: data.toId, edgeType: data.type, projectId: data.projectId },
      })
    }
    return edge
  }

  async deleteEdge(edgeId: string): Promise<void> {
    const edge = await this.repo.findEdge(edgeId)
    if (!edge) throw new NotFoundException(`Edge ${edgeId} not found`)
    await this.repo.deleteEdge(edgeId)
  }

  async listProjectEdges(projectId: string): Promise<Edge[]> {
    return this.repo.listProjectEdges(projectId)
  }

  async replaceNodeEdges(
    nodeId: string,
    type: EdgeType,
    newFromId: string,
    projectId: string,
    createdBy: CreatedBy,
  ): Promise<Edge> {
    const [node, newParent] = await Promise.all([
      this.repo.findNode(nodeId),
      this.repo.findNode(newFromId),
    ])
    if (!node) throw new NotFoundException(`Node ${nodeId} not found`)
    if (!newParent) throw new NotFoundException(`Node ${newFromId} not found`)
    if (newParent.status === NodeStatus.archived) throw new ConflictException('NODE_ARCHIVED')

    const edge = await this.repo.replaceNodeEdges(nodeId, type, newFromId, projectId, createdBy)
    await this.publisher.publish({
      type: 'graph.edge.created',
      payload: { edgeId: edge.id, fromId: newFromId, toId: nodeId, edgeType: type, projectId },
    })
    return edge
  }
}
```

- [ ] **Step 4: 运行测试，确认 PASS**

```bash
cd apps/server && pnpm test
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/graph/edge/
git commit -m "feat: add EdgeService with cycle detection integration"
```

---

## Task 7: GraphController（TDD）

**Files:**
- Create: `apps/server/src/graph/graph.controller.ts`
- Create: `apps/server/src/graph/graph.controller.spec.ts`

- [ ] **Step 1: 创建测试文件**

创建 `apps/server/src/graph/graph.controller.spec.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GraphController } from './graph.controller'
import { NodeType, CreatedBy, NodeStatus, EdgeType } from '@prisma/client'

describe('GraphController', () => {
  let controller: GraphController
  let mockNodeService: any
  let mockEdgeService: any

  beforeEach(() => {
    mockNodeService = {
      initProjectRoot: vi.fn(),
      createNode: vi.fn(),
      updateNode: vi.fn(),
      updateStatus: vi.fn(),
      resolveCheckpoint: vi.fn(),
      listProjectNodes: vi.fn(),
      getSubgraph: vi.fn(),
      deleteNode: vi.fn(),
    }
    mockEdgeService = {
      createEdge: vi.fn(),
      deleteEdge: vi.fn(),
      listProjectEdges: vi.fn(),
      replaceNodeEdges: vi.fn(),
    }
    controller = new GraphController(mockNodeService, mockEdgeService)
  })

  it('initProject calls nodeService.initProjectRoot', async () => {
    const node = { id: 'root', projectId: 'p1', isProjectRoot: true }
    mockNodeService.initProjectRoot.mockResolvedValue(node)
    const result = await controller.initProject('p1')
    expect(mockNodeService.initProjectRoot).toHaveBeenCalledWith('p1')
    expect(result).toEqual(node)
  })

  it('createNode calls nodeService.createNode with body', async () => {
    const body = { type: NodeType.scaffold, title: 'Task A', createdBy: CreatedBy.human }
    const node = { id: 'n1', projectId: 'p1', ...body }
    mockNodeService.createNode.mockResolvedValue(node)
    const result = await controller.createNode('p1', body)
    expect(mockNodeService.createNode).toHaveBeenCalledWith({ projectId: 'p1', ...body })
    expect(result).toEqual(node)
  })

  it('updateNode calls nodeService.updateNode for non-status fields', async () => {
    const body = { title: 'New Title' }
    mockNodeService.updateNode.mockResolvedValue({ id: 'n1', title: 'New Title' })
    await controller.updateNode('n1', body)
    expect(mockNodeService.updateNode).toHaveBeenCalledWith('n1', body)
  })

  it('updateNode calls nodeService.updateStatus when status is in body', async () => {
    const body = { status: NodeStatus.completed }
    mockNodeService.updateStatus.mockResolvedValue({ id: 'n1', status: NodeStatus.completed })
    await controller.updateNode('n1', body)
    expect(mockNodeService.updateStatus).toHaveBeenCalledWith('n1', NodeStatus.completed)
  })

  it('resolveCheckpoint delegates to nodeService', async () => {
    mockNodeService.resolveCheckpoint.mockResolvedValue({ id: 'n1' })
    await controller.resolveCheckpoint('n1', { resolution: 'continue' })
    expect(mockNodeService.resolveCheckpoint).toHaveBeenCalledWith('n1', 'continue')
  })

  it('deleteNode passes strategy from body', async () => {
    mockNodeService.deleteNode.mockResolvedValue({ affectedNodeIds: [] })
    await controller.deleteNode('n1', { strategy: 'cascade' })
    expect(mockNodeService.deleteNode).toHaveBeenCalledWith('n1', 'cascade')
  })

  it('createEdge delegates to edgeService', async () => {
    const body = { fromId: 'a', toId: 'b', type: EdgeType.composition, createdBy: CreatedBy.human }
    mockEdgeService.createEdge.mockResolvedValue({ id: 'e1', ...body, projectId: 'p1' })
    await controller.createEdge('p1', body)
    expect(mockEdgeService.createEdge).toHaveBeenCalledWith({ projectId: 'p1', ...body })
  })
})
```

- [ ] **Step 2: 运行测试，确认 FAIL**

```bash
cd apps/server && pnpm test
```

Expected: FAIL — `Cannot find module './graph.controller'`

- [ ] **Step 3: 创建 Controller**

创建 `apps/server/src/graph/graph.controller.ts`：

```typescript
import { Controller, Post, Patch, Get, Delete, Param, Body } from '@nestjs/common'
import { NodeType, CreatedBy, NodeStatus, EdgeType } from '@prisma/client'
import { NodeService } from './node/node.service'
import { EdgeService } from './edge/edge.service'
import type { DeleteStrategy } from './events/graph-event.publisher'

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
    if (status !== undefined) return this.nodeService.updateStatus(nodeId, status)
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
    @Body() body: { strategy?: DeleteStrategy } = {},
  ) {
    return this.nodeService.deleteNode(nodeId, body.strategy)
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
```

- [ ] **Step 4: 运行测试，确认 PASS**

```bash
cd apps/server && pnpm test
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/graph/graph.controller.ts apps/server/src/graph/graph.controller.spec.ts
git commit -m "feat: add GraphController with all node and edge routes"
```

---

## Task 8: GraphModule + AppModule 组装

**Files:**
- Create: `apps/server/src/graph/graph.module.ts`
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: 创建 GraphModule**

创建 `apps/server/src/graph/graph.module.ts`：

```typescript
import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { GraphController } from './graph.controller'
import { NodeService } from './node/node.service'
import { EdgeService } from './edge/edge.service'
import { CycleDetectorService } from './cycle/cycle-detector.service'
import { GraphEventPublisher, GRAPH_EVENTS_QUEUE } from './events/graph-event.publisher'
import { GraphRepository } from './repository/graph.repository'
import { PrismaService } from '../prisma/prisma.service'

@Module({
  imports: [
    BullModule.registerQueue({ name: GRAPH_EVENTS_QUEUE }),
  ],
  controllers: [GraphController],
  providers: [
    PrismaService,
    GraphRepository,
    CycleDetectorService,
    GraphEventPublisher,
    NodeService,
    EdgeService,
  ],
})
export class GraphModule {}
```

- [ ] **Step 2: 更新 AppModule**

替换 `apps/server/src/app.module.ts`：

```typescript
import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { GraphModule } from './graph/graph.module'

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    GraphModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 3: 添加 REDIS_HOST / REDIS_PORT 到 .env**

在 `apps/server/.env` 中追加：

```
REDIS_HOST=localhost
REDIS_PORT=6379
```

- [ ] **Step 4: 确认服务启动**

```bash
cd apps/server && pnpm dev
```

Expected:
```
[Nest] LOG [NestFactory] Starting Nest application...
[Nest] LOG [InstanceLoader] GraphModule dependencies initialized
[Nest] LOG [NestApplication] Nest application successfully started
```

若看到 `ECONNREFUSED` 是 Redis 未启动。本地启动 Redis：`redis-server`，再重试。

- [ ] **Step 5: 手动冒烟测试**

```bash
# 1. 初始化项目根节点
curl -s -X POST http://localhost:3000/projects/proj-001/init | jq .

# 2. 创建节点
curl -s -X POST http://localhost:3000/projects/proj-001/nodes \
  -H "Content-Type: application/json" \
  -d '{"type":"scaffold","title":"后端 API 开发","createdBy":"human"}' | jq .

# 3. 查询节点列表
curl -s http://localhost:3000/projects/proj-001/nodes | jq .
```

Expected: 三个请求均返回正常 JSON，节点列表中包含刚创建的节点。

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/graph/graph.module.ts apps/server/src/app.module.ts
git commit -m "feat: wire GraphModule into AppModule, scaffold graph engine complete"
```

---

## Self-Review

**Spec coverage check:**

| Spec 要求 | 覆盖任务 |
|---|---|
| Prisma Schema（Node/Edge/枚举） | Task 1 |
| PrismaService | Task 1 |
| CycleDetectorService（DFS + 入度） | Task 2 |
| reference 边跳过环检测 | Task 2 测试覆盖 |
| GraphEventPublisher + 5 种 Job 类型 | Task 3 |
| GraphRepository（含 4 种删除策略） | Task 4 |
| NodeService 护栏校验（5 条规则） | Task 5 |
| NodeService.resolveCheckpoint | Task 5 |
| EdgeService.createEdge（环检测集成） | Task 6 |
| EdgeService.replaceNodeEdges | Task 6 |
| GraphController（全部路由） | Task 7 |
| POST /projects/:id/init（根节点初始化） | Task 7 |
| GraphModule + AppModule 组装 | Task 8 |
| BullMQ Redis 配置 | Task 8 |
| 冒烟测试 | Task 8 |
