# Model — 当前数据模型

## 状态

当前服务端模型定义在 `apps/server/prisma/schema.prisma`，使用 Prisma Client、PostgreSQL 和 `pgvector` 扩展。核心领域包括 Project、Graph Node/Edge、Knowledge Entry/Revision。

## 模型关系

```text
Project
  ├── Node
  │     ├── Project Root      role=project_root, type=scaffold
  │     ├── Staging Area      role=staging_root, type=staging
  │     └── Regular Nodes     role=regular, type=scaffold|growth
  ├── Edge
  │     ├── composition
  │     └── dependency
  └── KnowledgeEntry
        └── KnowledgeRevision
```

项目是所有业务数据的隔离边界。Graph 的节点和边都带 `projectId`；KnowledgeEntry 也带 `projectId`，并通过 `nodeId` 锚定到同项目节点。

## Project

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `String @id @default(uuid())` | 项目 ID |
| `name` | `String` | 项目名 |
| `description` | `String?` | 项目描述 |
| `createdAt` | `DateTime @default(now())` | 创建时间 |
| `updatedAt` | `DateTime @updatedAt` | 更新时间 |

创建项目时，应用层会在同一事务里初始化 Project Root 和 Staging Area。删除项目时，应用层硬删除该项目下的 KnowledgeRevision、KnowledgeEntry、Edge、Node 和 Project。

## Node

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `String @id @default(uuid())` | 节点 ID |
| `projectId` | `String` | 所属项目 |
| `isProjectRoot` | `Boolean` | 兼容用根节点标记 |
| `role` | `NodeRole` | `regular` / `project_root` / `staging_root` |
| `type` | `NodeType` | `scaffold` / `growth` / `staging` |
| `title` | `String` | 标题 |
| `description` | `String?` | 描述 |
| `status` | `NodeStatus` | `active` / `blocked` / `completed` / `archived` |
| `isCheckpoint` | `Boolean` | 是否 checkpoint |
| `checkpointResolution` | `CheckpointResolution?` | `continue` / `loop` |
| `createdBy` | `CreatedBy` | `human` / `agent` |
| `createdAt` | `DateTime` | 创建时间 |
| `updatedAt` | `DateTime` | 更新时间 |

索引：

- `nodes_project_id_idx`：按项目查询节点。
- `nodes_project_id_role_idx`：按项目和角色查系统节点。

## Edge

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `String @id @default(uuid())` | 边 ID |
| `projectId` | `String` | 所属项目 |
| `fromId` | `String` | 源节点 |
| `toId` | `String` | 目标节点 |
| `type` | `EdgeType` | `composition` / `dependency` |
| `createdBy` | `CreatedBy` | `human` / `agent` |
| `createdAt` | `DateTime` | 创建时间 |

约束和索引：

- `fromId + toId + type` 唯一，避免重复同语义边。
- `projectId`、`fromId`、`toId` 分别建索引，支撑项目图查询、出边查询和入边查询。

当前 schema 未定义 Prisma relation 外键，跨表一致性主要由服务层校验和事务维护。

## KnowledgeEntry

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `String @id @default(uuid())` | 条目 ID |
| `projectId` | `String` | 所属项目 |
| `nodeId` | `String` | 锚定节点 |
| `category` | `EntryCategory` | `decision` / `pitfall` / `finding` / `context` |
| `title` | `String` | 标题 |
| `body` | `Json` | 当前正文 |
| `status` | `EntryStatus` | `draft` / `published` / `deprecated` |
| `embeddingStatus` | `EmbeddingStatus` | `unindexed` / `indexed` |
| `embedding` | `vector(1536)?` | 语义向量 |
| `createdBy` | `CreatedBy` | `human` / `agent` |
| `createdAt` | `DateTime` | 创建时间 |
| `updatedAt` | `DateTime` | 更新时间 |

索引：

- `knowledge_entries_project_id_idx`：按项目查询。
- `knowledge_entries_node_id_idx`：按锚点节点查询。

## KnowledgeRevision

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `String @id @default(uuid())` | 修订 ID |
| `entryId` | `String` | 所属知识条目 |
| `version` | `Int` | 版本号，从 1 开始 |
| `body` | `Json` | 该版本正文 |
| `changeNote` | `String?` | 变更说明 |
| `createdBy` | `CreatedBy` | `human` / `agent` |
| `createdAt` | `DateTime` | 创建时间 |

约束和索引：

- `entryId + version` 唯一。
- `knowledge_revisions_entry_id_idx`：按条目查询修订历史。

## 枚举

| 枚举 | 值 |
|---|---|
| `NodeType` | `scaffold` / `growth` / `staging` |
| `NodeRole` | `regular` / `project_root` / `staging_root` |
| `NodeStatus` | `active` / `blocked` / `completed` / `archived` |
| `CheckpointResolution` | `continue` / `loop` |
| `EdgeType` | `composition` / `dependency` |
| `CreatedBy` | `human` / `agent` |
| `EntryCategory` | `decision` / `pitfall` / `finding` / `context` |
| `EntryStatus` | `draft` / `published` / `deprecated` |
| `EmbeddingStatus` | `unindexed` / `indexed` |

## 当前实现要点

- Project 是根聚合边界，Graph 和 Knowledge 都必须先校验项目存在。
- Project Root 和 Staging Area 是系统节点，创建项目时自动生成。
- 普通节点创建和入边创建在一个事务里完成。
- 成环边允许写入，但会把环中入度最高节点升级为 blocked checkpoint。
- KnowledgeEntry 创建和初始 KnowledgeRevision 创建在一个事务里完成。
- KnowledgeEntry 可以先锚定到 Staging Area，再通过 reanchor 移动到具体业务节点。
- 语义检索依赖外部写入 embedding，数据库内使用 pgvector 距离计算排序。
