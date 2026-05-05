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

- **Cycle detection ignores `reference` edges** — only `composition` and `dependency` count as flow constraints. See `cycle-detector.service.ts`.
- **Checkpoint elevation runs inside the same `$transaction` as edge creation**, then the BullMQ job fires *after* the transaction commits. Never publish jobs from inside a `$transaction` callback.
- **Node status guards live in `NodeService.validateStatusTransition`** (5 rules: NODE_ARCHIVED, USE_RESOLUTION_API, UNRESOLVED_CHECKPOINT, INCOMPLETE_CHILDREN, UNRESOLVED_DEPENDENCY). Adding state transitions means updating both this method and the spec table.
- **`completed` is intentionally close to immutable.** A completed node cannot move back to `active`/`blocked`; only edge type `reference` may be added to it.
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

## Important docs to read before substantial changes

1. [docs/architecture.md](docs/architecture.md) — system-level layering and invariants
2. [docs/superpowers/specs/](docs/superpowers/specs/) — current feature specs
3. [README.md](README.md) — current delivery status and known issues
