# Swagger API Documentation Design

**Target:** Add full OpenAPI/Swagger documentation to Graph and Knowledge controllers, covering both request body schemas (via DTO classes) and response schemas (via entity classes).

---

## Scope

- **Graph Engine:** `GraphController` — all 11 routes
- **Knowledge Engine:** `KnowledgeController` — all 10 routes
- **Not in scope:** runtime validation (class-validator), serialization interceptors, auth decorators

---

## Package

Install `@nestjs/swagger`. Fastify adapter is supported natively in v7+; no `@fastify/static` needed.

```bash
pnpm add @nestjs/swagger
```

---

## Swagger Initialization (`main.ts`)

```typescript
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'

const config = new DocumentBuilder()
  .setTitle('Zet Plane API')
  .setVersion('1.0')
  .addTag('graph', 'Scaffold Graph Engine')
  .addTag('knowledge', 'Knowledge Engine')
  .build()

const document = SwaggerModule.createDocument(app, config)
SwaggerModule.setup('api-docs', app, document)
```

Swagger UI available at `http://localhost:3000/api-docs`.

---

## DTO Structure

One `dto/` directory per module, files grouped by resource. Each file contains both **request DTOs** and **entity classes** (Swagger response schemas only — no serialization logic).

```
apps/server/src/graph/dto/
  node.dto.ts     # CreateNodeDto, UpdateNodeDto, ResolveCheckpointDto, DeleteNodeDto
                  # NodeEntity, SubgraphEntity
  edge.dto.ts     # CreateEdgeDto, ReplaceEdgesDto
                  # EdgeEntity

apps/server/src/knowledge/dto/
  entry.dto.ts    # CreateEntryDto, UpdateEntryDto, UpdateBodyDto
                  # KnowledgeEntryEntity, KnowledgeRevisionEntity
  search.dto.ts   # StoreEmbeddingDto, SearchDto, SearchFilterDto
                  # SearchResultEntity
```

### Enum Handling

Prisma enums are imported from `@generated/client` and referenced directly — not redefined. Use `enumName` so Swagger generates a named schema instead of inlining values.

```typescript
@ApiProperty({ enum: NodeType, enumName: 'NodeType' })
type: NodeType
```

### Optional Fields

Use `@ApiPropertyOptional()` (shorthand for `@ApiProperty({ required: false })`).

### Request DTO Example

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { NodeType, CreatedBy } from '@generated/client'

export class CreateNodeDto {
  @ApiProperty({ enum: NodeType, enumName: 'NodeType' })
  type: NodeType

  @ApiProperty()
  title: string

  @ApiPropertyOptional()
  description?: string

  @ApiProperty({ enum: CreatedBy, enumName: 'CreatedBy' })
  createdBy: CreatedBy
}
```

### Entity Class Example (response schema)

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { NodeType, NodeStatus } from '@generated/client'

export class NodeEntity {
  @ApiProperty() id: string
  @ApiProperty() projectId: string
  @ApiProperty() isProjectRoot: boolean
  @ApiProperty({ enum: NodeType, enumName: 'NodeType' }) type: NodeType
  @ApiProperty() title: string
  @ApiPropertyOptional() description?: string
  @ApiProperty({ enum: NodeStatus, enumName: 'NodeStatus' }) status: NodeStatus
  @ApiProperty() isCheckpoint: boolean
  @ApiPropertyOptional() checkpointResolution?: string
  @ApiProperty({ enum: CreatedBy, enumName: 'CreatedBy' }) createdBy: CreatedBy
  @ApiProperty() createdAt: Date
  @ApiProperty() updatedAt: Date
}
```

---

## Controller Annotation Rules

### Required on every route

| Decorator | Purpose |
|-----------|---------|
| `@ApiOperation({ summary })` | Short human description |
| `@ApiParam({ name, description })` | Every path param |
| `@ApiBody({ type: XxxDto })` | Every POST/PATCH with a body |
| `@ApiResponse({ status: 200/201, type: XxxEntity })` | Success response |

### Conditional

| Decorator | When |
|-----------|------|
| `@ApiQuery(...)` | `listEntries` only (has optional query filters) |
| `@ApiResponse({ status: 400 })` | Routes with mixed-update guards (`updateNode`, `updateEntry`) |
| `@ApiResponse({ status: 404 })` | Routes that throw `NotFoundException` |
| `@ApiResponse({ status: 409 })` | Routes with status machine transitions (`updateStatus`, `reanchor`) |

### Tag placement

`@ApiTags('graph')` on `GraphController` class.
`@ApiTags('knowledge')` on `KnowledgeController` class.

---

## Graph Controller Route Map

| Method | Path | Request DTO | Response Entity |
|--------|------|-------------|-----------------|
| POST | `projects/:id/init` | — | `NodeEntity` |
| POST | `projects/:id/nodes` | `CreateNodeDto` | `NodeEntity` |
| GET | `projects/:id/nodes` | — | `NodeEntity[]` |
| GET | `nodes/:id/subgraph` | — | `SubgraphEntity` |
| PATCH | `nodes/:id` | `UpdateNodeDto` | `NodeEntity` |
| PATCH | `nodes/:id/resolution` | `ResolveCheckpointDto` | `NodeEntity` |
| DELETE | `nodes/:id` | `DeleteNodeDto` (optional body) | `DeleteNodeResultEntity` (`{ affectedNodeIds: string[] }`) |
| POST | `projects/:id/edges` | `CreateEdgeDto` | `EdgeEntity` |
| GET | `projects/:id/edges` | — | `EdgeEntity[]` |
| DELETE | `edges/:id` | — | `EdgeEntity` |
| PATCH | `nodes/:id/edges` | `ReplaceEdgesDto` | `EdgeEntity` |

`SubgraphEntity` describes the return shape of `getSubgraph`: `{ nodes: NodeEntity[], edges: EdgeEntity[] }`.

---

## Knowledge Controller Route Map

| Method | Path | Request DTO | Response Entity |
|--------|------|-------------|-----------------|
| POST | `projects/:id/entries` | `CreateEntryDto` | `KnowledgeEntryEntity` |
| GET | `projects/:id/entries` | (query params) | `KnowledgeEntryEntity[]` |
| GET | `entries/:id` | — | `KnowledgeEntryEntity` |
| PATCH | `entries/:id` | `UpdateEntryDto` | `KnowledgeEntryEntity` |
| DELETE | `entries/:id` | — | `KnowledgeEntryEntity` |
| PATCH | `entries/:id/body` | `UpdateBodyDto` | `KnowledgeRevisionEntity` |
| GET | `entries/:id/revisions` | — | `KnowledgeRevisionEntity[]` |
| GET | `entries/:id/revisions/:version` | — | `KnowledgeRevisionEntity` |
| PATCH | `entries/:id/embedding` | `StoreEmbeddingDto` | — (204) |
| POST | `projects/:id/entries/search` | `SearchDto` | `SearchResultEntity[]` |

---

## File Checklist

| Action | File |
|--------|------|
| 修改 | `apps/server/src/main.ts` |
| 新建 | `apps/server/src/graph/dto/node.dto.ts` (`NodeEntity`, `SubgraphEntity`, `DeleteNodeResultEntity` 也在此) |
| 新建 | `apps/server/src/graph/dto/edge.dto.ts` |
| 修改 | `apps/server/src/graph/graph.controller.ts` |
| 新建 | `apps/server/src/knowledge/dto/entry.dto.ts` |
| 新建 | `apps/server/src/knowledge/dto/search.dto.ts` |
| 修改 | `apps/server/src/knowledge/knowledge.controller.ts` |
