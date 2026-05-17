---
name: node-lifecycle
description: Guides valid node status transitions
applicable_tasks: [graph_growth]
---

## Node Lifecycle

Valid status transitions:
- `active` → `blocked` (dependency unresolved or checkpoint elevated)
- `blocked` → `active` (dependency resolved, non-checkpoint)
- `active` → `completed` (all children completed, no unresolved deps)

Forbidden transitions (will be rejected by the domain service):
- Any transition from `archived`
- `blocked` → `completed` (must go through `active` first)
- `completed` → any status (immutable)
- Direct resolution of checkpoint nodes via `update_node_status` (use `notify_human`)

When a status update fails with a domain error, record the reason in your final response.
Do not retry with a different status — respect the domain rules.
