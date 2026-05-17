# Checkpoint 任务生命周期设计

**日期：** 2026-05-17  
**状态：** 已确认

## 问题

检测到依赖环时，`graph.node.checkpoint_elevated` 会触发一个 `OrchestratorTask(checkpoint)`。当前的 `checkpoint-analysis` skill 以 `notify_human` 结束，这会把 `task.status` 设为 `waiting_for_approval`，而这个状态永远不会被关闭——图域的 `resolveCheckpoint` 接口没有任何桥接回 orchestrator task 的机制，导致 task 永远挂在那里。

根本原因是语义误用：`notify_human` / `waiting_for_approval` 的设计意图是 agent 暂停后需要**恢复运行**。但 checkpoint agent 不需要恢复——它的使命在准备好决策包并交接后就结束了。

## 设计

### Checkpoint 任务的生命周期

```
graph.node.checkpoint_elevated
  → 创建 OrchestratorTask(checkpoint)

  Agent 执行：
    1. get_node           — 了解 checkpoint 节点的背景
    2. get_subgraph       — 追踪环路路径
    3. search_knowledge   — 查找相关决策和上下文知识条目
    4. get_task_history   — 了解项目近期活动
    5. create_knowledge_entry(category: decision)
         — 包含：背景说明、continue vs loop 的风险分析、草稿建议
    6. conclude(signalType: 'decision', evidence: [{sourceType: 'knowledge_entry', sourceId: <entryId>}])

  → task.status = succeeded
  → task.modelResult 包含 entryId 引用
```

Task 到此结束。图节点继续保持 `blocked` + `isCheckpoint=true`，直到人工通过 `POST /graph/:id/resolve-checkpoint` 独立处理。

### `notify_human` 的语义（澄清）

`notify_human` 仅用于 agent 需要人工输入后**继续自身执行**的场景。Checkpoint 分析不需要继续执行，只需要留下完整的决策包。此处应使用 `conclude`。

### `graph.checkpoint.resolved`（暂不接入 orchestrator）

`GraphService.resolveCheckpoint` 在人工操作后已经发布了 `graph.checkpoint.resolved` 事件。本次设计中 `OrchestratorRouterService` 不为这个事件添加 handler。这是一个有意保留的扩展点：未来的任务类型（例如 `phase_transition`）可以订阅它，而不需要修改现有逻辑。

### 人工感知决策草稿的方式

前端通过以下查询找到待处理的 checkpoint 决策：

```
OrchestratorTask where type=checkpoint AND status=succeeded
```

从 `task.modelResult.evidence[].sourceId` 解析出对应的 knowledge entry，其中包含决策草稿（背景、风险分析、建议）。

这是拉取模式。推送通知（Webhook、WebSocket）不在本次范围内，可以作为独立能力叠加。

### `continue` 与 `loop` 的语义

两种 resolution 在 orchestrator 侧的处理完全相同：不触发任何后续 agent 任务。区别记录在图节点的 `checkpointResolution` 字段上，供后续 agent 运行时作为上下文读取。

| Resolution | Agent 行为 | 图的变化 |
|---|---|---|
| `continue` | 无 | `node.status = active`，`checkpointResolution = continue` |
| `loop` | 无 | `node.status = active`，`checkpointResolution = loop` |

如果特定 resolution 需要 orchestrator 跟进（例如触发 `phase_transition` 任务），在 `OrchestratorRouterService.handleGraphEvent` 里为 `graph.checkpoint.resolved` 添加对应 case 即可，作为未来扩展。

## 需要改动的地方

### 1. `checkpoint-analysis` skill

文件：`apps/server/skills/orchestrator/checkpoint-analysis/index.md`

- 第 6 步：将 `notify_human` 改为 `conclude`
  - `signalType: 'decision'`
  - `evidence` 中包含 `{ sourceType: 'knowledge_entry', sourceId: <entryId> }`
- 移除硬约束："NEVER call `skip`" → 改为：优先 `conclude`；仅当 agent 运行时节点已被解决才可调用 `skip`
- 移除硬约束："The `notify_human` call ends this task"

### 2. Runtime 层无需改动

`AgentRuntimeService` 已经将 `conclude` 路由到 `succeeded` + `modelResult`，不需要任何修改。

### 3. OrchestratorRouterService 无需新增 handler

`graph.checkpoint.resolved` 在 `handleGraphEvent` 中保持无 handler，以注释标注为预留扩展点。

## 不变量

- `checkpoint` 任务只会以 `succeeded` 或 `failed`（出错时）结束，永远不进入 `waiting_for_approval`。
- `conclude` 必须在 decision knowledge entry 创建之后调用。没有 evidence entryId 的 `conclude` 视为 skill 违规。
- 图节点保持 `blocked` 状态，直到 `resolveCheckpoint` 被独立调用，与 orchestrator task 的生命周期无关。

## 不做的事

- 向人工审核者推送通知（延后）
- `loop` resolution 后自动触发 agent 跟进（延后，可通过 `graph.checkpoint.resolved` 扩展）
- 同一节点多个并发 checkpoint（不阻止；每个 task 独立结束）
