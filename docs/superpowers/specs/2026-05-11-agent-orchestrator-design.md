# Agent Orchestrator — 设计文档

**日期**：2026-05-11
**状态**：待实现
**基于**：[架构文档](../../architecture.md) · [Scaffold Graph Engine 设计](./2026-05-04-scaffold-graph-engine-design.md) · [Knowledge Engine 设计](./2026-05-05-knowledge-engine-design.md)

---

## 一、定位与边界

Agent Orchestrator 是 Zet Plane 服务端唯一主动的智能层。它的工作是把项目过程中发生的事件做语义路由：垃圾消息直接丢弃、有意义但归属不明的信息暂存 Staging、有清晰锚点的事件直接写入 Graph / Knowledge、需要人工判断的情况通知人工。

**它做什么：**
- 消费事件，通过 agentic loop 自主分析、锚定节点、沉淀知识、管理节点流转
- 通过 SkillRegistry 加载行为指南，驱动 LLM 在 loop 中调用工具完成自动化操作
- 写工具内部强制领域规则（去重、权限、状态护栏）并写入 ActionLog，是审计的唯一来源
- 对每一次智能动作留下可追溯的 Task 记录和 ActionLog

**它不做什么：**
- 不直接写 Prisma（所有写回必须经过领域服务的写工具）
- 不调用外部 API、不发评论、不合并 PR
- 不删除节点、不归档节点（破坏性操作不提供工具）
- 不替人做 checkpoint 最终判决（只通知人工，resolution 由人通过 Graph Engine API 提交）
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
                 │ 需语义分析
                 ▼
        ┌──────────────────────┐
        │  Agent Orchestrator  │ ← 本文档范围
        │                      │
        │  读/写：通过工具调用  │
        │  工具内部强制领域规则  │
        └──────────────────────┘
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
│  （handler 内驱动 agentic loop）→ persist  │
└───────┬──────────────┬────────────┬─────────┘
        │              │            │
        ▼              ▼            ▼
┌──────────────┐ ┌────────────────────────────────────┐
│ Context Layer│ │  LLM Layer（Agentic Loop）          │
│ ContextBuilder│ │  LlmClient · SkillRegistry         │
│ 初始上下文   │ │  OutputValidator · RedactionService │
│ 构造         │ │                                    │
└──────────────┘ └─────────────────┬──────────────────┘
                                   │ tool_use / final_response
                                   ▼
                  ┌────────────────────────────────────┐
                  │  Tool Layer                        │
                  │  Read Tools · Write Tools          │
                  │  每个写工具内部：                   │
                  │  规则校验 → 领域服务 → ActionLog   │
                  └───────────────┬────────────────────┘
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
- Runtime Layer 是唯一的协调者，驱动 agentic loop
- 写工具是写回领域服务的唯一出口，规则校验和 ActionLog 写入都在工具内部完成
- 不提供删除节点、resolve_checkpoint、外部写操作等工具——这些操作不在 agent 权限范围内
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
  │     按 task type 构造初始 OrchestratorContext（候选节点、相关条目、task 历史）
  │     RedactionService 脱敏
  │     → 写 task.contextSummary
  │
  └─▶ [Agentic Loop]（最多 MAX_ITERATIONS 轮，embedding task 跳过）
        SkillRegistry 查询适用 skill，拼入 system prompt
        调用 LLM（携带当前上下文 + 已执行工具结果）
        │
        ├─ LLM 返回 tool_use（read tool）
        │    → 查 Graph / Knowledge，结果追加到上下文，继续下一轮
        │
        ├─ LLM 返回 tool_use（write tool）
        │    → 工具内部：规则校验 → 调用领域服务 → 写 ActionLog
        │    → 返回执行结果，继续下一轮
        │
        ├─ LLM 返回 tool_use（notify_human，需人工介入）
        │    → 发通知，task status → 'waiting_for_approval'，退出 loop
        │    → 人工操作后由独立事件触发后续流程，本 task 已完成
        │
        └─ LLM 返回 final_response（AgentInsight）
             → 写 task.modelResult（本次 task 的理解摘要）
             → 退出 loop，task status → 'succeeded'
  │
  ▼
Task status → 'succeeded' | 'failed' | 'waiting_for_approval' | 'skipped'
写 task.result / task.error
```

**终态说明：**

| 终态 | 触发条件 | 后续 |
|---|---|---|
| `succeeded` | LLM 输出 AgentInsight，loop 正常结束 | ActionLog 已在 loop 中实时写入 |
| `waiting_for_approval` | LLM 调用 `notify_human` | 本 task 终止，不阻塞其他 task；人工操作触发独立事件 |
| `failed` | loop 超过 MAX_ITERATIONS / 工具调用连续失败 | BullMQ 重试，超上限后写 error 终止 |
| `skipped` | Ingress 幂等检查发现重复 key | 不创建新 task |

**并发说明：** 同一项目的多个 task 并发执行，互不阻塞。`waiting_for_approval` 是终态而非锁，后续 task 正常运行；写工具内部的去重逻辑在数据层解决并发冲突（发现同主题草稿时改为 revise / skip，而非重复创建）。

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

**并发策略：** 同一项目的 task 并发执行，没有项目级串行锁。`waiting_for_approval` 是终态——task 发出通知后即完成，不持有任何锁，后续 task 不受影响。并发冲突由写工具在数据层通过去重逻辑处理。

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

### 4.4 推理层（LLM Client + SkillRegistry + Agentic Loop）

推理层驱动 agentic loop：LLM 在 skill 指引下，通过反复调用工具收集信息、执行操作，直到任务完成或需要人工介入。

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

每次 task 执行时，Runtime 查询 `applicable_tasks` 匹配的所有 skill，按顺序拼入 system prompt。多个 skill 可同时适用于一个 task。

**工具与 skill 的职责边界：**
- **工具**定义 agent 能做什么（操作接口，有明确的领域副作用）
- **Skill** 定义 agent 怎么思考、什么时候该用哪个工具（行为指引，写在 Markdown 文件里）

例如"遇到零散信息优先进 Staging"、"如何判断事件是否是噪音"、"何时调用 notify_human"——这些都是 skill 里的指引，不需要在工具层硬编码。工具只管执行，skill 管决策逻辑。

**事件路由决策矩阵（在 `event-anchoring` skill 中定义）：**

| 情况 | 处置 |
|---|---|
| 垃圾消息 / 无项目关联 | 调用 `skip`（明确记录原因） |
| 有意义 + 找到合适锚点 | 写工具直接操作，级联 sedimentation |
| 有意义 + 无锚点 / 信息零散 | 调用 `to_staging`（主动路由，不是降级） |
| 需要人工判断 | 调用 `notify_human` |

**Agentic Loop**

```
初始上下文（来自 Context Builder）
  ↓
LLM 调用（system: skills, user: 上下文 + 工具调用历史）
  ↓
  ├─ tool_use → 执行工具 → 追加结果到上下文 → 继续下一轮
  └─ final_response → 输出 AgentInsight → 退出
```

- 最大轮次 `MAX_ITERATIONS`（建议 10），超出写 `failed`
- LLM 每轮可以同时发起多个工具调用（parallel tool use）
- `notify_human` 是特殊工具：调用后 task 进入 `waiting_for_approval` 并退出 loop

**AgentInsight — loop 结束时的任务摘要**

LLM 在确认任务完成后输出此结构，写入 `task.modelResult`：

```ts
interface AgentInsight {
  summary: string      // 这次 task 理解了什么、做了什么
  signalType: SignalType
  confidence: number   // 对本次整体处理的置信度（0-1）
  evidence: Array<{
    sourceType: 'node' | 'knowledge_entry' | 'task'
    sourceId: string
    note: string
  }>
}
```

`AgentInsight` 不再包含 proposals——agent 在 loop 中已直接通过写工具完成操作，ActionLog 是操作的权威记录。

**模型路由：**

| Task | 模型策略 |
|---|---|
| `embedding` | embedding model，不走 chat，无 agentic loop |
| `event_anchor` / `sedimentation` / `graph_growth` | 轻量模型（Haiku 级别） |
| `checkpoint` / `digest` | 强模型（Sonnet 级别） |

### 4.5 工具层（Tool Layer）

工具是 agent 与系统交互的唯一接口。每个工具都是自包含的——规则校验、领域服务调用、ActionLog 写入都在工具内部完成，没有外部 Executor 或 PolicyGate。

**Read Tools（只读，用于 loop 中补充上下文）：**

| 工具 | 说明 |
|---|---|
| `get_node` | 获取节点详情 |
| `get_subgraph` | 获取节点及其 composition 子孙 |
| `search_nodes` | 按关键词 / 状态搜索候选节点 |
| `search_knowledge` | 向量检索相关 KnowledgeEntry |
| `get_task_history` | 获取同项目近期 task 摘要 |

**Write Tools（写回，工具内部强制规则）：**

| 工具 | 目标 | 内部规则 |
|---|---|---|
| `write_embedding` | KnowledgeEntry | 直接写，无额外规则 |
| `create_knowledge_entry` | KnowledgeEntry（新） | 去重检查（同主题已存在 → 返回已有 id，建议改用 revise） |
| `revise_knowledge_entry` | KnowledgeEntry（已有） | 创建 revision draft，返回 draft id |
| `create_node` | Node（type=growth） | 校验 project.status=active；去重检查 |
| `create_edge` | Edge | 校验节点存在且未 archived；环检测由 Graph Engine 处理 |
| `move_node` | 移动节点父级 | 同 create_edge 规则 |
| `update_node_status` | Node status | 校验状态转移合法（调用 Graph Engine 护栏） |
| `to_staging` | Staging Graph | 有意义但无明确锚点时的主动路由；在 KE Staging Graph 下创建草稿条目或临时节点 |
| `notify_human` | 通知 | 需人工判断时调用；发通知 + task → `waiting_for_approval` + 退出 loop |
| `skip` | — | 确认是垃圾消息时调用；仅写 ActionLog（记录原因），不调用任何领域服务 |

**所有写工具的统一行为：**
```
工具被调用
  → 校验 project.status（非 active 时拒绝，返回错误）
  → 校验工具特定规则（去重、状态护栏等）
  → 调用 Graph Engine / Knowledge Engine 领域服务
  → 写 ActionLog { action, status: 'applied' | 'failed', targetId, ... }
  → 返回结果（成功时含 targetId，失败时含 reason）
```

**禁止提供的操作（不存在对应工具）：**
- `delete_node` / `archive_node`——破坏性不可逆
- `resolve_checkpoint`——必须人工通过 Graph Engine API 提交
- 任何外部系统写操作（PR、评论、消息发送）

**级联 task（由写工具触发）：**
- `create_knowledge_entry` 成功 → 工具内发 `embedding` task 到 BullMQ
- `revise_knowledge_entry` 人工确认后（外部事件触发）→ 发 `embedding` task

### 4.6 审计层（Task Store + Action Log）

审计层保证系统的每次智能动作都可追溯：用户问"这条知识为什么出现"，能完整回答——来自哪个事件、哪个 task、哪次模型输出、经过了哪些 action、最终写回了什么。

**回溯查询路径：**

| 问题 | 查询路径 |
|---|---|
| 这条知识从哪来？ | `KnowledgeEntry.id` → `ActionLog.targetId` → `Task.modelResult` + `Task.input` |
| 这个节点为什么被创建？ | `Node.id` → `ActionLog.targetId` → `Task.sourceId`（原始事件） |
| 为什么没有自动写入？ | `ActionLog.status=rejected` + `ActionLog.reason` |
| 模型说了什么？ | `Task.modelResult`（完整 `AgentInsight`） |

---

## 五、Task 类型手册

每种 task 表达一种产品意图，是单 Agent Runtime 内的职责拆分，不是多 Agent 协作。

### `event_anchor` — 判断事件归属

| 项 | 内容 |
|---|---|
| 触发 | 外部 PR / commit / alert / chat 等非确定性事件 |
| 上下文 | trigger 原文、候选节点（规则预筛）、Staging Graph 现有节点、相关 KnowledgeEntry |
| Skills | `event-anchoring` + 事件源特定 skill（如 `github-pr-reading`） |
| LLM 目标 | 先判断是否噪音；有意义时找锚点决定直接写、进 Staging 或通知人工 |
| 典型工具调用 | `search_nodes` / `search_knowledge` → `skip` / `to_staging` / `update_node_status` / `create_node` |
| 级联 | 锚定成功且有沉淀价值 → 发 `sedimentation` task |

### `sedimentation` — 沉淀为知识条目

| 项 | 内容 |
|---|---|
| 触发 | `event_anchor` task 完成后级联发起 |
| 上下文 | trigger 原文、锚定节点、相邻 task 摘要、相似 KnowledgeEntry（防重复） |
| Skills | `knowledge-sedimentation` + `node-lifecycle` |
| LLM 目标 | 生成 KnowledgeEntry 草稿（title / body / category） |
| 典型工具调用 | `search_knowledge` → `create_knowledge_entry` / `revise_knowledge_entry` |
| 级联 | `create_knowledge_entry` 工具内自动发 `embedding` task |

### `graph_growth` — 判断是否需要新节点

| 项 | 内容 |
|---|---|
| 触发 | 定时扫描发现新子问题；MVP 阶段不做级联触发，独立运行 |
| 上下文 | 当前节点结构、近期主题聚类、已有 `type=growth` 节点 |
| Skills | `graph-growth` + `node-lifecycle` |
| LLM 目标 | 判断是否需要创建 `type=growth` 节点或补充边 |
| 典型工具调用 | `search_nodes` → `create_node` / `create_edge` / `to_staging` |
| 级联 | 无 |

### `checkpoint` — 为阻塞节点生成判决草稿

| 项 | 内容 |
|---|---|
| 触发 | `graph.node.checkpoint_elevated` 事件 |
| 上下文 | 环路径节点详情、相关 KnowledgeEntry、近期 task 摘要、历史 checkpoint 记录 |
| Skills | `checkpoint-analysis` |
| LLM 目标 | 生成背景摘要、风险分析、可选判决草稿（continue \| loop） |
| 典型工具调用 | `search_knowledge` → `create_knowledge_entry`（category=decision）→ `notify_human` |
| 约束 | 不可调用 `update_node_status` 写 resolution；判决必须人工通过 Graph Engine API 提交 |

### `embedding` — 生成向量

| 项 | 内容 |
|---|---|
| 触发 | `knowledge.entry.created` / `knowledge.entry.body_revised`，或 `sedimentation` 级联 |
| 上下文 | KnowledgeEntry 当前 body（仅此） |
| Skills | 无（不走 chat LLM） |
| LLM | 直接调 embedding model |
| 典型工具调用 | `write_embedding`（直接调，无 agentic loop） |
| 级联 | 无 |

### `digest` — 生成摘要报告

| 项 | 内容 |
|---|---|
| 触发 | 定时（日报 / 周报 / 接手摘要） |
| 上下文 | 时间窗口内的 task 摘要、节点状态变化、知识更新记录 |
| Skills | `digest-generation` |
| LLM 目标 | 生成可读的进展摘要 |
| 典型工具调用 | `get_task_history` → `notify_human`（附摘要内容） |
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

// ─── Tool ActionLog ──────────────────────────────────────
// 每次写工具调用后写入，是操作的权威审计记录

type ToolActionType =
  | 'write_embedding'
  | 'create_knowledge_entry'
  | 'revise_knowledge_entry'
  | 'create_node'
  | 'create_edge'
  | 'move_node'
  | 'update_node_status'
  | 'to_staging'
  | 'notify_human'
  | 'skip'

interface OrchestratorActionLog {
  id: string
  taskId: string
  toolName: ToolActionType
  status: 'applied' | 'failed' | 'awaiting_human'
  targetType?: 'node' | 'edge' | 'knowledge_entry' | 'notification'
  targetId?: string          // 写回后的领域对象 ID
  input: JsonValue            // 工具入参
  result?: JsonValue          // 领域服务返回值
  error?: string              // 失败原因
  createdAt: Date
}

// ─── LLM 最终输出 ────────────────────────────────────────
// agent 在 loop 结束时输出的任务摘要，写入 task.modelResult
// 操作记录在 ActionLog，AgentInsight 只做理解层面的汇总

type SignalType =
  | 'progress' | 'blocker' | 'decision'
  | 'risk'     | 'learning' | 'noise'

interface AgentInsight {
  summary: string      // 这次 task 理解了什么、做了什么
  signalType: SignalType
  confidence: number   // 对本次整体处理的置信度（0-1）
  evidence: Array<{
    sourceType: 'node' | 'knowledge_entry' | 'task'
    sourceId: string
    note: string
  }>
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
│   ├── agent-runtime.service.ts          # 主流程：load → context → agentic loop → persist
│   └── task-runner.service.ts            # 按 task type 分发到对应 handler
│
├── context/                               # 上下文层（初始上下文构造）
│   ├── context-builder.service.ts        # 统一入口，按 task type 组装初始上下文
│   ├── graph-context.reader.ts           # 查 Graph Engine（节点 / 子图 / 候选节点）
│   └── knowledge-context.reader.ts       # 查 Knowledge Engine（相关条目 / Staging Graph）
│
├── llm/                                   # 推理层（agentic loop）
│   ├── llm-client.ts                      # 模型调用 + 重试 + tool use 处理
│   ├── skill-registry.ts                  # 扫描 skills/ 目录，按 task type 查询适用 skill
│   └── redaction.service.ts               # 调用前脱敏
│
├── tools/                                 # 工具层（read + write tools）
│   ├── read/
│   │   ├── get-node.tool.ts
│   │   ├── get-subgraph.tool.ts
│   │   ├── search-nodes.tool.ts
│   │   ├── search-knowledge.tool.ts
│   │   └── get-task-history.tool.ts
│   └── write/
│       ├── write-embedding.tool.ts
│       ├── create-knowledge-entry.tool.ts # 含去重检查 + 级联 embedding task
│       ├── revise-knowledge-entry.tool.ts
│       ├── create-node.tool.ts
│       ├── create-edge.tool.ts
│       ├── move-node.tool.ts
│       ├── update-node-status.tool.ts
│       ├── to-staging.tool.ts             # 有意义但无锚点时的主动路由
│       ├── notify-human.tool.ts           # 发通知 + task → waiting_for_approval
│       └── skip.tool.ts                   # 噪音判定，仅写 ActionLog 不调领域服务
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
- 同一 source event 重复投递不重复创建知识或节点（写工具去重）
- agentic loop 超过 MAX_ITERATIONS 时 task 进入 `failed`，不产生部分写入
- `waiting_for_approval` 的 task 不阻塞同项目其他 task 运行
- 每次写工具调用都有 ActionLog 记录，包含 targetId 和执行结果
- `delete_node` / `resolve_checkpoint` 等禁止操作无对应工具，调用时返回错误
