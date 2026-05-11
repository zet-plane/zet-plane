# Agent Orchestrator — 设计文档

**日期**：2026-05-11
**状态**：待实现
**基于**：[架构文档](../../architecture.md) · [Scaffold Graph Engine 设计](./2026-05-04-scaffold-graph-engine-design.md) · [Knowledge Engine 设计](./2026-05-05-knowledge-engine-design.md)

---

## 一、定位与边界

Agent Orchestrator 是 Zet Plane 服务端唯一主动的智能层。它的工作是把项目过程中发生的事件转化为可审计的 Graph / Knowledge 变更，以及在置信度不足时生成待人工确认的草稿。

**它做什么：**
- 消费事件，决定是否值得分析、如何锚定、是否沉淀为知识
- 通过 SkillRegistry 加载行为指南，调用 LLM 做语义推理，产出结构化的 `ProjectUnderstandingDelta`
- 通过受控的 Action Executor 写回 Graph Engine / Knowledge Engine
- 对每一次智能动作留下可追溯的 Task 记录和 Action Log

**它不做什么：**
- 不直接写 Prisma（所有写回必须经过领域服务）
- 不调用外部 API、不发评论、不合并 PR、不删节点
- 不替人做 checkpoint 最终判决（只生成草稿）
- 不做多 Agent 协作，当前阶段是单 Agent Runtime
- 不做 Agent Client 接入（端侧 Agent 不在范围内）

---

## 二、分层架构图

### 外部视角：Orchestrator 在系统中的位置

```
┌─────────────────────────────────────────────┐
│  外部事件源                                   │
│  GitHub · Feishu · Claude Code Hook · ...    │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│  Adapter Layer  （归一化，核心逻辑不感知来源）  │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│  Event Pipeline                             │
│  Ingest → Deduplicate → Enrich → Route      │
└──────┬──────────────────────────┬───────────┘
       │ 确定性变更                 │ 需语义分析
       ▼                           ▼
┌─────────────┐        ┌──────────────────────┐
│ Graph Engine│        │  Agent Orchestrator  │ ← 本文档范围
│ Knowledge   │        │                      │
│ Engine      │        │  读：Graph / Knowledge│
│ （直接写入） │        │  写：经 Executor 回写 │
└─────────────┘        └──────────────────────┘
```

> **MVP 阶段说明**：Event Pipeline 尚未建立，Orchestrator Ingress 临时直接订阅 `graph-events` 和 `knowledge-events` 队列。Event Pipeline 建好后接管路由职责，Orchestrator 内部无需改动。

### 内部视角：Orchestrator 模块分层

```
┌─────────────────────────────────────────────┐
│  Ingress Layer                              │
│  OrchestratorRouter · TaskScheduler        │
│  订阅上游事件，生成 idempotency key，         │
│  创建 Task 记录并投递 BullMQ                  │
└──────────────────────┬──────────────────────┘
                       │  orchestrator-tasks 队列
                       ▼
┌─────────────────────────────────────────────┐
│  Runtime Layer                              │
│  AgentRuntimeService · TaskRunner           │
│  load task → build context → run handler   │
│  → execute actions → persist result        │
└───────┬──────────────┬────────────┬─────────┘
        │              │            │
        ▼              ▼            ▼
┌──────────────┐ ┌──────────┐ ┌───────────────┐
│ Context Layer│ │LLM Layer │ │ Action Layer  │
│ ContextBuilder│ │LlmClient │ │ ActionExecutor│
│ 读 Graph /   │ │Skill     │ │ PolicyGate    │
│ Knowledge /  │ │Registry  │ │ 动作分级写回  │
│ Task history │ │Output    │ │               │
│              │ │Validator │ │               │
└──────────────┘ └──────────┘ └───────┬───────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────┐
│  Repository Layer                           │
│  OrchestratorTaskRepository                 │
│  OrchestratorActionLogRepository            │
│  PostgreSQL                                 │
└─────────────────────────────────────────────┘
```

**分层约束：**
- Runtime Layer 是唯一的协调者，Context / LLM / Action 三层互不感知
- Action Layer 是唯一写回领域服务的出口，任何绕过 Executor 直接写 Graph / Knowledge 的行为都是违规
- Repository Layer 只属于 Orchestrator 自己的表，不直接查 Graph / Knowledge 的 Prisma model

---

## 三、执行链路总览

单次 task 的完整生命周期：

```
trigger
  │  上游事件（graph-events / knowledge-events / schedule / manual）
  ▼
[Ingress Layer]
  规则路由：按事件类型映射到 task type
  生成 idempotency key = hash(sourceType + ":" + sourceId + ":" + taskType)
  幂等检查：key 已存在 → skipped；不存在 → 创建 OrchestratorTask { status: 'pending' }
  投递 BullMQ job → orchestrator-tasks 队列
  │
  ▼
[Runtime Layer]  BullMQ Worker 消费
  Task status → 'running'
  │
  ├─▶ [Context Layer]
  │     按 task type 构造 OrchestratorContext
  │     读 Graph Engine（候选节点、子图）
  │     读 Knowledge Engine（相关条目、Staging Graph）
  │     读 Task history（同项目近期 task 摘要，来自 Task Store）
  │     → 写 task.contextSummary
  │
  ├─▶ [LLM Layer]（embedding task 跳过此步）
  │     SkillRegistry 查询适用 skill，拼入 system prompt
  │     RedactionService 脱敏上下文
  │     调用 LLM，要求结构化 JSON 输出
  │     StructuredOutputValidator 校验 schema
  │     ConfidenceGate：confidence < 0.6 → proposals 改为 to_staging / skip
  │     → 写 task.modelRequest / task.modelResult
  │
  └─▶ [Action Layer]
        遍历 ProjectUnderstandingDelta.proposals
        PolicyGate：校验权限、去重、人工审批门禁
        对每条 proposal：
          写 ActionLog { status: 'proposed' }
          调用 Graph Engine / Knowledge Engine 领域服务
          更新 ActionLog { status: 'applied' | 'rejected' | 'failed' }
        有需要级联的 task → 发新 BullMQ job 到 orchestrator-tasks
  │
  ▼
Task status → 'succeeded' | 'failed' | 'waiting_for_approval'
写 task.result / task.error
```

**三条终态路径：**

| 路径 | 触发条件 | 结果 |
|---|---|---|
| `succeeded` | 所有 proposals 执行完毕 | Task + ActionLog 持久化 |
| `waiting_for_approval` | PolicyGate 要求人工确认 | 生成草稿，发通知，等待人工写回 |
| `failed` | LLM 输出不合法 / 领域服务报错 | 写错误原因，BullMQ 重试（超上限后终止） |

**Ingress 路由规则：**

| 上游事件 | 映射 task type |
|---|---|
| `graph.node.checkpoint_elevated` | `checkpoint` |
| `knowledge.entry.created` | `embedding` |
| `knowledge.entry.body_revised` | `embedding` |
| 外部 PR / commit / alert | `event_anchor` |
| 定时触发 | `digest` |

---

## 四、链路节点详解

### 4.1 触发层（Ingress）

两类触发源：

**事件触发**：`OrchestratorRouter` 作为 BullMQ Worker 订阅 `graph-events` 和 `knowledge-events` 队列，按路由规则映射到 task type。MVP 阶段只处理来自这两个队列的事件；未来由 Event Pipeline 统一接管后，Router 改为订阅 Event Pipeline 的输出队列，内部路由表不变。

**定时触发**：`TaskScheduler` 维护 cron 表达式，定期扫描项目状态，生成 `digest` 或 stuck-node scan task。

两者都经过同一个 `OrchestratorTaskPublisher`，统一做幂等检查和 Task 创建。

### 4.2 任务层（Task Store + Queue）

Task 是 Orchestrator 一切动作的最小可审计单元。BullMQ 负责调度，PostgreSQL 负责审计。

**Task 状态机：**

```
pending → running → succeeded
                  → failed        （BullMQ 重试，超过上限写 error）
                  → waiting_for_approval → succeeded（人工确认后）
         → skipped                （Ingress 幂等检查发现重复）
```

**幂等键生成：**
```
idempotencyKey = hash(sourceType + ":" + sourceId + ":" + taskType)
```

同一 source event 多次投递只创建一条 task 记录。

**重试策略，按失败类型区分：**

| 失败类型 | 处理方式 |
|---|---|
| LLM 调用超时 / 网络错误 | 直接重试 |
| LLM 输出 JSON 解析失败 | 重试（换 prompt 变体） |
| Schema 校验失败 | 重试（记录 schema 错误详情） |
| 领域服务写回失败（节点已 archived 等） | 不重试，写 `failed` + 错误原因 |

### 4.3 上下文层（Context Builder）

Context Builder 负责在 LLM 调用前构造确定性、无副作用的上下文包。所有 task 都通过它读取信息，Runtime 不允许自己散落调用领域服务。

```ts
interface OrchestratorContext {
  project: { id: string; name: string; status: string }
  trigger: { sourceType: string; sourceId: string; raw: JsonValue }
  candidateNodes: NodeSnapshot[]
  relatedEntries: KnowledgeEntrySnapshot[]
  recentTaskHistory: TaskHistorySnapshot[]  // 来自 Task Store，MVP 阶段替代 Event Store
  subgraph?: GraphSnapshot
  constraints: {
    mayWriteGraph: boolean           // 由 Project.status 决定（非 active 时禁写）
    mayWriteKnowledge: boolean       // 同上
    requiresHumanApproval: boolean   // 由 task type 决定（checkpoint 始终为 true）
  }
}
```

**按 task type 的上下文窗口：**

| Task | 读什么 |
|---|---|
| `event_anchor` | trigger 原文、Graph 候选节点（规则预筛）、相关 KnowledgeEntry、已有 Staging Graph 节点 |
| `sedimentation` | trigger 原文、锚定节点详情、相邻 task 摘要、相似 KnowledgeEntry（防重复沉淀） |
| `graph_growth` | 当前节点结构、近期主题聚类、已有 `type=growth` 节点 |
| `checkpoint` | 环路径节点详情、相关 KnowledgeEntry、近期 task 摘要、历史 checkpoint 记录 |
| `embedding` | KnowledgeEntry 当前 body、entry id、project id（仅此） |
| `digest` | 时间窗口内的 task 摘要、节点状态变化、知识更新记录 |

**Token budget 控制**：每个 task type 设定最大 token 预算，超出时按优先级截断：trigger 原文 > 锚定节点 > 相关条目 > 历史摘要。截断策略在 ContextBuilder 里硬编码，不由 LLM 决定。

### 4.4 推理层（LLM Client + SkillRegistry）

推理层只提供受限的结构化接口。核心机制是 SkillRegistry——通过加载本地 skill 文件，向 LLM 注入操作特定的行为指南。

**SkillRegistry**

启动时扫描 `src/orchestrator/skills/` 目录，按 frontmatter 索引所有 skill 文件。

Skill 文件格式：
```markdown
---
name: knowledge-sedimentation
description: 教导 agent 如何将事件转化为知识条目
applicable_tasks: [sedimentation]
---

## 知识沉淀原则
...
```

每次 task 执行时，Runtime 查询 `applicable_tasks` 匹配的所有 skill，按顺序拼入 system prompt，再附上上下文数据作为 user prompt。多个 skill 可同时适用于一个 task（如 `event_anchor` 同时加载 `event-anchoring` 和 `github-pr-reading` skill）。

**输出合约 — `ProjectUnderstandingDelta`**

所有 LLM 输出必须符合此 schema，否则触发重试：

```ts
interface ProjectUnderstandingDelta {
  summary: string
  signalType: 'progress' | 'blocker' | 'decision' | 'risk' | 'learning' | 'noise'
  confidence: number   // 0-1
  evidence: Array<{
    sourceType: 'node' | 'knowledge_entry' | 'task'
    sourceId: string
    note: string
  }>
  proposals: OrchestratorActionProposal[]
}
```

**置信度门控（两个层次）**：
- `ProjectUnderstandingDelta.confidence`（整体置信度）< 0.6 时，所有 proposals 整体降级为 `to_staging` / `skip`，不再逐条执行
- `OrchestratorActionProposal.confidence`（单条置信度）由 PolicyGate 在动作层按 action 类型做二次判断（见 §4.5 执行策略表）

**模型路由：**

| Task | 模型策略 |
|---|---|
| `embedding` | embedding model，不走 chat |
| `event_anchor` / `sedimentation` / `graph_growth` | 轻量模型（Haiku 级别） |
| `checkpoint` / `digest` | 强模型（Sonnet 级别） |

### 4.5 动作层（Action Executor）

Action Executor 是唯一合法的写回出口。`proposals` 只是建议，必须经过这一层才能变成真实的系统状态变更。

**执行流程：**
```
proposal
  → PolicyGate（权限 + 去重 + 人工审批门禁）
  → 写 ActionLog { status: 'proposed' }
  → 调用领域服务
  → 更新 ActionLog { status: 'applied' | 'rejected' | 'failed' }
```

**ActionType 与执行策略：**

| Action | 目标 | 执行策略 |
|---|---|---|
| `write_embedding` | KnowledgeEntry | 自动执行 |
| `anchor_to_node` | Node | confidence ≥ 0.8 自动；否则 `to_staging` |
| `create_knowledge_entry` | KnowledgeEntry（新） | 高置信度自动；低置信度生成草稿 |
| `revise_knowledge_entry` | KnowledgeEntry（已有） | 默认生成草稿，需人工确认 |
| `create_growth_node` | Node（type=growth） | 高置信度自动；否则进 Staging Graph |
| `create_edge` | Edge | 高置信度且无环检测风险时自动 |
| `to_staging` | Staging Graph | 自动（在 KE Staging Graph 下创建草稿） |
| `notify_human` | 通知 | 自动发送 |
| `skip` | — | 记录原因，不做任何写回 |

**PolicyGate 做三件事：**
1. **权限校验**：task type 是否有权执行该 action（如 `embedding` task 只允许 `write_embedding`）
2. **去重**：同 projectId + 同主题的 KnowledgeEntry 或 growth node 已存在时，改为 `revise` 而非重复 `create`
3. **人工审批门禁**：`revise_knowledge_entry` 和 checkpoint 相关 action 默认进入 `waiting_for_approval`

**Staging 说明**：`to_staging` action 直接调用 Knowledge Engine 的 Staging Graph API，在 Staging Graph 节点下创建草稿 KnowledgeEntry 或 `type=growth` 的临时子节点。Orchestrator 没有独立的 Staging 缓冲区。

**级联 task**：
- `create_knowledge_entry` 成功 → 发 `embedding` task
- `revise_knowledge_entry` 人工确认后 → 发 `embedding` task

### 4.6 审计层（Task Store + Action Log）

审计层保证系统的每次智能动作都可追溯：用户问"这条知识为什么出现"，能完整回答——来自哪个事件、哪个 task、哪次模型输出、经过了哪些 action、最终写回了什么。

**回溯查询路径：**

| 问题 | 查询路径 |
|---|---|
| 这条知识从哪来？ | `KnowledgeEntry.id` → `ActionLog.targetId` → `Task.modelResult` + `Task.input` |
| 这个节点为什么被创建？ | `Node.id` → `ActionLog.targetId` → `Task.sourceId`（原始事件） |
| 为什么没有自动写入？ | `ActionLog.status=rejected` + `ActionLog.reason` |
| 模型说了什么？ | `Task.modelResult`（完整 `ProjectUnderstandingDelta`） |

---

## 五、Task 类型手册

每种 task 表达一种产品意图，是单 Agent Runtime 内的职责拆分，不是多 Agent 协作。

### `event_anchor` — 判断事件归属

| 项 | 内容 |
|---|---|
| 触发 | 外部 PR / commit / alert / chat 等非确定性事件 |
| 上下文 | trigger 原文、候选节点（规则预筛）、Staging Graph 现有节点、相关 KnowledgeEntry |
| Skills | `event-anchoring` + 事件源特定 skill（如 `github-pr-reading`） |
| LLM 目标 | 判断事件锚定到哪个节点，或进 Staging，或 skip |
| 典型 proposals | `anchor_to_node` / `to_staging` / `skip` |
| 级联 | 锚定成功且有沉淀价值 → 发 `sedimentation` task |

### `sedimentation` — 沉淀为知识条目

| 项 | 内容 |
|---|---|
| 触发 | `event_anchor` 成功后由 Action Executor 级联发起 |
| 上下文 | trigger 原文、锚定节点、相邻 task 摘要、相似 KnowledgeEntry（防重复） |
| Skills | `knowledge-sedimentation` + `node-lifecycle` |
| LLM 目标 | 生成 KnowledgeEntry 草稿（title / body / category） |
| 典型 proposals | `create_knowledge_entry` / `revise_knowledge_entry` / `skip` |
| 级联 | `create_knowledge_entry` 成功 → 发 `embedding` task |

### `graph_growth` — 判断是否需要新节点

| 项 | 内容 |
|---|---|
| 触发 | 定时扫描发现新子问题；MVP 阶段不做级联触发，独立运行 |
| 上下文 | 当前节点结构、近期主题聚类、已有 `type=growth` 节点 |
| Skills | `graph-growth` + `node-lifecycle` |
| LLM 目标 | 判断是否需要创建 `type=growth` 节点或补充边 |
| 典型 proposals | `create_growth_node` / `create_edge` / `to_staging` / `skip` |
| 级联 | 无 |

### `checkpoint` — 为阻塞节点生成判决草稿

| 项 | 内容 |
|---|---|
| 触发 | `graph.node.checkpoint_elevated` 事件 |
| 上下文 | 环路径节点详情、相关 KnowledgeEntry、近期 task 摘要、历史 checkpoint 记录 |
| Skills | `checkpoint-analysis` |
| LLM 目标 | 生成背景摘要、风险分析、可选判决草稿（continue \| loop） |
| 典型 proposals | `create_knowledge_entry`（category=decision，草稿）+ `notify_human` |
| 约束 | 禁止 `anchor_to_node` / 直接写 resolution；判决必须人工通过 Graph Engine API 提交 |

### `embedding` — 生成向量

| 项 | 内容 |
|---|---|
| 触发 | `knowledge.entry.created` / `knowledge.entry.body_revised`，或 `sedimentation` 级联 |
| 上下文 | KnowledgeEntry 当前 body（仅此） |
| Skills | 无（不走 chat LLM） |
| LLM | 直接调 embedding model |
| 典型 proposals | `write_embedding` |
| 级联 | 无 |

### `digest` — 生成摘要报告

| 项 | 内容 |
|---|---|
| 触发 | 定时（日报 / 周报 / 接手摘要） |
| 上下文 | 时间窗口内的 task 摘要、节点状态变化、知识更新记录 |
| Skills | `digest-generation` |
| LLM 目标 | 生成可读的进展摘要 |
| 典型 proposals | `notify_human`（附摘要内容） |
| 约束 | 不修改任何 Graph / Knowledge 状态 |

---

## 六、关键数据结构

所有类型集中定义在 `src/orchestrator/types.ts`。

```ts
// ─── Task ────────────────────────────────────────────────

type OrchestratorTaskType =
  | 'event_anchor'
  | 'sedimentation'
  | 'graph_growth'
  | 'checkpoint'
  | 'embedding'
  | 'digest'

type OrchestratorTaskStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'waiting_for_approval'

interface OrchestratorTask {
  id: string
  projectId: string
  type: OrchestratorTaskType
  sourceType: 'graph_event' | 'knowledge_event' | 'schedule' | 'manual'
  sourceId: string
  status: OrchestratorTaskStatus
  idempotencyKey: string
  input: JsonValue
  contextSummary?: JsonValue
  modelRequest?: JsonValue
  modelResult?: JsonValue
  result?: JsonValue
  error?: JsonValue
  createdAt: Date
  updatedAt: Date
}

// ─── Action ──────────────────────────────────────────────

type ActionType =
  | 'write_embedding'
  | 'anchor_to_node'
  | 'create_knowledge_entry'
  | 'revise_knowledge_entry'
  | 'create_growth_node'
  | 'create_edge'
  | 'to_staging'
  | 'notify_human'
  | 'skip'

interface OrchestratorActionProposal {
  action: ActionType
  targetType?: 'node' | 'edge' | 'knowledge_entry' | 'notification'
  targetId?: string
  payload: JsonValue
  confidence: number   // 0-1
  reason: string
}

interface OrchestratorActionLog {
  id: string
  taskId: string
  action: ActionType
  status: 'proposed' | 'applied' | 'rejected' | 'failed'
  targetType?: 'node' | 'edge' | 'knowledge_entry' | 'notification'
  targetId?: string
  proposal: JsonValue
  executionResult?: JsonValue
  reason?: string
  createdAt: Date
}

// ─── LLM 输出 ────────────────────────────────────────────

type SignalType =
  | 'progress' | 'blocker' | 'decision'
  | 'risk'     | 'learning' | 'noise'

interface ProjectUnderstandingDelta {
  summary: string
  signalType: SignalType
  confidence: number
  evidence: Array<{
    sourceType: 'node' | 'knowledge_entry' | 'task'
    sourceId: string
    note: string
  }>
  proposals: OrchestratorActionProposal[]
}

// ─── Context ─────────────────────────────────────────────

interface OrchestratorContext {
  project: { id: string; name: string; status: string }
  trigger: { sourceType: string; sourceId: string; raw: JsonValue }
  candidateNodes: NodeSnapshot[]
  relatedEntries: KnowledgeEntrySnapshot[]
  recentTaskHistory: TaskHistorySnapshot[]
  subgraph?: GraphSnapshot
  constraints: {
    mayWriteGraph: boolean
    mayWriteKnowledge: boolean
    requiresHumanApproval: boolean
  }
}
```

---

## 七、模块目录

文件结构从执行链路推导，每个文件职责单一：

```
src/orchestrator/
├── types.ts                               # 所有类型定义（§六）
├── orchestrator.module.ts
│
├── skills/                                # Skill 文件目录（本地 Markdown）
│   ├── event-anchoring.md
│   ├── knowledge-sedimentation.md
│   ├── node-lifecycle.md
│   ├── graph-growth.md
│   ├── checkpoint-analysis.md
│   ├── digest-generation.md
│   └── github-pr-reading.md              # 事件源特定 skill
│
├── ingress/                               # 触发层
│   ├── orchestrator-router.service.ts    # 订阅 graph-events / knowledge-events，映射 task type
│   └── task-scheduler.service.ts         # cron 定时触发
│
├── queue/                                 # 任务层
│   ├── orchestrator-task.publisher.ts    # 幂等检查 + 创建 Task + 投递 BullMQ
│   └── orchestrator-task.worker.ts       # BullMQ Worker，消费 orchestrator-tasks
│
├── runtime/                               # Runtime 层（协调者）
│   ├── agent-runtime.service.ts          # 主流程：load → context → llm → action → persist
│   ├── task-runner.service.ts            # 按 task type 分发到对应 handler
│   └── policy-gate.service.ts            # 权限 + 去重 + 人工审批门禁
│
├── context/                               # 上下文层
│   ├── context-builder.service.ts        # 统一入口，按 task type 组装上下文
│   ├── graph-context.reader.ts           # 查 Graph Engine（节点 / 子图 / 候选节点）
│   └── knowledge-context.reader.ts       # 查 Knowledge Engine（相关条目 / Staging Graph）
│
├── llm/                                   # 推理层
│   ├── llm-client.ts                      # 模型调用 + 重试
│   ├── skill-registry.ts                  # 扫描 skills/ 目录，按 task type 查询适用 skill
│   ├── structured-output.validator.ts     # JSON schema 校验
│   └── redaction.service.ts               # 调用前脱敏
│
├── actions/                               # 动作层
│   ├── action-executor.service.ts        # 遍历 proposals，调用各 executor
│   ├── graph-action.executor.ts          # 写 Graph Engine（节点 / 边）
│   ├── knowledge-action.executor.ts      # 写 Knowledge Engine（条目 / embedding / staging）
│   └── notification-action.executor.ts   # 发通知
│
├── tasks/                                 # Task handler（每种 task 的具体逻辑）
│   ├── event-anchor.task.ts
│   ├── sedimentation.task.ts
│   ├── graph-growth.task.ts
│   ├── checkpoint.task.ts
│   ├── embedding.task.ts
│   └── digest.task.ts
│
└── repository/                            # 审计层
    ├── orchestrator-task.repository.ts
    └── orchestrator-action-log.repository.ts
```

---

## 八、MVP 验收标准

第一阶段按以下顺序实现，每步可独立验收：

| 步骤 | 内容 | 验收标准 |
|---|---|---|
| 1 | Prisma model + migration | `OrchestratorTask` 和 `OrchestratorActionLog` 表建好，字段齐全 |
| 2 | `OrchestratorTaskPublisher` | 相同 idempotency key 重复调用只创建一条 task 记录 |
| 3 | BullMQ Worker + AgentRuntimeService 骨架 | task 能从 `pending` 跑到 `succeeded` / `failed`，状态有记录 |
| 4 | `embedding` task | KnowledgeEntry 创建后自动生成 embedding 并写回 Knowledge Engine |
| 5 | `event_anchor` task | 外部事件能锚定到节点 / 进 Staging / skip，每次都有完整 task + action log |
| 6 | `sedimentation` task | `event_anchor` 成功后自动触发，生成 KnowledgeEntry 草稿或正式条目 |
| 7 | `checkpoint` task | `graph.node.checkpoint_elevated` 触发后生成摘要草稿 + 人工确认通知，不自动写 resolution |

**横向验收标准（贯穿所有步骤）：**
- 同一 source event 重复投递不重复创建知识或节点
- LLM 输出不符合 schema 时不写回任何内容
- `confidence < 0.6` 的 proposals 不进入正式 Graph / Knowledge
- 每次 action 都有 ActionLog 记录，包括 skip 和 rejected
