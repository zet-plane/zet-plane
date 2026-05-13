# Shared API Contracts via Monorepo

**Target:** Replace server-local `class-validator` DTOs with a workspace-shared Zod-based contract package that drives both server-side validation/OpenAPI and web-side typed API client. Establish the pattern end-to-end via one vertical slice (`POST /api/projects/:id/nodes`), with the rest of the graph module migrated in follow-up PRs.

This spec supersedes [2026-05-05-swagger-design.md](./2026-05-05-swagger-design.md) for the validation/DTO layer. The Swagger UI initialization in `main.ts` from that spec remains valid; only the DTO mechanism changes.

---

## Decisions

| Area | Decision |
|---|---|
| What is shared | API request/response Zod schemas + endpoint metadata, between `apps/server` and `apps/web` |
| Server integration | `nestjs-zod` — full switch. `class-validator` + `class-transformer` removed from server deps |
| Contract shape | Bare Zod schemas + literal endpoint metadata objects (`{ method, path, request, response, errors }`). **No** runtime contract framework (ts-rest, tRPC) |
| Package split | `@zet-plane/contracts` (API contracts + error envelope) and `@zet-plane/types` (internal cross-service types like `NormalizedEvent`, BullMQ payloads) |
| Build strategy | Conditional `exports`: `development` → `./src/index.ts`, `default` → `./dist/index.js`. Source for dev, `tsc` emit for prod, ordered by `turbo ^build` |
| Error envelope | Unified shape `{ code, message, details? }` with **per-endpoint literal `code` enums**. Global `ExceptionFilter` + `DomainException` base class translate Nest + Zod exceptions to envelope |
| First branch scope | Infrastructure + single vertical slice: `POST /api/projects/:id/nodes` migrated end-to-end (server controller + web `apiCall` helper + first tanstack-query hook) |

---

## Out of scope (this branch)

- Migrating the remaining 9 graph endpoints (follow-up PRs, one per resource)
- Knowledge module (not yet implemented in code)
- Auth, rate limiting, request IDs — orthogonal concerns
- BullMQ job payload types (will move to `@zet-plane/types` later)
- WebSocket message types
- Switching Nest dev runner to Vite/oxc — separate decision, not blocked by this branch

---

## Package layout

```
packages/
  contracts/                       # NEW
    package.json
    tsconfig.json
    src/
      index.ts                     # re-export everything
      errors.ts                    # ErrorResponse envelope + makeErrorResponse helper
      shared.ts                    # cross-resource schemas (e.g. NodeId, ProjectId branded strings)
      nodes.ts                     # graph node endpoints + schemas
      edges.ts                     # graph edge endpoints + schemas (stubs until migrated)
      projects.ts                  # project endpoints (stubs)
    dist/                          # built by tsc, gitignored
  types/                           # EXISTING — leave NormalizedEvent here
    src/index.ts
```

Both `apps/server` and `apps/web` add `"@zet-plane/contracts": "workspace:*"` to their `dependencies`.

---

## Build strategy

### `packages/contracts/package.json`

```json
{
  "name": "@zet-plane/contracts",
  "version": "0.0.1",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "development": "./src/index.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "peerDependencies": {
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@zet-plane/tsconfig": "workspace:*",
    "typescript": "^6.0.3"
  }
}
```

### Consumers' tsconfig

Add to **both** `apps/server/tsconfig.json` and `apps/web/tsconfig.json` (and any package that needs to resolve `development` exports during typecheck):

```jsonc
{
  "compilerOptions": {
    "customConditions": ["development"]
  }
}
```

Available since TS 5.0; project is on TS 6.0.3.

### `turbo.json` task wiring

Ensure `build` declares `dependsOn: ["^build"]` so `@zet-plane/contracts` builds before `@zet-plane/server`. `dev` does **not** depend on `^build` — dev consumes source directly via the `development` condition. (If `turbo.json` already has this pattern from the existing `@zet-plane/types` package, no change needed.)

### Production runtime invariant

`apps/server` is deployed as `node dist/main`. At runtime, Node ignores the `development` condition and falls through to `default` → `./dist/index.js`. **This means `packages/contracts` must have a built `dist/` in any deployable artifact.** CI must run `pnpm build` from repo root (which `turbo` orders correctly) before `node dist/main`.

### `tsc-alias` in server

The server's `build` script is `nest build && tsc-alias -p tsconfig.json`. `tsc-alias` rewrites tsconfig `paths` aliases — it does **not** touch workspace package imports. `@zet-plane/contracts` is resolved by Node's module resolution via the `exports` field, not by `paths`. So `tsc-alias` requires no modification for this work.

---

## Contract shape

### `packages/contracts/src/errors.ts`

```ts
import { z } from 'zod'

/**
 * Build an error response schema where `code` is a literal or enum.
 * Each endpoint declares the exact set of codes it can emit.
 */
export function makeErrorResponse<C extends string>(
  code: z.ZodLiteral<C> | z.ZodEnum<[C, ...C[]]>,
) {
  return z.object({
    code,
    message: z.string(),
    details: z.unknown().optional(),
  })
}

export const ValidationErrorResponse = makeErrorResponse(z.literal('VALIDATION_ERROR'))
export type ValidationErrorResponse = z.infer<typeof ValidationErrorResponse>

/** Generic envelope without code-narrowing, for catch-all client paths. */
export const AnyErrorResponse = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
})
export type AnyErrorResponse = z.infer<typeof AnyErrorResponse>
```

### `packages/contracts/src/nodes.ts` (first slice)

```ts
import { z } from 'zod'
import { makeErrorResponse, ValidationErrorResponse } from './errors'

// Schemas
export const NodeId = z.string().uuid()
export const ProjectId = z.string().uuid()

export const NodeStatus = z.enum(['active', 'blocked', 'completed', 'archived'])

export const CreateNodeRequest = z.object({
  title: z.string().min(1).max(200),
  parentId: NodeId.optional(),     // omit → child of project root
  description: z.string().optional(),
})
export type CreateNodeRequest = z.infer<typeof CreateNodeRequest>

export const NodeResponse = z.object({
  id: NodeId,
  projectId: ProjectId,
  title: z.string(),
  status: NodeStatus,
  description: z.string().nullable(),
  isProjectRoot: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type NodeResponse = z.infer<typeof NodeResponse>

// Endpoint
export const createNodeEndpoint = {
  method: 'POST',
  path: '/api/projects/:id/nodes',
  params: z.object({ id: ProjectId }),
  request: CreateNodeRequest,
  response: NodeResponse,
  errors: {
    400: ValidationErrorResponse,
    404: makeErrorResponse(z.literal('PROJECT_NOT_FOUND')),
    409: makeErrorResponse(
      z.enum(['NODE_DUPLICATE_TITLE', 'PARENT_NODE_ARCHIVED', 'PARENT_NODE_COMPLETED']),
    ),
  },
} as const
```

**Convention:** every endpoint exports as `<verb><Resource>Endpoint`. Schemas it references live alongside in the same file. Cross-resource schemas (e.g. `NodeId`) go in `shared.ts`.

### `packages/contracts/src/index.ts`

```ts
export * from './errors'
export * from './shared'
export * from './nodes'
// edges, projects, ... as they are added
```

---

## Server integration (`nestjs-zod`)

### Dependencies

```bash
# in apps/server
pnpm add nestjs-zod
pnpm remove class-validator class-transformer
```

Verify in the pre-flight spike (see below) that `nestjs-zod`'s currently-published version supports Zod 4.x and Nest 11 + Fastify before committing this step.

### Global pipe & filter (`apps/server/src/main.ts` or `app.module.ts`)

```ts
import { ZodValidationPipe } from 'nestjs-zod'
import { patchNestJsSwagger } from 'nestjs-zod'

// In main.ts, before SwaggerModule.createDocument:
patchNestJsSwagger()

// Globally in AppModule:
{
  provide: APP_PIPE,
  useClass: ZodValidationPipe,
}
{
  provide: APP_FILTER,
  useClass: DomainExceptionFilter,  // defined below
}
```

### `DomainException` base class & filter

Location: `apps/server/src/common/exceptions/`

```ts
// domain-exception.ts
export class DomainException<C extends string = string> extends Error {
  constructor(
    public readonly code: C,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message)
  }
}

// Specific subclasses keep call sites short:
export class NotFoundDomainException<C extends string> extends DomainException<C> {
  constructor(code: C, message: string, details?: unknown) {
    super(code, message, 404, details)
  }
}
export class ConflictDomainException<C extends string> extends DomainException<C> {
  constructor(code: C, message: string, details?: unknown) {
    super(code, message, 409, details)
  }
}
```

```ts
// domain-exception.filter.ts
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse<FastifyReply>()

    if (exception instanceof DomainException) {
      return res.status(exception.status).send({
        code: exception.code,
        message: exception.message,
        details: exception.details,
      })
    }

    if (exception instanceof ZodValidationException) {
      return res.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: exception.getZodError().issues,
      })
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const resp = exception.getResponse()
      return res.status(status).send({
        code: 'HTTP_ERROR',
        message: typeof resp === 'string' ? resp : (resp as any).message ?? exception.message,
      })
    }

    // Unknown — log and return 500
    return res.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    })
  }
}
```

### Controller migration pattern

```ts
import { createZodDto } from 'nestjs-zod'
import {
  createNodeEndpoint,
  ConflictDomainException,
  NotFoundDomainException,
} from '@zet-plane/contracts'

class CreateNodeDto extends createZodDto(createNodeEndpoint.request) {}
class CreateNodeParamsDto extends createZodDto(createNodeEndpoint.params) {}

@Controller()
export class GraphController {
  @Post(createNodeEndpoint.path)
  async createNode(
    @Param() params: CreateNodeParamsDto,
    @Body() body: CreateNodeDto,
  ): Promise<NodeResponse> {
    return this.nodeService.create(params.id, body)
  }
}
```

`NodeService` `throw new NotFoundException(...)` sites become `throw new NotFoundDomainException('PROJECT_NOT_FOUND', '...')`. The literal code strings must be a subset of what `createNodeEndpoint.errors[<status>]` declares.

---

## Web client shape

### `apps/web/src/lib/api-client.ts`

```ts
import { z } from 'zod'
import { AnyErrorResponse } from '@zet-plane/contracts'

type EndpointDef = {
  method: string
  path: string
  params?: z.ZodType
  request?: z.ZodType
  response: z.ZodType
  errors: Record<number, z.ZodType>
}

export class ApiError<T extends EndpointDef> extends Error {
  constructor(
    public readonly status: number,
    public readonly body: z.infer<T['errors'][keyof T['errors']]> | AnyErrorResponse,
  ) {
    super((body as any).message ?? 'API error')
  }
}

export async function apiCall<T extends EndpointDef>(
  endpoint: T,
  args: {
    params?: z.infer<NonNullable<T['params']>>
    body?: z.infer<NonNullable<T['request']>>
  } = {},
): Promise<z.infer<T['response']>> {
  const path = endpoint.path.replace(/:(\w+)/g, (_, k) => String((args.params as any)?.[k]))
  const res = await fetch(path, {
    method: endpoint.method,
    headers: { 'Content-Type': 'application/json' },
    body: args.body ? JSON.stringify(args.body) : undefined,
  })
  const json = await res.json()
  if (!res.ok) {
    const errSchema = endpoint.errors[res.status] ?? AnyErrorResponse
    throw new ApiError(res.status, errSchema.parse(json))
  }
  return endpoint.response.parse(json)
}
```

### tanstack-query factory

```ts
// apps/web/src/lib/use-endpoint.ts
export function useEndpointMutation<T extends EndpointDef>(endpoint: T) {
  return useMutation({
    mutationFn: (args: Parameters<typeof apiCall<T>>[1]) => apiCall(endpoint, args),
  })
}

export function useEndpointQuery<T extends EndpointDef>(
  endpoint: T,
  args: Parameters<typeof apiCall<T>>[1],
) {
  return useQuery({
    queryKey: [endpoint.path, args.params, args.body],
    queryFn: () => apiCall(endpoint, args),
  })
}
```

### First UI consumer

A single screen or component that calls `useEndpointMutation(createNodeEndpoint)` is enough to validate the loop. Whatever surface is most natural in the current web scaffold — the existing dashboard route, or a temporary form. Not prescribed by this spec.

---

## Pre-flight spikes (do BEFORE writing migration code)

Spend ~30 minutes confirming each. If any fails, return to design before committing.

1. **`nestjs-zod` × Zod 4.4.3 compatibility** — `pnpm view nestjs-zod peerDependencies` and confirm the latest published version accepts `zod@^4`. nestjs-zod was Zod-3-only for a long time.
2. **`nestjs-zod` × Fastify + `@nestjs/swagger`** — minimal spike: install nestjs-zod, call `patchNestJsSwagger()`, define one `createZodDto`-wrapped endpoint, hit `/api-docs-json`, verify the schema appears correctly. Fastify adapter has historically been less tested than Express.
3. **TypeScript `customConditions: ["development"]` under default Nest CLI tsc builder** — create `@zet-plane/contracts` as source-only, import from `apps/server`, run `nest start --watch`, confirm it resolves `./src/index.ts` and hot-reloads on schema edit. If it falls through to `dist` (which won't exist), the dev workflow breaks.
4. **Production build ordering** — `pnpm -w build` from repo root should build `@zet-plane/contracts` first, then `apps/server`. Confirm `node apps/server/dist/main.js` starts successfully and imports resolve to `packages/contracts/dist/index.js`.

---

## Commit sequence (this branch only)

Branch name suggestion: `feat/shared-contracts-pkg`

1. `chore: scaffold @zet-plane/contracts package`
   - package.json, tsconfig, empty src/index.ts, turbo wiring
2. `feat(contracts): add error envelope + domain exception helpers`
   - src/errors.ts with `makeErrorResponse` + `ValidationErrorResponse`
3. `feat(server): install nestjs-zod, add ZodValidationPipe + DomainExceptionFilter globally`
   - including `DomainException` base class in `apps/server/src/common/`
   - `patchNestJsSwagger()` call
4. `refactor(server): remove class-validator and class-transformer`
   - deps + any global ValidationPipe registration from main.ts
5. `feat(contracts): define createNodeEndpoint`
   - src/nodes.ts and shared.ts
6. `refactor(server): migrate POST /projects/:id/nodes to contracts`
   - controller + service throw-site updates
   - existing `*.spec.ts` tests updated for new exception types
7. `feat(web): add apiCall + useEndpointMutation helpers`
8. `feat(web): use createNodeEndpoint in <screen>`

Each commit should leave the working tree in a building, testing state. After step 4, remaining graph endpoints will temporarily lack validation (they used class-validator) — this is acceptable for one branch but **must** be addressed in the immediate follow-up PRs. Document the gap in `README.md` or commit message of step 4.

---

## Follow-up branches (out of scope here, but tracked)

- `feat/contracts-migrate-edges` — migrate edge endpoints, define `createEdgeEndpoint` etc.
- `feat/contracts-migrate-nodes-remaining` — the 5 other node endpoints (`GET subgraph`, `PATCH`, `PATCH resolution`, `DELETE`, `PATCH edges`)
- `feat/contracts-migrate-projects` — project CRUD once that module exists
- `chore: move NormalizedEvent + BullMQ payloads to @zet-plane/types if not already`

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| `nestjs-zod` doesn't support Zod 4 | Pre-flight spike #1. Fallback: pin Zod to 3.x across the workspace until support lands |
| `customConditions` not picked up by Nest CLI's tsc builder | Pre-flight spike #3. Fallback: drop the `development` condition, always run `tsc --watch` in `packages/contracts` via `turbo dev` |
| `tsc-alias` interferes with workspace package imports | Verified above — it doesn't, but watch for it in spike #4 |
| nestjs-zod's Swagger patch doesn't cover Fastify adapter quirks | Pre-flight spike #2. Fallback: skip auto-OpenAPI for now, supersede `@nestjs/swagger` integration in a follow-up |
| Removing class-validator breaks the other 9 graph endpoints' validation | Expected for one branch. Either (a) migrate all 10 in this branch (scope grows ~3x), or (b) leave them temporarily un-validated and ship the follow-up PRs quickly. Decision: (b) — record in step-4 commit message |

---

## Acceptance criteria

- [ ] All 4 pre-flight spikes pass
- [ ] `pnpm -w build` succeeds; `apps/server/dist/main.js` runs
- [ ] `nest start --watch` hot-reloads on edits to `packages/contracts/src/*.ts` without manual rebuild
- [ ] `POST /api/projects/:id/nodes` returns parsed response on happy path
- [ ] Sending invalid body returns `{ code: 'VALIDATION_ERROR', ... }` with Zod issues in `details`
- [ ] Hitting a non-existent project returns `{ code: 'PROJECT_NOT_FOUND', ... }` with status 404
- [ ] `/api-docs-json` includes the schema for create-node
- [ ] Web `useEndpointMutation(createNodeEndpoint)` round-trips successfully and types narrow correctly on `error.code`
- [ ] `class-validator` and `class-transformer` are removed from `apps/server/package.json`
- [ ] `apps/server` has zero references to `@nestjs/swagger` DTO decorators (`@ApiProperty` etc.) for the migrated endpoint; OpenAPI is fully derived from Zod
