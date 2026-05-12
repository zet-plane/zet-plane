---
name: checkpoint-analysis
description: Guides checkpoint analysis and human-approval preparation
applicable_tasks: [checkpoint]
---

## Checkpoint Analysis

A checkpoint node has been elevated (a dependency cycle was detected). Your job is to prepare
a decision package for human review. You CANNOT resolve the checkpoint — only humans can.

### Required actions (in order)
1. Call `get_node` on the checkpoint node to understand context
2. Call `get_subgraph` to see the cycle path
3. Call `search_knowledge` to find related decisions and context entries
4. Call `get_task_history` to understand recent activity on this project
5. Call `create_knowledge_entry` with `category: decision` containing:
   - Background: what led to this cycle
   - Risk analysis: what happens with `continue` vs `loop`
   - Your recommendation (clearly labeled as a draft for human review)
6. Call `notify_human` with the `entryId` of the decision draft

### Hard constraints
- NEVER call `update_node_status` — resolution is exclusively a human action
- NEVER call `skip` — checkpoints always require human notification
- The `notify_human` call ends this task; do not attempt further actions after it
