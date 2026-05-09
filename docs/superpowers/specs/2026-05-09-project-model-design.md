# Project Model — Design

**Date**: 2026-05-09
**Status**: Pending implementation
**Supersedes**: implicit "projectId is a free-form string" assumption in [Scaffold Graph Engine design](./2026-05-04-scaffold-graph-engine-design.md) and [Knowledge Engine design](./2026-05-05-knowledge-engine-design.md).

---

## 1. Problem

`projectId` is currently a free-form `String` column on `Node`, `Edge`, and `KnowledgeEntry`. There is no `Project` table, no FK, no lifecycle, and no service that owns project-level invariants. Three concrete consequences:

1. **`initProjectRoot(projectId)` accepts any string.** A typo creates a brand-new "project" with its own root node, silently. There is no canonical list of projects to validate against.
2. **Knowledge anchors to nodes that anchor to nothing.** The architectural invariant "no knowledge outside graph" is enforced, but the outer hull — "no graph outside a known project" — has no enforcement point.
3. **No archival semantics.** A project that is no longer worked on cannot be marked read-only without ad-hoc node-level archival, which interacts poorly with cascade rules.

The `Project` model fills the missing top of the aggregate hierarchy:

```
Project (new)
  └── Node           (FK → Project, cascade)
  └── Edge           (FK → Project, cascade)
  └── KnowledgeEntry (FK → Project, cascade)
       └── KnowledgeRevision (cascade via entry)
```

## 2. Scope

**In scope:**

- A `Project` aggregate root with metadata (`name`, `description`, `status`).
- FK from `Node` / `Edge` / `KnowledgeEntry` to `Project`, with `ON DELETE CASCADE`.
- Two-state lifecycle: `active` ↔ `archived`. Archived projects are read-only at the service boundary.
- A `ProjectService.assertActive` guard called by every write path in `Graph` and `Knowledge` modules.
- `POST /projects` creates the project **and** the project root node in one transaction.
- A `ProjectEventPublisher` BullMQ exit for `project.created` / `archived` / `unarchived` / `deleted`.

**Out of scope (explicit YAGNI):**

- Members, roles, JWT scoping.
- Per-project configuration (LLM keys, adapter credentials, orchestrator policies).
- Soft delete / restore.
- A `Graph` entity between Project and Node. The "multi-graph per project" notion in the Knowledge Engine spec stays implicit (encoded by edge reachability) and is deferred to its own future spec.
- DB-level prevention of cross-project edges (`(projectId, fromId)` composite FK). The current single-FK + service-layer validation stays.

**References for the chosen pattern:**

- **Vendure** (NestJS, OSS) — `ChannelService` is the multi-tenant root; `ChannelModule` directly DI-imports sub-feature services to bootstrap defaults synchronously.
- **GitLab** — `Projects::CreateService` orchestrates default branch / protected-branches / repository creation in one ActiveRecord transaction.
- **Sentry** — `Organization` creation synchronously creates a default project + team; uses post-commit signals for non-invariant reactions.

The common thread: **bootstrapping invariants belongs in a synchronous transaction owned by the aggregate root, not in an event-driven reaction.** Events are reserved for non-invariant downstream consumers.

## 3. Data Model

### 3.1 New table

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

### 3.2 FK additions to existing tables

`Node`, `Edge`, `KnowledgeEntry` each gain:

```prisma
project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
```

The existing `projectId String` column stays — it is now FK-backed, no rename.

### 3.3 Cascade chain fix

`KnowledgeRevision.entryId` does not currently declare an explicit `onDelete`. To make `DELETE /projects/:id` cascade cleanly to revisions, this migration also adds:

```prisma
model KnowledgeRevision {
  entry KnowledgeEntry @relation(fields: [entryId], references: [id], onDelete: Cascade)
}
```

This is a small correctness fix bundled with the new FKs since the cascade chain only matters once `Project` is deletable.

## 4. Module Structure

New `apps/server/src/project/`:

```
project/
├── dto/project.dto.ts
├── repository/project.repository.ts
├── project.service.ts
├── project.service.spec.ts
├── project.controller.ts
├── project.controller.spec.ts
├── events/project-event-publisher.ts
└── project.module.ts
```

Layering matches `GraphModule`:

```
ProjectController → ProjectService → ProjectRepository → PrismaService
                          │
                          ├──→ ProjectEventPublisher (BullMQ, post-commit)
                          └──→ NodeService.initProjectRootInternal (during create)
```

### 4.1 Dependency direction

- `ProjectModule` exports `ProjectService`.
- `ProjectModule` `imports: [GraphModule]` so `ProjectService.create` can call `NodeService.initProjectRootInternal`.
- `GraphModule` and `KnowledgeModule` `imports: [ProjectModule]` so their services can call `ProjectService.assertActive`.

This is a **one-way module dependency**: `Project ⇄ Graph` looks circular at first glance but at the service-call level it is asymmetric — Project orchestrates Graph during bootstrap, Graph consults Project during writes. Vendure / GitLab use the same shape; the orchestration responsibility belongs to the aggregate root by design.

NestJS resolves the import cycle via `forwardRef` only if needed; in practice declaring `GraphModule` in `ProjectModule.imports` and `ProjectModule` in `GraphModule.imports` works because both export their services. If the DI graph complains, fall back to `forwardRef` on whichever side is loaded second. This is documented at module level so the next reader does not "fix" it by collapsing the dependency.

### 4.2 What does **not** move

- `GraphRepository.initProjectRoot` keeps existing semantics, but its **only public caller** is now `ProjectService.create`. The graph controller's old "init project" entry point is removed.
- `NodeService.initProjectRoot` is renamed `initProjectRootInternal` to signal it is not a controller-facing operation. Its behavior is unchanged; it skips `assertActive` because it runs inside the `Project` create transaction where the project row is not yet committed.

## 5. API Surface

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| POST | `/projects` | `{ name, description? }` | 201 `ProjectDto` | Creates project + root node in one tx |
| GET | `/projects` | — (query: `status?=active\|archived`) | `ProjectDto[]` | Defaults to all statuses |
| GET | `/projects/:id` | — | `ProjectDto` | 404 if not found |
| PATCH | `/projects/:id` | `{ name?, description? }` | `ProjectDto` | 409 if archived |
| POST | `/projects/:id/archive` | — | `ProjectDto` | 409 if already archived |
| POST | `/projects/:id/unarchive` | — | `ProjectDto` | 409 if already active |
| DELETE | `/projects/:id` | — | 204 | Hard delete; FK cascade |

**`ProjectDto`**: `{ id, name, description, status, createdAt, updatedAt }`.

**Removed routes (breaking change)**:

- Any pre-existing `POST /graph/projects/:id/init` or equivalent. The CLI / web client must `POST /projects` first to obtain a `projectId`. This is acceptable per project decision (no production callers yet).

## 6. Service Methods

### 6.1 `ProjectService`

```ts
class ProjectService {
  create(dto: CreateProjectDto): Promise<Project>
  // tx:
  //   1. INSERT INTO Project
  //   2. nodeService.initProjectRootInternal(project.id, tx)
  //   3. (commit)
  //   4. eventPublisher.emit('project.created', { projectId, rootNodeId })

  update(id: string, dto: UpdateProjectDto): Promise<Project>
  // assertActive then update; throws ConflictException if archived

  archive(id: string): Promise<Project>
  unarchive(id: string): Promise<Project>
  remove(id: string): Promise<void>
  // tx: count children → DELETE → commit → emit 'project.deleted' with counts

  findById(id: string): Promise<Project>      // 404 if missing
  list(filter?: { status?: ProjectStatus }): Promise<Project[]>

  assertActive(id: string): Promise<void>
  // 404 PROJECT_NOT_FOUND if missing
  // 409 PROJECT_ARCHIVED if status=archived
  // resolves silently if active
}
```

### 6.2 Guard insertion points

`assertActive(projectId)` is the **first line** of every write method:

| Service | Methods |
|---|---|
| `NodeService` | `createNode`, `updateStatus`, `resolveCheckpoint`, `deleteNode` |
| `EdgeService` | `createEdge`, `repointEdge`, `deleteEdge` |
| `KnowledgeEntryService` | `create`, `update`, `archive`, every other write path |

**Read paths** (`list*`, `getById`) do **not** call `assertActive`. Archived projects remain queryable.

**Exception**: `NodeService.initProjectRootInternal` does not call `assertActive` because it runs before the project row is visible to other transactions. It is package-private to `ProjectService`.

## 7. Events

New `ProjectEventPublisher`, queue name `project-events`. Same post-commit semantics as `GraphEventPublisher`: never enqueue from inside a `$transaction` callback.

```ts
type ProjectEvent =
  | { type: 'project.created';    projectId: string; rootNodeId: string }
  | { type: 'project.archived';   projectId: string }
  | { type: 'project.unarchived'; projectId: string }
  | { type: 'project.deleted';    projectId: string; cascadedCounts: { nodes: number; edges: number; entries: number } }
```

`project.deleted` carries `cascadedCounts` — the service layer counts children **inside** the same transaction (right before the delete) and attaches the snapshot to the post-commit event. This mirrors `graph.node.deleted`'s `affectedNodeIds` field.

Workers are not implemented in this PR — they go on the README punch list alongside the existing `graph-events` consumers.

## 8. Migration Plan

New file: `apps/server/prisma/migrations/<timestamp>_add_project_table/migration.sql`.

Generated by `prisma migrate dev --name add_project_table` after the schema edit. Manual review must confirm:

1. `CREATE TYPE "ProjectStatus" AS ENUM ('active', 'archived')`
2. `CREATE TABLE "Project" (...)` with index on `status`
3. `ALTER TABLE "Node" ADD CONSTRAINT "Node_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE`
4. Same for `Edge`, `KnowledgeEntry`
5. `ALTER TABLE "KnowledgeRevision" DROP CONSTRAINT "KnowledgeRevision_entryId_fkey", ADD CONSTRAINT ... ON DELETE CASCADE`

The dev database is empty of meaningful data, so no backfill SQL is needed. Local developers with stale rows in `Node`/`Edge`/`KnowledgeEntry` referencing nonexistent project ids must wipe their dev DB before applying — the `ALTER ... ADD FOREIGN KEY` will fail otherwise.

## 9. Testing

Per the project's TDD convention:

| File | What it covers |
|---|---|
| `project.service.spec.ts` | `create` rolls back if `initProjectRootInternal` throws; `assertActive` on missing → 404; on archived → 409; on active → resolves; archive/unarchive idempotency rejected; `update`/`remove` blocked when archived; `remove` event carries counts captured pre-delete. |
| `project.controller.spec.ts` | Route → service-method mapping for all 7 endpoints. |
| `project.repository.ts` | Not unit-tested (consistent with `GraphRepository`). |
| `node.service.spec.ts` (edited) | New describe block: `'when project is archived'` → every write throws `ConflictException`. |
| `edge.service.spec.ts` (edited) | Same. |
| `knowledge-entry.service.spec.ts` (edited) | Same. |

E2E coverage of the cascade delete path is deferred to the broader E2E suite tracked in the README backlog.

## 10. Open Questions

None at design time. Implementation may surface NestJS DI cycle behavior between `ProjectModule ⇄ GraphModule` — if so, resolve with `forwardRef` and add an inline comment explaining the orchestration relationship rather than restructuring the modules.

## 11. Implementation Order

1. Schema edit + `prisma migrate dev` (no app code changes yet — should compile against existing tests if FKs accept current dev rows; if not, wipe dev DB).
2. Create `ProjectModule` skeleton: repository, service stub, controller, DTOs, event publisher.
3. Implement `ProjectService.create` + `assertActive`, with full spec coverage.
4. Wire `ProjectModule` into `GraphModule.imports` and `KnowledgeModule.imports`.
5. Add `assertActive` calls in `NodeService` / `EdgeService` / `KnowledgeEntryService` write paths; update each spec.
6. Rename `initProjectRoot` → `initProjectRootInternal`; remove old controller route; update `graph.controller.spec.ts`.
7. Implement remaining `ProjectService` methods (archive, unarchive, update, remove) + event payloads.
8. Smoke test: `POST /projects`, `POST /graph/.../nodes`, `POST /projects/:id/archive`, retry write → 409, `DELETE /projects/:id` → child rows gone.

Each step is a single commit per the project's existing convention.
