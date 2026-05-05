# Knowledge Sedimentation Engine — 设计文档

**日期**：2026-05-05
**状态**：待实现

---

## 一、职责与边界

Knowledge Sedimentation Engine（以下简称 KE）是 KnowledgeEntry 的领域服务。管理知识条目的生命周期、渐进式修订历史，以及与 Graph 节点和事件的关联关系。

**KE 不做的事：**
- 不调用 LLM
- 不主动发起任何操作
- 不校验 `nodeId` 指向的节点是否存在或合法（由调用方负责）
- 不直接 import Graph Engine 模块

---

## 二、核心概念

### 2.1 暂存图（Staging Graph）

每个项目除主 Scaffold Graph 外，还有一个 **Staging Graph**，专门承载无法立即锚定到主图节点的事件。

**设计动机**：事件进入系统时，Orchestrator 可能需要积累多个相关事件才能判断应挂到哪个主图节点，单个事件无法立即决策。Staging Graph 提供了结构化的暂存空间——Orchestrator 在其中创建 Growth Node 并用边表达事件关系，待上下文足够后整体迁移至主图。

**约束**：
- 知识条目**必须锚定到某个节点**（主图或 Staging Graph 的节点均可）
- 不存在 `nodeId` 为空的知识条目，「无游离知识」约束始终成立
- Staging Graph 的节点由 Orchestrator 创建，KE 不感知图的类型（主图/暂存图）

### 2.2 EntryCategory

| category | 语义 |
|---|---|
| `decision` | 技术决策，含备选方案和否决理由 |
| `pitfall` | 坑点，含触发条件和规避方式 |
| `finding` | 调研发现，含结论和依据 |
| `context` | 背景说明，不含明确结论的过程性记录 |

`body` 字段为 JSONB，结构由 category 约定推荐模板，但不强制 schema。

### 2.3 渐进式修订

每次 body 变更追加一条 `KnowledgeRevision` 记录，保留完整演变轨迹。version 从 1 开始递增，由 repository 层在事务内自增，不由调用方传入。

---

## 三、数据模型

### KnowledgeEntry

```typescript
interface KnowledgeEntry {
  id: string                  // UUID
  projectId: string           // 冗余，加速按项目查，与 Graph Engine 风格一致
  nodeId: string              // 必须锚定节点（主图或 Staging Graph）
  category: EntryCategory
  title: string
  body: JsonValue             // JSONB，结构由 category 约定但不强制
  status: EntryStatus
  createdBy: 'human' | 'agent'
  createdAt: Date
  updatedAt: Date
}

type EntryCategory = 'decision' | 'pitfall' | 'finding' | 'context'
type EntryStatus = 'draft' | 'published' | 'deprecated'
```

### KnowledgeRevision

```typescript
interface KnowledgeRevision {
  id: string
  entryId: string
  version: number             // 从 1 开始递增
  body: JsonValue             // 本版本 body 的完整快照
  changeNote?: string         // 本次修订说明（Agent 可自动生成）
  createdBy: 'human' | 'agent'
  createdAt: Date
}
```

**写入约定：**
- 创建 Entry 时同步写入 `version=1` 的 Revision（事务内原子操作）
- `PATCH /entries/:id/body` 追加新 Revision，version 自增
- `PATCH /entries/:id`（title / status / category）不产生新 Revision

---

## 四、状态流转

### Entry Status

```
draft ──────────────────▶ published
  │                           │
  └──────────────────────▶ deprecated ◀──┘
```

**规则：**
- `deprecated` 是终态，不可逆
- `published → draft` 不允许
- `published` 状态下 body 仍可修订（渐进式沉淀），修订会触发 `knowledge.entry.body_revised` 事件
- `deprecated` 条目不允许 reanchor，不允许修订 body

### Reanchor 规则

- `nodeId` 可通过 `PATCH /entries/:id` 更新（`draft` / `published` 状态均可）
- reanchor 不产生新 revision
- 触发 `knowledge.entry.reanchored` 领域事件，供 Orchestrator 感知迁移完成

---

## 五、API 接口

### 知识条目

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/projects/:id/entries` | 创建条目，同步写入 revision v1 |
| `GET` | `/projects/:id/entries` | 列出项目下所有条目，支持 `?category=` `?nodeId=` `?status=` 过滤 |
| `GET` | `/entries/:id` | 查询单条，含最新 body |
| `PATCH` | `/entries/:id` | 更新 title / status / category / nodeId（不产生 revision） |
| `PATCH` | `/entries/:id/body` | 更新 body，追加新 revision；`deprecated` 状态下返回 409 |
| `DELETE` | `/entries/:id` | 软删除，status → `deprecated` |

### 修订历史

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/entries/:id/revisions` | 列出该条目所有修订版本（按 version 升序） |
| `GET` | `/entries/:id/revisions/:version` | 查询指定版本的 body 快照 |

### 内部领域事件（供 Agent Orchestrator 订阅）

| 事件 | 触发时机 |
|---|---|
| `knowledge.entry.created` | 新条目创建 |
| `knowledge.entry.body_revised` | body 被更新，revision 追加 |
| `knowledge.entry.status_changed` | status 变更 |
| `knowledge.entry.reanchored` | nodeId 被更新（暂存图节点迁移到主图后触发） |

---

## 六、模块结构

```
src/knowledge/
├── index.ts
├── knowledge.module.ts
├── knowledge.controller.ts
├── knowledge.controller.spec.ts
├── entry/
│   ├── entry.service.ts               # 条目生命周期逻辑（status 流转、reanchor）
│   └── entry.service.spec.ts
├── revision/
│   ├── revision.service.ts            # revision 追加、版本查询
│   └── revision.service.spec.ts
├── repository/
│   └── knowledge.repository.ts        # Prisma 操作，事务封装
└── events/
    ├── knowledge-event.publisher.ts   # 发出四类领域事件
    └── knowledge-event.publisher.spec.ts
```

**各层职责：**

| 层 | 职责 |
|---|---|
| `KnowledgeController` | 路由 + DTO 校验，不含业务逻辑 |
| `EntryService` | status 流转校验、reanchor 逻辑、调用 publisher |
| `RevisionService` | version 自增、body 快照写入 |
| `KnowledgeRepository` | 所有 Prisma 调用，`createEntryWithRevision` 用事务保证原子性 |
| `KnowledgeEventPublisher` | 发出四类领域事件，接口与 `GraphEventPublisher` 对称 |

---

## 七、数据流转

```
Agent Orchestrator
      │
      ├──── POST /projects/:id/entries ──▶ KnowledgeRepository
      │                                    (事务：createEntry + createRevision v1)
      │                                          │
      │                                          ▼
      │                                   knowledge.entry.created 事件
      │
      ├──── PATCH /entries/:id/body ──▶ RevisionService
      │                                    (version 自增，body 快照)
      │                                          │
      │                                          ▼
      │                                   knowledge.entry.body_revised 事件
      │
      └──── PATCH /entries/:id (nodeId) ──▶ EntryService
                                              (reanchor，校验非 deprecated)
                                                    │
                                                    ▼
                                             knowledge.entry.reanchored 事件
```

---

## 八、与 Staging Graph 的协作流程

```
外部事件（无法立即锚定主图）
      │
      ▼
Agent Orchestrator
  在 Staging Graph 创建 Growth Node（通过 Graph Engine API）
      │
      ▼
  创建 KnowledgeEntry，nodeId → Staging Graph 节点
      │
      ▼
  （积累更多相关事件，在 Staging Graph 中建边组织关系）
      │
      ▼
  上下文足够，决定迁移
      │
      ├── 更新 Staging Graph 节点（或在主图创建新节点）
      └── PATCH /entries/:id { nodeId: <主图节点 id> }
                │
                ▼
          knowledge.entry.reanchored 事件
```
