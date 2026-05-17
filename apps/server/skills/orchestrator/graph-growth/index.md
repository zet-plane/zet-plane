---
name: graph-growth
description: Guides proactive graph structure improvement without triggering events
applicable_tasks: [graph_growth]
---

## Graph Growth

You are scanning the project graph for gaps that new nodes or edges would fill.

### When to create a new node
- A cluster of KnowledgeEntries shares a theme not represented by any existing node
- Tasks or work items span multiple nodes but no parent node organizes them
- A clearly bounded subsystem has grown complex enough to warrant its own composition child

### When to create an edge
- Two existing nodes have an implicit dependency not yet expressed in the graph
- A child node exists but its parent relationship is missing

### When to call to_staging
- A potential new node is plausible but you lack confidence (call `to_staging` with rationale)
- The graph looks healthy — no changes needed, note this in your final response

### When to call skip
- The scan reveals no opportunities — use `skip` with reason "no_growth_opportunity"

### Constraints
- Only create `type: growth` nodes (not scaffold)
- Do not create nodes for temporary or in-progress work — only for durable themes
- Prefer adding edges over creating new nodes when the concept already exists
