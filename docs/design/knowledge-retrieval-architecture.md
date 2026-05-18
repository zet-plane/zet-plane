# Knowledge Retrieval Architecture — 向量优先、Agent 增强、Project 隔离

## 背景

当前知识系统已经有稳定的基础模型：

```text
Project
  └── Node
        └── KnowledgeEntry
              └── KnowledgeRevision
```

其中：

- `project` 是默认隔离边界
- `node` 是知识锚点
- `knowledge_entry` 是当前可读知识
- `knowledge_revision` 是版本演替链

这套模型适合继续扩展成一套“向量优先检索 + 结构约束 + agent 理解”的知识查询体系。

本文档聚焦的是新的起点：当知识量继续扩大、查询越来越依赖 agent、且需要兼顾项目隔离与必要的跨项目复用时，知识应如何被精准存储、召回、扩展和重排。

## 当前真实实现的约束

基于当前代码实现，已有的事实是：

- `KnowledgeEntry` 必须锚定到某个 `node`
- `KnowledgeEntry` 带 `projectId`
- `KnowledgeRevision` 只表达同一条知识的时间演化
- 语义检索目前严格在单个 `project` 内进行
- 当前没有显式的“知识到知识”的关系边
- 当前 embedding 字段是 `vector(1536)`

因此，现阶段知识关联主要来自三类结构：

1. 同一 `project`
2. 同一 `node` 或相邻 `node`
3. 同一 `entry` 的 revision 链

而以下关系目前尚未显式建模：

- 支撑关系
- 冲突关系
- 覆盖关系
- 重复关系
- 派生关系

这决定了检索架构不能只靠向量一次命中，也不能只靠原始 JSON 文本理解。

## 总体原则

这套系统建议遵循下面的总体原则：

- `project` 做默认边界
- `node` 做导航与锚点
- `revision` 做时间线
- 向量检索做第一跳召回
- 结构化关系做约束与重排
- agent 做知识规范化、查询改写和最终理解

压缩成一句话就是：

**向量库做入口，关系模型做约束，project 做边界，node 做锚点，revision 做时间线，agent 做知识规范化与最终理解。**

## 为什么向量优先，但不能只有向量

“从向量数据库触发”是正确方向，但要明确向量在系统中的定位：

**向量检索负责召回候选，不负责裁定最终真相。**

原因是当前知识并不是裸文本，而是嵌在结构里的知识：

- 它属于某个项目
- 它挂在某个图节点
- 它有成熟度状态
- 它可能处于 staging
- 它可能有多个 revision

如果直接做“问题一来，全库向量搜索”，在大数据量下很快会出现：

- 语义命中但上下文错误
- 跨项目误召回
- staging 知识与正式知识混杂
- 旧 revision 与当前版本混杂

所以推荐的标准链路是：

```text
用户问题
  -> 结构化作用域判断
  -> query rewrite / query embedding
  -> topK vector recall
  -> 回到 node / entry / revision / relations
  -> rerank
  -> 最小充分上下文交给 agent
```

## 默认隔离：Project First

### 默认查询边界

所有知识查询默认应先限定在当前 `project` 中。

这是因为 `project` 在当前系统里不是普通标签，而是业务隔离边界。它同时约束：

- 节点图
- 知识归属
- 事件来源
- agent 的当前上下文

因此项目内搜索应作为主路径，而不是一个可选优化。

### 跨 Project 的设计原则

跨项目检索必须是显式能力，而不是默认行为。

推荐最少分三层范围：

- `private_project`
- `shared_workspace`
- `global_reference`

推荐查询顺序：

1. 先搜当前项目
2. 若召回不足，再补搜共享空间
3. 只有显式授权时，才搜多个项目

这样做可以避免“大向量池”带来的精度塌陷。

## Node 作为知识锚点，而不是可选元数据

当前系统最有价值的结构事实是：知识必须锚定到某个 `node`。

这意味着 node 不应只是返回结果时的附加字段，而应是查询路径的一部分。

### Node 在检索里的作用

- 用于作用域收缩
- 用于语义扩展
- 用于上下文重排
- 用于答案解释

例如一个用户问题很可能不是“全项目的任何知识”，而是：

- 某个 node 的决策依据
- 某个子图下的历史发现
- 某条任务链相关的坑点和背景

因此推荐的查询入口往往不是“先扫 knowledge”，而是：

1. 先推断相关 node 或 node 子树
2. 再在这些 node 范围内做知识召回

## Revision 是时间线，不是召回主对象

`KnowledgeRevision` 的核心职责是保留演化轨迹，不应直接替代 `KnowledgeEntry` 成为默认检索单元。

推荐原则：

- 默认检索主对象是 `KnowledgeEntry`
- `Revision` 主要在结果扩展阶段补充
- 只有在“追溯演化过程”场景才主动查 revision

适合主动拉 revision 的问题包括：

- 这个决策是什么时候变化的
- 最新结论覆盖了哪些旧说法
- 为什么某条知识最近被修改

## 当前缺口：知识关联尚未显式建模

当前最值得增强的地方，不是立刻换更大的 embedding 模型，而是补一层显式知识关系。

推荐未来增加 `knowledge_relations` 一类表，至少支持：

- `supports`
- `contradicts`
- `supersedes`
- `duplicates`
- `derived_from`
- `related_to`

每条关系建议至少包含：

- `project_id`
- `source_entry_id`
- `target_entry_id`
- `type`
- `weight`
- `created_by`
- `created_at`

这会直接增强 agent 对下面问题的可回答性：

- 这个决策依据是什么
- 这条 finding 支撑了哪些结论
- 哪些知识已经被新知识取代
- 哪些坑点本质上是同一个问题

## Embedding 模型怎么考虑

### 当前默认建议

在当前架构下，默认推荐从 `text-embedding-3-small` 起步。

原因：

- 当前字段就是 `vector(1536)`，与默认输出维度匹配
- 当前检索已有 `project/node/status/category` 等结构约束
- 项目内知识检索更适合优先追求成本和延迟稳定

### 什么时候考虑更高规格模型

只有在下面场景，才建议认真评估升级：

- 跨项目共享知识很多
- 多语言比例高
- 语义边界特别细
- 离线评测确认 `small` 的 topK 召回不足

### 模型并不是首要瓶颈

对这类知识系统，embedding 质量经常不是先输在模型，而是先输在“喂进去的文本不对”。

也就是说：

- 不建议直接 embed 原始 `body JSON`
- 更建议先生成面向检索的文本表示

## Agent 前处理：不是裁判，是知识规范化器

可以在 embedding 前面加 agent，但更合适的定位不是“先让 agent 决定留什么扔什么”，而是：

**让 agent 负责把知识整理成适合检索的表示。**

### 入库前的 agent 前处理

建议在知识创建或修订后，先从原始 `body` 中抽取：

- `summary`
- `canonical_question`
- `key_facts`
- `decision`
- `risks`
- `keywords`
- `entities`
- `applicable_scope`

然后生成 `retrieval_text`，再做 embedding。

推荐的 `retrieval_text` 结构：

```text
Title: ...
Category: ...
Summary: ...
Decision: ...
Key facts: ...
Risks: ...
Keywords: ...
Applicable scope: ...
```

这一步的价值很大：

- 统一不同 entry 的表达
- 去掉不适合检索的噪声
- 为后续 chunking 做准备
- 让较小 embedding 模型也能获得更稳定的效果

### 查询前的 agent 轻处理

查询前也可以有一层 agent，但建议做轻处理，只负责：

- 意图识别
- 查询改写
- 去歧义
- 提取结构化过滤条件

例如从用户问题中识别：

- 是否只限当前项目
- 是否只限当前 node 或子图
- 偏好的知识类别
- 是否允许跨项目补召回

不建议把每次查询都变成“先让大 agent 全量读懂，再决定搜什么”，那样成本和延迟都会失控。

## Body 与 Retrieval Text 的分工

建议未来逐步把知识内容分成两层：

- `body`：业务真相，保留原始结构和当前可读正文
- `retrieval_text`：检索真相，专门服务 embedding 和向量召回

二者不要混为一谈。

这样有几个好处：

- 不用为了检索去污染 `body`
- 不用为了保真把噪声字段硬塞进 embedding
- 可以独立优化检索策略而不破坏知识正文

## 检索单元的演进路线

### 第一阶段：Entry 级 embedding

现阶段最现实的做法，是每个 `KnowledgeEntry` 只保留一份高质量 `retrieval_text`，并生成一条 embedding。

优点：

- 改动小
- 与现有 schema 兼容
- 足够验证项目内召回质量

### 第二阶段：Chunk 级 embedding

当单条知识变长、知识量变大后，建议演进到 chunk 级检索。

可以增加 `knowledge_chunk` 或 `knowledge_segment` 一类表，每个 chunk 带：

- `project_id`
- `entry_id`
- `revision_id` 或 `version`
- `node_id`
- `chunk_type`
- `text`
- `embedding`
- `metadata`

`chunk_type` 可先支持：

- `summary`
- `fact`
- `decision`
- `evidence`
- `risk`

这样 agent 问“依据是什么”时，更容易先命中 `evidence`，而不是整条 entry 的全部文本。

## 推荐查询链路

推荐采用“缩圈 -> 召回 -> 扩展 -> 重排”的稳定链路。

### 1. 缩圈

先用确定性约束收缩查询范围：

- `projectId`
- `nodeId` 或 node 子树
- `status != deprecated`
- 优先 `published`
- 可选 `category`
- 可选 staging / non-staging

### 2. 向量召回

对缩圈后的候选集做 topK 召回，而不是无边界全库扫。

### 3. 结构扩展

从召回的 entry 回查：

- 所属 node
- 同 node 的相邻知识
- revision 历史
- 未来的 knowledge relations

### 4. 重排

建议综合以下因素做 rerank：

- semantic score
- node proximity
- relation weight
- revision freshness
- status priority

### 5. 最小充分上下文

返回给 agent 的不应是一大批原始结果，而应是恰好够回答问题的最小上下文集合。

## Metadata 设计建议

无论未来是否引入独立向量数据库，每条 embedding 记录至少应保留这些 metadata：

- `project_id`
- `node_id`
- `entry_id`
- `revision_version`
- `category`
- `status`
- `visibility`
- `source_type`

这样才能保证：

- 默认只查当前 project
- 可以限定 node 范围
- 可以优先正式知识而不是 staging
- 可以必要时跨 project，但边界可控

## 大数据量下的核心策略

在知识量明显增长后，精准性不是靠“更大的模型”单点解决，而是靠以下组合：

- 更好的 `retrieval_text`
- 明确的 `project` 边界
- `node` 收缩作用域
- 显式的知识关系
- 分阶段检索
- 轻量 query rewrite
- 结构化 rerank

换句话说，大数据量下真正重要的是：

**少让 agent 在海里捞针，多让系统先把海缩成池塘。**

## 推荐的下一步落地顺序

推荐按下面顺序推进：

1. 保持 `KnowledgeEntry` 作为当前主对象，不急着改全模型
2. 为 entry 增加 `retrieval_text` 思路，替代原始 JSON 直接 embedding
3. 保持默认单项目检索
4. 在查询层加入 node / status / staging 范围约束
5. 为跨项目检索引入 `shared_workspace` 概念
6. 增加显式的 knowledge relation 表
7. 知识量继续增长后，再演进到 chunk 级检索

## 总结

这套知识检索架构的关键不是“把知识丢进向量库就结束”，而是把知识放进一条有层次的链路里：

- `project` 决定默认边界
- `node` 决定局部上下文
- `entry` 决定当前可读知识
- `revision` 决定时间演化
- `embedding` 决定第一跳召回
- `relations` 决定知识之间的显式联系
- `agent` 决定规范化、改写和最终理解

如果只保留一句设计原则，那就是：

**先用结构缩圈，再用向量召回，再用关系扩展，最后让 agent 理解。**
