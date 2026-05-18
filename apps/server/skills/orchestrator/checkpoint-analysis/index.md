---
name: checkpoint-analysis
description: Guides checkpoint analysis and decision draft creation for human review
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
