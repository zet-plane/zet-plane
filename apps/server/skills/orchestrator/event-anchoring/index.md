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

### Graph update rules
- If the event describes a confirmed structural change between existing nodes, update the graph directly instead of only writing knowledge.
- When the event explicitly states that one existing node now depends on another existing node, call `create_edge` with `type: dependency`.
- When the event describes a parent-child decomposition under an existing node, create or move nodes first, then connect them with `composition` edges.
- If exact node IDs are present in the trigger, treat them as authoritative references and prefer updating those nodes over fuzzy matching.
- Do not avoid a graph write merely because it may reveal a dependency cycle. Apply the confirmed structure; downstream checkpoint handling will deal with the cycle.

### Knowledge sedimentation trigger
After anchoring: if the event contains a decision, risk, finding, or learning worth preserving,
immediately call `create_knowledge_entry` in the same loop. Do not defer sedimentation to a later task.
