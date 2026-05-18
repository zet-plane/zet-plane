# Checkpoint 任务生命周期设计

**日期：** 2026-05-17  
**状态：** 已修订

## 设计目标

澄清 `checkpoint` 在当前系统中的真正语义，并收敛其生命周期边界：

- `checkpoint` 首先是一个 **human gate**，表示某个事项推进到这里必须由人确认。
- `checkpoint task` 只是为这个 gate 准备决策材料，不负责做最终决策，也不负责等待人类审批结束。
- 等待语义属于 graph/node，而不属于 orchestrator task。
- 人工确认后通过 graph resolution 打开 gate；后续推进由新事件或新任务承担，而不是恢复旧 task。

## 问题

当前实现把 `checkpoint` 混成了两层语义：

1. 图层语义：事项被人工确认门拦住。
2. 任务层语义：agent 任务暂停，等待人工输入后恢复。

这导致 `checkpoint-analysis` 以 `notify_human` 结束，并把 task 置为 `waiting_for_approval`。但对 `checkpoint` 来说，真正等待的不是 task，而是 gate。本系统也没有任何机制在人工调用 `resolveCheckpoint` 后恢复原 task，因此 `waiting_for_approval` 在这条链路里既不准确，也没有关闭路径。

根本原因是状态建模放错了层级：`checkpoint` 需要的是 gate lifecycle，而不是 task pause/resume lifecycle。

## 核心定义

### 1. Checkpoint Gate

`checkpoint` 首先是一个 **human gate**，表示某个事项的推进已经到达“必须由人确认才能继续”的边界。

在图模型中，agent 通过将当前事项连接到 `checkpoint` 来显式表达这个门控语义；成环不是异常本身，而是“该事项当前受人工确认约束”的建模方式。

### 2. Checkpoint Task

`checkpoint task` 的职责不是做决定，也不是等待人类审批结束。它只是一个 **decision-package producer**：

- 收集当前节点与子图上下文
- 查找相关知识和近期任务历史
- 整理 `continue` / `loop` 的风险分析
- 产出一份供人类审阅的 decision draft

它完成的判据是“决策材料已产出”，不是“人已经批准”。

### 3. Checkpoint Resolution

`resolveCheckpoint` 表示人类已经完成确认，并为该 gate 给出 resolution。这个动作改变的是 graph/node 的状态，而不是恢复或续跑原来的 `checkpoint task`。

## 生命周期边界

当 agent 判断某事项继续推进前必须由人确认时，它会把该事项连接到 `checkpoint`，从而形成一个 human gate。系统随后创建一个 `checkpoint task`，由该 task 收集上下文并产出 decision draft。

一旦决策材料准备完成，`checkpoint task` 就应结束；此时仍处于等待状态的是 `checkpoint gate`，不是 `checkpoint task`。之后由人类查看材料并调用 `resolveCheckpoint`。resolution 生效后，gate 被打开，后续推进通过新事件或新任务发生，而不是恢复旧 task。

## 状态机定义

### 1. Checkpoint Gate 状态机

`checkpoint gate` 挂在 graph node 上，表示该事项是否仍被人工确认所阻塞。

| Gate 状态 | 含义 | 进入条件 | 离开条件 |
|---|---|---|---|
| `active` | 事项可继续推进，无人工门控 | 初始状态；或 checkpoint 已被 resolve | agent 判断该事项推进前需要人工确认，并连接到 checkpoint |
| `blocked + isCheckpoint=true` | 事项被人工确认门拦住 | agent 形成 checkpoint gate；或图检测到该事项已进入 checkpoint 约束 | human 调用 `resolveCheckpoint` |
| `active + checkpointResolution=continue` | gate 已被打开，允许按当前方向继续推进 | human 选择 `continue` | 后续事项正常推进 |
| `active + checkpointResolution=loop` | gate 已被打开，但要求回到上一步或重新整理方向 | human 选择 `loop` | 后续事项按 loop 语义重新推进 |

这里最关键的一句是：`blocked` 表示“事项在等人确认”，不是“agent task 还没做完”。

### 2. Checkpoint Task 状态机

`checkpoint task` 挂在 orchestrator task 上，表示“决策材料准备工作”本身的执行状态。

| Task 状态 | 含义 | 进入条件 | 离开条件 |
|---|---|---|---|
| `pending` | 已创建，尚未执行 | `graph.node.checkpoint_elevated` 路由创建 task | worker 开始执行 |
| `running` | 正在收集材料 | runtime 开始执行 agent loop | `conclude` / `skip` / error |
| `succeeded` | 决策材料已准备完成 | 成功创建 decision draft 并 `conclude` | 终态 |
| `failed` | 决策材料准备失败 | tool 或 runtime 出错 | 终态 |
| `succeeded (signalType: noise)` | gate 在执行前已不再需要处理，task 以 noise 信号结束 | 发现 checkpoint 已被其他人解决，调用 `skip` | 终态；`modelResult.signalType === 'noise'` 标识跳过语义 |

在当前设计里，`checkpoint task` 不使用 `waiting_for_approval`，也不使用独立的 `skipped` 状态——"跳过"语义通过 `modelResult.signalType === 'noise'` 与正常 `succeeded` 区分。

## `notify_human` 去留决议

### 决议

`notify_human` 不再用于 `checkpoint` 生命周期。

在当前设计中，`checkpoint` 表达的是一个挂在 graph/node 上的 human gate，而不是一个需要暂停并等待恢复的 task。因此，`checkpoint task` 在完成决策材料准备后应调用 `conclude` 结束；等待人工确认的语义由 `checkpoint node` 的 `blocked + isCheckpoint=true` 承担。

### 原因

`notify_human` 的语义天然指向 task 级别的暂停：

- 当前 task 尚未完成
- 需要人工介入
- 人工介入后可能恢复原 task

这与 `checkpoint` 的目标语义不一致。在 `checkpoint` 模型中：

- task 负责产出 decision draft
- gate 负责阻塞事项推进
- human 负责做 resolution
- resolution 后通过新事件或新任务继续推进，而不是恢复旧 task

### 对 `checkpoint` 的替代方式

`checkpoint task` 的标准收尾方式为：

1. 收集上下文
2. 创建 decision knowledge entry
3. 调用 `conclude`
4. 在 `modelResult.evidence` 中记录 decision draft 的 `entryId`

此时 task 进入 `succeeded`。与此同时，`checkpoint node` 保持 `blocked`，直到 human 调用 `resolveCheckpoint`。

### 对 `notify_human` 的后续处理

`notify_human` 在当前设计中进入废弃状态：

- 不再允许 `checkpoint-analysis` 使用
- 不再作为 `checkpoint` task 的终态工具
- 不再与 `waiting_for_approval` 绑定

如果未来出现真正的 task 级 pause/resume 场景，例如 agent 需要人工补充输入后继续同一个执行流，应单独设计新的语义，并优先使用更准确的名称，例如 `pause_for_input` 或 `request_human_input`，而不是继续复用 `notify_human`。

## Checkpoint 任务的生命周期

```text
graph.node.checkpoint_elevated
  → 创建 OrchestratorTask(checkpoint)

checkpoint task 执行：
  1. get_node
  2. get_subgraph
  3. search_knowledge
  4. get_task_history
  5. create_knowledge_entry(category: decision)
       - 包含背景说明、continue vs loop 风险分析、建议草稿
       - 副作用：自动触发 knowledge.entry.created → embedding task（预期行为，无需处理）
  6. conclude(
       signalType: 'decision',
       evidence: [{ sourceType: 'knowledge_entry', sourceId: <entryId>, note: 'Decision draft for checkpoint review' }]
     )

  → task.status = succeeded
  → task.modelResult 包含 entryId 引用

checkpoint node 继续保持 blocked + isCheckpoint=true

human 调用 POST /graph/:id/resolve-checkpoint
  → node.status = active
  → node.checkpointResolution = continue | loop
  → 发布 graph.checkpoint.resolved
```

## `continue` 与 `loop` 的语义

`continue` 与 `loop` 是 gate 的 resolution，不是 task 的 outcome。

两种 resolution 在当前 orchestrator 侧都不触发旧 task 恢复。区别只记录在图节点的 `checkpointResolution` 字段上，供后续 agent 运行时作为上下文读取。

| Resolution | 旧 checkpoint task | 图的变化 | 后续推进 |
|---|---|---|---|
| `continue` | 无变化，保持终态 | `node.status = active`，`checkpointResolution = continue` | 由新事件或新任务继续 |
| `loop` | 无变化，保持终态 | `node.status = active`，`checkpointResolution = loop` | 由新事件或新任务按 loop 语义继续 |

如果特定 resolution 需要 orchestrator 跟进（例如触发 `phase_transition` 任务），在 `OrchestratorRouterService.handleGraphEvent` 里为 `graph.checkpoint.resolved` 添加对应 case 即可，作为未来扩展；该扩展触发的是新任务，而不是恢复旧 task。

## `graph.checkpoint.resolved`（暂不接入 orchestrator）

`GraphService.resolveCheckpoint` 在人工操作后已经发布了 `graph.checkpoint.resolved` 事件。本次设计中 `OrchestratorRouterService` 不为这个事件添加 handler。

这是一个有意保留的扩展点，但它的语义必须明确：`graph.checkpoint.resolved` 是 **gate resolved 事件**，不是 **checkpoint task completion 事件**。未来如需接入 orchestrator，应由它创建新的 follow-up task，而不是关闭、恢复或改写原有 checkpoint task。

## 需要改动的地方

### 1. `checkpoint-analysis` skill

文件：`apps/server/skills/orchestrator/checkpoint-analysis/index.md`

- 第 6 步：将 `notify_human` 改为 `conclude`
  - `signalType: 'decision'`
  - `evidence` 中包含 `{ sourceType: 'knowledge_entry', sourceId: <entryId>, note: ... }`
- 删除硬约束：“NEVER call `conclude` for unresolved checkpoints”
- 将 `skip` 约束改为：仅当 agent 运行时节点已被解决才可调用 `skip`
- 明确说明 task 的目标是准备 decision draft，而不是等待人工审批

### 2. Prompt / Context 约束

- `PromptBuilderService` 对 checkpoint task 的 completion instruction 改为：`'When done, call the `conclude` tool with signalType: decision and evidence referencing the knowledge entry you created. Do NOT call `notify_human`.'`
- 判断条件从 `ctx.constraints.requiresHumanApproval` 改为 `task.type === OrchestratorTaskType.checkpoint`
- `ContextBuilderService.constraints.requiresHumanApproval` 已标记废弃，随 `notify_human` 一起退役
- 如需保留 task-level human input 语义，应为未来 pause/resume 场景单独建模

### 3. Runtime / 状态枚举

- `checkpoint` 任务不再进入 `waiting_for_approval`
- `waiting_for_approval` 状态标记为**废弃**，短期保留以维持 BullMQ 重投递守卫；彻底删除需要 DB migration，待有真实 pause/resume 场景时再统一处理
- 废弃原因：checkpoint 语义已迁移到 gate 层（`blocked + isCheckpoint=true`），task 层无需 pause/resume；如未来需要此语义，应使用更准确的名称（如 `pause_for_input`）重新建模

### 4. Eval / 测试 / 旧文档

- 所有 “checkpoint task -> waiting_for_approval” 的断言改为 “checkpoint task -> succeeded”
- 所有 “checkpoint 必须 `notify_human`” 的 prompt / skill / eval 口径同步改为 `conclude`
- 旧设计文档中把 `waiting_for_approval` 视为 checkpoint 终态的段落应标记为过时或同步修订

## 不变量

- `checkpoint node` 表达“事项等待人工确认”。
- `checkpoint task` 表达“为这次人工确认准备材料”。
- 人工未确认前，等待状态属于 `checkpoint node`，不属于 `checkpoint task`。
- `checkpoint task` 的完成条件是“决策材料已产出”，不是“人工已批准”。
- `conclude` 必须在 decision knowledge entry 创建之后调用；没有 evidence entryId 的 `conclude` 视为 skill 违规。
- `continue` 与 `loop` 是 gate 的 resolution，不是 task 的 outcome。
- 人工确认后，改变的是 graph 状态，不是旧 task 的执行状态。

## 不做的事

- 向人工审核者推送通知（延后）
- `loop` resolution 后自动触发 agent 跟进（延后，可通过 `graph.checkpoint.resolved` 扩展）
- 恢复或续跑原 checkpoint task
- 同一节点多个并发 checkpoint 的合并治理（暂不阻止；每个 task 独立结束）
