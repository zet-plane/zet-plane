---
name: event-anchoring
description: Guides routing and anchoring of external events to graph nodes
applicable_tasks: [event_anchor]
---

## Event Anchoring

Your job is to decide what this event means for the project graph.

### Decision Matrix

| Situation | Action |
|---|---|
| Event is noise / no project relevance | Call `skip` with reason |
| Event is meaningful + clear anchor node exists | Use write tools to anchor; cascade sedimentation if knowledge value |
| Event is meaningful + no clear anchor | Call `to_staging` — this is a deliberate routing, not a fallback |
| Human judgment required (high-stakes decision, incomplete info) | Call `notify_human` |

### Noise criteria
- Automated bot activity with no semantic content
- Duplicate of an event already anchored (check `get_task_history`)
- Test/CI artifacts with no project meaning

### Anchoring process
1. Call `search_nodes` to find candidate anchor nodes by keyword from the event
2. If 2+ candidates: use `get_node` to read details and pick the best fit
3. If no candidates: call `search_knowledge` to find related entries as clues
4. Anchor to the most specific matching node; escalate to `to_staging` if uncertain

### Tool call discipline
- Call each tool **at most once per intent**. Never repeat a tool call with the same arguments.
- After tool results arrive, check them and proceed to the next step or output the final JSON.
- Do NOT re-create nodes you already created in this session.

### Knowledge sedimentation trigger
After anchoring: if the event contains a decision, risk, finding, or learning worth preserving,
immediately call `create_knowledge_entry` in the same loop. Do not defer sedimentation to a later task.
