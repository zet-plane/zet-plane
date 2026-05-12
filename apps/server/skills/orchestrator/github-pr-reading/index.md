---
name: github-pr-reading
description: Interprets GitHub PR events for event anchoring
applicable_tasks: [event_anchor]
---

## GitHub PR Reading

When the trigger is a GitHub PR or commit event:

### Signal extraction
- PR title + description → primary signal
- Changed files → infer affected subsystems (map to graph nodes by directory/module name)
- PR labels → look for: `breaking-change`, `hotfix`, `decision`, `blocked`
- Review comments → may contain decisions or risk signals

### Anchoring heuristics
- Map changed file paths to node titles using keyword overlap
- A PR touching `src/auth/` most likely belongs to a node with "auth" in its title
- Merged PRs with `breaking-change` label → consider `update_node_status` to `blocked` if dependents exist

### Sedimentation triggers
- PR description explicitly states a decision → `category: decision`
- PR description mentions a workaround or known issue → `category: pitfall`
- Significant architectural change merged → `category: finding`
