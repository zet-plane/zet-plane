# Project Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a `Project` aggregate root with FK constraints over `Node` / `Edge` / `KnowledgeEntry`, an `active` ↔ `archived` lifecycle, and a service-layer `assertActive` guard on every write path.

**Architecture:** New `ProjectModule` lives at `apps/server/src/project/`. `ProjectRepository` directly bootstraps the project + root node in one Prisma transaction (no cross-module call to `NodeService` — see [Deviation from spec §6.2](#deviation-from-spec-62) below). `GraphModule` and `KnowledgeModule` import `ProjectModule` to inject `ProjectService` for `assertActive`. A new `project-events` BullMQ queue receives lifecycle events, post-commit only.

**Tech Stack:** NestJS 11, Prisma 7 (custom output at `@generated/client`), Vitest, BullMQ. PostgreSQL with `ON DELETE CASCADE` for the FK chain.

### Deviation from spec §6.2

The spec proposed renaming `NodeService.initProjectRoot` to `initProjectRootInternal` and having `ProjectService.create` call it. That requires a circular module import (`ProjectModule ⇄ GraphModule`) resolved with `forwardRef`. This plan instead has `ProjectRepository.createWithRoot` issue both `INSERT`s directly in a single transaction. This:

- Removes the circular module dependency entirely (`ProjectModule` does not need `GraphModule`).
- Duplicates ~5 lines of root-node insertion logic, which is acceptable.
- Keeps `GraphRepository.findProjectRoot` (still used by `deleteReparentToRoot`) but **deletes** `GraphRepository.initProjectRoot` (sole caller was the now-removed `POST /projects/:id/init` route).

This is an implementation-level refinement; the spec's user-facing semantics (one transaction, atomic project + root) are preserved.

---

## File Map

**New files:**

```
apps/server/src/project/
├── dto/project.dto.ts
├── repository/project.repository.ts
├── events/project-event.publisher.ts
├── project.service.ts
├── project.service.spec.ts
├── project.controller.ts
├── project.controller.spec.ts
└── project.module.ts

apps/server/prisma/migrations/<timestamp>_add_project_table/
└── migration.sql
```

**Modified files:**

```
apps/server/prisma/schema.prisma              # add Project, FKs, KnowledgeRevision cascade
apps/server/src/app.module.ts                 # register ProjectModule
apps/server/src/graph/graph.module.ts         # imports: [ProjectModule]
apps/server/src/graph/graph.controller.ts     # delete POST /projects/:id/init
apps/server/src/graph/graph.controller.spec.ts# delete initProject test
apps/server/src/graph/node/node.service.ts    # remove initProjectRoot, inject ProjectService, add assertActive
apps/server/src/graph/node/node.service.spec.ts# update mocks, add archived-project tests
apps/server/src/graph/edge/edge.service.ts    # inject ProjectService, add assertActive
apps/server/src/graph/edge/edge.service.spec.ts# update mocks, add archived-project tests
apps/server/src/graph/repository/graph.repository.ts # delete initProjectRoot method
apps/server/src/knowledge/knowledge.module.ts # imports: [ProjectModule]
apps/server/src/knowledge/entry/entry.service.ts # inject ProjectService, add assertActive
apps/server/src/knowledge/entry/entry.service.spec.ts # update mocks, add archived-project tests
```

---

## Task 1: Schema migration

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- Create: `apps/server/prisma/migrations/<timestamp>_add_project_table/migration.sql` (auto-generated)

- [ ] **Step 1: Edit schema.prisma — add Project model and enum**

Insert after the `datasource db { ... }` block (around line 10):

```prisma
model Project {
  id          String        @id @default(uuid())
  name        String
  description String?
  status      ProjectStatus @default(active)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  nodes            Node[]
  edges            Edge[]
  knowledgeEntries KnowledgeEntry[]

  @@index([status])
}

enum ProjectStatus {
  active
  archived
}
```

- [ ] **Step 2: Edit schema.prisma — add FK relation on Node**

Inside the existing `model Node { ... }` block, after the `updatedAt` line, before the `@@index([projectId])` line:

```prisma
  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
```

- [ ] **Step 3: Edit schema.prisma — add FK relation on Edge**

Inside the existing `model Edge { ... }` block, after the `createdAt` line, before the `@@unique([fromId, toId, type])` line:

```prisma
  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
```

- [ ] **Step 4: Edit schema.prisma — add FK relation on KnowledgeEntry**

Inside the existing `model KnowledgeEntry { ... }` block, after `updatedAt`, before `@@index([projectId])`:

```prisma
  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
```

- [ ] **Step 5: Edit schema.prisma — add cascade to KnowledgeRevision**

Inside `model KnowledgeRevision { ... }`, add a relation block (after `createdAt`, before `@@unique`):

```prisma
  entry KnowledgeEntry @relation(fields: [entryId], references: [id], onDelete: Cascade)
```

- [ ] **Step 6: Generate migration and Prisma client**

Run from `apps/server/`:

```bash
pnpm prisma migrate dev --name add_project_table
```

Expected: a new directory under `prisma/migrations/` with a `migration.sql`. The SQL must contain:
- `CREATE TYPE "ProjectStatus" AS ENUM ('active', 'archived')`
- `CREATE TABLE "Project"` with columns matching the model
- `CREATE INDEX` on `status`
- `ALTER TABLE "Node" ADD CONSTRAINT "Node_projectId_fkey" ... ON DELETE CASCADE`
- Same for `Edge`, `KnowledgeEntry`
- For `KnowledgeRevision`: `DROP CONSTRAINT` then `ADD CONSTRAINT ... ON DELETE CASCADE` (Prisma usually splits these)

If the migrate command fails with FK violation, the dev DB has stale rows. Resolve by:

```bash
pnpm prisma migrate reset --force
```

Then re-run step 6.

- [ ] **Step 7: Verify Prisma client regenerated**

Run:

```bash
ls -la src/prisma/gen/client/index.d.ts
grep -c "model Project" src/prisma/gen/client/index.d.ts || true
```

Expected: file exists and contains a `Project` type.

- [ ] **Step 8: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations/
git commit -m "feat(db): add Project table with cascade FKs to Node/Edge/KnowledgeEntry"
```

---

## Task 2: Project DTOs

**Files:**
- Create: `apps/server/src/project/dto/project.dto.ts`

- [ ] **Step 1: Write the DTO file**

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ProjectStatus } from '@generated/client'

export class CreateProjectDto {
  @ApiProperty()
  name!: string

  @ApiPropertyOptional()
  description?: string
}

export class UpdateProjectDto {
  @ApiPropertyOptional()
  name?: string

  @ApiPropertyOptional()
  description?: string
}

export class ProjectEntity {
  @ApiProperty() id!: string
  @ApiProperty() name!: string
  @ApiPropertyOptional() description?: string
  @ApiProperty({ enum: ProjectStatus, enumName: 'ProjectStatus' }) status!: ProjectStatus
  @ApiProperty() createdAt!: Date
  @ApiProperty() updatedAt!: Date
}
```

- [ ] **Step 2: Verify it compiles**

Run from `apps/server/`:

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/project/dto/
git commit -m "feat(project): add Project DTOs"
```

---

## Task 3: ProjectRepository

**Files:**
- Create: `apps/server/src/project/repository/project.repository.ts`

- [ ] **Step 1: Write the repository**

```typescript
import { Injectable } from '@nestjs/common'
import { ProjectStatus, NodeType, CreatedBy } from '@generated/client'
import type { Project, Node } from '@generated/client'
import { PrismaService } from '../../prisma/prisma.service'

export type ProjectCreateData = {
  name: string
  description?: string
}

export type ProjectUpdateData = {
  name?: string
  description?: string
}

export type CascadedCounts = {
  nodes: number
  edges: number
  entries: number
}

@Injectable()
export class ProjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createWithRoot(data: ProjectCreateData): Promise<{ project: Project; root: Node }> {
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: { name: data.name, description: data.description ?? null },
      })
      const root = await tx.node.create({
        data: {
          projectId: project.id,
          isProjectRoot: true,
          type: NodeType.scaffold,
          title: '[Project Root]',
          createdBy: CreatedBy.human,
        },
      })
      return { project, root }
    })
  }

  async findById(id: string): Promise<Project | null> {
    return this.prisma.project.findUnique({ where: { id } })
  }

  async list(filter: { status?: ProjectStatus } = {}): Promise<Project[]> {
    return this.prisma.project.findMany({
      where: filter.status ? { status: filter.status } : undefined,
      orderBy: { createdAt: 'desc' },
    })
  }

  async update(id: string, data: ProjectUpdateData): Promise<Project> {
    return this.prisma.project.update({ where: { id }, data })
  }

  async setStatus(id: string, status: ProjectStatus): Promise<Project> {
    return this.prisma.project.update({ where: { id }, data: { status } })
  }

  async removeWithCounts(id: string): Promise<CascadedCounts> {
    return this.prisma.$transaction(async (tx) => {
      const [nodes, edges, entries] = await Promise.all([
        tx.node.count({ where: { projectId: id } }),
        tx.edge.count({ where: { projectId: id } }),
        tx.knowledgeEntry.count({ where: { projectId: id } }),
      ])
      await tx.project.delete({ where: { id } })
      return { nodes, edges, entries }
    })
  }
}
```

- [ ] **Step 2: Add `project` getter to PrismaService**

Edit `apps/server/src/prisma/prisma.service.ts`. Find the existing getter block:

```typescript
  get node() { return this.client.node }
  get edge() { return this.client.edge }
  get knowledgeEntry() { return this.client.knowledgeEntry }
  get knowledgeRevision() { return this.client.knowledgeRevision }
```

Add after it:

```typescript
  get project() { return this.client.project }
```

- [ ] **Step 3: Verify it compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/project/repository/ apps/server/src/prisma/prisma.service.ts
git commit -m "feat(project): add ProjectRepository with createWithRoot bootstrap"
```

---

## Task 4: ProjectEventPublisher

**Files:**
- Create: `apps/server/src/project/events/project-event.publisher.ts`

- [ ] **Step 1: Write the publisher**

```typescript
import { Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'

export const PROJECT_EVENTS_QUEUE = 'project-events'

export type ProjectJob =
  | { type: 'project.created'; payload: { projectId: string; rootNodeId: string } }
  | { type: 'project.archived'; payload: { projectId: string } }
  | { type: 'project.unarchived'; payload: { projectId: string } }
  | {
      type: 'project.deleted'
      payload: {
        projectId: string
        cascadedCounts: { nodes: number; edges: number; entries: number }
      }
    }

@Injectable()
export class ProjectEventPublisher {
  constructor(@InjectQueue(PROJECT_EVENTS_QUEUE) private readonly queue: Queue) {}

  async publish(job: ProjectJob): Promise<void> {
    await this.queue.add(job.type, job.payload)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/project/events/
git commit -m "feat(project): add ProjectEventPublisher for lifecycle events"
```

---

## Task 5: ProjectService — assertActive (TDD)

**Files:**
- Create: `apps/server/src/project/project.service.spec.ts`
- Create: `apps/server/src/project/project.service.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/project/project.service.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { ProjectStatus } from '@generated/client'
import type { Project } from '@generated/client'
import { ProjectService } from './project.service'

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Test Project',
    description: null,
    status: ProjectStatus.active,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('ProjectService', () => {
  let service: ProjectService
  let mockRepo: any
  let mockPublisher: any

  beforeEach(() => {
    mockRepo = {
      createWithRoot: vi.fn(),
      findById: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      setStatus: vi.fn(),
      removeWithCounts: vi.fn(),
    }
    mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    service = new ProjectService(mockRepo, mockPublisher)
  })

  describe('assertActive', () => {
    it('throws NotFoundException when project does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null)
      await expect(service.assertActive('missing')).rejects.toThrow(NotFoundException)
    })

    it('throws ConflictException when project is archived', async () => {
      mockRepo.findById.mockResolvedValue(makeProject({ status: ProjectStatus.archived }))
      await expect(service.assertActive('p1')).rejects.toThrow(ConflictException)
    })

    it('resolves silently when project is active', async () => {
      mockRepo.findById.mockResolvedValue(makeProject({ status: ProjectStatus.active }))
      await expect(service.assertActive('p1')).resolves.toBeUndefined()
    })
  })
})
```

- [ ] **Step 2: Run tests, expect failure**

```bash
cd apps/server && pnpm vitest run src/project/project.service.spec.ts
```

Expected: FAIL — `Cannot find module './project.service'`.

- [ ] **Step 3: Write minimal ProjectService**

Create `apps/server/src/project/project.service.ts`:

```typescript
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { ProjectStatus } from '@generated/client'
import type { Project } from '@generated/client'
import { ProjectRepository } from './repository/project.repository'
import type { ProjectCreateData, ProjectUpdateData } from './repository/project.repository'
import { ProjectEventPublisher } from './events/project-event.publisher'

@Injectable()
export class ProjectService {
  constructor(
    private readonly repo: ProjectRepository,
    private readonly publisher: ProjectEventPublisher,
  ) {}

  async assertActive(id: string): Promise<void> {
    const project = await this.repo.findById(id)
    if (!project) throw new NotFoundException('PROJECT_NOT_FOUND')
    if (project.status === ProjectStatus.archived) {
      throw new ConflictException('PROJECT_ARCHIVED')
    }
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm vitest run src/project/project.service.spec.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/project/project.service.ts apps/server/src/project/project.service.spec.ts
git commit -m "feat(project): add ProjectService.assertActive guard"
```

---

## Task 6: ProjectService — create (TDD)

**Files:**
- Modify: `apps/server/src/project/project.service.spec.ts`
- Modify: `apps/server/src/project/project.service.ts`

- [ ] **Step 1: Add failing tests for create**

Append to the `describe('ProjectService', () => { ... })` block in `project.service.spec.ts`, **before** the closing `})`:

```typescript
  describe('create', () => {
    it('creates project with root node and emits project.created', async () => {
      const project = makeProject()
      const root = { id: 'root1', projectId: 'p1' }
      mockRepo.createWithRoot.mockResolvedValue({ project, root })

      const result = await service.create({ name: 'Test Project' })

      expect(mockRepo.createWithRoot).toHaveBeenCalledWith({
        name: 'Test Project',
        description: undefined,
      })
      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'project.created',
        payload: { projectId: 'p1', rootNodeId: 'root1' },
      })
      expect(result).toBe(project)
    })

    it('does not emit event when repo throws', async () => {
      mockRepo.createWithRoot.mockRejectedValue(new Error('db down'))
      await expect(service.create({ name: 'X' })).rejects.toThrow('db down')
      expect(mockPublisher.publish).not.toHaveBeenCalled()
    })
  })
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm vitest run src/project/project.service.spec.ts
```

Expected: FAIL — `service.create is not a function`.

- [ ] **Step 3: Implement create**

Edit `project.service.ts`. Add this method inside the `ProjectService` class after `assertActive`:

```typescript
  async create(data: ProjectCreateData): Promise<Project> {
    const { project, root } = await this.repo.createWithRoot(data)
    await this.publisher.publish({
      type: 'project.created',
      payload: { projectId: project.id, rootNodeId: root.id },
    })
    return project
  }
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm vitest run src/project/project.service.spec.ts
```

Expected: 5 tests pass (3 from Task 5 + 2 new).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/project/project.service.ts apps/server/src/project/project.service.spec.ts
git commit -m "feat(project): add ProjectService.create"
```

---

## Task 7: ProjectService — read, update, archive, unarchive, remove (TDD)

**Files:**
- Modify: `apps/server/src/project/project.service.spec.ts`
- Modify: `apps/server/src/project/project.service.ts`

- [ ] **Step 1: Add failing tests for findById / list**

Append inside the `describe('ProjectService')` block:

```typescript
  describe('findById', () => {
    it('throws NotFoundException when missing', async () => {
      mockRepo.findById.mockResolvedValue(null)
      await expect(service.findById('x')).rejects.toThrow(NotFoundException)
    })

    it('returns the project when present', async () => {
      const p = makeProject()
      mockRepo.findById.mockResolvedValue(p)
      await expect(service.findById('p1')).resolves.toBe(p)
    })
  })

  describe('list', () => {
    it('passes filter to repo', async () => {
      mockRepo.list.mockResolvedValue([])
      await service.list({ status: ProjectStatus.archived })
      expect(mockRepo.list).toHaveBeenCalledWith({ status: ProjectStatus.archived })
    })
  })
```

- [ ] **Step 2: Add failing tests for update**

```typescript
  describe('update', () => {
    it('throws ConflictException when project is archived', async () => {
      mockRepo.findById.mockResolvedValue(makeProject({ status: ProjectStatus.archived }))
      await expect(service.update('p1', { name: 'New' })).rejects.toThrow(ConflictException)
    })

    it('updates and returns the project when active', async () => {
      mockRepo.findById.mockResolvedValue(makeProject())
      const updated = makeProject({ name: 'New' })
      mockRepo.update.mockResolvedValue(updated)
      await expect(service.update('p1', { name: 'New' })).resolves.toBe(updated)
      expect(mockRepo.update).toHaveBeenCalledWith('p1', { name: 'New' })
    })
  })
```

- [ ] **Step 3: Add failing tests for archive / unarchive**

```typescript
  describe('archive', () => {
    it('throws ConflictException if already archived', async () => {
      mockRepo.findById.mockResolvedValue(makeProject({ status: ProjectStatus.archived }))
      await expect(service.archive('p1')).rejects.toThrow(ConflictException)
    })

    it('sets status to archived and emits project.archived', async () => {
      mockRepo.findById.mockResolvedValue(makeProject())
      const archived = makeProject({ status: ProjectStatus.archived })
      mockRepo.setStatus.mockResolvedValue(archived)
      await expect(service.archive('p1')).resolves.toBe(archived)
      expect(mockRepo.setStatus).toHaveBeenCalledWith('p1', ProjectStatus.archived)
      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'project.archived',
        payload: { projectId: 'p1' },
      })
    })
  })

  describe('unarchive', () => {
    it('throws ConflictException if already active', async () => {
      mockRepo.findById.mockResolvedValue(makeProject({ status: ProjectStatus.active }))
      await expect(service.unarchive('p1')).rejects.toThrow(ConflictException)
    })

    it('sets status to active and emits project.unarchived', async () => {
      mockRepo.findById.mockResolvedValue(makeProject({ status: ProjectStatus.archived }))
      const active = makeProject({ status: ProjectStatus.active })
      mockRepo.setStatus.mockResolvedValue(active)
      await expect(service.unarchive('p1')).resolves.toBe(active)
      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'project.unarchived',
        payload: { projectId: 'p1' },
      })
    })
  })
```

- [ ] **Step 4: Add failing tests for remove**

```typescript
  describe('remove', () => {
    it('deletes and emits project.deleted with cascaded counts', async () => {
      mockRepo.findById.mockResolvedValue(makeProject())
      mockRepo.removeWithCounts.mockResolvedValue({ nodes: 4, edges: 5, entries: 2 })
      await service.remove('p1')
      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'project.deleted',
        payload: {
          projectId: 'p1',
          cascadedCounts: { nodes: 4, edges: 5, entries: 2 },
        },
      })
    })

    it('throws NotFoundException when missing', async () => {
      mockRepo.findById.mockResolvedValue(null)
      await expect(service.remove('x')).rejects.toThrow(NotFoundException)
    })
  })
```

- [ ] **Step 5: Run tests, expect failure**

```bash
pnpm vitest run src/project/project.service.spec.ts
```

Expected: multiple failures — methods do not exist yet.

- [ ] **Step 6: Implement the remaining methods**

Replace `project.service.ts` with the full version:

```typescript
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { ProjectStatus } from '@generated/client'
import type { Project } from '@generated/client'
import { ProjectRepository } from './repository/project.repository'
import type { ProjectCreateData, ProjectUpdateData } from './repository/project.repository'
import { ProjectEventPublisher } from './events/project-event.publisher'

@Injectable()
export class ProjectService {
  constructor(
    private readonly repo: ProjectRepository,
    private readonly publisher: ProjectEventPublisher,
  ) {}

  async assertActive(id: string): Promise<void> {
    const project = await this.repo.findById(id)
    if (!project) throw new NotFoundException('PROJECT_NOT_FOUND')
    if (project.status === ProjectStatus.archived) {
      throw new ConflictException('PROJECT_ARCHIVED')
    }
  }

  async create(data: ProjectCreateData): Promise<Project> {
    const { project, root } = await this.repo.createWithRoot(data)
    await this.publisher.publish({
      type: 'project.created',
      payload: { projectId: project.id, rootNodeId: root.id },
    })
    return project
  }

  async findById(id: string): Promise<Project> {
    return this.requireProject(id)
  }

  async list(filter: { status?: ProjectStatus } = {}): Promise<Project[]> {
    return this.repo.list(filter)
  }

  async update(id: string, data: ProjectUpdateData): Promise<Project> {
    const project = await this.requireProject(id)
    if (project.status === ProjectStatus.archived) {
      throw new ConflictException('PROJECT_ARCHIVED')
    }
    return this.repo.update(id, data)
  }

  async archive(id: string): Promise<Project> {
    const project = await this.requireProject(id)
    if (project.status === ProjectStatus.archived) {
      throw new ConflictException('PROJECT_ALREADY_ARCHIVED')
    }
    const updated = await this.repo.setStatus(id, ProjectStatus.archived)
    await this.publisher.publish({
      type: 'project.archived',
      payload: { projectId: id },
    })
    return updated
  }

  async unarchive(id: string): Promise<Project> {
    const project = await this.requireProject(id)
    if (project.status === ProjectStatus.active) {
      throw new ConflictException('PROJECT_ALREADY_ACTIVE')
    }
    const updated = await this.repo.setStatus(id, ProjectStatus.active)
    await this.publisher.publish({
      type: 'project.unarchived',
      payload: { projectId: id },
    })
    return updated
  }

  async remove(id: string): Promise<void> {
    await this.requireProject(id)
    const counts = await this.repo.removeWithCounts(id)
    await this.publisher.publish({
      type: 'project.deleted',
      payload: { projectId: id, cascadedCounts: counts },
    })
  }

  private async requireProject(id: string): Promise<Project> {
    const project = await this.repo.findById(id)
    if (!project) throw new NotFoundException('PROJECT_NOT_FOUND')
    return project
  }
}
```

- [ ] **Step 7: Run tests, expect pass**

```bash
pnpm vitest run src/project/project.service.spec.ts
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/project/
git commit -m "feat(project): complete ProjectService lifecycle methods"
```

---

## Task 8: ProjectController + spec

**Files:**
- Create: `apps/server/src/project/project.controller.spec.ts`
- Create: `apps/server/src/project/project.controller.ts`

- [ ] **Step 1: Write the failing controller spec**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProjectStatus } from '@generated/client'
import { ProjectController } from './project.controller'

describe('ProjectController', () => {
  let controller: ProjectController
  let mockService: any

  beforeEach(() => {
    mockService = {
      create: vi.fn(),
      findById: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
      unarchive: vi.fn(),
      remove: vi.fn(),
    }
    controller = new ProjectController(mockService)
  })

  it('POST /projects calls service.create', async () => {
    mockService.create.mockResolvedValue({ id: 'p1' })
    await controller.create({ name: 'A' })
    expect(mockService.create).toHaveBeenCalledWith({ name: 'A' })
  })

  it('GET /projects calls service.list with status filter', async () => {
    mockService.list.mockResolvedValue([])
    await controller.list(ProjectStatus.archived)
    expect(mockService.list).toHaveBeenCalledWith({ status: ProjectStatus.archived })
  })

  it('GET /projects without status passes empty filter', async () => {
    mockService.list.mockResolvedValue([])
    await controller.list(undefined)
    expect(mockService.list).toHaveBeenCalledWith({})
  })

  it('GET /projects/:id calls service.findById', async () => {
    mockService.findById.mockResolvedValue({ id: 'p1' })
    await controller.findOne('p1')
    expect(mockService.findById).toHaveBeenCalledWith('p1')
  })

  it('PATCH /projects/:id calls service.update', async () => {
    mockService.update.mockResolvedValue({ id: 'p1' })
    await controller.update('p1', { name: 'New' })
    expect(mockService.update).toHaveBeenCalledWith('p1', { name: 'New' })
  })

  it('POST /projects/:id/archive calls service.archive', async () => {
    mockService.archive.mockResolvedValue({ id: 'p1' })
    await controller.archive('p1')
    expect(mockService.archive).toHaveBeenCalledWith('p1')
  })

  it('POST /projects/:id/unarchive calls service.unarchive', async () => {
    mockService.unarchive.mockResolvedValue({ id: 'p1' })
    await controller.unarchive('p1')
    expect(mockService.unarchive).toHaveBeenCalledWith('p1')
  })

  it('DELETE /projects/:id calls service.remove', async () => {
    mockService.remove.mockResolvedValue(undefined)
    await controller.remove('p1')
    expect(mockService.remove).toHaveBeenCalledWith('p1')
  })
})
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm vitest run src/project/project.controller.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the controller**

Create `apps/server/src/project/project.controller.ts`:

```typescript
import {
  Controller, Post, Get, Patch, Delete, Param, Body, Query, HttpCode,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBody, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger'
import { ProjectStatus } from '@generated/client'
import { ProjectService } from './project.service'
import { CreateProjectDto, UpdateProjectDto, ProjectEntity } from './dto/project.dto'

@ApiTags('projects')
@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @ApiOperation({ summary: 'Create a project (also creates root node)' })
  @ApiBody({ type: CreateProjectDto })
  @ApiResponse({ status: 201, type: ProjectEntity })
  create(@Body() body: CreateProjectDto) {
    return this.projectService.create(body)
  }

  @Get()
  @ApiOperation({ summary: 'List projects' })
  @ApiQuery({ name: 'status', required: false, enum: ProjectStatus })
  @ApiResponse({ status: 200, type: [ProjectEntity] })
  list(@Query('status') status?: ProjectStatus) {
    return this.projectService.list(status ? { status } : {})
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a project by id' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: ProjectEntity })
  @ApiResponse({ status: 404, description: 'Project not found' })
  findOne(@Param('id') id: string) {
    return this.projectService.findById(id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update project name/description' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: UpdateProjectDto })
  @ApiResponse({ status: 200, type: ProjectEntity })
  @ApiResponse({ status: 409, description: 'Project archived' })
  update(@Param('id') id: string, @Body() body: UpdateProjectDto) {
    return this.projectService.update(id, body)
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a project (read-only)' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: ProjectEntity })
  @ApiResponse({ status: 409, description: 'Project already archived' })
  archive(@Param('id') id: string) {
    return this.projectService.archive(id)
  }

  @Post(':id/unarchive')
  @ApiOperation({ summary: 'Unarchive a project' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: ProjectEntity })
  @ApiResponse({ status: 409, description: 'Project already active' })
  unarchive(@Param('id') id: string) {
    return this.projectService.unarchive(id)
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Hard-delete a project (cascades to nodes/edges/entries)' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  remove(@Param('id') id: string) {
    return this.projectService.remove(id)
  }
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm vitest run src/project/project.controller.spec.ts
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/project/project.controller.ts apps/server/src/project/project.controller.spec.ts
git commit -m "feat(project): add ProjectController with full REST surface"
```

---

## Task 9: ProjectModule wiring

**Files:**
- Create: `apps/server/src/project/project.module.ts`
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: Write the module**

```typescript
import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ProjectController } from './project.controller'
import { ProjectService } from './project.service'
import { ProjectRepository } from './repository/project.repository'
import { ProjectEventPublisher, PROJECT_EVENTS_QUEUE } from './events/project-event.publisher'
import { PrismaService } from '../prisma/prisma.service'

@Module({
  imports: [
    BullModule.registerQueue({ name: PROJECT_EVENTS_QUEUE }),
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

- [ ] **Step 2: Register in AppModule**

Edit `apps/server/src/app.module.ts`. Add import:

```typescript
import { ProjectModule } from './project/project.module'
```

Add `ProjectModule` to the `imports` array, before `GraphModule`:

```typescript
imports: [
  ConfigModule.forRoot({ isGlobal: true }),
  AppConfigModule,
  BullModule.forRootAsync({ ... }),
  ProjectModule,
  GraphModule,
  KnowledgeModule,
],
```

- [ ] **Step 3: Verify the app boots**

```bash
pnpm exec tsc --noEmit
pnpm vitest run
```

Expected: typecheck clean, all existing tests still pass (no integration yet).

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/project/project.module.ts apps/server/src/app.module.ts
git commit -m "feat(project): wire ProjectModule into AppModule"
```

---

## Task 10: GraphModule imports ProjectModule + NodeService.assertActive (TDD)

**Files:**
- Modify: `apps/server/src/graph/graph.module.ts`
- Modify: `apps/server/src/graph/graph.controller.ts`
- Modify: `apps/server/src/graph/graph.controller.spec.ts`
- Modify: `apps/server/src/graph/node/node.service.ts`
- Modify: `apps/server/src/graph/node/node.service.spec.ts`
- Modify: `apps/server/src/graph/repository/graph.repository.ts`

This task removes `initProjectRoot` from all three layers (controller → service → repository) and adds the `assertActive` guard to `NodeService` write methods. All deletions happen in this single task so each commit compiles.

- [ ] **Step 1: Delete the GraphController.initProject route**

Edit `apps/server/src/graph/graph.controller.ts`. Delete the entire `// ── Project init ──` block plus the `initProject` method (`@Post('projects/:id/init')` decorator, the `@ApiOperation` / `@ApiParam` / `@ApiResponse` lines, and the method body).

- [ ] **Step 2: Delete the matching controller test**

Find this test in `apps/server/src/graph/graph.controller.spec.ts`:

```typescript
  it('initProject calls nodeService.initProjectRoot', async () => {
    const node = { id: 'root', projectId: 'p1', isProjectRoot: true }
    ...
  })
```

Delete the entire `it(...)` block. Also remove `initProjectRoot: vi.fn()` from `mockNodeService` in the same file's `beforeEach` if present.

- [ ] **Step 3: Delete GraphRepository.initProjectRoot**

Edit `apps/server/src/graph/repository/graph.repository.ts`. Delete the `initProjectRoot(projectId: string)` method entirely (currently lines 50-77). Keep `findProjectRoot` — it is still used by `deleteReparentToRoot`.

- [ ] **Step 4: Update GraphModule imports**

Edit `apps/server/src/graph/graph.module.ts`:

```typescript
import { Module } from '@nestjs/common'
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
    ProjectModule,
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
})
export class GraphModule {}
```

- [ ] **Step 5: Update node.service.spec.ts mock setup**

Edit `apps/server/src/graph/node/node.service.spec.ts`. Replace the `beforeEach` block:

```typescript
  let service: NodeService
  let mockRepo: any
  let mockPublisher: any
  let mockProjectService: any

  beforeEach(() => {
    mockRepo = {
      findNode: vi.fn(),
      createNode: vi.fn(),
      updateNode: vi.fn(),
      listProjectNodes: vi.fn(),
      getSubgraph: vi.fn(),
      findCompositionChildren: vi.fn(),
      findDependencyTargets: vi.fn(),
      deleteNodeWithStrategy: vi.fn(),
    }
    mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    mockProjectService = { assertActive: vi.fn().mockResolvedValue(undefined) }
    service = new NodeService(mockRepo, mockPublisher, mockProjectService)
  })
```

Note: removed `initProjectRoot: vi.fn()` from the repo mock — that method is being deleted in Task 13.

- [ ] **Step 6: Add new failing tests for archived-project guard**

Append inside the existing `describe('NodeService', ...)` block:

```typescript
  describe('project guard', () => {
    it('createNode throws when project is archived', async () => {
      mockProjectService.assertActive.mockRejectedValueOnce(new ConflictException('PROJECT_ARCHIVED'))
      await expect(service.createNode({
        projectId: 'p1', type: NodeType.scaffold, title: 'X', createdBy: CreatedBy.human,
      })).rejects.toThrow(ConflictException)
      expect(mockRepo.createNode).not.toHaveBeenCalled()
    })

    it('updateStatus throws when project is archived', async () => {
      mockProjectService.assertActive.mockRejectedValueOnce(new ConflictException('PROJECT_ARCHIVED'))
      await expect(service.updateStatus('n1', NodeStatus.completed)).rejects.toThrow(ConflictException)
      expect(mockRepo.findNode).not.toHaveBeenCalled()
    })

    it('deleteNode throws when project is archived', async () => {
      mockRepo.findNode.mockResolvedValue({
        id: 'n1', projectId: 'p1', isProjectRoot: false, status: NodeStatus.active,
      })
      mockProjectService.assertActive.mockRejectedValueOnce(new ConflictException('PROJECT_ARCHIVED'))
      await expect(service.deleteNode('n1')).rejects.toThrow(ConflictException)
      expect(mockRepo.deleteNodeWithStrategy).not.toHaveBeenCalled()
    })
  })
```

Note: existing tests already pass `mockProjectService.assertActive.mockResolvedValue(undefined)` in `beforeEach` so they will continue to pass.

- [ ] **Step 7: Remove obsolete initProjectRoot references from node.service.spec.ts**

Search `node.service.spec.ts` for any test that exercises `service.initProjectRoot` or references `mockRepo.initProjectRoot`. If present, delete those `it(...)` blocks. (As of writing, none exist — the only `initProjectRoot` test was in `graph.controller.spec.ts`, deleted in Step 2.)

- [ ] **Step 8: Run, expect failure**

```bash
pnpm vitest run src/graph/node/node.service.spec.ts
```

Expected: FAIL — `NodeService` constructor has 2 args, test passes 3; also failures from controller test removal if it referenced `initProjectRoot`.

- [ ] **Step 9: Update NodeService**

Edit `apps/server/src/graph/node/node.service.ts`. Replace the file:

```typescript
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { NodeStatus, CheckpointResolution } from '@generated/client'
import type { Node, Edge } from '@generated/client'
import { GraphRepository, HasCompositionChildrenError, AmbiguousParentError } from '../repository/graph.repository'
import type { NodeCreateData, DeleteStrategy } from '../repository/graph.repository'
import { GraphEventPublisher } from '../events/graph-event.publisher'
import { ProjectService } from '../../project/project.service'

@Injectable()
export class NodeService {
  constructor(
    private readonly repo: GraphRepository,
    private readonly publisher: GraphEventPublisher,
    private readonly projectService: ProjectService,
  ) {}

  async createNode(data: NodeCreateData): Promise<Node> {
    await this.projectService.assertActive(data.projectId)
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
    await this.projectService.assertActive(node.projectId)
    if (node.status === NodeStatus.archived) {
      throw new ConflictException('NODE_ARCHIVED')
    }
    return this.repo.updateNode(id, data)
  }

  async updateStatus(nodeId: string, newStatus: NodeStatus): Promise<Node> {
    const node = await this.requireNode(nodeId)
    await this.projectService.assertActive(node.projectId)
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
    await this.projectService.assertActive(node.projectId)
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
    await this.projectService.assertActive(node.projectId)
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

Note: `initProjectRoot` method is **removed** entirely per the deviation in this plan's header.

- [ ] **Step 10: Run, expect pass**

```bash
pnpm vitest run src/graph/
pnpm exec tsc --noEmit
```

Expected: all graph tests pass (including 3 new project-guard tests in `node.service.spec.ts` and the controller spec without the deleted `initProject` test); typecheck clean.

- [ ] **Step 11: Commit**

```bash
git add apps/server/src/graph/
git commit -m "feat(graph)!: remove POST /projects/:id/init; NodeService consults ProjectService.assertActive on writes"
```

Single commit covers: GraphController route removal, GraphRepository.initProjectRoot removal, NodeService rewrite with assertActive, GraphModule import of ProjectModule. All compile together.

---

## Task 11: EdgeService.assertActive (TDD)

**Files:**
- Modify: `apps/server/src/graph/edge/edge.service.ts`
- Modify: `apps/server/src/graph/edge/edge.service.spec.ts`

- [ ] **Step 1: Update edge.service.spec.ts mock setup**

Find the `beforeEach` block in `apps/server/src/graph/edge/edge.service.spec.ts`. Add `mockProjectService` setup. The pattern should mirror what was done in Task 10:

```typescript
    mockProjectService = { assertActive: vi.fn().mockResolvedValue(undefined) }
    service = new EdgeService(mockRepo, mockDetector, mockPublisher, mockProjectService)
```

Add `let mockProjectService: any` to the declarations.

- [ ] **Step 2: Add new failing tests for archived-project guard**

Append inside the existing `describe('EdgeService', ...)` block:

```typescript
  describe('project guard', () => {
    it('createEdge throws when project is archived', async () => {
      mockProjectService.assertActive.mockRejectedValueOnce(new ConflictException('PROJECT_ARCHIVED'))
      await expect(service.createEdge({
        projectId: 'p1', fromId: 'a', toId: 'b', type: EdgeType.composition, createdBy: CreatedBy.human,
      })).rejects.toThrow(ConflictException)
      expect(mockRepo.findNode).not.toHaveBeenCalled()
    })

    it('replaceNodeEdges throws when project is archived', async () => {
      mockProjectService.assertActive.mockRejectedValueOnce(new ConflictException('PROJECT_ARCHIVED'))
      await expect(service.replaceNodeEdges(
        'n1', EdgeType.composition, 'newParent', 'p1', CreatedBy.human,
      )).rejects.toThrow(ConflictException)
    })

    it('deleteEdge throws when project is archived', async () => {
      mockRepo.findEdge.mockResolvedValue({ id: 'e1', projectId: 'p1' })
      mockProjectService.assertActive.mockRejectedValueOnce(new ConflictException('PROJECT_ARCHIVED'))
      await expect(service.deleteEdge('e1')).rejects.toThrow(ConflictException)
      expect(mockRepo.deleteEdge).not.toHaveBeenCalled()
    })
  })
```

Make sure `EdgeType`, `CreatedBy`, and `ConflictException` are imported at the top of the spec file if not already.

- [ ] **Step 3: Run, expect failure**

```bash
pnpm vitest run src/graph/edge/edge.service.spec.ts
```

Expected: FAIL — constructor signature mismatch.

- [ ] **Step 4: Update EdgeService**

Replace `apps/server/src/graph/edge/edge.service.ts`:

```typescript
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
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
    private readonly projectService: ProjectService,
  ) {}

  async createEdge(data: EdgeCreateData): Promise<Edge> {
    await this.projectService.assertActive(data.projectId)
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
    await this.projectService.assertActive(edge.projectId)
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
    await this.projectService.assertActive(projectId)
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

- [ ] **Step 5: Run, expect pass**

```bash
pnpm vitest run src/graph/edge/edge.service.spec.ts
```

Expected: all tests pass, including the 3 new guards.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/graph/edge/
git commit -m "feat(graph): EdgeService consults ProjectService.assertActive on writes"
```

---

## Task 12: KnowledgeModule + EntryService.assertActive (TDD)

**Files:**
- Modify: `apps/server/src/knowledge/knowledge.module.ts`
- Modify: `apps/server/src/knowledge/entry/entry.service.ts`
- Modify: `apps/server/src/knowledge/entry/entry.service.spec.ts`

- [ ] **Step 1: Update KnowledgeModule imports**

Edit `apps/server/src/knowledge/knowledge.module.ts`. Add the ProjectModule import:

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
import { ProjectModule } from '../project/project.module'

@Module({
  imports: [
    BullModule.registerQueue({ name: KNOWLEDGE_EVENTS_QUEUE }),
    ProjectModule,
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

- [ ] **Step 2: Update entry.service.spec.ts mock setup**

Find the `beforeEach` in `apps/server/src/knowledge/entry/entry.service.spec.ts`. Add the project service mock and pass it to the constructor:

```typescript
    mockProjectService = { assertActive: vi.fn().mockResolvedValue(undefined) }
    service = new EntryService(mockRepo, mockPublisher, mockProjectService)
```

Add `let mockProjectService: any` to the declarations.

- [ ] **Step 3: Add failing tests**

Append inside the existing `describe('EntryService', ...)` block:

```typescript
  describe('project guard', () => {
    it('createEntry throws when project is archived', async () => {
      mockProjectService.assertActive.mockRejectedValueOnce(new ConflictException('PROJECT_ARCHIVED'))
      await expect(service.createEntry({
        projectId: 'p1', nodeId: 'n1', category: EntryCategory.decision,
        title: 'X', body: {}, createdBy: CreatedBy.human,
      })).rejects.toThrow(ConflictException)
      expect(mockRepo.createEntryWithRevision).not.toHaveBeenCalled()
    })

    it('updateStatus throws when project is archived', async () => {
      mockRepo.findEntry.mockResolvedValue({
        id: 'e1', projectId: 'p1', status: EntryStatus.draft,
      })
      mockProjectService.assertActive.mockRejectedValueOnce(new ConflictException('PROJECT_ARCHIVED'))
      await expect(service.updateStatus('e1', EntryStatus.published)).rejects.toThrow(ConflictException)
      expect(mockRepo.updateEntry).not.toHaveBeenCalled()
    })
  })
```

Ensure `EntryCategory`, `EntryStatus`, `CreatedBy`, and `ConflictException` are imported.

- [ ] **Step 4: Run, expect failure**

```bash
pnpm vitest run src/knowledge/entry/entry.service.spec.ts
```

Expected: FAIL — constructor signature mismatch.

- [ ] **Step 5: Update EntryService**

Replace `apps/server/src/knowledge/entry/entry.service.ts`:

```typescript
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
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
    private readonly projectService: ProjectService,
  ) {}

  async createEntry(data: EntryCreateData): Promise<KnowledgeEntry> {
    await this.projectService.assertActive(data.projectId)
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
    await this.projectService.assertActive(entry.projectId)
    if (entry.status === EntryStatus.deprecated) {
      throw new ConflictException('ENTRY_DEPRECATED')
    }
    return this.repo.updateEntry(id, data)
  }

  async updateStatus(id: string, newStatus: EntryStatus): Promise<KnowledgeEntry> {
    const entry = await this.requireEntry(id)
    await this.projectService.assertActive(entry.projectId)
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
    await this.projectService.assertActive(entry.projectId)
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
    await this.projectService.assertActive(entry.projectId)
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

- [ ] **Step 6: Run, expect pass**

```bash
pnpm vitest run src/knowledge/entry/entry.service.spec.ts
```

Expected: all tests pass.

- [ ] **Step 7: Check RevisionService for write paths**

Run:

```bash
grep -n "publish\|update\|create\|delete" src/knowledge/revision/revision.service.ts
```

If `RevisionService` has any write method (e.g., `appendRevision`), it also needs `assertActive`. Apply the same pattern: inject `ProjectService`, mock it in the spec, add a guard test, call `assertActive(entry.projectId)` before the write. If only reads exist, skip.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/knowledge/
git commit -m "feat(knowledge): EntryService consults ProjectService.assertActive on writes"
```

---

## Task 13: End-to-end smoke test

**Files:**
- None modified; this task verifies the wiring.

- [ ] **Step 1: Boot the server**

In one terminal from `apps/server/`:

```bash
pnpm dev
```

Expected: server starts on port 3000, no DI errors.

- [ ] **Step 2: Create a project via curl**

In another terminal:

```bash
curl -sX POST http://localhost:3000/projects \
  -H 'Content-Type: application/json' \
  -d '{"name":"Smoke Test","description":"verify wiring"}'
```

Expected: HTTP 201, JSON body with `id`, `name=Smoke Test`, `status=active`.

Save the `id` — call it `$PID`.

- [ ] **Step 3: Verify the root node was created**

```bash
curl -s http://localhost:3000/projects/$PID/nodes
```

Expected: empty array `[]`. (`listProjectNodes` filters out `isProjectRoot=true`.)

```bash
curl -s "http://localhost:3000/projects/$PID/nodes" -X POST \
  -H 'Content-Type: application/json' \
  -d '{"type":"scaffold","title":"First node","createdBy":"human"}'
```

Expected: HTTP 201 with a new node. The fact that this succeeds proves the root node exists (`createNode` requires `findProjectRoot` to find it).

- [ ] **Step 4: Archive the project, verify writes are blocked**

```bash
curl -sX POST http://localhost:3000/projects/$PID/archive
curl -sX POST http://localhost:3000/projects/$PID/nodes \
  -H 'Content-Type: application/json' \
  -d '{"type":"scaffold","title":"Should fail","createdBy":"human"}'
```

Expected: second call returns HTTP 409 with `PROJECT_ARCHIVED` in the body.

- [ ] **Step 5: Unarchive and delete**

```bash
curl -sX POST http://localhost:3000/projects/$PID/unarchive
curl -sX DELETE http://localhost:3000/projects/$PID -w '%{http_code}\n'
```

Expected: 204. Then:

```bash
curl -s http://localhost:3000/projects/$PID -w '%{http_code}\n'
```

Expected: 404. Database rows for that project's nodes/edges are gone (FK cascade).

- [ ] **Step 6: Run the full test suite once more**

```bash
pnpm test
```

Expected: green.

- [ ] **Step 7: Update README punch list**

Open `apps/server/README.md` (or root `README.md` if that is where the punch list lives — check both). Find the "后续任务" / "TODO" / "punch list" section that mentions missing event consumers. Add a line:

```
- 实现 project-events 队列消费者（project.created / archived / unarchived / deleted）
```

If the README file does not exist or has no such section, skip this step.

- [ ] **Step 8: Final commit**

```bash
git add apps/server/README.md README.md 2>/dev/null || true
git commit -m "docs: note project-events consumer on the punch list" --allow-empty
```

(Use `--allow-empty` so the task does not fail when there is nothing to update.)

---

## Validation Checklist

Run all of these from `apps/server/`:

- [ ] `pnpm exec tsc --noEmit` — clean
- [ ] `pnpm test` — green
- [ ] `pnpm prisma migrate status` — no pending migrations
- [ ] `git log --oneline -20` — shows the bite-sized commits in order

If any of these fails, the task that produced the failure is incomplete — return to it.
