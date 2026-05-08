# Scaffold Graph Engine — 设计文档

## 职责

Graph 结构和节点生命周期的领域服务。只响应外部调用（API Layer 或 Agent Orchestrator），不主动发起任何操作，不调用 LLM。

---

**日期**：2026-05-04  
**状态**：待实现

---

## 一、核心概念

### 1.1 节点分类

Graph 里有两类节点，区别在于谁创建、谁负责：

| | **Scaffold Node（骨架节点）** | **Growth Node（生长节点）** |
|---|---|---|
| 创建者 | 人（通过 API） | Agent Orchestrator 或人 |
| 粒度 | 高层：项目阶段、里程碑、功能模块 | 细粒度：具体任务、子问题、调查分支 |
| 稳定性 | 相对稳定，轻易不删 | 可自由增删，生命周期较短 |
| 示例 | "后端 API 开发"、"上线前测试" | "修复登录态丢失 bug"、"调研 Redis 方案" |

Growth Node 的创建由 Agent Orchestrator 决定，Graph Engine 本身不主动生成节点。所有节点必须通过边连接到 Graph 中，不存在游离节点（Project 根节点除外）。

### 1.2 图结构

整体是**有向图（允许环）**，而非 DAG：

- 节点可以有多个父节点（一个 Growth Node 可同时挂在两个 Scaffold Node 下）
- 允许环路存在，但环路会触发 Checkpoint 升级机制（见 1.3）
- Project 作为虚拟根节点，所有无其他父节点的节点默认挂在 Project 下

### 1.3 Checkpoint 机制

Checkpoint 是节点的属性标记（`isCheckpoint: true`），不是独立节点类型。

**触发路径（两条）：**

1. **人工标记**：用户通过 API 显式将某节点标为 Checkpoint
2. **环检测自动升级**：写入新边时系统检测到环路，将环中入度最高的节点自动升级为 Checkpoint，状态置为 `blocked`，等待人工判决

**判决结果（`checkpointResolution`）：**

- `continue`：结束本轮循环，节点状态恢复 `active`，流程向前推进
- `loop`：再循环一次，节点状态恢复 `active`，Agent Orchestrator 重新分析该节点上下文

**双层环检测（防御性设计）：**

- **Graph Engine 层**：写边时硬检测，发现环则**允许写入并同时触发 Checkpoint 升级 + 发出事件**，不拒绝写入
- **Agent Orchestrator 层**：调用写边 API 前做前置分析，预判是否成环；若会成环，先组织阶段汇总再决定是否落边

两层各负其责：Orchestrator 尽量提前处理，Graph Engine 兜底保证数据层状态一致性。

### 1.4 边的类型

| 类型 | 语义 | 流程约束 |
|---|---|---|
| `composition` | `to` 是 `from` 的子部分，`to` 完成后 `from` 才能推进 | 有 |
| `dependency` | `from` 依赖 `to` 完成才能开始，但 `to` 不属于 `from` | 有 |

---

## 二、数据模型

### Node

```typescript
interface Node {
  id: string                // UUID
  projectId: string         // UUID
  type: 'scaffold' | 'growth'
  title: string
  description?: string
  status: 'active' | 'blocked' | 'completed' | 'archived'
  isCheckpoint: boolean
  checkpointResolution: 'continue' | 'loop' | null
  createdBy: 'human' | 'agent'
  createdAt: Date
  updatedAt: Date
}
```

### Edge

```typescript
interface Edge {
  id: string                // UUID
  fromId: string            // 源节点 UUID
  toId: string              // 目标节点 UUID
  type: 'composition' | 'dependency'
  createdBy: 'human' | 'agent'
  createdAt: Date
}
```

---

## 三、节点生命周期

```
active ──────────────────────────▶ completed
  │
  ▼
blocked  ◀──── 环检测自动升级（isCheckpoint = true）
  │
  ▼  （人工提交 checkpointResolution）
  ├── "continue" ──▶ active（推进，跳出循环）
  └── "loop"     ──▶ active（再循环，Orchestrator 重新分析）

任意状态 ──▶ archived（软删除，保留数据，不参与流程计算）
```

---

## 四、API 接口

Graph Engine 只暴露被动 CRUD，不含 LLM 调用或主动逻辑。

### 节点

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/projects/:id/nodes` | 创建节点（type, title, createdBy） |
| `PATCH` | `/nodes/:id` | 更新节点属性（title, description, status, isCheckpoint） |
| `PATCH` | `/nodes/:id/resolution` | 提交 Checkpoint 判决（continue \| loop） |
| `GET` | `/projects/:id/nodes` | 查询项目下全部节点 |
| `GET` | `/nodes/:id/subgraph` | 查询节点及其下方子图（含所有边） |
| `DELETE` | `/nodes/:id` | 软删除（→ archived） |

### 边

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/edges` | 创建边（fromId, toId, type）；写入后触发环检测 |
| `DELETE` | `/edges/:id` | 删除边 |
| `GET` | `/projects/:id/edges` | 查询项目下全部边 |
| `PATCH` | `/nodes/:id/edges` | 原子性替换节点指定类型的边（移动节点用）；同样触发环检测 |

### 内部领域事件（Domain Event，供 Agent Orchestrator 订阅）

Graph Engine 状态变更后向外发出的通知，属于系统内部信号，与 Event Pipeline 处理的外部触发事件（Trigger Event）性质不同。

| 事件 | 触发时机 |
|---|---|
| `graph.node.checkpoint_elevated` | 环检测触发 Checkpoint 自动升级 |
| `graph.node.status_changed` | 节点状态变更 |
| `graph.checkpoint.resolved` | 人工判决完成 |

---

## 五、数据流转

```
GitHub Webhook
      │
      ▼
 GitHub Adapter
  （归一化为 NormalizedEvent）
      │
      ▼
 Event Pipeline
  （去重 → Enrich → Route）
      │
      ▼
 Agent Orchestrator
  （所有事件统一经由 LLM 分析）
      │                          Graph Engine 发出领域事件（pub/sub）
      │                          如 checkpoint_elevated → 触发 AI 后续处理
      │                          ◀──────────────────────────────────┐
      │                                                             │
      ├──────────────────────────▶ Graph Engine ───────────────────┘
      │                        （创建/更新节点、边）
      │
      └──────────────────────────▶ Knowledge Engine
                               （创建/更新知识条目）
                                        │
                               REST API / WebSocket
                                        │
                                  Web Dashboard
```

> 外部事件和Node的存储关系是多对一的关系
> 可能会出现孤立event难以直接载入Node下的情况，需要agent orchestrator详细设计

**术语区分：**

- **外部触发事件（Trigger Event）**：来自 GitHub 的原始信号，由 Event Pipeline 归一化后全部路由到 Agent Orchestrator
- **内部领域事件（Domain Event）**：Graph Engine 状态变更后发出的 pub/sub 通知；特定事件（如 `checkpoint_elevated`）会反向触发 Orchestrator 做 AI 后续处理

---

## 六、边界说明

- Graph Engine **不调用 LLM**，不主动发起操作，不决定何时创建子节点
- 子节点（Growth Node）的创建时机和内容由 **Agent Orchestrator** 决定
- Checkpoint 升级后的 AI 汇总分析由 **Agent Orchestrator** 负责，Graph Engine 只负责状态变更和事件发出
- 知识条目与节点的关联关系由 **Knowledge Sedimentation Engine** 管理，Graph Engine 不直接操作知识条目
