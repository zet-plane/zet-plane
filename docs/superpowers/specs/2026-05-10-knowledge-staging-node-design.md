# Knowledge Staging Node — 设计文档

**日期**：2026-05-10  
**状态**：设计中

---

## 一、背景

Knowledge Engine 原设计已经通过 `EntryStatus` 表达知识内容的沉淀程度：

```text
draft -> published -> deprecated
```

这套状态解决的是：

```text
这条知识是否已经成熟？
```

但它没有明确解决另一个问题：

```text
一条零散事件在还不知道应该挂到哪个正式节点时，应该放在哪里？
```

因此需要补充一个明确的暂存设计，让零散事件可以先进入项目暂存区，经过修订和整理后，再迁移到正式节点。

---

## 二、核心结论

保留原来的 `EntryStatus` 语义：

```text
draft      内容还在沉淀
published  内容已经可作为正式知识
deprecated 内容已经废弃
```

新增 **Staging Node** 语义：

```text
nodeId 指向 staging node = 位置还未确定
nodeId 指向正式归属节点 = 位置已经确定
```

两者是两个不同维度：

| 维度 | 字段/结构 | 含义 |
|---|---|---|
| 内容成熟度 | `KnowledgeEntry.status` | 这条知识是否沉淀完成 |
| 挂载确定性 | `KnowledgeEntry.nodeId` 指向 staging node / 正式归属节点 | 这条知识是否已经找到正式归属 |

---

## 三、Staging Node 定义

Staging Node 是每个 project 下的系统保留节点，用作知识暂存区入口。

推荐结构：

```text
[Project Root]
└── [Staging Area]
```

Staging Node 不表示普通任务流程，而表示：

```text
这个项目中暂时无法归类到正式节点的知识条目集合。
```

每个 project 只有一个 Staging Node。它在 project 创建时由系统自动创建，不由 `createNode` / `updateNode` / entry 创建流程创建。

---

## 四、数据模型建议

在 `NodeType` 中增加：

```prisma
enum NodeType {
  scaffold
  growth
  staging
}
```

在 `Node` 上增加一个角色枚举字段：

```prisma
enum NodeRole {
  regular
  project_root
  staging_root
}

model Node {
  role NodeRole @default(regular)
}
```

推荐节点约定：

```text
Project Root:
  role = project_root
  type = scaffold

Staging Node:
  role = staging_root
  type = staging
  title = "[Staging Area]"

普通节点:
  role = regular
```

`KnowledgeEntry.nodeId` 仍然保持必填。系统不引入 `nodeId = null` 的游离知识。

使用 `role` 而不是多个 boolean，可以避免非法组合，例如同一个节点同时被标记为 project root 和 staging root。

---

## 五、创建 Entry 的行为

接口保持：

```http
POST /projects/:id/entries
```

但 `nodeId` 从必填改为可选。

### 5.1 传入 nodeId

如果请求体包含 `nodeId`：

```text
1. 校验 project 存在
2. 校验 node 存在
3. 校验 node.projectId === projectId
4. 创建 KnowledgeEntry
5. 同步创建 KnowledgeRevision v1
```

### 5.2 不传 nodeId

如果请求体不包含 `nodeId`：

```text
1. 校验 project 存在
2. 查找当前 project 的 staging node
3. 如果不存在，返回 PROJECT_STAGING_NOT_INITIALIZED
4. 将 entry.nodeId 设置为 staging node id
5. 创建 KnowledgeEntry
6. 同步创建 KnowledgeRevision v1
```

调用方可以发送：

```json
{
  "category": "context",
  "title": "一次尚未归类的讨论",
  "body": {
    "raw": "讨论中提到某个接口可能需要调整"
  },
  "createdBy": "human"
}
```

返回的 entry 仍然包含 `nodeId`，只是该 `nodeId` 由系统自动指向 `[Staging Area]`。

---

## 六、沉淀与迁移流程

完整流程：

```text
零散事件
  ↓
POST /projects/:id/entries，不传 nodeId
  ↓
entry 自动挂到 [Staging Area]
  ↓
status = draft
  ↓
PATCH /entries/:id/body，持续追加 revision
  ↓
判断出正式归属
  ↓
PATCH /entries/:id { nodeId: <formal-node-id> }
  ↓
PATCH /entries/:id { status: "published" }
```

`reanchor` 不产生 revision，因为它表达的是挂载位置迁移，不是知识正文变化。

---

## 七、保护规则

Staging Node 是系统保留节点，建议加以下限制：

```text
1. 不能删除 staging node
2. 不能 archive staging node
3. 不能 completed staging node
4. 不能把 staging node 当成普通业务节点移动
5. 可以查询 staging node 下的 entries，作为待沉淀列表
6. public create/update node API 不能创建或改造 staging node
7. public edge API 不能给 staging node 增加额外结构
```

这些限制避免暂存区被误删或被错误地当成普通流程节点完成。

---

## 八、与原 EntryStatus 设计的关系

原来的 `EntryStatus` 不需要废弃。

它继续表达内容成熟度：

```text
draft      还在沉淀
published  已经正式沉淀
deprecated 已经废弃
```

Staging Node 补充表达挂载确定性：

```text
staging node    还不知道正式归属
正式归属节点     已经知道正式归属
```

这里的“正式归属节点”不是新的 schema 类型，而是指非 staging 的业务节点。第一版中通常是：

```text
role = regular
type = scaffold | growth
```

常见组合：

| 组合 | 含义 |
|---|---|
| `draft + staging node` | 零散事件，还在沉淀，位置也未确定 |
| `draft + 正式归属节点` | 位置已确定，但内容还在整理 |
| `published + 正式归属节点` | 正式知识 |
| `published + staging node` | 不推荐，表示内容成熟但位置仍未确定 |

---

## 九、第一版边界

第一版只实现 project-level staging node。

暂不引入：

```text
Graph 表
graph.kind = staging
每个子图独立 staging graph
复杂的事件聚类/合并/拆分逻辑
```

这些能力可以在 Graph 模型成熟后再扩展。

---

## 十、测试建议

需要覆盖：

```text
1. Project 创建时自动创建 project root 和 staging node
2. createEntry 传 nodeId 时，保持现有行为
3. createEntry 不传 nodeId 时，复用 project 已有 staging node
4. createEntry 不传 nodeId 时，entry.nodeId 指向 staging node
5. cross-project nodeId 仍然拒绝
6. reanchor 到正式 node 正常
7. staging node 不能被删除
8. staging node 不能被标记 completed/archive
9. createNode 不能创建 `NodeType.staging`
10. edge API 不能给 staging node 添加额外 graph 结构
```
