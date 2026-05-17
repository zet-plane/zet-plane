# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Turborepo + pnpm workspace. `apps/server` (NestJS backend) is where active development happens; `apps/web` (Next.js dashboard) and `apps/cli` (local SDK that pushes hook events) are scaffolded but minimal. Shared workspace packages live under `packages/` (`tsconfig`, `types`).

Workspace root scripts (`pnpm build|dev|lint|test`) fan out via Turbo. To work on a single app, `cd` into it and run its own scripts — faster and avoids Turbo cache noise.

## Commands

All commands assume `cd apps/server` unless noted otherwise.

```bash
# Backend dev loop
pnpm dev                              # nest start --watch (port 3000)
pnpm test                             # vitest run (one-shot)
pnpm test:watch                       # vitest in watch mode
pnpm vitest run path/to/file.spec.ts  # single test file
pnpm vitest run -t "test name"        # filter by test name

# Database (requires DATABASE_URL set)
pnpm prisma migrate dev --name <name> # create + apply migration
pnpm prisma generate                  # regenerate client after schema edit
pnpm prisma studio                    # GUI at localhost:5555

# Workspace-wide
pnpm -w build / dev / lint / test     # via Turbo from repo root
```

Required infra for running the server: PostgreSQL (DATABASE_URL) + Redis (REDIS_HOST / REDIS_PORT, defaults to localhost:6379). See `.env.example`. Tests are pure unit tests with mocks — no infra needed.

## Architecture

This system is a project-scoped graph engine that ingests events from external sources (GitHub, Feishu, Claude Code hooks, etc.) and orchestrates an LLM-driven agent layer over it. The full design is in [docs/architecture.md](docs/architecture.md). Key invariants worth knowing before editing:

**Layered, not peer-to-peer.** Domain Services (Scaffold Graph Engine, Knowledge Engine) are *passive* — they only mutate via API CRUD or via the Agent Orchestrator. The Orchestrator is the only active intelligence layer. Event Pipeline routes events either to deterministic CRUD or to the Orchestrator. Do not call LLMs from inside domain services.

**Knowledge anchors to Graph.** No knowledge entry exists outside a Graph node. Graph provides navigation; Knowledge provides content. When designing new knowledge features, always include the anchor node.

**Adapter, don't depend.** Source-side integrations (GitHub, Feishu, …) sit behind an Adapter Layer that normalizes events. Core logic must never reference a specific source.

### Scaffold Graph Engine (`apps/server/src/graph/`)

This is the only domain module currently implemented. Its design intent is in [docs/superpowers/specs/2026-05-04-scaffold-graph-engine-design.md](docs/superpowers/specs/2026-05-04-scaffold-graph-engine-design.md). Layering: `GraphController → NodeService / EdgeService → GraphRepository → PrismaService`. Three cross-cutting services: `CycleDetectorService` (pure, no IO), `GraphEventPublisher` (sole BullMQ exit), `PrismaService` (global).

Non-obvious rules enforced in code:

- **Checkpoint elevation runs inside the same `$transaction` as edge creation**, then the BullMQ job fires *after* the transaction commits. Never publish jobs from inside a `$transaction` callback.
- **Node status guards live in `NodeService.validateStatusTransition`** (5 rules: NODE_ARCHIVED, USE_RESOLUTION_API, UNRESOLVED_CHECKPOINT, INCOMPLETE_CHILDREN, UNRESOLVED_DEPENDENCY). Adding state transitions means updating both this method and the spec table.
- **`completed` is fully immutable on outbound edges.** A completed node cannot move back to `active`/`blocked`, and no new outbound edges of any type may originate from it.
- **Project root node is created lazily** via `initProjectRoot` and is the only node with `isProjectRoot=true`. All user-created nodes get a composition edge from root.
- **Delete strategies are 4-way** (`block` | `cascade` | `reparent-to-parent` | `reparent-to-root`) and return the list of affected node IDs, which gets attached to the published `graph.node.deleted` job.

### Event publishing

`GraphEventPublisher` is the single BullMQ exit. The five job types are exhaustively typed as a discriminated union — adding a new job type requires extending the union *and* the `Skill` type maps that consumers will use. Workers are not yet implemented (see README "后续任务"). Expected queue name: `graph-events`.

### What's not built yet

`adapters/`, `api/`, `event-pipeline/`, `knowledge/`, `orchestrator/` are placeholder directories under `apps/server/src/`. The Web dashboard and CLI are scaffolds. README has the live punch list of known gaps in the Graph Engine itself (spec deviations, missing service-layer tests, E2E coverage).

## Conventions

- **TDD is the default** for services. Each service has a co-located `*.spec.ts` with mocked dependencies; `GraphRepository` is intentionally not unit-tested (covered by future E2E).
- **NestJS DI throughout.** Don't `new Service()` outside tests — go through the module providers.
- **Prisma client is the only DB access path.** Repository wraps it; services never import Prisma directly.
- **Errors at service boundary use Nest exceptions** (`NotFoundException`, `ConflictException`). Repository throws plain typed errors with `instanceof`-checkable shapes; service catches and rethrows as Nest exceptions.
- **Plans + specs under `docs/superpowers/`** are the source of truth for in-flight features. When implementing from a plan, follow its task order and commit per task.

## Database / SQL naming conventions

**These rules govern the database layer only** — i.e. the actual table names, column names, index names, and constraint names that land in PostgreSQL. They do **not** apply to TypeScript/application code: Prisma model names stay `PascalCase`, field names stay `camelCase`, and class/variable names follow TypeScript conventions as normal.

In practice: use Prisma's `@@map` / `@map` directives to bridge the two naming worlds — TypeScript code uses its own conventions, the database sees `snake_case`.

### General
- All identifiers (database, table, column) **must use lowercase `snake_case`**. No camelCase, PascalCase, kebab-case, or spaces.
- Names must be self-explanatory. No pinyin, unexplained abbreviations, or meaningless names (`a`, `b`, `id1`, `tmp`).
- Do not use reserved SQL keywords as identifiers: `order`, `status`, `desc`, `group`, `key`, `index`, `type`, `name`, `date`, `datetime`, etc.

### Database names
- Format: `business_module` — e.g. `user_center`, `order_system`, `product_warehouse`.
- No meaningless suffixes like `_db` or `_database`.

### Table names
- **Plural nouns** only — tables represent collections: `users`, `user_roles`, `orders`, `order_items`.
- Use a module prefix to namespace by domain.
- ❌ `user`, `UserInfo`, `user-item` (singular / wrong case / kebab)

### Column names
- `snake_case` only. No camelCase (`userId`, `createTime`).
- Primary key: always `id` (`BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY`).
- Foreign keys: `<referenced_table_singular>_id` — e.g. `user_id`, `order_id`.
- Timestamps: `created_at`, `updated_at`, `deleted_at` (soft delete — prefer over `is_deleted`).
- Boolean / flag fields: `is_xxx` or `has_xxx` prefix — e.g. `is_enabled`, `has_password`. Do not use bare `status` for boolean state; use an enum with explicit values instead.
- Monetary amounts: `DECIMAL(10,2)` only — no `FLOAT` or `DOUBLE`.
- All `VARCHAR` columns must specify length — e.g. `VARCHAR(255)`, never bare `VARCHAR`.
- Every column must have a `COMMENT` describing its business meaning. Preserve comments when generating or modifying SQL.

### Index and constraint names
- Regular index: `idx_<column>` — e.g. `idx_user_id`
- Unique index: `uk_<column>` — e.g. `uk_phone`
- Foreign key constraint: `fk_<current_table>_<referenced_table>` — e.g. `fk_orders_user_id`

### Soft delete
- Use `deleted_at TIMESTAMP NULL DEFAULT NULL`, not `is_deleted TINYINT`.

## Dependency hygiene

**Always prefer the latest stable major** when adding a new dependency or starting a new module. Do **not** copy version strings from older docs, plan files, or training-data memory — they go stale fast.

Before writing a new `pnpm add` (or editing `package.json` by hand):

1. Resolve the actual latest with `npm view <pkg> dist-tags` (or `pnpm view`) — never trust your memory of "the current version."
2. If a plan/spec specifies a version, verify it against `dist-tags.latest`. If the plan is older than ~3 months, treat its version as advisory only.
3. For libraries with active framework integrations (NestJS, Prisma, Vitest, Next.js, React), check that peer compatibility is satisfied — a major-version bump in one often forces companion bumps.
4. If you cannot upgrade right now (e.g. it would break the current task), record the deferral in [docs/dependencies.md](docs/dependencies.md) with the reason, instead of silently leaving an old pin.

When upgrading existing deps:
- One PR per dependency (or per coherent group like all `@nestjs/*`). Don't bundle unrelated upgrades — review and rollback both get harder.
- After the upgrade, re-run `pnpm test`, `pnpm test:e2e`, and `pnpm dev` boot. New majors silently change behavior; CI catches the obvious, manual smoke catches the rest.
- Update [docs/dependencies.md](docs/dependencies.md) entry from "deferred" to "done" or remove it.

For library API questions during/after an upgrade, **use the context7 MCP** (`resolve-library-id` then `query-docs`) instead of relying on training-data knowledge — version drift is exactly where the model is most wrong.

## Important docs to read before substantial changes

1. [docs/architecture.md](docs/architecture.md) — system-level layering and invariants
2. [docs/superpowers/specs/](docs/superpowers/specs/) — current feature specs
3. [README.md](README.md) — current delivery status and known issues
4. [docs/dependencies.md](docs/dependencies.md) — outstanding dep upgrades and per-package adaptation notes

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`zet-plane/zet-plane`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
