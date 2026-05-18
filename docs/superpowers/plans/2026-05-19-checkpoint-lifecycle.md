# Checkpoint Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate checkpoint task from `notify_human` / `waiting_for_approval` semantics to a gate-based lifecycle where the task concludes after producing a decision draft, and the gate (blocked node) carries the wait semantics.

**Architecture:** The checkpoint task is a *decision-package producer* — it collects context, creates a `decision` knowledge entry, and calls `conclude`. Waiting for human confirmation is expressed by the graph node staying `blocked + isCheckpoint=true`, not by the task status. Human calls `resolveCheckpoint`, which opens the gate and emits `graph.checkpoint.resolved`; no old task is resumed.

**Tech Stack:** NestJS, LangGraph (agent loop), BullMQ, Vitest. All commands run from `apps/server/`.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `apps/server/skills/orchestrator/checkpoint-analysis/index.md` | Modify | Replace `notify_human` with `conclude`; rewrite constraints |
| `apps/server/src/orchestrator/prompt/prompt-builder.service.spec.ts` | Modify | Fix broken test that asserts old `notify_human` instruction |
| `apps/server/src/orchestrator/context/context-builder.service.spec.ts` | Modify | Mark `requiresHumanApproval` tests as deprecated-field tests |
| `apps/server/src/orchestrator/runtime/agent-runtime.service.spec.ts` | Modify | Mark `waiting_for_approval` tests as testing deprecated path |

**Already done (do not re-do):**
- `apps/server/src/orchestrator/prompt/prompt-builder.service.ts` — checkpoint now routes to `conclude` instruction via `task.type === checkpoint`
- `apps/server/src/orchestrator/tools/write/notify-human.tool.ts` — deprecation comment added
- `apps/server/src/orchestrator/runtime/agent-runtime.service.ts` — deprecation comments on both `waiting_for_approval` branches
- `apps/server/src/orchestrator/context/context-builder.service.ts` — deprecation comment on `requiresHumanApproval`

---

## Task 1: Update checkpoint-analysis skill

**Files:**
- Modify: `apps/server/skills/orchestrator/checkpoint-analysis/index.md`

- [ ] **Step 1: Run the current test suite to confirm baseline**

```bash
cd apps/server && pnpm vitest run
```

Expected: All tests pass *except* the one checkpoint test in `prompt-builder.service.spec.ts` (which was broken by the earlier `prompt-builder.service.ts` change — we'll fix that in Task 2). Note the count of failures before continuing.

- [ ] **Step 2: Replace the skill file contents**

Overwrite `apps/server/skills/orchestrator/checkpoint-analysis/index.md` with:

```markdown
---
name: checkpoint-analysis
description: Guides checkpoint analysis and human-approval preparation
applicable_tasks: [checkpoint]
---

## Checkpoint Analysis

A checkpoint node has been elevated (a dependency cycle was detected). Your job is to prepare
a decision draft for human review. You are a **decision-package producer** — your task ends when
the draft exists, not when a human has reviewed it. The gate (blocked node) carries the wait
semantics; the task does not.

### Required actions (in order)
1. Call `get_node` on the checkpoint node to understand context
2. Call `get_subgraph` to see the cycle path
3. Call `search_knowledge` to find related decisions and context entries
4. Call `get_task_history` to understand recent activity on this project
5. Call `create_knowledge_entry` with `category: decision` containing:
   - Background: what led to this cycle
   - Risk analysis: what happens with `continue` vs `loop`
   - Your recommendation (clearly labeled as a draft for human review)
6. Call `conclude` with:
   - `signalType: 'decision'`
   - `evidence`: `[{ sourceType: 'knowledge_entry', sourceId: <entryId>, note: 'Decision draft for checkpoint review' }]`
   - `summary`: one sentence describing the decision draft produced

### Hard constraints
- NEVER call `update_node_status` — resolution is exclusively a human action via `resolveCheckpoint`
- NEVER call `notify_human` — checkpoint wait semantics belong to the gate, not the task
- `conclude` MUST be called AFTER `create_knowledge_entry`; a `conclude` with no `evidence` entryId is a skill violation
- `skip` is only permitted if the checkpoint node was already resolved **before this task started running**; check `get_node` status to confirm
```

- [ ] **Step 3: Verify no other skill files reference the old constraint**

```bash
grep -r "NEVER call \`conclude\` for unresolved" apps/server/skills/
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/server/skills/orchestrator/checkpoint-analysis/index.md
git commit -m "feat(checkpoint): migrate skill from notify_human to conclude

checkpoint task is now a decision-package producer that concludes after
creating the decision draft. Gate (blocked node) carries wait semantics."
```

---

## Task 2: Fix broken prompt-builder test

**Files:**
- Modify: `apps/server/src/orchestrator/prompt/prompt-builder.service.spec.ts`

Context: The `prompt-builder.service.ts` was already updated (outside this plan) to emit a `conclude`-based instruction for checkpoint tasks. The test at line 77 still asserts the old `notify_human` wording and will FAIL.

- [ ] **Step 1: Run the test to confirm it fails**

```bash
cd apps/server && pnpm vitest run src/orchestrator/prompt/prompt-builder.service.spec.ts
```

Expected: 1 failure — `"instructs checkpoint tasks to notify_human instead of conclude"`.

- [ ] **Step 2: Replace the failing test**

In `apps/server/src/orchestrator/prompt/prompt-builder.service.spec.ts`, find and replace the test at lines 77–84:

Old:
```ts
it('instructs checkpoint tasks to notify_human instead of conclude', () => {
  const { userMessage } = service.build(
    makeTask(OrchestratorTaskType.checkpoint),
    makeCtx(true) as any,
  )
  expect(userMessage).toContain('requires human approval')
  expect(userMessage).toContain('call `notify_human` instead of `conclude`')
})
```

New:
```ts
it('instructs checkpoint tasks to conclude with decision signalType and evidence', () => {
  const { userMessage } = service.build(
    makeTask(OrchestratorTaskType.checkpoint),
    makeCtx() as any,
  )
  expect(userMessage).toContain('signalType: decision')
  expect(userMessage).toContain('Do NOT call `notify_human`')
})
```

- [ ] **Step 3: Run the test to confirm it passes**

```bash
cd apps/server && pnpm vitest run src/orchestrator/prompt/prompt-builder.service.spec.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 4: Run full suite to confirm no regressions**

```bash
cd apps/server && pnpm vitest run
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/orchestrator/prompt/prompt-builder.service.spec.ts
git commit -m "test(checkpoint): update prompt-builder spec for conclude-based instruction"
```

---

## Task 3: Annotate deprecated-path tests

**Files:**
- Modify: `apps/server/src/orchestrator/context/context-builder.service.spec.ts`
- Modify: `apps/server/src/orchestrator/runtime/agent-runtime.service.spec.ts`

These tests still pass (the deprecated code is still in place), but their descriptions imply active features. Update descriptions so future readers know they're covering deprecated paths.

- [ ] **Step 1: Update context-builder tests — change descriptions**

In `apps/server/src/orchestrator/context/context-builder.service.spec.ts`, replace:

```ts
it('sets requiresHumanApproval=true for checkpoint tasks', async () => {
```

with:

```ts
it('[deprecated] sets requiresHumanApproval=true for checkpoint tasks (field is deprecated; use task.type check instead)', async () => {
```

And replace:

```ts
it('sets requiresHumanApproval=false for non-checkpoint tasks', async () => {
```

with:

```ts
it('[deprecated] sets requiresHumanApproval=false for non-checkpoint tasks (field is deprecated)', async () => {
```

- [ ] **Step 2: Update agent-runtime tests — change descriptions**

In `apps/server/src/orchestrator/runtime/agent-runtime.service.spec.ts`, replace:

```ts
it('transitions to waiting_for_approval on WaitingForApprovalSignal', async () => {
```

with:

```ts
it('[deprecated] transitions to waiting_for_approval on WaitingForApprovalSignal (deprecated path; checkpoint tasks no longer use this)', async () => {
```

And replace:

```ts
it('skips execution without touching status when task is already waiting_for_approval', async () => {
```

with:

```ts
it('[deprecated] skips re-execution when task is already waiting_for_approval (deprecated status retained for backward compat)', async () => {
```

- [ ] **Step 3: Run full suite to confirm nothing broke**

```bash
cd apps/server && pnpm vitest run
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/orchestrator/context/context-builder.service.spec.ts
git add apps/server/src/orchestrator/runtime/agent-runtime.service.spec.ts
git commit -m "test(checkpoint): mark deprecated-path tests with [deprecated] prefix"
```
