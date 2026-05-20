# Semantic Demo Seed Design

## Goal

Replace the four old `[demo]` seed projects with one semantic demo project: `[demo] Zet Plane 项目开发流程`.

## Modeling Rules

- The root scaffold is visible on the canvas as `Zet Plane 项目开发流程`.
- `scaffold` nodes model process structure: main flows, sub-flows, and checkpoints.
- `growth` nodes model process events, findings, risks, and scope changes.
- `composition` edges model ownership/placement in the process tree.
- `dependency` edges model causal influence, ordering, or cross-flow feedback.
- The demo seed follows the rule that growth events are composed under scaffold flows; event relationships are represented with dependency edges.
- The service-layer type validation is unchanged.

## Graph Shape

The single demo uses about 30 nodes:

- Root plus six main process scaffolds: Idea 提出, 需求分析, 竞品分析, PRD 与项目排期, 原型与技术方案, 开发交付与复盘.
- Each main process has two or three sub-flow scaffolds and selected growth events.
- Root-to-leaf depth is at least three, with deeper paths for PRD scope and technical planning.
- The graph includes branches, sibling dependencies, and cross-flow dependency stubs for canvas behavior.
- Scaffold siblings are connected by dependency edges inside the top-level and focused process views, so visible process nodes read as a flow rather than isolated steps.

## Demo Coverage

The fixture keeps real product semantics while still covering the canvas behaviors previously covered by separate demo projects:

- statuses: active, blocked, completed, archived
- node types: scaffold and growth
- checkpoints: blocked range confirmation, active technical review, completed release review
- knowledge entries: 8-10 high-signal entries across decisions, findings, context, and pitfalls
- dive-in views, breadcrumb behavior, selection URLs, sibling dependency edges, and peripheral dependency stubs

## E2E Contract

Playwright canvas tests should target the single semantic demo project by stable UUIDs. Test assertions should prefer behavior and stable semantic nodes over old fixture names such as Compact, Dive-in, Backend, and Frontend.
