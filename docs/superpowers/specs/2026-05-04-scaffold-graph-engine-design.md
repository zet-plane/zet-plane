# Scaffold Graph Engine — 实现设计文档

**日期**：2026-05-04  
**状态**：待实现  
**基于**：[架构文档](../../architecture.md) · [原始设计文档](../../design/scaffold-graph-engine.md)

---

## 一、决策摘要

| 问题 | 决策 |
|---|---|
| 领域事件机制 | BullMQ（持久化，已有依赖，天然解耦） |
| 状态传播方式 | Graph Engine 推事件 + 应用层护栏校验；Orchestrator 决定是否推进父节点 |
| 环检测算法 | 局部 DFS（写边后从 `toId` 出发尝试回到 `fromId`） |
| 入度并列处理 | 取 DFS 遍历顺序中第一个（确定性） |
| Project 根节点 | 真实 Node 记录（`isProjectRoot: true`），创建项目时自动生成 |
| 外键约束 | 不使用 DB 外键，引用完整性由应用层保证 |
| 删除中间节点 | 参数化策略，由 Orchestrator 或人决定 |
| 事务 vs. Job 推送 | DB 事务提交后推 BullMQ Job，推失败不回滚，依赖 BullMQ 重试 |
| checkpoint 历史记录 | 不在 Graph 层扩展历史表，由 Knowledge Engine 的 KnowledgeEntry 承载（见下方说明） |
| `checkpointResolution` 字段 | 保留在 Node 上作冗余快照，显示最终判决；Knowledge Engine 为内容权威，Graph 不依赖此字段做状态推进 |

---

## 二、模块结构

```
apps/server/src/graph/
├── graph.module.ts                   # NestJS 模块，注册 BullMQ Queue
├── graph.controller.ts               # 所有 HTTP 路由（节点 + 边）
├── node/
│   └── node.service.ts               # 节点 CRUD + 状态写入校验
├── edge/
│   └── edge.service.ts               # 写边 + 触发环检测 + 推 Job
├── cycle/
│   └── cycle-detector.service.ts     # 纯算法：DFS + 入度计算（无 IO，无副作用）
├── events/
│   └── graph-event.publisher.ts      # BullMQ Job 统一出口
└── repository/
    └── graph.repository.ts           # Prisma 封装 + 事务管理
```

**职责边界**：

- `NodeService`：节点 CRUD，所有状态变更前的护栏校验，不感知 BullMQ
- `EdgeService`：写边主流程，协调 Repository（事务）→ CycleDetector → Publisher
- `CycleDetectorService`：纯函数，入参是内存边数组，不触 DB，独立可单测
- `GraphEventPublisher`：所有 BullMQ Job 推送，统一 Job 类型定义
- `GraphRepository`：Prisma 封装，提供事务上下文，供 EdgeService 在单次事务内完成「写边 + 可能的 Checkpoint 升级」

---

## 三、Prisma Schema

```prisma
model Node {
  id                   String                @id @default(uuid())
  projectId            String                // 无外键，普通 String
  isProjectRoot        Boolean               @default(false)
  type                 NodeType
  title                String
  description          String?
  status               NodeStatus            @default(active)
  isCheckpoint         Boolean               @default(false)
  checkpointResolution CheckpointResolution?
  createdBy            CreatedBy
  createdAt            DateTime              @default(now())
  updatedAt            DateTime              @updatedAt

  @@index([projectId])
}

model Edge {
  id        String   @id @default(uuid())
  projectId String   // 冗余存储，避免查项目边时 JOIN Node
  fromId    String   // 无外键，普通 String
  toId      String   // 无外键，普通 String
  type      EdgeType
  createdBy CreatedBy
  createdAt DateTime @default(now())

  @@unique([fromId, toId, type])
  @@index([projectId])
  @@index([fromId])
  @@index([toId])
}

enum NodeType             { scaffold growth }
enum NodeStatus           { active blocked completed archived }
enum CheckpointResolution { continue loop }
enum EdgeType             { composition dependency }
enum CreatedBy            { human agent }
```

**无外键的引用完整性保证**：

- 写边前：`EdgeService` 查 `fromId` / `toId` 节点是否存在且未 `archived`，不满足返回 404/409
- 删节点时：在同一事务内硬删除该节点的所有关联边（`Edge` 表中 `fromId` 或 `toId` 等于该节点的记录）

---

## 四、状态写入护栏

所有通过 `PATCH /nodes/:id` 的状态变更，在写入前由 `NodeService` 统一校验：

| 操作 | 校验规则 | 失败响应 |
|---|---|---|
| 任意写入 | 节点是 `archived` | `409 NODE_ARCHIVED` |
| 设置 `completed` | 节点当前是 `blocked`（必须先提交 resolution） | `409 UNRESOLVED_CHECKPOINT` |
| 设置 `completed` | 存在未 `completed` 的 `composition` 子节点（`fromId=本节点, type=composition`） | `409 INCOMPLETE_CHILDREN` |
| 设置 `active` | 存在未 `completed` 的 `dependency` 目标（`fromId=本节点, type=dependency`） | `409 UNRESOLVED_DEPENDENCY` |
| `blocked → active` 直接 PATCH | `blocked` 状态只能通过 resolution API 解锁 | `409 USE_RESOLUTION_API` |
| `completed → <非 archived>` | `completed` 节点近不可变——唯一允许的出口是 `archived`（显式退役），其余状态变更一律拒绝，保证审计完整性 | `409 NODE_COMPLETED` |

---

## 五、写入流程

### 5.0 POST /projects/:id/init — 初始化项目根节点

> 依赖说明：Graph Engine 假设每个项目有且仅有一个 `isProjectRoot=true` 的节点。此节点需在项目创建时由上层（Project 模块或初始化流程）调用一次，Graph Engine 本身不感知"项目创建"事件。

```
// 幂等接口，重复调用返回已有根节点
1. 查 projectId 下是否已有 isProjectRoot=true 的节点
2. 若已有 → 返回该节点（200）
3. 若无 → 插入 Node { isProjectRoot: true, type: 'scaffold', title: '[Project Root]',
                       status: 'active', createdBy: 'human', projectId }
```

### 5.1 POST /projects/:id/nodes — 创建节点

```
1. 查 projectId 下的根节点（isProjectRoot=true），不存在则 404
2. 事务内：
   a. 插入 Node（status: active, isProjectRoot: false）
   b. 插入 Edge { fromId: rootNode.id, toId: newNode.id, type: 'composition', projectId }
      // 新节点默认挂到根节点，保证无游离节点
      // 后续可通过 PATCH /nodes/:id/edges 移动到正确父节点
```

### 5.2 PATCH /nodes/:id — 更新节点

```
1. 加载节点，运行护栏校验
2. 更新字段（title / description / status / isCheckpoint）
3. 若 status 变更 → 推 BullMQ Job: graph.node.status_changed
```

### 5.3 PATCH /nodes/:id/resolution — 提交 Checkpoint 判决

```
1. 加载节点，校验：status=blocked 且 isCheckpoint=true，否则 409
2. 更新：checkpointResolution=resolution, status='active'
3. 推 BullMQ Job: graph.checkpoint.resolved
```

### 5.4 POST /edges — 创建边

```
// 事务外校验
1. 查 fromNode, toNode 存在且未 archived，否则 404
2. fromNode.status=completed → 409 COMPLETED_NODE_IMMUTABLE

// DB 事务内
3. 插入 Edge
4. 加载该项目所有边（含新插入的）→ 传给 CycleDetector
5. CycleDetector.detect(fromId, toId, allEdges)
   - DFS 从 toId 出发，仅遍历 composition + dependency 边
   - 若能回到 fromId → 返回 cyclePath[]，否则 null
6a. 无环 → 提交事务
6b. 有环 →
   a. 在 cyclePath 中按全图入度排序，最高者升级
      - 入度 = count(edges WHERE toId=nodeId AND projectId=X)
      - 并列时取 DFS 遍历顺序中先遇到的
   b. UPDATE Node: isCheckpoint=true, status='blocked'
   c. 提交事务

// 事务提交后
7a. 无环 → 推 graph.edge.created
7b. 有环 → 推 graph.node.checkpoint_elevated
```

### 5.5 PATCH /nodes/:id/edges — 原子移动节点

```
// 将节点从当前父节点移到新父节点（原子替换指定类型的边）
Body: { type: 'composition' | 'dependency', newFromId: string }

1. 查 newFromId 节点存在且未 archived，否则 404
2. 事务内：
   a. 删除本节点所有 type=body.type 类型的入边（fromId=任意, toId=本节点）
   b. 插入新边 { fromId: newFromId, toId: nodeId, type: body.type }
   c. 运行环检测（同 POST /edges 步骤 4-6）
3. 事务提交后推对应 Job（无环: graph.edge.created；有环: graph.node.checkpoint_elevated）
```

### 5.6 DELETE /nodes/:id — 删除节点（参数化策略）

请求体：`{ strategy: 'block' | 'cascade' | 'reparent-to-parent' | 'reparent-to-root' }`，默认 `block`。

| 策略 | 行为 |
|---|---|
| `block` | 有任意 composition 子节点 → 409，附 affectedNodes 列表 |
| `cascade` | 递归归档所有 composition 子孙 + 硬删除其所有边 |
| `reparent-to-parent` | 将直接 composition 子节点重挂到本节点的父节点；父节点不唯一时 → 409 AMBIGUOUS_PARENT |
| `reparent-to-root` | 将直接 composition 子节点重挂到项目根节点（唯一确定） |

所有策略执行后：硬删除本节点的所有关联边，将节点设为 `archived`。  
所有策略均在单个 DB 事务内完成，响应包含 `affectedNodeIds`。  
删除完成后推 Job: `graph.node.deleted { nodeId, strategy, affectedNodeIds, projectId }`。

> **dependency 边子节点不受影响**：dependency 是"依赖"而非"从属"，删除节点时只删相关边，dependency 目标节点无需移动。

---

## 六、CycleDetector 算法

```typescript
// cycle-detector.service.ts — 纯函数，无任何 IO
function detect(fromId: string, toId: string, edges: Edge[]): string[] | null {
  // 所有边均参与流程约束检测
  const graph = buildAdjacency(edges)
  const path: string[] = []
  const visited = new Set<string>()

  function dfs(nodeId: string): boolean {
    if (nodeId === fromId) return true  // 找到环
    if (visited.has(nodeId)) return false
    visited.add(nodeId)
    path.push(nodeId)
    for (const neighbor of graph[nodeId] ?? []) {
      if (dfs(neighbor)) return true
    }
    path.pop()
    return false
  }

  return dfs(toId) ? [fromId, ...path] : null
}
```

入参 `edges` 由 `GraphRepository` 在事务内一次性加载整个项目的边后传入，零额外 DB 查询。

---

## 七、BullMQ Job 类型

所有 Job 由 `GraphEventPublisher` 统一推送到同一个队列（`graph-events`）。

```typescript
type GraphJob =
  | { type: 'graph.edge.created'
      payload: { edgeId: string; fromId: string; toId: string; edgeType: EdgeType; projectId: string } }

  | { type: 'graph.node.checkpoint_elevated'
      payload: { nodeId: string; cyclePath: string[]; projectId: string } }

  | { type: 'graph.node.status_changed'
      payload: { nodeId: string; status: NodeStatus; previousStatus: NodeStatus; projectId: string } }

  | { type: 'graph.checkpoint.resolved'
      payload: { nodeId: string; resolution: 'continue' | 'loop'; projectId: string } }

  | { type: 'graph.node.deleted'
      payload: { nodeId: string; strategy: DeleteStrategy; affectedNodeIds: string[]; projectId: string } }
```

---

## 八、API 路由总览

### 节点

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/projects/:id/init` | 初始化项目根节点（幂等） |
| `POST` | `/projects/:id/nodes` | 创建节点，自动挂根节点 |
| `PATCH` | `/nodes/:id` | 更新节点属性（含状态，护栏校验） |
| `PATCH` | `/nodes/:id/resolution` | 提交 Checkpoint 判决（continue \| loop） |
| `GET` | `/projects/:id/nodes` | 查询项目全部节点（过滤 isProjectRoot） |
| `GET` | `/nodes/:id/subgraph` | 查询节点及其 composition 子孙 |
| `DELETE` | `/nodes/:id` | 按策略删除（body: { strategy }） |

### 边

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/edges` | 创建边，触发环检测 |
| `DELETE` | `/edges/:id` | 删除边 |
| `GET` | `/projects/:id/edges` | 查询项目全部边 |
| `PATCH` | `/nodes/:id/edges` | 原子替换节点指定类型的边（移动节点用），同样触发环检测 |

---

## 九、边界说明

- Graph Engine **不调用 LLM**，不主动发起操作
- **删除策略的选择**由 Agent Orchestrator（可用 LLM 分析子图语义）或人通过 API 决定
- **父节点状态是否推进**由 Orchestrator 在收到 `graph.node.status_changed` Job 后决定，Graph Engine 只做校验护栏
- `isProjectRoot=true` 的根节点不对外暴露（`GET /projects/:id/nodes` 过滤），不可删除

---

## 十、设计备注：checkpoint 历史与 `checkpointResolution` 字段

### 背景

同一个节点可能多次被升级为 checkpoint（例如提案反复被打回重做）。最初曾考虑在 Graph 层增加 `CheckpointEvent` 历史表来记录每轮判决。

### 决策

**不在 Scaffold Graph 层扩展历史表。** checkpoint 的判决理由、审阅意见、多轮历史属于"内容语义"，由 **Knowledge Engine** 承载：

- 每次 checkpoint 被 resolve 后，Orchestrator 在 Knowledge Engine 中针对该 node 创建一条 `category=decision` 的 `KnowledgeEntry`，记录本轮判断背景
- 多轮打回 = 多条 KnowledgeEntry，`KnowledgeRevision` 天然支持版本追溯
- Graph 层只负责结构事实（当前是否 blocked、最终判决是什么）

### `checkpointResolution` 字段的定位

该字段**保留在 Node 上**，作为最新轮次判决的冗余快照（`continue` | `loop`）：

- 方便在不查询 Knowledge Engine 的情况下快速读取当前结论
- Graph Engine 状态机本身**不依赖此字段**做任何决策（状态推进依赖 `status` 和 `isCheckpoint`）
- Knowledge Engine 是判决内容的权威来源；若两者不一致，以 Knowledge 为准

### 层次分工

| 层 | 存什么 |
|---|---|
| Scaffold Graph (`checkpointResolution`) | 结构事实：最新轮次的判决结果（快照） |
| Knowledge Engine (`KnowledgeEntry`) | 内容语义：为什么打回、审阅意见、每轮决策背景、完整历史 |
