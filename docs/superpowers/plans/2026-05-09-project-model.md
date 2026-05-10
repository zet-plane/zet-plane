# Project Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Project` aggregate root so that all nodes, edges, and knowledge entries belong to a verified domain entity, replacing the free-string `projectId` with a validated record.

**Architecture:** `ProjectModule` sits above `GraphModule` and `KnowledgeModule`. `ProjectService.assertExists` guards every write path in child modules via a circular dependency resolved with NestJS `forwardRef`. `ProjectRepository` owns cascade deletion (hard delete, bypassing child service layers) in a single Prisma transaction. `ProjectService.create` and `NodeService.initProjectRootInternal` share a transaction via a callback passed through `ProjectRepository.createWithRootTx`.

**Tech Stack:** NestJS, Prisma (PostgreSQL), BullMQ, Vitest

---

## File Map

**Created:**
- `apps/server/src/project/dto/project.dto.ts`
- `apps/server/src/project/repository/project.repository.ts`
- `apps/server/src/project/events/project-event.publisher.ts`
- `apps/server/src/project/project.service.ts`
- `apps/server/src/project/project.service.spec.ts`
- `apps/server/src/project/project.controller.ts`
- `apps/server/src/project/project.controller.spec.ts`
- `apps/server/src/project/project.module.ts`

**Modified:**
- `apps/server/prisma/schema.prisma` — add `model Project`
- `apps/server/src/app.module.ts` — register `ProjectModule`
- `apps/server/src/graph/graph.module.ts` — `forwardRef` import of `ProjectModule`, export `NodeService`/`EdgeService`
- `apps/server/src/graph/graph.controller.ts` — remove `POST /projects/:id/init`
- `apps/server/src/graph/graph.controller.spec.ts` — remove init route test
- `apps/server/src/graph/repository/graph.repository.ts` — add `initProjectRootInTransaction`
- `apps/server/src/graph/node/node.service.ts` — inject `ProjectService`, add `assertExists`, rename `initProjectRoot` → `initProjectRootInternal`
- `apps/server/src/graph/node/node.service.spec.ts` — add "when project does not exist" blocks, update constructor call
- `apps/server/src/graph/edge/edge.service.ts` — inject `ProjectService`, add `assertExists`
- `apps/server/src/graph/edge/edge.service.spec.ts` — add "when project does not exist" blocks, update constructor call
- `apps/server/src/knowledge/knowledge.module.ts` — `forwardRef` import of `ProjectModule`
- `apps/server/src/knowledge/entry/entry.service.ts` — inject `ProjectService`, add `assertExists`
- `apps/server/src/knowledge/entry/entry.service.spec.ts` — add "when project does not exist" blocks, update constructor call

---

## Task 1: Add Project table to schema and migrate

**Files:**
- Modify: `apps/server/prisma/schema.prisma`

- [ ] **Step 1: Add Project model to schema**

Open `apps/server/prisma/schema.prisma` and append at the top of the model section (before `model Node`):

```prisma
model Project {
  id          String   @id @default(uuid())
  name        String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

No relations, no status, no index beyond the implicit PK.

- [ ] **Step 2: Run migration**

```bash
cd apps/server
pnpm prisma migrate dev --name add_project_table
```

Expected: migration file created under `prisma/migrations/`, Prisma client regenerated automatically.

- [ ] **Step 3: Verify existing tests still pass**

```bash
cd apps/server
pnpm test
```

Expected: all pre-existing tests pass (schema change only adds a table, no existing code references it).

- [ ] **Step 4: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations/
git commit -m "feat(db): add Project table"
```

---

## Task 2: Create ProjectModule scaffold (DTOs, Repository, EventPublisher, Module wiring)

**Files:**
- Create: `apps/server/src/project/dto/project.dto.ts`
- Create: `apps/server/src/project/repository/project.repository.ts`
- Create: `apps/server/src/project/events/project-event.publisher.ts`
- Create: `apps/server/src/project/project.module.ts`
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: Create DTO file**

```ts
// apps/server/src/project/dto/project.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsOptional } from 'class-validator'
import type { Project } from '@generated/client'

export class CreateProjectDto {
  @ApiProperty()
  @IsString()
  name: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string
}

export class UpdateProjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string
}

export class ProjectEntity implements Project {
  @ApiProperty() id: string
  @ApiProperty() name: string
  @ApiPropertyOptional() description: string | null
  @ApiProperty() createdAt: Date
  @ApiProperty() updatedAt: Date
}
```

- [ ] **Step 2: Create ProjectRepository**

```ts
// apps/server/src/project/repository/project.repository.ts
import { Injectable } from '@nestjs/common'
import type { Project, Prisma } from '@generated/client'
import { PrismaService } from '../../prisma/prisma.service'
import type { Node } from '@generated/client'

export type ProjectCreateData = { name: string; description?: string }
export type ProjectUpdateData = { name?: string; description?: string }

@Injectable()
export class ProjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createWithRootTx(
    data: ProjectCreateData,
    nodeInit: (tx: Prisma.TransactionClient, projectId: string) => Promise<Node>,
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
```

- [ ] **Step 3: Create ProjectEventPublisher**

```ts
// apps/server/src/project/events/project-event.publisher.ts
import { Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'

export const PROJECT_EVENTS_QUEUE = 'project-events'

export type ProjectJob =
  | { type: 'project.created'; payload: { projectId: string; rootNodeId: string } }
  | { type: 'project.deleted'; payload: { projectId: string; cascadedCounts: { nodes: number; edges: number; entries: number } } }

@Injectable()
export class ProjectEventPublisher {
  constructor(@InjectQueue(PROJECT_EVENTS_QUEUE) private readonly queue: Queue) {}

  async publish(job: ProjectJob): Promise<void> {
    await this.queue.add(job.type, job.payload)
  }
}
```

- [ ] **Step 4: Create ProjectModule (stub — service and controller added later)**

```ts
// apps/server/src/project/project.module.ts
import { Module, forwardRef } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { GraphModule } from '../graph/graph.module'
import { ProjectRepository } from './repository/project.repository'
import { ProjectEventPublisher, PROJECT_EVENTS_QUEUE } from './events/project-event.publisher'
import { PrismaService } from '../prisma/prisma.service'

@Module({
  imports: [
    BullModule.registerQueue({ name: PROJECT_EVENTS_QUEUE }),
    forwardRef(() => GraphModule),
  ],
  providers: [
    PrismaService,
    ProjectRepository,
    ProjectEventPublisher,
  ],
  exports: [],
})
export class ProjectModule {}
```

- [ ] **Step 5: Register ProjectModule in AppModule**

Edit `apps/server/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { BullModule } from '@nestjs/bullmq'
import { GraphModule } from './graph/graph.module'
import { AppConfigModule } from './config/app-config.module'
import { AppConfig } from './config/app-config'
import { KnowledgeModule } from './knowledge/knowledge.module'
import { ProjectModule } from './project/project.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AppConfigModule,
    BullModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (cfg: AppConfig) => {
        const { hostname, port } = new URL(cfg.redis.url)
        return { connection: { host: hostname, port: Number(port) || 6379 } }
      },
    }),
    GraphModule,
    KnowledgeModule,
    ProjectModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 6: Run tests to verify scaffold compiles**

```bash
cd apps/server
pnpm test
```

Expected: all tests pass (no logic added yet, just new files and module registration).

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/project/ apps/server/src/app.module.ts
git commit -m "feat(project): scaffold ProjectModule with repository and event publisher"
```

---

## Task 3: Implement ProjectService (create, assertExists, findById, list, update, remove) with TDD

**Files:**
- Create: `apps/server/src/project/project.service.spec.ts`
- Create: `apps/server/src/project/project.service.ts`
- Modify: `apps/server/src/project/project.module.ts`

- [ ] **Step 1: Write failing tests**

```ts
// apps/server/src/project/project.service.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { ProjectService } from './project.service'
import type { Project } from '@generated/client'

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'Test Project',
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('ProjectService', () => {
  let service: ProjectService
  let mockRepo: any
  let mockPublisher: any
  let mockNodeService: any

  beforeEach(() => {
    mockRepo = {
      createWithRootTx: vi.fn(),
      findById: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      removeWithCascade: vi.fn(),
    }
    mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    mockNodeService = { initProjectRootInternal: vi.fn() }
    service = new ProjectService(mockRepo, mockPublisher, mockNodeService)
  })

  describe('create', () => {
    it('inserts project and root node in the same transaction', async () => {
      const project = makeProject()
      const rootNode = { id: 'root-1' }
      mockRepo.createWithRootTx.mockImplementation(async (_data: any, nodeInit: Function) => {
        const node = await nodeInit({}, project.id)
        return { project, rootNode: node }
      })
      mockNodeService.initProjectRootInternal.mockResolvedValue(rootNode)

      const result = await service.create({ name: 'Test Project' })

      expect(mockRepo.createWithRootTx).toHaveBeenCalledWith(
        { name: 'Test Project' },
        expect.any(Function),
      )
      expect(mockNodeService.initProjectRootInternal).toHaveBeenCalledWith(project.id, {})
      expect(result).toEqual(project)
    })

    it('publishes project.created with rootNodeId after commit', async () => {
      const project = makeProject()
      const rootNode = { id: 'root-1' }
      mockRepo.createWithRootTx.mockImplementation(async (_data: any, nodeInit: Function) => {
        const node = await nodeInit({}, project.id)
        return { project, rootNode: node }
      })
      mockNodeService.initProjectRootInternal.mockResolvedValue(rootNode)

      await service.create({ name: 'Test Project' })

      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'project.created',
        payload: { projectId: project.id, rootNodeId: 'root-1' },
      })
    })

    it('rolls back if initProjectRootInternal throws', async () => {
      mockRepo.createWithRootTx.mockImplementation(async (_data: any, nodeInit: Function) => {
        await nodeInit({}, 'proj-1')
      })
      mockNodeService.initProjectRootInternal.mockRejectedValue(new Error('DB error'))

      await expect(service.create({ name: 'Test Project' })).rejects.toThrow('DB error')
      expect(mockPublisher.publish).not.toHaveBeenCalled()
    })
  })

  describe('assertExists', () => {
    it('resolves silently when project exists', async () => {
      mockRepo.findById.mockResolvedValue(makeProject())
      await expect(service.assertExists('proj-1')).resolves.toBeUndefined()
    })

    it('throws 404 when project does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null)
      await expect(service.assertExists('missing')).rejects.toThrow(NotFoundException)
    })
  })

  describe('findById', () => {
    it('returns project when found', async () => {
      const project = makeProject()
      mockRepo.findById.mockResolvedValue(project)
      await expect(service.findById('proj-1')).resolves.toEqual(project)
    })

    it('throws 404 when not found', async () => {
      mockRepo.findById.mockResolvedValue(null)
      await expect(service.findById('missing')).rejects.toThrow(NotFoundException)
    })
  })

  describe('update', () => {
    it('updates project after asserting existence', async () => {
      const project = makeProject()
      mockRepo.findById.mockResolvedValue(project)
      mockRepo.update.mockResolvedValue({ ...project, name: 'Renamed' })

      const result = await service.update('proj-1', { name: 'Renamed' })
      expect(result.name).toBe('Renamed')
    })

    it('throws 404 when project does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null)
      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(NotFoundException)
    })
  })

  describe('remove', () => {
    it('calls repo.removeWithCascade, not child service methods', async () => {
      mockRepo.findById.mockResolvedValue(makeProject())
      mockRepo.removeWithCascade.mockResolvedValue({ counts: { nodes: 3, edges: 2, entries: 1 } })

      await service.remove('proj-1')

      expect(mockRepo.removeWithCascade).toHaveBeenCalledWith('proj-1')
    })

    it('publishes project.deleted with cascaded counts', async () => {
      mockRepo.findById.mockResolvedValue(makeProject())
      mockRepo.removeWithCascade.mockResolvedValue({ counts: { nodes: 3, edges: 2, entries: 1 } })

      await service.remove('proj-1')

      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'project.deleted',
        payload: { projectId: 'proj-1', cascadedCounts: { nodes: 3, edges: 2, entries: 1 } },
      })
    })

    it('throws 404 if project does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null)
      await expect(service.remove('missing')).rejects.toThrow(NotFoundException)
    })
  })

  describe('list', () => {
    it('returns array from repo', async () => {
      mockRepo.list.mockResolvedValue([makeProject()])
      await expect(service.list()).resolves.toHaveLength(1)
    })
  })
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd apps/server
pnpm vitest run src/project/project.service.spec.ts
```

Expected: FAIL — `ProjectService` does not exist yet.

- [ ] **Step 3: Implement ProjectService**

```ts
// apps/server/src/project/project.service.ts
import { Injectable, NotFoundException, forwardRef, Inject } from '@nestjs/common'
import type { Project, Prisma } from '@generated/client'
import { ProjectRepository } from './repository/project.repository'
import type { ProjectCreateData, ProjectUpdateData } from './repository/project.repository'
import { ProjectEventPublisher } from './events/project-event.publisher'
import { NodeService } from '../graph/node/node.service'

@Injectable()
export class ProjectService {
  constructor(
    private readonly repo: ProjectRepository,
    private readonly publisher: ProjectEventPublisher,
    @Inject(forwardRef(() => NodeService)) private readonly nodeService: NodeService,
  ) {}

  async create(data: ProjectCreateData): Promise<Project> {
    const { project, rootNode } = await this.repo.createWithRootTx(
      data,
      (tx: Prisma.TransactionClient, projectId: string) =>
        this.nodeService.initProjectRootInternal(projectId, tx),
    )
    await this.publisher.publish({
      type: 'project.created',
      payload: { projectId: project.id, rootNodeId: rootNode.id },
    })
    return project
  }

  async findById(id: string): Promise<Project> {
    const project = await this.repo.findById(id)
    if (!project) throw new NotFoundException('PROJECT_NOT_FOUND')
    return project
  }

  async list(): Promise<Project[]> {
    return this.repo.list()
  }

  async update(id: string, data: ProjectUpdateData): Promise<Project> {
    await this.assertExists(id)
    return this.repo.update(id, data)
  }

  async remove(id: string): Promise<void> {
    await this.assertExists(id)
    const { counts } = await this.repo.removeWithCascade(id)
    await this.publisher.publish({
      type: 'project.deleted',
      payload: { projectId: id, cascadedCounts: counts },
    })
  }

  async assertExists(id: string): Promise<void> {
    const project = await this.repo.findById(id)
    if (!project) throw new NotFoundException('PROJECT_NOT_FOUND')
  }
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
cd apps/server
pnpm vitest run src/project/project.service.spec.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Register ProjectService in ProjectModule and export it**

Edit `apps/server/src/project/project.module.ts` — add `ProjectService` to providers and exports:

```ts
import { Module, forwardRef } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { GraphModule } from '../graph/graph.module'
import { ProjectRepository } from './repository/project.repository'
import { ProjectEventPublisher, PROJECT_EVENTS_QUEUE } from './events/project-event.publisher'
import { ProjectService } from './project.service'
import { PrismaService } from '../prisma/prisma.service'

@Module({
  imports: [
    BullModule.registerQueue({ name: PROJECT_EVENTS_QUEUE }),
    forwardRef(() => GraphModule),
  ],
  providers: [
    PrismaService,
    ProjectRepository,
    ProjectEventPublisher,
    ProjectService,
  ],
  exports: [ProjectService],
})
export class ProjectModule {}
```

- [ ] **Step 6: Run all tests**

```bash
cd apps/server
pnpm test
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/project/
git commit -m "feat(project): implement ProjectService with create, assertExists, update, remove"
```

---

## Task 4: Add ProjectController (TDD)

**Files:**
- Create: `apps/server/src/project/project.controller.spec.ts`
- Create: `apps/server/src/project/project.controller.ts`
- Modify: `apps/server/src/project/project.module.ts`

- [ ] **Step 1: Write failing controller tests**

```ts
// apps/server/src/project/project.controller.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProjectController } from './project.controller'
import type { Project } from '@generated/client'

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1', name: 'P', description: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
}

describe('ProjectController', () => {
  let controller: ProjectController
  let mockService: any

  beforeEach(() => {
    mockService = {
      create: vi.fn(),
      findById: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    }
    controller = new ProjectController(mockService)
  })

  it('POST / calls service.create', async () => {
    mockService.create.mockResolvedValue(makeProject())
    await controller.create({ name: 'P' })
    expect(mockService.create).toHaveBeenCalledWith({ name: 'P' })
  })

  it('GET / calls service.list', async () => {
    mockService.list.mockResolvedValue([])
    await controller.list()
    expect(mockService.list).toHaveBeenCalled()
  })

  it('GET /:id calls service.findById', async () => {
    mockService.findById.mockResolvedValue(makeProject())
    await controller.findById('proj-1')
    expect(mockService.findById).toHaveBeenCalledWith('proj-1')
  })

  it('PATCH /:id calls service.update', async () => {
    mockService.update.mockResolvedValue(makeProject())
    await controller.update('proj-1', { name: 'New' })
    expect(mockService.update).toHaveBeenCalledWith('proj-1', { name: 'New' })
  })

  it('DELETE /:id calls service.remove', async () => {
    mockService.remove.mockResolvedValue(undefined)
    await controller.remove('proj-1')
    expect(mockService.remove).toHaveBeenCalledWith('proj-1')
  })
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd apps/server
pnpm vitest run src/project/project.controller.spec.ts
```

Expected: FAIL — `ProjectController` does not exist.

- [ ] **Step 3: Implement ProjectController**

```ts
// apps/server/src/project/project.controller.ts
import { Controller, Post, Get, Patch, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiResponse } from '@nestjs/swagger'
import { ProjectService } from './project.service'
import { CreateProjectDto, UpdateProjectDto, ProjectEntity } from './dto/project.dto'

@ApiTags('projects')
@Controller('projects')
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
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: ProjectEntity })
  @ApiResponse({ status: 404, description: 'Project not found' })
  findById(@Param('id') id: string) {
    return this.projectService.findById(id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update project name or description' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: UpdateProjectDto })
  @ApiResponse({ status: 200, type: ProjectEntity })
  @ApiResponse({ status: 404, description: 'Project not found' })
  update(@Param('id') id: string, @Body() body: UpdateProjectDto) {
    return this.projectService.update(id, body)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Hard delete a project and all its data' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Project not found' })
  remove(@Param('id') id: string) {
    return this.projectService.remove(id)
  }
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
cd apps/server
pnpm vitest run src/project/project.controller.spec.ts
```

Expected: all PASS.

- [ ] **Step 5: Register ProjectController in ProjectModule**

Edit `apps/server/src/project/project.module.ts` — add to controllers and imports:

```ts
import { Module, forwardRef } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { GraphModule } from '../graph/graph.module'
import { ProjectRepository } from './repository/project.repository'
import { ProjectEventPublisher, PROJECT_EVENTS_QUEUE } from './events/project-event.publisher'
import { ProjectService } from './project.service'
import { ProjectController } from './project.controller'
import { PrismaService } from '../prisma/prisma.service'

@Module({
  imports: [
    BullModule.registerQueue({ name: PROJECT_EVENTS_QUEUE }),
    forwardRef(() => GraphModule),
  ],
  controllers: [ProjectController],
  providers: [
    PrismaService,
    ProjectRepository,
    ProjectEventPublisher,
    ProjectService,
  ],
  exports: [ProjectService],
})
export class ProjectModule {}
```

- [ ] **Step 6: Run all tests**

```bash
cd apps/server
pnpm test
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/project/
git commit -m "feat(project): add ProjectController with 5 CRUD endpoints"
```

---

## Task 5: Wire ProjectModule ↔ GraphModule (forwardRef) and add initProjectRootInternal

This task wires the circular dependency and adds the transaction-aware root-init method. No new tests yet — existing tests will update in Tasks 6 and 7.

**Files:**
- Modify: `apps/server/src/graph/graph.module.ts`
- Modify: `apps/server/src/graph/repository/graph.repository.ts`
- Modify: `apps/server/src/graph/node/node.service.ts`

- [ ] **Step 1: Update GraphModule to import ProjectModule (forwardRef) and export NodeService**

```ts
// apps/server/src/graph/graph.module.ts
import { Module, forwardRef } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { GraphController } from './graph.controller'
import { NodeService } from './node/node.service'
import { EdgeService } from './edge/edge.service'
import { CycleDetectorService } from './cycle/cycle-detector.service'
import { GraphEventPublisher, GRAPH_EVENTS_QUEUE } from './events/graph-event.publisher'
import { GraphEventWorker } from './events/graph-event.worker'
import { GraphRepository } from './repository/graph.repository'
import { PrismaService } from '../prisma/prisma.service'
import { ProjectModule } from '../project/project.module'

@Module({
  imports: [
    BullModule.registerQueue({ name: GRAPH_EVENTS_QUEUE }),
    forwardRef(() => ProjectModule),
  ],
  controllers: [GraphController],
  providers: [
    PrismaService,
    GraphRepository,
    CycleDetectorService,
    GraphEventPublisher,
    GraphEventWorker,
    NodeService,
    EdgeService,
  ],
  exports: [NodeService, EdgeService],
})
export class GraphModule {}
```

- [ ] **Step 2: Add initProjectRootInTransaction to GraphRepository**

Open `apps/server/src/graph/repository/graph.repository.ts`. Add this method after `initProjectRoot`:

```ts
async initProjectRootInTransaction(projectId: string, tx: Prisma.TransactionClient): Promise<Node> {
  return tx.node.create({
    data: {
      projectId,
      isProjectRoot: true,
      type: NodeType.scaffold,
      title: '[Project Root]',
      createdBy: CreatedBy.human,
    },
  })
}
```

Also add `Prisma` to the imports at the top of the file:

```ts
import type { Node, Edge, Prisma } from '@generated/client'
```

- [ ] **Step 3: Add initProjectRootInternal to NodeService**

Open `apps/server/src/graph/node/node.service.ts`. Add this method right after `initProjectRoot`:

```ts
async initProjectRootInternal(projectId: string, tx: Prisma.TransactionClient): Promise<Node> {
  return this.repo.initProjectRootInTransaction(projectId, tx)
}
```

Also add `Prisma` to the imports:

```ts
import type { Node, Edge, Prisma } from '@generated/client'
```

- [ ] **Step 4: Run all tests**

```bash
cd apps/server
pnpm test
```

Expected: all pass. `initProjectRootInternal` is additive — no existing code breaks.

- [ ] **Step 5: Wire KnowledgeModule to import ProjectModule**

Edit `apps/server/src/knowledge/knowledge.module.ts`:

```ts
import { Module, forwardRef } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { KnowledgeController } from './knowledge.controller'
import { EntryService } from './entry/entry.service'
import { RevisionService } from './revision/revision.service'
import { SearchService } from './search/search.service'
import { KnowledgeRepository } from './repository/knowledge.repository'
import { KnowledgeEventPublisher, KNOWLEDGE_EVENTS_QUEUE } from './events/knowledge-event.publisher'
import { PrismaService } from '../prisma/prisma.service'
import { ProjectModule } from '../project/project.module'

@Module({
  imports: [
    BullModule.registerQueue({ name: KNOWLEDGE_EVENTS_QUEUE }),
    forwardRef(() => ProjectModule),
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

- [ ] **Step 6: Run all tests**

```bash
cd apps/server
pnpm test
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/graph/ apps/server/src/knowledge/knowledge.module.ts
git commit -m "feat(project): wire ProjectModule↔GraphModule forwardRef, add initProjectRootInternal"
```

---

## Task 6: Add assertExists to NodeService write paths (TDD)

**Files:**
- Modify: `apps/server/src/graph/node/node.service.spec.ts`
- Modify: `apps/server/src/graph/node/node.service.ts`

- [ ] **Step 1: Add failing tests**

Open `apps/server/src/graph/node/node.service.spec.ts`. Add `mockProjectService` to the `beforeEach` block and add a new top-level `describe` block:

In `beforeEach`, change the service instantiation:
```ts
// add to existing beforeEach:
mockRepo.initProjectRootInTransaction = vi.fn()
const mockProjectService = { assertExists: vi.fn().mockResolvedValue(undefined) }
// update the constructor call:
service = new NodeService(mockRepo, mockPublisher, mockProjectService)
```

Add this describe block **after** the existing `describe('updateStatus', ...)` block:

```ts
describe('when project does not exist', () => {
  let mockProjectService: any

  beforeEach(() => {
    mockProjectService = {
      assertExists: vi.fn().mockRejectedValue(new NotFoundException('PROJECT_NOT_FOUND')),
    }
    service = new NodeService(mockRepo, mockPublisher, mockProjectService)
  })

  it('createNode throws 404', async () => {
    await expect(
      service.createNode({ projectId: 'bad', type: NodeType.scaffold, title: 'T', createdBy: CreatedBy.human }),
    ).rejects.toThrow(NotFoundException)
  })

  it('updateNode throws 404', async () => {
    mockRepo.findNode.mockResolvedValue(makeNode())
    await expect(service.updateNode('n1', { title: 'X' })).rejects.toThrow(NotFoundException)
  })

  it('updateStatus throws 404', async () => {
    mockRepo.findNode.mockResolvedValue(makeNode())
    await expect(service.updateStatus('n1', NodeStatus.completed)).rejects.toThrow(NotFoundException)
  })

  it('resolveCheckpoint throws 404', async () => {
    mockRepo.findNode.mockResolvedValue(makeNode({ status: NodeStatus.blocked, isCheckpoint: true }))
    await expect(service.resolveCheckpoint('n1', 'continue')).rejects.toThrow(NotFoundException)
  })

  it('deleteNode throws 404', async () => {
    mockRepo.findNode.mockResolvedValue(makeNode())
    await expect(service.deleteNode('n1')).rejects.toThrow(NotFoundException)
  })
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd apps/server
pnpm vitest run src/graph/node/node.service.spec.ts
```

Expected: the new "when project does not exist" tests FAIL, existing tests may also fail because `NodeService` constructor signature changed.

- [ ] **Step 3: Update NodeService to inject ProjectService and call assertExists**

```ts
// apps/server/src/graph/node/node.service.ts
import { Injectable, NotFoundException, ConflictException, forwardRef, Inject } from '@nestjs/common'
import { NodeStatus, CheckpointResolution } from '@generated/client'
import type { Node, Edge, Prisma } from '@generated/client'
import { GraphRepository, HasCompositionChildrenError, AmbiguousParentError } from '../repository/graph.repository'
import type { NodeCreateData, DeleteStrategy } from '../repository/graph.repository'
import { GraphEventPublisher } from '../events/graph-event.publisher'
import { ProjectService } from '../../project/project.service'

@Injectable()
export class NodeService {
  constructor(
    private readonly repo: GraphRepository,
    private readonly publisher: GraphEventPublisher,
    @Inject(forwardRef(() => ProjectService)) private readonly projectService: ProjectService,
  ) {}

  async initProjectRoot(projectId: string): Promise<Node> {
    return this.repo.initProjectRoot(projectId)
  }

  async initProjectRootInternal(projectId: string, tx: Prisma.TransactionClient): Promise<Node> {
    return this.repo.initProjectRootInTransaction(projectId, tx)
  }

  async createNode(data: NodeCreateData): Promise<Node> {
    await this.projectService.assertExists(data.projectId)
    return this.repo.createNode(data)
  }

  async listProjectNodes(projectId: string): Promise<Node[]> {
    return this.repo.listProjectNodes(projectId)
  }

  async getSubgraph(nodeId: string): Promise<{ nodes: Node[]; edges: Edge[] }> {
    const node = await this.repo.findNode(nodeId)
    if (!node) throw new NotFoundException(`Node ${nodeId} not found`)
    return this.repo.getSubgraph(nodeId)
  }

  async updateNode(id: string, data: Partial<Pick<Node, 'title' | 'description' | 'isCheckpoint'>>): Promise<Node> {
    const node = await this.requireNode(id)
    await this.projectService.assertExists(node.projectId)
    if (node.status === NodeStatus.archived) {
      throw new ConflictException('NODE_ARCHIVED')
    }
    return this.repo.updateNode(id, data)
  }

  async updateStatus(nodeId: string, newStatus: NodeStatus): Promise<Node> {
    const node = await this.requireNode(nodeId)
    await this.projectService.assertExists(node.projectId)
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
    await this.projectService.assertExists(node.projectId)
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
    await this.projectService.assertExists(node.projectId)
    if (node.isProjectRoot) throw new ConflictException('Cannot delete project root node')
    try {
      const affectedNodeIds = await this.repo.deleteNodeWithStrategy(nodeId, node.projectId, strategy)
      await this.publisher.publish({
        type: 'graph.node.deleted',
        payload: { nodeId, strategy, affectedNodeIds, projectId: node.projectId },
      })
      return { affectedNodeIds }
    } catch (err) {
      if (err instanceof HasCompositionChildrenError) {
        throw new ConflictException({ error: 'HAS_ACTIVE_CHILDREN', affectedNodes: err.affectedNodes })
      }
      if (err instanceof AmbiguousParentError) {
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
    if (node.status === NodeStatus.completed && newStatus !== NodeStatus.archived) {
      throw new ConflictException('NODE_COMPLETED')
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
      const unresolved = deps.filter(d => d.status !== NodeStatus.completed && d.status !== NodeStatus.archived)
      if (unresolved.length > 0) {
        throw new ConflictException('UNRESOLVED_DEPENDENCY')
      }
    }
  }
}
```

Also update the `beforeEach` in `node.service.spec.ts` to pass `mockProjectService` to the constructor for the main describe block (the one not in "when project does not exist"):

```ts
// At the top of the outer describe, change:
const mockProjectService = { assertExists: vi.fn().mockResolvedValue(undefined) }
service = new NodeService(mockRepo, mockPublisher, mockProjectService)
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
cd apps/server
pnpm vitest run src/graph/node/node.service.spec.ts
```

Expected: all PASS.

- [ ] **Step 5: Run all tests**

```bash
cd apps/server
pnpm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/graph/node/
git commit -m "feat(project): add assertExists guard to NodeService write paths"
```

---

## Task 7: Add assertExists to EdgeService write paths (TDD)

**Files:**
- Modify: `apps/server/src/graph/edge/edge.service.spec.ts`
- Modify: `apps/server/src/graph/edge/edge.service.ts`

- [ ] **Step 1: Add failing tests**

Open `apps/server/src/graph/edge/edge.service.spec.ts`. Add `mockProjectService` to the outer `beforeEach`:

```ts
// change the service instantiation in outer beforeEach:
const mockProjectService = { assertExists: vi.fn().mockResolvedValue(undefined) }
service = new EdgeService(mockRepo, mockDetector, mockPublisher, mockProjectService)
```

Add this describe block after the existing tests:

```ts
describe('when project does not exist', () => {
  let mockProjectService: any

  beforeEach(() => {
    mockProjectService = {
      assertExists: vi.fn().mockRejectedValue(new NotFoundException('PROJECT_NOT_FOUND')),
    }
    service = new EdgeService(mockRepo, mockDetector, mockPublisher, mockProjectService)
  })

  it('createEdge throws 404', async () => {
    await expect(
      service.createEdge({ projectId: 'bad', fromId: 'n1', toId: 'n2', type: EdgeType.composition, createdBy: CreatedBy.human }),
    ).rejects.toThrow(NotFoundException)
  })

  it('deleteEdge throws 404', async () => {
    mockRepo.findEdge.mockResolvedValue({ id: 'e1', projectId: 'bad' })
    await expect(service.deleteEdge('e1')).rejects.toThrow(NotFoundException)
  })

  it('replaceNodeEdges throws 404', async () => {
    await expect(
      service.replaceNodeEdges('n1', EdgeType.composition, 'n2', 'bad', CreatedBy.human),
    ).rejects.toThrow(NotFoundException)
  })
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd apps/server
pnpm vitest run src/graph/edge/edge.service.spec.ts
```

Expected: new tests FAIL and existing tests fail due to constructor mismatch.

- [ ] **Step 3: Update EdgeService**

```ts
// apps/server/src/graph/edge/edge.service.ts
import { Injectable, NotFoundException, ConflictException, forwardRef, Inject } from '@nestjs/common'
import { EdgeType, NodeStatus, CreatedBy } from '@generated/client'
import type { Edge } from '@generated/client'
import { GraphRepository } from '../repository/graph.repository'
import type { EdgeCreateData } from '../repository/graph.repository'
import { CycleDetectorService } from '../cycle/cycle-detector.service'
import { GraphEventPublisher } from '../events/graph-event.publisher'
import { ProjectService } from '../../project/project.service'

@Injectable()
export class EdgeService {
  constructor(
    private readonly repo: GraphRepository,
    private readonly detector: CycleDetectorService,
    private readonly publisher: GraphEventPublisher,
    @Inject(forwardRef(() => ProjectService)) private readonly projectService: ProjectService,
  ) {}

  async createEdge(data: EdgeCreateData): Promise<Edge> {
    await this.projectService.assertExists(data.projectId)

    const root = await this.repo.findProjectRoot(data.projectId)
    if (!root) throw new ConflictException('PROJECT_NOT_INITIALIZED')

    const [fromNode, toNode] = await Promise.all([
      this.repo.findNode(data.fromId),
      this.repo.findNode(data.toId),
    ])
    if (!fromNode) throw new NotFoundException(`Node ${data.fromId} not found`)
    if (!toNode) throw new NotFoundException(`Node ${data.toId} not found`)
    if (fromNode.status === NodeStatus.archived) throw new ConflictException('NODE_ARCHIVED')
    if (toNode.status === NodeStatus.archived) throw new ConflictException('NODE_ARCHIVED')
    if (fromNode.status === NodeStatus.completed) {
      throw new ConflictException('COMPLETED_NODE_IMMUTABLE')
    }

    const { edge, cyclePath, checkpointNodeId } = await this.repo.createEdge(data, (allEdges) => {
      const path = this.detector.detect(data.fromId, data.toId, allEdges)
      if (!path) return { cyclePath: null, checkpointNodeId: null }
      const nodeId = this.detector.findHighestInDegreeNode(path, allEdges)
      return { cyclePath: path, checkpointNodeId: nodeId }
    })

    if (cyclePath) {
      if (checkpointNodeId) {
        await this.publisher.publish({
          type: 'graph.node.checkpoint_elevated',
          payload: { nodeId: checkpointNodeId, cyclePath, projectId: data.projectId },
        })
      }
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
    await this.projectService.assertExists(edge.projectId)
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
    await this.projectService.assertExists(projectId)

    const root = await this.repo.findProjectRoot(projectId)
    if (!root) throw new ConflictException('PROJECT_NOT_INITIALIZED')

    const [node, newParent] = await Promise.all([
      this.repo.findNode(nodeId),
      this.repo.findNode(newFromId),
    ])
    if (!node) throw new NotFoundException(`Node ${nodeId} not found`)
    if (!newParent) throw new NotFoundException(`Node ${newFromId} not found`)
    if (node.status === NodeStatus.archived) throw new ConflictException('NODE_ARCHIVED')
    if (newParent.status === NodeStatus.archived) throw new ConflictException('NODE_ARCHIVED')

    const { edge, cyclePath, checkpointNodeId } = await this.repo.replaceNodeEdges(
      nodeId, type, newFromId, projectId, createdBy,
      (allEdges) => {
        const path = this.detector.detect(newFromId, nodeId, allEdges)
        if (!path) return { cyclePath: null, checkpointNodeId: null }
        const cpId = this.detector.findHighestInDegreeNode(path, allEdges)
        return { cyclePath: path, checkpointNodeId: cpId }
      },
    )

    if (cyclePath) {
      if (checkpointNodeId) {
        await this.publisher.publish({
          type: 'graph.node.checkpoint_elevated',
          payload: { nodeId: checkpointNodeId, cyclePath, projectId },
        })
      }
    } else {
      await this.publisher.publish({
        type: 'graph.edge.created',
        payload: { edgeId: edge.id, fromId: newFromId, toId: nodeId, edgeType: type, projectId },
      })
    }
    return edge
  }
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
cd apps/server
pnpm vitest run src/graph/edge/edge.service.spec.ts
```

Expected: all PASS.

- [ ] **Step 5: Run all tests**

```bash
cd apps/server
pnpm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/graph/edge/
git commit -m "feat(project): add assertExists guard to EdgeService write paths"
```

---

## Task 8: Add assertExists to EntryService write paths (TDD)

**Files:**
- Modify: `apps/server/src/knowledge/entry/entry.service.spec.ts`
- Modify: `apps/server/src/knowledge/entry/entry.service.ts`

- [ ] **Step 1: Add failing tests**

Open `apps/server/src/knowledge/entry/entry.service.spec.ts`. Update outer `beforeEach`:

```ts
// add to outer beforeEach:
const mockProjectService = { assertExists: vi.fn().mockResolvedValue(undefined) }
service = new EntryService(mockRepo, mockPublisher, mockProjectService)
```

Add this describe block:

```ts
describe('when project does not exist', () => {
  let mockProjectService: any

  beforeEach(() => {
    mockProjectService = {
      assertExists: vi.fn().mockRejectedValue(new NotFoundException('PROJECT_NOT_FOUND')),
    }
    service = new EntryService(mockRepo, mockPublisher, mockProjectService)
  })

  it('createEntry throws 404', async () => {
    await expect(
      service.createEntry({
        projectId: 'bad', nodeId: 'n1', category: EntryCategory.decision,
        title: 'T', body: {}, createdBy: CreatedBy.human,
      }),
    ).rejects.toThrow(NotFoundException)
  })

  it('updateFields throws 404', async () => {
    mockRepo.findEntry.mockResolvedValue(makeEntry())
    await expect(service.updateFields('e1', { title: 'X' })).rejects.toThrow(NotFoundException)
  })

  it('updateStatus throws 404', async () => {
    mockRepo.findEntry.mockResolvedValue(makeEntry())
    await expect(service.updateStatus('e1', EntryStatus.published)).rejects.toThrow(NotFoundException)
  })

  it('reanchor throws 404', async () => {
    mockRepo.findEntry.mockResolvedValue(makeEntry())
    await expect(service.reanchor('e1', 'n2')).rejects.toThrow(NotFoundException)
  })

  it('softDelete throws 404', async () => {
    mockRepo.findEntry.mockResolvedValue(makeEntry())
    await expect(service.softDelete('e1')).rejects.toThrow(NotFoundException)
  })
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd apps/server
pnpm vitest run src/knowledge/entry/entry.service.spec.ts
```

Expected: new tests FAIL, existing tests fail due to constructor mismatch.

- [ ] **Step 3: Update EntryService**

```ts
// apps/server/src/knowledge/entry/entry.service.ts
import { Injectable, NotFoundException, ConflictException, forwardRef, Inject } from '@nestjs/common'
import { EntryStatus } from '@generated/client'
import type { KnowledgeEntry } from '@generated/client'
import { KnowledgeRepository } from '../repository/knowledge.repository'
import type { EntryCreateData, EntryListFilters } from '../repository/knowledge.repository'
import { KnowledgeEventPublisher } from '../events/knowledge-event.publisher'
import { ProjectService } from '../../project/project.service'

@Injectable()
export class EntryService {
  constructor(
    private readonly repo: KnowledgeRepository,
    private readonly publisher: KnowledgeEventPublisher,
    @Inject(forwardRef(() => ProjectService)) private readonly projectService: ProjectService,
  ) {}

  async createEntry(data: EntryCreateData): Promise<KnowledgeEntry> {
    await this.projectService.assertExists(data.projectId)
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
    await this.projectService.assertExists(entry.projectId)
    if (entry.status === EntryStatus.deprecated) {
      throw new ConflictException('ENTRY_DEPRECATED')
    }
    return this.repo.updateEntry(id, data)
  }

  async updateStatus(id: string, newStatus: EntryStatus): Promise<KnowledgeEntry> {
    const entry = await this.requireEntry(id)
    await this.projectService.assertExists(entry.projectId)
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
    await this.projectService.assertExists(entry.projectId)
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
    const entry = await this.requireEntry(id)
    await this.projectService.assertExists(entry.projectId)
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

Also register `ProjectService` in `KnowledgeModule` providers (it's provided via `forwardRef(() => ProjectModule)` import, but NestJS resolves it automatically through the module import — no additional provider registration needed).

- [ ] **Step 4: Run tests — expect all pass**

```bash
cd apps/server
pnpm vitest run src/knowledge/entry/entry.service.spec.ts
```

Expected: all PASS.

- [ ] **Step 5: Run all tests**

```bash
cd apps/server
pnpm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/knowledge/entry/
git commit -m "feat(project): add assertExists guard to EntryService write paths"
```

---

## Task 9: Remove old initProjectRoot route and rename method

**Files:**
- Modify: `apps/server/src/graph/graph.controller.ts`
- Modify: `apps/server/src/graph/graph.controller.spec.ts`
- Modify: `apps/server/src/graph/node/node.service.ts`

- [ ] **Step 1: Remove initProject from GraphController**

Open `apps/server/src/graph/graph.controller.ts`. Delete the entire `// ── Project init ──` section (lines 24–32):

```ts
// DELETE these lines:
// ── Project init ──────────────────────────────────────────────────────

@Post('projects/:id/init')
@ApiOperation({ summary: 'Initialize project root node' })
@ApiParam({ name: 'id', description: 'Project ID' })
@ApiResponse({ status: 201, type: NodeEntity })
initProject(@Param('id') projectId: string) {
  return this.nodeService.initProjectRoot(projectId)
}
```

- [ ] **Step 2: Remove the init test from graph.controller.spec.ts**

Open `apps/server/src/graph/graph.controller.spec.ts`. Delete the test block:

```ts
// DELETE this test:
it('initProject calls nodeService.initProjectRoot', async () => {
  ...
})
```

Also remove `initProjectRoot: vi.fn()` from `mockNodeService` in the spec's `beforeEach`.

- [ ] **Step 3: Remove the public initProjectRoot from NodeService**

Open `apps/server/src/graph/node/node.service.ts`. Delete the `initProjectRoot` method (the public one that just delegates to `repo.initProjectRoot`):

```ts
// DELETE this method:
async initProjectRoot(projectId: string): Promise<Node> {
  return this.repo.initProjectRoot(projectId)
}
```

`initProjectRootInternal` stays — it's used by `ProjectService.create`.

- [ ] **Step 4: Run all tests**

```bash
cd apps/server
pnpm test
```

Expected: all pass. The deleted method has no other callers in tested code.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/graph/
git commit -m "feat(project): remove POST /projects/:id/init, project creation now via POST /projects"
```

---

## Task 10: Smoke test

- [ ] **Step 1: Start infra and server**

```bash
# In a separate terminal:
cd apps/server
pnpm dev
```

- [ ] **Step 2: Create a project**

```bash
curl -s -X POST http://localhost:3000/projects \
  -H 'Content-Type: application/json' \
  -d '{"name":"smoke-test"}' | jq .
```

Expected: `201` with `{ id, name, createdAt, updatedAt }`.

- [ ] **Step 3: Verify root node was created**

```bash
PROJECT_ID=<id from above>
curl -s http://localhost:3000/projects/$PROJECT_ID/nodes | jq .
```

Expected: empty array (root node is excluded from `listProjectNodes`).

- [ ] **Step 4: Create a node with valid projectId**

```bash
curl -s -X POST http://localhost:3000/projects/$PROJECT_ID/nodes \
  -H 'Content-Type: application/json' \
  -d '{"type":"scaffold","title":"First node","createdBy":"human"}' | jq .
```

Expected: `201` with node object.

- [ ] **Step 5: Attempt node creation with invalid projectId**

```bash
curl -s -X POST http://localhost:3000/projects/nonexistent-id/nodes \
  -H 'Content-Type: application/json' \
  -d '{"type":"scaffold","title":"Ghost node","createdBy":"human"}' | jq .
```

Expected: `404` with `PROJECT_NOT_FOUND`.

- [ ] **Step 6: Delete the project and verify cascade**

```bash
curl -s -X DELETE http://localhost:3000/projects/$PROJECT_ID
# then check nodes:
curl -s http://localhost:3000/projects/$PROJECT_ID/nodes | jq .
```

Expected: `DELETE` returns `204`. Subsequent GET returns `404`.
