# Knowledge Sedimentation Engine — 设计文档

## 状态

当前已在 `apps/server/src/knowledge` 落地为 NestJS 模块，包含 Entry、Revision、Search 三个领域服务，持久化使用 Prisma + PostgreSQL + pgvector，异步领域事件通过 BullMQ `knowledge-events` 队列发布。

## 职责

Knowledge Sedimentation Engine 负责把项目推进过程中的结论、上下文、风险和发现沉淀为可版本化、可重定位、可检索的知识条目。它管理 `KnowledgeEntry` 的生命周期、修订历史、Graph 节点锚点以及向量索引状态。

它不调用 LLM，不主动生成知识，只接收 API Layer 或后续 Agent Orchestrator 提交的结构化写入请求。

## 核心模型

### KnowledgeEntry

知识条目是知识沉淀的当前可读版本。

| 字段 | 说明 |
|---|---|
| `projectId` | 所属项目 |
| `nodeId` | 锚定的 Graph Node |
| `category` | `decision` / `pitfall` / `finding` / `context` |
| `title` | 知识标题 |
| `body` | 任意 JSON 内容，保存当前版本正文 |
| `status` | `draft` / `published` / `deprecated` |
| `embeddingStatus` | `unindexed` / `indexed` |
| `embedding` | `vector(1536)`，由外部预计算后写入 |
| `createdBy` | `human` / `agent` |

### KnowledgeRevision

修订记录保存每次正文变更的快照。创建 Entry 时会在同一个事务里创建 `version = 1` 的初始 Revision；后续 `PATCH /entries/:id/body` 只追加新 Revision，不覆盖历史。

| 字段 | 说明 |
|---|---|
| `entryId` | 所属知识条目 |
| `version` | 从 1 开始递增；`entryId + version` 唯一 |
| `body` | 该版本正文快照 |
| `changeNote` | 可选变更说明 |
| `createdBy` | 修订发起者 |

## Staging Area

项目创建时，Graph Engine 会同步初始化两个系统节点：

- Project Root：虚拟根节点，普通列表接口不返回。
- Staging Area：`type = staging`、`role = staging_root`，作为未归档到具体业务节点的临时知识入口。

创建知识条目时：

- 如果请求显式传入 `nodeId`，Knowledge Engine 会校验该节点属于同一项目。
- 如果请求没有传入 `nodeId`，系统会查找项目的 Staging Area，并把条目锚定到 staging 节点。
- 如果项目缺少 staging 节点，请求返回 `PROJECT_STAGING_NOT_INITIALIZED`。

这使外部事件或人工快速记录可以先落到 staging，再由后续流程通过 `reanchor` 迁移到具体节点。

## 生命周期

```text
draft ─────────▶ published ─────────▶ deprecated
  │                                      ▲
  └──────────────────────────────────────┘
```

当前实现中的约束：

- `draft -> published` 允许。
- `draft -> deprecated` 和 `published -> deprecated` 允许。
- `published -> draft` 不允许，返回 `CANNOT_REVERT_TO_DRAFT`。
- `deprecated` 是终态：不能更新字段、不能追加正文修订、不能 reanchor、不能写入 embedding。
- `DELETE /entries/:id` 是软删除，实际把状态置为 `deprecated`。

## API

### Entry

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/projects/:id/entries` | 创建知识条目；同时创建 v1 revision |
| `GET` | `/projects/:id/entries` | 查询项目知识；支持 `category`、`status`、`nodeId` 过滤 |
| `GET` | `/entries/:id` | 查询单个条目 |
| `PATCH` | `/entries/:id` | 更新字段、状态流转或 reanchor；三类操作互斥 |
| `DELETE` | `/entries/:id` | 软删除为 `deprecated` |

`PATCH /entries/:id` 的互斥规则：

- 传 `status` 时，不能同时传 `title`、`category`、`nodeId`。
- 传 `nodeId` 时，不能同时传 `title`、`category`、`status`。
- 只更新普通字段时，目前支持 `title`、`category`。

### Revision

| 方法 | 路径 | 说明 |
|---|---|---|
| `PATCH` | `/entries/:id/body` | 追加正文修订 |
| `GET` | `/entries/:id/revisions` | 按版本升序查询全部修订 |
| `GET` | `/entries/:id/revisions/:version` | 查询指定版本 |

追加正文修订会根据当前最大版本号生成下一个版本，并发布 `knowledge.entry.body_revised`。

### Search

| 方法 | 路径 | 说明 |
|---|---|---|
| `PATCH` | `/entries/:id/embedding` | 写入外部预计算的 1536 维 embedding |
| `POST` | `/projects/:id/entries/search` | 基于 pgvector 做语义检索 |

搜索实现：

- 仅检索 `embedding_status = indexed` 且 `embedding IS NOT NULL` 的条目。
- 使用 `1 - (embedding <=> queryVector)` 作为相似度分数。
- 支持 `category[]`、`status[]`、`nodeId[]` 过滤。
- `limit` 默认 10，`threshold` 默认 0。

## 领域事件

Knowledge Engine 写入成功后通过 BullMQ 发布内部领域事件，当前事件 worker 还只是日志消费；后续可接 Agent Orchestrator、索引器或通知系统。

| 事件 | 触发时机 |
|---|---|
| `knowledge.entry.created` | 创建条目和初始 revision 后 |
| `knowledge.entry.body_revised` | 追加正文 revision 后 |
| `knowledge.entry.status_changed` | 状态流转后 |
| `knowledge.entry.reanchored` | 条目迁移到新节点后 |
| `knowledge.entry.indexed` | embedding 写入并标记 indexed 后 |

## 边界

- 不负责生成 embedding，只存储外部传入的向量。
- 不负责决定知识应沉淀到哪个业务节点；未指定节点时只落到 staging。
- 不直接修改 Graph 结构，只校验节点归属并保存 `nodeId`。
- 不调用 LLM；后续 Agent Orchestrator 可以调用这些 API 来创建、修订、迁移知识。
