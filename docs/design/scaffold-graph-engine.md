# Scaffold Graph Engine — 设计文档

## 状态

当前已在 `apps/server/src/graph` 落地为 NestJS 模块，包含 GraphService、GraphRepository、CycleDetectorService、GraphEventPublisher 和 GraphEventWorker。持久化使用 Prisma，领域事件通过 BullMQ `graph-events` 队列发布。

Graph Engine 是被动领域服务：只响应 API Layer 或后续 Agent Orchestrator 调用，不主动发起操作，不调用 LLM。

## 职责

Graph Engine 管理项目内的节点、边、子图、节点状态流转、Checkpoint 判决和删除策略。它保证图结构的最小一致性，并通过领域事件把关键状态变化通知给系统内其他模块。

## 核心概念

### Project Root

创建项目时，ProjectService 会在同一个事务里调用 Graph Engine 初始化项目图：

- Project Root：`role = project_root`、`type = scaffold`、`isProjectRoot = true`、标题为 `[Project Root]`。
- Staging Area：`role = staging_root`、`type = staging`、标题为 `[Staging Area]`。
- Root 到 Staging 会自动创建一条 `composition` 边。

普通节点列表 `GET /projects/:id/nodes` 不返回 Project Root，但会返回 Staging Area。

### 节点分类

| 类型 | 说明 | 当前约束 |
|---|---|---|
| `scaffold` | 人维护的骨架节点，用于阶段、里程碑、模块等稳定结构 | 可由 API 创建 |
| `growth` | Agent 或人创建的细粒度任务、问题、调查分支 | 可由 API 创建 |
| `staging` | 系统管理的临时挂载区，用于未定位事件和知识 | 不能通过公开 `createNode` 创建 |

`NodeRole` 用于区分节点在系统结构中的角色：

- `regular`：普通业务节点。
- `project_root`：项目虚拟根，受保护。
- `staging_root`：项目 staging 区，受保护。

### 边类型

| 类型 | 语义 | 当前流程约束 |
|---|---|---|
| `composition` | `to` 是 `from` 的子节点或组成部分 | 完成父节点前，所有未归档 composition 子节点必须 completed |
| `dependency` | `from` 依赖 `to` 完成 | 节点激活时，dependency 指向的未归档节点必须 completed |

节点创建时会原子性创建节点和入边：

- 传 `parentNodeId` 时，挂到指定父节点。
- 不传 `parentNodeId` 时，默认挂到 Project Root。
- `edgeType` 默认 `composition`。

## 图结构与环检测

Graph 当前允许有向图出现环，但写边时会做兜底检测：

1. 先在事务中写入新边。
2. 读取项目内所有边，使用 DFS 判断是否从 `toId` 能回到 `fromId`。
3. 如果成环，选取环路径里入度最高的节点。
4. 将该节点更新为 `isCheckpoint = true`、`status = blocked`。
5. 发布 `graph.node.checkpoint_elevated` 事件，payload 包含 `cyclePath`。

平局时，CycleDetector 使用 DFS 路径里的第一个最高入度节点。

Graph Engine 不拒绝成环写入，而是把环显性化为 blocked checkpoint，等待人工或后续 Agent Orchestrator 判决。

## Checkpoint

Checkpoint 是节点属性，不是独立节点类型。

```text
active ─────────▶ completed
  │
  ▼
blocked
  │
  ├── resolution = continue ──▶ active
  └── resolution = loop     ──▶ active

任意非保护节点 ──▶ archived
```

当前实现：

- `PATCH /nodes/:id/resolution` 只能用于 `status = blocked` 且 `isCheckpoint = true` 的节点。
- 判决会写入 `checkpointResolution = continue | loop`，并把状态恢复为 `active`。
- 直接把 blocked 节点 `PATCH /nodes/:id` 改回 active 会返回 `USE_RESOLUTION_API`。

## 状态流转约束

当前实现的主要保护规则：

- Project Root 不能通过普通节点 API 修改、改状态或删除。
- Staging Root 不能修改普通字段，不能删除，不能 completed 或 archived；显式创建边和替换入边时不能把 staging root 作为结构变更端点。
- archived 节点不可再更新或参与新边写入。
- completed 节点不能再回到 active；completed 节点也不能作为新边的 `from`。
- blocked 节点不能直接 completed，必须先 resolution。
- 节点 completed 前，所有 composition 子节点必须是 completed 或 archived。
- 节点 active 前，所有 dependency 目标必须是 completed 或 archived。
- 自环边被拒绝，返回 `SELF_LOOP_NOT_ALLOWED`。

## 删除策略

`DELETE /nodes/:id` 支持四种策略，返回 `affectedNodeIds`：

| 策略 | 行为 |
|---|---|
| `block` | 有 composition 子节点时拒绝删除，返回 `HAS_ACTIVE_CHILDREN` 和受影响子节点 |
| `cascade` | 归档节点及其 composition 子树，并删除相关边 |
| `reparent-to-parent` | 要求被删节点只有一个 composition 父节点；将子节点挂到该父节点 |
| `reparent-to-root` | 将子节点挂到 Project Root |

所有删除都是软删除节点为 `archived`，同时清理或重建相关边。Project 删除是 ProjectService 的硬删除，会级联删除项目下 nodes、edges、knowledge entries 和 revisions。

## API

### Nodes

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/projects/:id/nodes` | 创建节点，并自动创建入边 |
| `GET` | `/projects/:id/nodes` | 查询项目下非 Project Root 节点 |
| `GET` | `/nodes/:id/subgraph` | 查询以节点为根的 composition 子图及相关边 |
| `PATCH` | `/nodes/:id` | 更新字段或状态；字段更新和状态流转互斥 |
| `PATCH` | `/nodes/:id/resolution` | 判决 blocked checkpoint |
| `DELETE` | `/nodes/:id` | 按策略软删除节点 |

`PATCH /nodes/:id` 的互斥规则：

- 传 `status` 时，不能同时传 `title`、`description`、`isCheckpoint`。
- 不传 `status` 时，作为普通字段更新。

### Edges

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/projects/:projectId/edges` | 创建边，并触发环检测 |
| `GET` | `/projects/:id/edges` | 查询项目全部边 |
| `DELETE` | `/edges/:id` | 删除边 |
| `PATCH` | `/nodes/:id/edges` | 替换节点指定类型的入边，用于移动节点 |

`replaceNodeEdges` 会先删除目标节点同类型入边，再创建新入边，并执行同样的环检测和 checkpoint 升级逻辑。

## 领域事件

Graph Engine 写入成功后通过 BullMQ 发布内部领域事件。当前 worker 记录日志，后续可接 Agent Orchestrator 或通知系统。

| 事件 | 触发时机 |
|---|---|
| `graph.edge.created` | 无环边创建成功，或换边成功且无环 |
| `graph.node.checkpoint_elevated` | 新边或换边形成环，并自动升级 checkpoint |
| `graph.node.status_changed` | 节点状态变更成功 |
| `graph.checkpoint.resolved` | Checkpoint 判决完成 |
| `graph.node.deleted` | 节点按删除策略归档成功 |

## 边界

- 不调用 LLM，不判断业务语义，不决定何时创建 growth 节点。
- 不直接管理 KnowledgeEntry，只提供节点和图结构锚点。
- 不主动订阅外部事件；事件流入和 AI 分析由 Event Pipeline / Agent Orchestrator 负责。
- 对系统节点采用强保护，普通业务图通过状态约束、环检测和删除策略维护一致性。
