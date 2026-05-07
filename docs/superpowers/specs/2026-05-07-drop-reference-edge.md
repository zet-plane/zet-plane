# Drop the `reference` Edge Type

**Date**: 2026-05-07
**Status**: Pending implementation
**Supersedes**: portions of [Scaffold Graph Engine design](./2026-05-04-scaffold-graph-engine-design.md) and [Knowledge Engine design](./2026-05-05-knowledge-engine-design.md) that mention `reference`.

---

## 1. Problem

The `reference` edge type was introduced as a "soft pointer for knowledge navigation" ([scaffold-graph-engine.md:64](../../design/scaffold-graph-engine.md#L64)). After the Knowledge Engine landed, it has no consumer and no real semantics:

| Intended role | Actual owner today |
|---|---|
| Knowledge ↔ Node anchoring | [`KnowledgeEntry.nodeId`](../../../apps/server/prisma/schema.prisma#L75) (direct FK-style relation) |
| Cross-node "see also" navigation | None — no code reads reference edges |
| LLM context hints | None — Orchestrator does not consume it; `KnowledgeEntry.category=context` already covers this |
| Citation / provenance | None |

What it *does* do is impose ongoing complexity to compensate for the fact that it does not belong in the flow graph:

- [`CycleDetectorService`](../../../apps/server/src/graph/cycle/cycle-detector.service.ts) must filter `e.type !== 'reference'` before building the adjacency list.
- [`EdgeService.createEdge`](../../../apps/server/src/graph/edge/edge.service.ts#L26) needs a special-case escape hatch allowing edges *out of* `completed` nodes only when the type is `reference`.
- The status guard table carries a row dedicated to the `reference` exception.
- Every future delete / cascade rule has to define its behavior on `reference` separately.

A semantically empty type that costs branches everywhere is a net liability. Removing it simplifies the graph to a clean two-edge-type model.

## 2. Decision

**Remove `reference` from `EdgeType`.** The remaining edge types are:

| Type | Semantics | Participates in cycle detection | Allowed out of `completed` nodes |
|---|---|---|---|
| `composition` | Structural part-of relationship; defines the project tree (DAG-permitted, see §6) | Yes | No |
| `dependency` | Flow constraint: `from` cannot complete until `to` has completed | Yes | No |

Both remaining types carry real flow semantics, so every code path that today branches on edge type collapses to a uniform rule.

## 3. Schema Migration

### 3.1 Prisma change

[`apps/server/prisma/schema.prisma`](../../../apps/server/prisma/schema.prisma):

```prisma
enum EdgeType {
  composition
  dependency
  // reference removed
}
```

### 3.2 Data migration

Add a Prisma migration `drop_reference_edge_type`:

```sql
-- 1. Hard-delete any existing reference edges.
DELETE FROM "Edge" WHERE "type" = 'reference';

-- 2. Drop the enum value.
--    Postgres requires recreating the enum to remove a value.
ALTER TYPE "EdgeType" RENAME TO "EdgeType_old";
CREATE TYPE "EdgeType" AS ENUM ('composition', 'dependency');
ALTER TABLE "Edge"
  ALTER COLUMN "type" TYPE "EdgeType"
  USING "type"::text::"EdgeType";
DROP TYPE "EdgeType_old";
```

Step 1 is destructive but safe: no consumer reads reference edges, so any rows present today are inert. If a deployment has accumulated such rows, they would be unreachable noise after this migration regardless.

## 4. Application-Layer Changes

### 4.1 `CycleDetectorService`

[`cycle-detector.service.ts`](../../../apps/server/src/graph/cycle/cycle-detector.service.ts) currently filters out reference edges before adjacency construction. Remove the filter — every edge now contributes to flow constraint detection.

```typescript
// before
const graph = buildAdjacency(edges.filter(e => e.type !== EdgeType.reference))

// after
const graph = buildAdjacency(edges)
```

The corresponding "ignores reference edges" unit test in [`cycle-detector.service.spec.ts`](../../../apps/server/src/graph/cycle/cycle-detector.service.spec.ts) is deleted.

### 4.2 `EdgeService.createEdge`

[`edge.service.ts:26-28`](../../../apps/server/src/graph/edge/edge.service.ts#L26-L28) currently allows edges out of `completed` nodes when `type === reference`:

```typescript
// before
if (data.type !== EdgeType.reference && fromNode.status === NodeStatus.completed) {
  throw new ConflictException('COMPLETED_NODE_IMMUTABLE')
}

// after
if (fromNode.status === NodeStatus.completed) {
  throw new ConflictException('COMPLETED_NODE_IMMUTABLE')
}
```

`completed` becomes uniformly immutable on the outbound side: no edge of any type may originate from a completed node. This matches the intent recorded in [scaffold-graph-engine-design.md §四](./2026-05-04-scaffold-graph-engine-design.md) ("`completed` nodes are near-immutable") without the carve-out.

### 4.3 DTOs and validators

Search and remove `reference` from any class-validator `@IsEnum` lists, Swagger schema decorators, and OpenAPI examples in:

- [`apps/server/src/graph/dto/edge.dto.ts`](../../../apps/server/src/graph/dto/edge.dto.ts)
- Any `EdgeType` reference under `apps/server/src/knowledge/dto/`
- Test fixtures using `EdgeType.reference`

### 4.4 Generated Prisma client

`pnpm prisma generate` regenerates [`apps/server/src/prisma/gen/client/`](../../../apps/server/src/prisma/gen/client/) — no manual edits, but verify the regenerated `EdgeType` no longer lists `reference` before committing.

## 5. Test Changes

| File | Action |
|---|---|
| `cycle-detector.service.spec.ts` | Delete the "ignores reference edges" case |
| `edge.service.spec.ts` | Delete the "allows reference edge even when fromNode is completed" case; tighten the completed-node test to assert *all* edge types are rejected |
| `graph.controller.spec.ts` | Remove any `EdgeType.reference` fixtures |
| `knowledge.controller.spec.ts` | Remove any `EdgeType.reference` fixtures (if present) |

No new tests are added by this spec — it is a pure removal. Coverage is verified by the existing suite continuing to pass with the deletions above.

## 6. Implications for Subsequent Specs

This change unlocks two follow-ups, written as separate specs:

1. **Unified delete cascade with in-degree guard** — with only two edge types, the cascade rules have a single uniform branch on `composition` (in-degree-driven) and a trivial branch on `dependency` (edge removal only). The `reference` carve-out the cascade design otherwise needs disappears entirely.
2. **Project aggregate + composite FKs** — independent of this spec, can land in parallel.

Composition is now explicitly permitted as a DAG (multiple composition parents allowed). Cycle detection still blocks flow cycles by elevating a checkpoint node, identical to current behavior; what changes is only that the detector no longer skips any edge type.

## 7. Documentation Updates

Edit the following to remove references (no pun intended) to the `reference` edge type:

- [`docs/architecture.md`](../../architecture.md) — none found, no change.
- [`docs/design/scaffold-graph-engine.md:64`](../../design/scaffold-graph-engine.md#L64) — remove the `reference` row from the edge-type table; update §EdgeType code block.
- [`docs/superpowers/specs/2026-05-04-scaffold-graph-engine-design.md`](./2026-05-04-scaffold-graph-engine-design.md) — strike rows mentioning `reference` in §一 decision summary, §三 schema enum, §四 status guard table, §五 step 2, §六 cycle detector.
- [`docs/superpowers/plans/2026-05-04-scaffold-graph-engine.md`](../plans/2026-05-04-scaffold-graph-engine.md) — already-shipped plan; add a one-line note at top: *"Superseded in part by [drop-reference-edge spec](../specs/2026-05-07-drop-reference-edge.md) (2026-05-07): the `reference` edge type has been removed."* Do not rewrite the historical body.
- [`docs/superpowers/plans/2026-05-05-knowledge-engine-zh.md:139`](../plans/2026-05-05-knowledge-engine-zh.md#L139) — same treatment if the line is load-bearing; otherwise leave the historical reference in place with a top-of-file note.

## 8. Task Checklist

1. Write Prisma migration `drop_reference_edge_type` with the SQL in §3.2.
2. Update [`schema.prisma`](../../../apps/server/prisma/schema.prisma) `EdgeType` enum.
3. Run `pnpm prisma migrate dev` locally; run `pnpm prisma generate`.
4. Delete the cycle-detector reference filter (§4.1).
5. Tighten the completed-node guard in `edge.service.ts` (§4.2).
6. Sweep DTOs, validators, and fixtures for `EdgeType.reference` usages (§4.3).
7. Update / delete tests per §5.
8. Run `pnpm test` and `pnpm build` from `apps/server`; both must pass.
9. Update the documents listed in §7.
10. Single commit, scope `feat(graph)!` (breaking change to enum surface).

## 9. Out of Scope

- Any replacement for "soft cross-node pointers." If a real use case appears later, it belongs in [`KnowledgeEntry`](../../../apps/server/prisma/schema.prisma#L72) (e.g. a `relatedNodeIds` field on entries of category `context`), not as a new edge type. Reintroducing a third edge type to recover lost flexibility would re-incur the complexity this spec removes.
