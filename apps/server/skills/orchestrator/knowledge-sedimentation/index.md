---
name: knowledge-sedimentation
description: Guides extraction and storage of durable knowledge from events
applicable_tasks: [event_anchor]
---

## Knowledge Sedimentation

Knowledge entries preserve the "why" behind project events. Not every event creates knowledge.

### When to sedate

Create a `KnowledgeEntry` when the event contains:
- A **decision** with rationale (`category: decision`)
- A **pitfall** or failure mode encountered (`category: pitfall`)
- A **finding** or discovery worth remembering (`category: finding`)
- Necessary **context** for understanding a node (`category: context`)

Do NOT create entries for:
- Status updates that are already visible in the graph
- Noise or irrelevant events
- Information already captured in an existing entry (use `revise_knowledge_entry` instead)

### Dedup check
Before calling `create_knowledge_entry`, verify the tool hasn't returned `action: duplicate_found`.
If it does, call `revise_knowledge_entry` with the `existingId` instead.

### Body format
Write the body as a concise, self-contained explanation. Avoid references like "as mentioned above".
The entry must make sense read in isolation, weeks later.

### Completion
After `create_knowledge_entry` or `revise_knowledge_entry` returns, call `conclude` immediately:
- `signalType`: `"learning"`
- `confidence`: 0.9 if entry was clearly warranted, lower if borderline
- `evidence`: include the `entryId` returned by the tool with a brief note
