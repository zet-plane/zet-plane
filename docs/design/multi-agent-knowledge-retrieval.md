# Multi-Agent Knowledge Retrieval — 面向大规模节点与知识沉淀的局部化查询架构

## 背景

随着项目推进，系统中的两类数据会同步增长：

- Graph 中的 `node` / `edge`
- Knowledge 中的 `entry` / `revision`

当规模较小时，单个 agent 可以通过调用若干 read tools，在项目级数据中搜索、展开、筛选，最终定位到用户关心的局部结构。

但当规模继续增长后，这种做法会迅速暴露出问题：

- tool 的返回粒度过粗，默认返回 project 级结果
- agent 为了找到局部目标，不得不读取大量无效数据
- 即使问题只关注某一个任务、某一个子图、某一个链接，也容易被整个项目的上下文淹没
- agent 的 token 成本、推理时间和误判概率都会显著上升

这说明问题的核心不是“agent 不够聪明”，而是：

**当前查询体系缺少一层稳定的定位与缩圈机制。**

本文档提出一种新的开始：在现有 `project -> node -> knowledge_entry -> knowledge_revision` 模型之上，引入 **multi-agent + scope-aware tools** 的局部化查询架构。

## 问题定义

### 典型问题

用户的问题经常不是：

- “把整个项目的任务都给我看看”

而是：

- “我只想关注第二个任务”
- “帮我找到这个依赖链接”
- “这个问题在哪个子图里出现过”
- “只看这个任务范围内的知识结论”

换句话说，用户真正需要的是：

- 精确定位某个局部对象
- 在局部范围内读取结构和知识
- 避免无关任务和无关知识污染上下文

### 当前单 agent 方案的局限

当前 read tools 更接近“通用项目读接口”，而不是“局部定位接口”：

- `search_nodes`：本质上先拿项目内所有候选节点，再做关键词过滤
- `get_subgraph`：一旦命中某个 node，会返回整棵 composition 子树
- `get_task_history`：返回的是项目级 recent tasks
- `search_knowledge`：当前也是以 project 为默认搜索边界

这些 tool 在小规模数据下足够好用，但在大规模数据下会导致：

1. 定位阶段和读取阶段混在一起
2. agent 被迫自己扮演 router、locator、reader、synthesizer 多重角色
3. 很多无效数据在最早阶段就进入上下文

## 设计目标

本架构希望达成以下目标：

- 把“定位对象”和“读取数据”明确拆成两个阶段
- 让 agent 在大多数情况下只读取局部 scope，而不是项目全量数据
- 让多 agent 并行协作时，传递的是 scope 和候选对象，而不是整批原始数据
- 让 knowledge 检索与 graph 检索都能绑定到局部子图
- 保持 `project` 作为默认隔离边界，仅在必要时显式跨 project

## 非目标

本文档不试图解决：

- 知识正文 schema 的最终形态
- 最终 embedding 模型选型的全部细节
- 全新的图数据库替换方案
- 所有查询都必须走 multi-agent

这是一份面向 retrieval orchestration 的架构文档，不替代现有 Knowledge Engine 或 Graph Engine 的领域设计。

## 核心原则

### 1. 先定位，再读取

不要让 agent 直接从 project 级数据里边读边猜。标准流程应是：

1. 判断用户要找什么对象
2. 定位最可能的 node / edge / subgraph / knowledge scope
3. 在这个局部范围内读取数据
4. 最后做综合回答

### 2. 先缩圈，再召回

无论是 graph 检索还是 knowledge 检索，优先使用确定性条件缩小范围：

- `project`
- `node`
- `subgraph`
- `status`
- `category`
- `depth`

再去做向量召回或结构展开。

### 3. Scope 比原始数据更重要

multi-agent 协作中，前一个 agent 交给后一个 agent 的最重要产物不是长文本，而是工作范围。

例如：

```json
{
  "projectId": "p1",
  "focusNodeId": "task_2_root",
  "scopeType": "subgraph",
  "maxDepth": 2,
  "allowedToolClasses": ["neighbors", "scoped_knowledge"]
}
```

### 4. 多 agent 不能替代好工具

如果底层 tool 仍然是 project 级大返回，那么 multi-agent 只会把低效并行化。

因此：

**multi-agent 必须与 scope-aware tools 一起设计。**

## 总体架构

推荐采用：

```text
User Query
  -> Planner / Router Agent
  -> Locator Agent
  -> Scope Gate
  -> Graph Reader Agent / Knowledge Reader Agent (parallel)
  -> Synthesizer Agent
```

其中：

- `Planner / Router`：判断问题类型与查询计划
- `Locator`：把模糊指代解析成局部对象
- `Scope Gate`：生成后续 agent 的工作边界
- `Graph Reader`：只读 scope 内图结构
- `Knowledge Reader`：只读 scope 内知识
- `Synthesizer`：汇总并输出最终回答

## Agent 角色设计

## 1. Planner / Router Agent

### 职责

- 识别用户是在问 task、subgraph、link 还是 knowledge
- 决定是否需要 multi-agent
- 生成初步检索计划

### 输入

- 用户原始问题
- 当前 thread / project 上下文

### 输出

```json
{
  "targetType": "task_root | subgraph | link | knowledge | mixed",
  "scope": "current_project",
  "queryHint": "第二个任务",
  "needHistory": false,
  "needKnowledge": true,
  "needGraph": true,
  "allowCrossProject": false
}
```

### 约束

- 默认不读大图
- 默认不直接读知识全文
- 只负责规划，不负责最终证据收集

## 2. Locator Agent

### 职责

把模糊引用解析成具体对象。例如：

- “第二个任务”
- “上次那个依赖”
- “知识检索那个节点”
- “前天新增的那个阶段”

### 输出

```json
{
  "matches": [
    {
      "kind": "node",
      "id": "node_task_2",
      "title": "Task 2: Knowledge Retrieval",
      "score": 0.91,
      "reason": "title match + sibling order + active status"
    }
  ]
}
```

### 约束

- 只使用定位类 tool
- 不读取完整子图
- 不读取 project 全量知识

## 3. Scope Gate

### 职责

把 locator 的输出转换成后续 reader agent 的正式工作范围。

### 示例输出

```json
{
  "projectId": "p1",
  "scopeType": "subgraph",
  "rootNodeId": "node_task_2",
  "maxDepth": 2,
  "includeArchived": false,
  "knowledgeCategories": ["decision", "pitfall", "finding", "context"],
  "knowledgeStatus": ["published", "draft"],
  "allowCrossProject": false,
  "toolBudget": {
    "graphReads": 3,
    "knowledgeReads": 3
  }
}
```

### 作用

- 让 reader agent 进入“局部模式”
- 明确禁止读 project 全量数据
- 把 token 和工具预算绑定到局部范围

## 4. Graph Reader Agent

### 职责

在被授权的 scope 内读取图结构，包括：

- 当前节点
- 一跳 / 两跳邻居
- 局部子图
- 局部路径
- 局部链接说明

### 约束

- 只能使用 scope-aware graph tools
- 默认不能直接调 project 级 `list all`
- 返回的应是局部结构摘要，不是无边界原始图

## 5. Knowledge Reader Agent

### 职责

在被授权的 scope 内查找知识候选，包括：

- 当前 node 的知识
- 当前子图范围内的知识
- 当前任务相关的最新 published entries
- 必要时查 revision 或关系扩展

### 约束

- 只能在 scope 限定范围内搜索
- 默认不允许跨 project
- 优先返回摘要和关键证据，而不是所有 entry 全文

## 6. Synthesizer Agent

### 职责

把 graph 和 knowledge 两边的局部结果综合成最终可回答内容。

### 约束

- 默认不再主动开大范围查询
- 优先消费前置 agents 的输出
- 需要说明定位依据和回答边界

## Scope-Aware Tool 体系

multi-agent 成功的前提是有一套“可缩圈”的工具，而不是只有 project 级粗工具。

推荐把工具分成四类。

## 1. 定位类工具

用于把模糊引用解析成具体对象。

### `resolve_task_reference`

输入：

- `projectId`
- `referenceText`
- 可选 `parentNodeId`

输出：

- 候选 task root nodes
- 分数
- 命中原因

### `resolve_link_reference`

输入：

- `projectId`
- `fromHint`
- `toHint`
- `edgeType?`

输出：

- 候选 edge
- 两端节点
- 分数

## 2. 局部图读取工具

### `get_neighbors`

输入：

- `nodeId`
- `direction: in | out | both`
- `edgeType: composition | dependency | all`
- `hops: 1 | 2`

输出：

- 紧邻节点与边

这是大多数“局部看一眼”场景比 `get_subgraph` 更实用的工具。

### `get_subgraph_scoped`

输入：

- `rootNodeId`
- `maxDepth`
- `edgeTypes`
- `childLimit`
- `includeArchived`

输出：

- 受控大小的局部子图

### `find_paths`

输入：

- `fromNodeId`
- `toNodeId`
- `maxHops`
- `edgeTypes`

输出：

- 短路径摘要

适用于回答：

- “A 和 B 怎么连起来的”
- “为什么这个任务依赖那个任务”

## 3. 局部知识检索工具

### `search_knowledge_scoped`

输入：

- `projectId`
- `query`
- `rootNodeId?`
- `nodeIds?`
- `maxDepth?`
- `categories?`
- `statuses?`
- `limit`

输出：

- 局部 scope 内的 knowledge candidates

### `list_node_entries`

输入：

- `nodeId`
- `categories?`
- `statuses?`
- `limit`

输出：

- 当前节点直接挂载的知识摘要

## 4. 摘要类工具

### `get_subgraph_summary`

输入：

- `rootNodeId`

输出：

- child count
- active / blocked / completed 分布
- 最近知识结论
- top keywords
- 简短局部摘要

摘要类工具能显著减少 agent 为了“先看个大概”而读取整棵子树的需求。

## Scope 数据契约

建议把 scope 作为系统内一等对象传递。

推荐结构：

```json
{
  "projectId": "p1",
  "scopeType": "node | subgraph | path | edge | knowledge_set",
  "focusNodeId": "node_task_2",
  "rootNodeId": "node_task_2",
  "edgeId": null,
  "nodeIds": ["node_task_2", "node_task_2_child_1"],
  "maxDepth": 2,
  "includeArchived": false,
  "allowCrossProject": false,
  "knowledgeFilters": {
    "categories": ["decision", "pitfall", "finding", "context"],
    "statuses": ["published", "draft"]
  },
  "toolBudget": {
    "locator": 2,
    "graphReads": 3,
    "knowledgeReads": 3
  }
}
```

## 标准执行流程

### 场景一：只关注“第二个任务”

```text
用户: 我只想关注第二个任务
  -> Planner: targetType=task_root
  -> Locator: 解析出 task_2_root
  -> Scope Gate: scope=subgraph(task_2_root, depth=2)
  -> Graph Reader: 读局部子图摘要与关键邻居
  -> Knowledge Reader: 读 task_2_root 范围内知识
  -> Synthesizer: 返回该任务局部情况
```

### 场景二：找某个依赖链接

```text
用户: 帮我看看这个任务和那个任务为什么有关联
  -> Planner: targetType=link
  -> Locator: 解析 from/to nodes
  -> Scope Gate: scope=path(from,to,maxHops=3)
  -> Graph Reader: 查路径、边类型、邻近节点
  -> Knowledge Reader: 查路径上的知识结论
  -> Synthesizer: 输出关联原因
```

### 场景三：找某个子图里的历史知识

```text
用户: 这个阶段之前沉淀过哪些坑点
  -> Planner: targetType=subgraph + knowledge
  -> Locator: 解析阶段 root node
  -> Scope Gate: subgraph(root, depth=2), categories=pitfall
  -> Graph Reader: 子图摘要
  -> Knowledge Reader: 局部向量搜索 + node entries
  -> Synthesizer: 输出局部历史坑点
```

## 为什么 multi-agent 适合这个问题

这个场景适合 multi-agent，不是因为“模型越多越强”，而是因为它天然包含多个不同性质的子任务：

- 意图识别
- 局部对象定位
- 局部结构读取
- 局部知识召回
- 最终综合回答

这些子任务的成功条件不同：

- 定位看的是精确率
- 读取看的是范围控制
- 检索看的是召回率
- 综合看的是解释力

把它们拆给不同 agent，可以让每个 agent 只承担一种认知负担。

## 为什么 multi-agent 不能单独解决问题

如果不改 tool，multi-agent 只会把 project 级噪音并行放大。

所以真正的设计重点是：

- 先有局部化工具
- 再用多个 agent 调度这些工具

也就是：

**multi-agent 解决“分工”，scope-aware tools 解决“数据脏”。**

## 失败模式与保护措施

## 1. Locator 定位错误

风险：

- 错把“第二个任务”解析成另一个 sibling

保护：

- 返回多个候选与置信度
- 若置信度低，要求 planner 做二次确认或更保守读取

## 2. Scope 过大

风险：

- 即使定位正确，子图还是太大

保护：

- 设置 `maxDepth`
- 设置 `childLimit`
- 优先返回 summary，再按需展开

## 3. Reader 越权到 project 级

风险：

- 局部化设计失效

保护：

- tool 层做 scope enforcement
- reader agent 默认不暴露 project 级大返回工具

## 4. Knowledge 检索召回过多

风险：

- 局部子图内知识仍很多

保护：

- 先 `node` 过滤，再向量召回
- 优先 `published`
- 支持 `category` 收缩

## 与现有系统的关系

本方案建立在现有模型之上，不要求立刻推翻当前设计。

已有资产可以直接复用：

- `project` 作为默认隔离边界
- `node` 作为知识锚点
- `entry` / `revision` 的版本模型
- 现有 orchestrator 运行时
- 现有 tool calling 机制

需要补的是：

- 局部化定位工具
- 带 scope 的 graph / knowledge tools
- multi-agent 编排层
- scope 数据契约

## 渐进式落地顺序

推荐按下面顺序落地。

### 第一阶段：先补 scope-aware tools

优先新增：

- `resolve_task_reference`
- `get_neighbors`
- `get_subgraph_scoped`
- `search_knowledge_scoped`

这一阶段即使仍是单 agent，也会立刻减少无效数据。

### 第二阶段：引入 scope gate

让 tool 调用不再默认 project 级，而是先生成局部 scope。

### 第三阶段：拆出 multi-agent 角色

先从最小组合开始：

- `planner`
- `locator`
- `reader`
- `synthesizer`

### 第四阶段：图与知识并行读取

在 scope 已明确时，让 `graph reader` 和 `knowledge reader` 并行工作。

### 第五阶段：补充摘要对象与关系对象

继续减少 reader 直接读取原始大数据的需求。

## 总结

随着知识和节点规模持续增长，真正的问题不是“如何让 agent 读更多”，而是“如何让 agent 从一开始就只读对的那一小块”。

因此推荐的新方向不是单纯升级 embedding，也不是继续扩展单 agent 的通用工具集合，而是：

- 用 `planner / locator / reader / synthesizer` 做多 agent 分工
- 用 `scope gate` 严格限定后续工作边界
- 用 scope-aware tools 替代 project 级粗读取

如果只保留一句话作为本方案的设计原则，那就是：

**先定位局部对象，再限定工作范围，再并行读取局部结构与知识，最后由 agent 综合回答。**
