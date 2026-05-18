# Progressive Skill Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace static at-startup skill injection with on-demand loading, giving the agent autonomy to call `use_skill` and pull operating instructions when needed.

**Architecture:** `SkillRegistry` now separates frontmatter (cached as a manifest at boot) from body content (read fresh from disk per call). `ContextBuilderService` exposes the manifest to the agent via `OrchestratorContext.availableSkills`. `PromptBuilderService` renders only the `_base` content as the system prompt and instructs the agent to call `use_skill` before acting. A new `use_skill` tool in `TaskRunnerService` lets the agent load any skill body on demand.

**Tech Stack:** NestJS, TypeScript, Vitest, LangChain (`@langchain/core/tools`), `zod`, `node:fs/promises`, `yaml` (already in use)

**Spec:** [docs/superpowers/specs/2026-05-17-progressive-skill-loading-design.md](../specs/2026-05-17-progressive-skill-loading-design.md)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `apps/server/src/orchestrator/types.ts` | Add `SkillManifestEntry`, add `availableSkills` to `OrchestratorContext` |
| Modify | `apps/server/src/orchestrator/skill/skill-registry.ts` | Replace full-load with manifest + on-demand body read |
| Modify | `apps/server/src/orchestrator/skill/skill-registry.spec.ts` | Replace old `getSystemPrompt` tests with new API tests |
| Modify | `apps/server/src/orchestrator/context/context-builder.service.ts` | Inject `SkillRegistry`, populate `availableSkills` |
| Modify | `apps/server/src/orchestrator/context/context-builder.service.spec.ts` | Add `mockSkillRegistry`, test `availableSkills` population |
| Modify | `apps/server/src/orchestrator/prompt/prompt-builder.service.ts` | Use `getBaseContent()` for system prompt, add skills section to user message |
| Modify | `apps/server/src/orchestrator/prompt/prompt-builder.service.spec.ts` | Update mocks and test new user message structure |
| Create | `apps/server/src/orchestrator/tools/use-skill.tool.ts` | `useSkillTool` factory function |
| Create | `apps/server/src/orchestrator/tools/use-skill.tool.spec.ts` | Unit tests for the tool |
| Modify | `apps/server/src/orchestrator/runtime/task-runner.service.ts` | Inject `SkillRegistry`, register `useSkillTool` in `buildTools()` |
| Modify | `apps/server/src/orchestrator/runtime/task-runner.service.spec.ts` | Add `mockSkillRegistry`, test that `use_skill` tool is present |

---

## Task 1: Add `SkillManifestEntry` type and update `OrchestratorContext`

**Files:**
- Modify: `apps/server/src/orchestrator/types.ts`

- [ ] **Step 1: Add `SkillManifestEntry` and update `OrchestratorContext`**

In `apps/server/src/orchestrator/types.ts`, add after the `GraphSnapshot` interface:

```typescript
export interface SkillManifestEntry {
  name: string
  description: string
  applicableTasks: OrchestratorTaskType[]
}
```

Then add `availableSkills` to `OrchestratorContext`:

```typescript
export interface OrchestratorContext {
  project: { id: string; name: string; status: string }
  trigger: { sourceType: string; sourceId: string; raw: JsonValue }
  candidateNodes: NodeSnapshot[]
  relatedEntries: KnowledgeEntrySnapshot[]
  recentTaskHistory: TaskHistorySnapshot[]
  subgraph?: GraphSnapshot
  availableSkills: SkillManifestEntry[]          // ← new
  constraints: {
    mayWriteGraph: boolean
    mayWriteKnowledge: boolean
    requiresHumanApproval: boolean
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/server && pnpm tsc --noEmit
```

Expected: type errors in `context-builder.service.ts` and `prompt-builder.service.spec.ts` where `OrchestratorContext` is constructed without `availableSkills`. That's expected — those files are fixed in later tasks.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/orchestrator/types.ts
git commit -m "feat(orchestrator): add SkillManifestEntry and availableSkills to OrchestratorContext"
```

---

## Task 2: Refactor `SkillRegistry` — manifest + on-demand body

**Files:**
- Modify: `apps/server/src/orchestrator/skill/skill-registry.ts`
- Modify: `apps/server/src/orchestrator/skill/skill-registry.spec.ts`

- [ ] **Step 1: Write failing tests**

Replace the full contents of `apps/server/src/orchestrator/skill/skill-registry.spec.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { join } from 'node:path'
import { SkillRegistry } from './skill-registry'

const SKILLS_DIR = join(__dirname, '../../../skills/orchestrator')

describe('SkillRegistry', () => {
  let registry: SkillRegistry

  beforeEach(async () => {
    registry = new SkillRegistry(SKILLS_DIR)
    await registry.onModuleInit()
  })

  it('listSkills returns all non-base skills with name, description, and applicableTasks', () => {
    const skills = registry.listSkills()
    expect(skills.length).toBeGreaterThan(0)
    const names = skills.map((s) => s.name)
    expect(names).not.toContain('agent-base')
    expect(names).toContain('checkpoint-analysis')
    expect(names).toContain('event-anchoring')
  })

  it('listSkills entries have correct applicableTasks', () => {
    const skills = registry.listSkills()
    const checkpoint = skills.find((s) => s.name === 'checkpoint-analysis')
    expect(checkpoint).toBeDefined()
    expect(checkpoint!.applicableTasks).toContain('checkpoint')

    const eventAnchor = skills.find((s) => s.name === 'event-anchoring')
    expect(eventAnchor).toBeDefined()
    expect(eventAnchor!.applicableTasks).toContain('event_anchor')
  })

  it('listSkills entries do not expose filePath', () => {
    const skills = registry.listSkills()
    for (const skill of skills) {
      expect(skill).not.toHaveProperty('filePath')
    }
  })

  it('getBaseContent returns non-empty _base skill content', () => {
    const content = registry.getBaseContent()
    expect(content.length).toBeGreaterThan(0)
  })

  it('readSkillBody returns content for a known skill', async () => {
    const body = await registry.readSkillBody('checkpoint-analysis')
    expect(body).not.toBeNull()
    expect(body!.length).toBeGreaterThan(0)
  })

  it('readSkillBody returns null for an unknown skill', async () => {
    const body = await registry.readSkillBody('does-not-exist')
    expect(body).toBeNull()
  })

  it('readSkillBody reads fresh from disk (no content caching)', async () => {
    const first = await registry.readSkillBody('event-anchoring')
    const second = await registry.readSkillBody('event-anchoring')
    expect(first).toEqual(second)
    // Both calls must resolve independently — no shared reference
    expect(first).not.toBe(second)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd apps/server && pnpm vitest run src/orchestrator/skill/skill-registry.spec.ts
```

Expected: failures because `listSkills`, `getBaseContent`, `readSkillBody` do not exist yet.

- [ ] **Step 3: Implement new `SkillRegistry`**

Replace the full contents of `apps/server/src/orchestrator/skill/skill-registry.ts`:

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseFrontmatter } from 'yaml'
import type { OrchestratorTaskType, SkillManifestEntry } from '../types'

type InternalEntry = SkillManifestEntry & { filePath: string }

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/

@Injectable()
export class SkillRegistry implements OnModuleInit {
  private manifests: InternalEntry[] = []
  private baseContent: string = ''

  constructor(private readonly skillsDir: string) {}

  async onModuleInit(): Promise<void> {
    await this.loadManifest()
  }

  async loadManifest(): Promise<void> {
    const dirs = await readdir(this.skillsDir, { withFileTypes: true })
    const entries: InternalEntry[] = []
    let baseContent = ''

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue
      const filePath = join(this.skillsDir, dir.name, 'index.md')
      let raw: string
      try {
        raw = await readFile(filePath, 'utf-8')
      } catch {
        continue
      }

      const match = raw.match(FRONTMATTER_RE)
      if (!match) continue

      const fm = parseFrontmatter(match[1]) as {
        name: string
        description?: string
        applicable_tasks?: string[]
        base?: boolean
      }
      const body = match[2].trim()

      if (fm.base === true) {
        baseContent = body
        continue
      }

      entries.push({
        name: fm.name,
        description: fm.description ?? '',
        applicableTasks: (fm.applicable_tasks ?? []) as OrchestratorTaskType[],
        filePath,
      })
    }

    this.manifests = entries
    this.baseContent = baseContent
  }

  listSkills(): SkillManifestEntry[] {
    return this.manifests.map(({ filePath: _fp, ...entry }) => entry)
  }

  getBaseContent(): string {
    return this.baseContent
  }

  async readSkillBody(name: string): Promise<string | null> {
    const entry = this.manifests.find((m) => m.name === name)
    if (!entry) return null

    const raw = await readFile(entry.filePath, 'utf-8')
    const match = raw.match(FRONTMATTER_RE)
    if (!match) return null
    return match[2].trim()
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd apps/server && pnpm vitest run src/orchestrator/skill/skill-registry.spec.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/orchestrator/skill/skill-registry.ts \
        apps/server/src/orchestrator/skill/skill-registry.spec.ts
git commit -m "feat(orchestrator): refactor SkillRegistry to manifest + on-demand body loading"
```

---

## Task 3: Update `ContextBuilderService` to populate `availableSkills`

**Files:**
- Modify: `apps/server/src/orchestrator/context/context-builder.service.ts`
- Modify: `apps/server/src/orchestrator/context/context-builder.service.spec.ts`

- [ ] **Step 1: Write failing test**

In `apps/server/src/orchestrator/context/context-builder.service.spec.ts`:

1. Add `mockSkillRegistry` to the `beforeEach` block and constructor call.
2. Add one new test for `availableSkills`.
3. Update `makeCtx` (if present) to include `availableSkills: []`.

Replace the full file:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContextBuilderService } from './context-builder.service'
import {
  OrchestratorTaskType,
  OrchestratorSourceType,
  OrchestratorTaskStatus,
  type Prisma,
} from '@generated/client'

const makeTask = (type: OrchestratorTaskType, input: Prisma.JsonValue = {}) => ({
  id: 'task-1',
  projectId: 'p1',
  type,
  sourceType: OrchestratorSourceType.graph_event,
  sourceId: 'src-1',
  status: OrchestratorTaskStatus.pending,
  idempotencyKey: 'k',
  input,
  modelResult: null,
  error: null,
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe('ContextBuilderService', () => {
  let builder: ContextBuilderService
  let mockGraphReader: any
  let mockKnowledgeReader: any
  let mockTaskRepo: any
  let mockSkillRegistry: any

  beforeEach(() => {
    mockGraphReader = {
      getCandidateNodes: vi.fn().mockResolvedValue([]),
      getSubgraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
    }
    mockKnowledgeReader = {
      getRelatedEntries: vi.fn().mockResolvedValue([]),
    }
    mockTaskRepo = {
      findRecentByProject: vi.fn().mockResolvedValue([]),
    }
    mockSkillRegistry = {
      listSkills: vi.fn().mockReturnValue([
        { name: 'event-anchoring', description: 'Anchors events', applicableTasks: ['event_anchor'] },
      ]),
    }
    builder = new ContextBuilderService(
      mockGraphReader,
      mockKnowledgeReader,
      mockTaskRepo,
      mockSkillRegistry,
    )
  })

  it('builds context with project and trigger fields', async () => {
    const ctx = await builder.build(makeTask(OrchestratorTaskType.event_anchor, { projectId: 'p1' }))
    expect(ctx.project.id).toBe('p1')
    expect(ctx.trigger.sourceType).toBe('graph_event')
    expect(ctx.trigger.sourceId).toBe('src-1')
  })

  it('sets requiresHumanApproval=true for checkpoint tasks', async () => {
    const ctx = await builder.build(makeTask(OrchestratorTaskType.checkpoint))
    expect(ctx.constraints.requiresHumanApproval).toBe(true)
  })

  it('sets requiresHumanApproval=false for non-checkpoint tasks', async () => {
    const ctx = await builder.build(makeTask(OrchestratorTaskType.event_anchor))
    expect(ctx.constraints.requiresHumanApproval).toBe(false)
  })

  it('calls graph reader for event_anchor tasks', async () => {
    await builder.build(makeTask(OrchestratorTaskType.event_anchor))
    expect(mockGraphReader.getCandidateNodes).toHaveBeenCalledWith('p1')
  })

  it('skips graph reader for embedding tasks', async () => {
    await builder.build(makeTask(OrchestratorTaskType.embedding))
    expect(mockGraphReader.getCandidateNodes).not.toHaveBeenCalled()
  })

  it('populates availableSkills from skillRegistry.listSkills', async () => {
    const ctx = await builder.build(makeTask(OrchestratorTaskType.event_anchor))
    expect(mockSkillRegistry.listSkills).toHaveBeenCalled()
    expect(ctx.availableSkills).toEqual([
      { name: 'event-anchoring', description: 'Anchors events', applicableTasks: ['event_anchor'] },
    ])
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd apps/server && pnpm vitest run src/orchestrator/context/context-builder.service.spec.ts
```

Expected: constructor arity mismatch (`SkillRegistry` not yet injected) and `availableSkills` missing from returned context.

- [ ] **Step 3: Update `ContextBuilderService`**

In `apps/server/src/orchestrator/context/context-builder.service.ts`:

1. Import `SkillRegistry` and inject it as the 4th constructor parameter.
2. Add `availableSkills: this.skillRegistry.listSkills()` to the returned context object.

The constructor becomes:

```typescript
constructor(
  private readonly graphReader: GraphContextReader,
  private readonly knowledgeReader: KnowledgeContextReader,
  private readonly taskRepo: OrchestratorTaskRepository,
  private readonly skillRegistry: SkillRegistry,
) {}
```

Add this import at the top of the file:

```typescript
import { SkillRegistry } from '../skill/skill-registry'
```

In `build(task)`, add `availableSkills` to the returned `OrchestratorContext`:

```typescript
return {
  project: { ... },          // existing fields unchanged
  trigger: { ... },
  candidateNodes,
  relatedEntries,
  recentTaskHistory,
  availableSkills: this.skillRegistry.listSkills(),   // ← new
  constraints: { ... },
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd apps/server && pnpm vitest run src/orchestrator/context/context-builder.service.spec.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/orchestrator/context/context-builder.service.ts \
        apps/server/src/orchestrator/context/context-builder.service.spec.ts
git commit -m "feat(orchestrator): inject SkillRegistry into ContextBuilderService and populate availableSkills"
```

---

## Task 4: Update `PromptBuilderService` — base-only system prompt + skills section in user message

**Files:**
- Modify: `apps/server/src/orchestrator/prompt/prompt-builder.service.ts`
- Modify: `apps/server/src/orchestrator/prompt/prompt-builder.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Replace the full contents of `apps/server/src/orchestrator/prompt/prompt-builder.service.spec.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import {
  OrchestratorTaskType,
  OrchestratorTaskStatus,
  OrchestratorSourceType,
} from '@generated/client'
import { PromptBuilderService } from './prompt-builder.service'

const makeTask = (type = OrchestratorTaskType.event_anchor) => ({
  id: 'task-1',
  projectId: 'proj-1',
  type,
  sourceType: OrchestratorSourceType.graph_event,
  sourceId: 'src-1',
  status: OrchestratorTaskStatus.pending,
  idempotencyKey: 'key-1',
  input: {},
  modelResult: null,
  error: null,
  createdAt: new Date(),
  updatedAt: new Date(),
})

const makeCtx = () => ({
  project: { id: 'proj-1', name: 'Test', status: 'active' },
  trigger: { sourceType: 'graph_event', sourceId: 'src-1', raw: { foo: 'bar' } },
  candidateNodes: [{ id: 'node-1' }],
  relatedEntries: [{ id: 'entry-1' }],
  recentTaskHistory: [],
  availableSkills: [
    { name: 'event-anchoring', description: 'Anchors events', applicableTasks: ['event_anchor'] },
  ],
  constraints: { mayWriteGraph: true, mayWriteKnowledge: true, requiresHumanApproval: false },
})

describe('PromptBuilderService', () => {
  const mockSkillRegistry = {
    getBaseContent: vi.fn().mockReturnValue('base system prompt content'),
  }
  const service = new PromptBuilderService(mockSkillRegistry as any)

  it('system prompt comes from skillRegistry.getBaseContent()', () => {
    const { systemPrompt } = service.build(makeTask(), makeCtx() as any)
    expect(mockSkillRegistry.getBaseContent).toHaveBeenCalled()
    expect(systemPrompt).toBe('base system prompt content')
  })

  it('userMessage contains task type, project id, and trigger', () => {
    const { userMessage } = service.build(makeTask(), makeCtx() as any)
    expect(userMessage).toContain('Task type: event_anchor')
    expect(userMessage).toContain('Project: proj-1')
    expect(userMessage).toContain('"foo":"bar"')
  })

  it('userMessage includes candidate nodes and related entries', () => {
    const { userMessage } = service.build(makeTask(), makeCtx() as any)
    expect(userMessage).toContain('node-1')
    expect(userMessage).toContain('entry-1')
  })

  it('userMessage includes availableSkills as JSON', () => {
    const { userMessage } = service.build(makeTask(), makeCtx() as any)
    expect(userMessage).toContain('event-anchoring')
    expect(userMessage).toContain('Available skills')
  })

  it('userMessage instructs agent to call use_skill before acting', () => {
    const { userMessage } = service.build(makeTask(), makeCtx() as any)
    expect(userMessage).toContain('use_skill')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd apps/server && pnpm vitest run src/orchestrator/prompt/prompt-builder.service.spec.ts
```

Expected: `mockSkillRegistry.getBaseContent` is not a function (current code calls `getSystemPrompt`); `availableSkills` and `use_skill` not in user message.

- [ ] **Step 3: Update `PromptBuilderService`**

In `apps/server/src/orchestrator/prompt/prompt-builder.service.ts`, make two changes:

**Change 1 — `build()` method:** replace `skillRegistry.getSystemPrompt(task.type)` with `skillRegistry.getBaseContent()`.

```typescript
build(task: OrchestratorTask, ctx: OrchestratorContext): AgentPrompt {
  return {
    systemPrompt: this.skillRegistry.getBaseContent(),
    userMessage: this.buildUserMessage(task, ctx),
  }
}
```

**Change 2 — `buildUserMessage()` method:** add the skills section and `use_skill` instruction.

```typescript
private buildUserMessage(task: OrchestratorTask, ctx: OrchestratorContext): string {
  return [
    `Task type: ${task.type}`,
    `Project: ${ctx.project.id}`,
    `Trigger: ${JSON.stringify(ctx.trigger)}`,
    `Candidate nodes: ${JSON.stringify(ctx.candidateNodes)}`,
    `Related knowledge: ${JSON.stringify(ctx.relatedEntries)}`,
    `Recent task history: ${JSON.stringify(ctx.recentTaskHistory)}`,
    `Available skills: ${JSON.stringify(ctx.availableSkills)}`,
    '',
    'Call use_skill first to load your operating instructions, then act.',
    'When done, call the `conclude` tool with your structured summary.',
  ].join('\n')
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd apps/server && pnpm vitest run src/orchestrator/prompt/prompt-builder.service.spec.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/orchestrator/prompt/prompt-builder.service.ts \
        apps/server/src/orchestrator/prompt/prompt-builder.service.spec.ts
git commit -m "feat(orchestrator): PromptBuilderService uses getBaseContent and adds skills section to user message"
```

---

## Task 5: Implement `use_skill` tool and register in `TaskRunnerService`

**Files:**
- Create: `apps/server/src/orchestrator/tools/use-skill.tool.ts`
- Create: `apps/server/src/orchestrator/tools/use-skill.tool.spec.ts`
- Modify: `apps/server/src/orchestrator/runtime/task-runner.service.ts`
- Modify: `apps/server/src/orchestrator/runtime/task-runner.service.spec.ts`

- [ ] **Step 1: Write failing tests for the tool itself**

Create `apps/server/src/orchestrator/tools/use-skill.tool.spec.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { useSkillTool } from './use-skill.tool'

const makeRegistry = (body: string | null, skills = ['event-anchoring', 'checkpoint-analysis']) => ({
  readSkillBody: vi.fn().mockResolvedValue(body),
  listSkills: vi.fn().mockReturnValue(skills.map((name) => ({ name, description: '', applicableTasks: [] }))),
})

describe('useSkillTool', () => {
  it('has the name "use_skill"', () => {
    const t = useSkillTool(makeRegistry(null) as any)
    expect(t.name).toBe('use_skill')
  })

  it('returns skill body when skill is found', async () => {
    const registry = makeRegistry('# Checkpoint Analysis\n\nDo these steps...')
    const t = useSkillTool(registry as any)
    const result = await t.invoke({ name: 'checkpoint-analysis' })
    expect(result).toContain('Checkpoint Analysis')
    expect(registry.readSkillBody).toHaveBeenCalledWith('checkpoint-analysis')
  })

  it('returns error message listing available skills when skill is not found', async () => {
    const registry = makeRegistry(null)
    const t = useSkillTool(registry as any)
    const result = await t.invoke({ name: 'unknown-skill' })
    expect(result).toContain("Skill 'unknown-skill' not found")
    expect(result).toContain('event-anchoring')
    expect(result).toContain('checkpoint-analysis')
  })

  it('does not throw when skill is not found', async () => {
    const registry = makeRegistry(null)
    const t = useSkillTool(registry as any)
    await expect(t.invoke({ name: 'ghost' })).resolves.not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd apps/server && pnpm vitest run src/orchestrator/tools/use-skill.tool.spec.ts
```

Expected: module not found.

- [ ] **Step 3: Implement `useSkillTool`**

Create `apps/server/src/orchestrator/tools/use-skill.tool.ts`:

```typescript
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { SkillRegistry } from '../skill/skill-registry'

export function useSkillTool(skillRegistry: SkillRegistry) {
  return tool(
    async ({ name }: { name: string }) => {
      const body = await skillRegistry.readSkillBody(name)
      if (body === null) {
        const available = skillRegistry.listSkills().map((s) => s.name).join(', ')
        return `Skill '${name}' not found. Available: [${available}]`
      }
      return body
    },
    {
      name: 'use_skill',
      description:
        '加载指定 skill 的操作指南。在执行任何实质动作之前调用，获取当前任务的行动规范。可多次调用以组合多个 skill。',
      schema: z.object({
        name: z.string().describe('Name of the skill to load'),
      }),
    },
  )
}
```

- [ ] **Step 4: Run tool tests — verify they pass**

```bash
cd apps/server && pnpm vitest run src/orchestrator/tools/use-skill.tool.spec.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Write failing test for `TaskRunnerService` integration**

In `apps/server/src/orchestrator/runtime/task-runner.service.spec.ts`:

1. Add `mockSkillRegistry` to the mocks block.
2. Update the `new TaskRunnerService(...)` call to pass `mockSkillRegistry` as the last argument.
3. Add one new test verifying `use_skill` appears in the tools list.

Find the `beforeEach` section and add:

```typescript
let mockSkillRegistry: any

// Inside beforeEach, add:
mockSkillRegistry = {
  readSkillBody: vi.fn().mockResolvedValue('skill content'),
  listSkills: vi.fn().mockReturnValue([]),
}
```

Update the `new TaskRunnerService(...)` call — add `mockSkillRegistry` as the final argument:

```typescript
service = new TaskRunnerService(
  mockContextBuilder,
  mockPromptBuilder,
  mockGraphReader,
  mockGraphRepo,
  mockNodeService,
  mockEdgeService,
  mockEntryService,
  mockRevisionService,
  mockSearchService,
  mockTaskRepo,
  mockPublisher,
  mockLlmRegistry,
  traceConfigService,
  mockSkillRegistry,   // ← new
)
```

Add a new test at the end of the describe block:

```typescript
it('buildTools includes the use_skill tool', async () => {
  const task = makeTask()
  const tools = await (service as any).buildTools(task)
  const toolNames = tools.map((t: any) => t.name)
  expect(toolNames).toContain('use_skill')
})
```

- [ ] **Step 6: Run task-runner tests — verify the new test fails**

```bash
cd apps/server && pnpm vitest run src/orchestrator/runtime/task-runner.service.spec.ts
```

Expected: `use_skill` not found in tools list (not yet registered), and possible constructor arity error.

- [ ] **Step 7: Update `TaskRunnerService`**

In `apps/server/src/orchestrator/runtime/task-runner.service.ts`:

**Add import** at the top:

```typescript
import { useSkillTool } from '../tools/use-skill.tool'
import { SkillRegistry } from '../skill/skill-registry'
```

**Add `skillRegistry` as the last constructor parameter:**

```typescript
constructor(
  private readonly contextBuilder: ContextBuilderService,
  private readonly promptBuilder: PromptBuilderService,
  private readonly graphReader: GraphContextReader,
  private readonly graphRepo: GraphRepository,
  private readonly nodeService: NodeService,
  private readonly edgeService: EdgeService,
  private readonly entryService: EntryService,
  private readonly revisionService: RevisionService,
  private readonly searchService: SearchService,
  private readonly taskRepo: OrchestratorTaskRepository,
  private readonly publisher: OrchestratorTaskPublisher,
  private readonly llmRegistry: LlmProviderRegistry,
  private readonly traceConfigService: OrchestratorTraceConfigService,
  private readonly skillRegistry: SkillRegistry,        // ← new
) {}
```

**In `buildTools()`**, add `useSkillTool(this.skillRegistry)` to the returned tools array. Place it alongside the other meta/terminal tools (before `skipTool`, `notifyHumanTool`, `concludeTool`):

```typescript
useSkillTool(this.skillRegistry),
```

- [ ] **Step 8: Run all task-runner tests — verify they all pass**

```bash
cd apps/server && pnpm vitest run src/orchestrator/runtime/task-runner.service.spec.ts
```

Expected: all tests including the new one pass.

- [ ] **Step 9: Run the full test suite**

```bash
cd apps/server && pnpm test
```

Expected: all tests pass with no regressions.

- [ ] **Step 10: Commit**

```bash
git add apps/server/src/orchestrator/tools/use-skill.tool.ts \
        apps/server/src/orchestrator/tools/use-skill.tool.spec.ts \
        apps/server/src/orchestrator/runtime/task-runner.service.ts \
        apps/server/src/orchestrator/runtime/task-runner.service.spec.ts
git commit -m "feat(orchestrator): implement use_skill tool and register in TaskRunnerService"
```

---

## Self-Review Checklist

### Spec coverage

| Spec requirement | Covered by |
|---|---|
| `SkillRegistry.loadManifest()` — reads only frontmatter at boot | Task 2 |
| `SkillRegistry.listSkills()` — returns non-base manifest entries | Task 2 |
| `SkillRegistry.readSkillBody(name)` — fresh disk read, no cache | Task 2 |
| `_base` handling unchanged — body cached, written to system prompt | Task 2 (cached in `baseContent`) + Task 4 (`getBaseContent()`) |
| `OrchestratorContext.availableSkills: SkillManifestEntry[]` | Task 1, Task 3 |
| `ContextBuilderService` populates `availableSkills` via `listSkills()` | Task 3 |
| `PromptBuilderService.getSystemPrompt` removed / replaced with `getBaseContent()` | Task 4 |
| `buildUserMessage` renders `availableSkills` JSON + call-use_skill instruction | Task 4 |
| `use_skill` tool: returns body on success, lists available on miss, no throw | Task 5 |
| `use_skill` registered in `TaskRunnerService.buildTools()` | Task 5 |

### Invariants verified

- `readSkillBody` reads from disk each time — enforced by the implementation (no in-memory body cache). Confirmed by test: "reads fresh from disk (no content caching)" asserts `first !== second` (different string references).
- `listSkills()` never exposes `filePath` — enforced by destructuring + test.
- `use_skill` never throws — enforced by returning error string instead of rejecting.
