# Scaffold Graph Engine — 设计文档

## 职责

Graph 结构和节点生命周期的领域服务。只响应外部调用（API Layer 或 Agent Orchestrator），不主动发起任何操作，不调用 LLM。

---

## 内部模块

```
GraphService     — 节点/边的 CRUD
LifecycleService — 状态机，合法转换验证，变更后发出 lifecycle event
QueryService     — 依赖路径、子图查询（PostgreSQL CTE 递归）
TemplateService  — Graph 模板的管理与应用（新项目脚手架）
```

---

## 核心数据结构

```
Graph
  └── Node
        ├── id
        ├── type     — 'checkpoint' | 'milestone' | 'task' | 'decision' | 'review' | 'custom'
        ├── status   — 'planned' | 'active' | 'blocked' | 'completed' | 'abandoned'
        ├── owner?
        └── edges: Edge[]

Edge
  ├── from: NodeId
  ├── to: NodeId
  └── type — 'depends_on' | 'blocks' | 'related_to'
```

---

## 节点状态机

```
planned ──▶ active ──▶ completed
              │
              ├──▶ blocked ──▶ active（解除阻塞）
              │
              └──▶ abandoned（必须附原因）
```

`LifecycleService` 只做合法性校验，不阻止任何手动状态变更。`depends_on` 边仅作为可视化提示，不锁定执行顺序（对应 specs 原则二：引导而非约束）。

---

## Core Checkpoint（核心检查点）

`type: 'checkpoint'` 的节点是流程中的阶段性验证门，是 Graph 自由生长的引导锚点而非硬性门控。

**语义**：Checkpoint 代表「这个阶段的核心目标应当完成」的检验时刻。它的前置节点（通过 `depends_on` 边关联）构成该阶段的工作范围。Checkpoint 完成意味着团队对这个阶段的产出做了显式确认。

**Checkpoint 完成时的特殊行为**（由 Agent Orchestrator 监听 lifecycle event 触发）：
- 汇总该 Checkpoint 前置节点上积累的所有 KE，生成阶段性知识摘要
- 将摘要作为新的 `KnowledgeEntry` 锚定到 Checkpoint 节点本身

**与普通节点的区别**：

| | 普通节点 | Checkpoint |
|---|---|---|
| 完成语义 | 具体任务/决策完成 | 一个阶段的工作经过验证 |
| KE 锚定 | 该节点自身的上下文 | 该阶段的汇总摘要 |
| Agent 触发 | 常规分析任务 | 额外触发阶段摘要任务 |
| Dashboard 入口 | 节点详情 | 新成员理解项目阶段进展的主要入口 |

Checkpoint 不阻止后续节点进行（原则二），但未完成的 Checkpoint 会在 Dashboard 中显著标记，提示团队关注。

---

## KE 与 Node 的强绑定

所有 KnowledgeEntry 必须锚定到一个 Node（`nodeId` 为强制字段）。知识的导航结构由 Graph 提供：后来者通过节点找到对应上下文，而非在平铺的知识列表中搜索。

游离于 Graph 之外的知识条目不应存在——如果某条知识找不到合适的节点，说明 Graph 中缺少一个节点，应先补充节点再关联 KE。

---

## Agent 建议机制

Agent Orchestrator 不能直接变更节点状态。写入时附带 `suggested: true` 标记，由用户在 Dashboard 确认后 `LifecycleService` 才执行真正的转换。

---

## 存储

邻接表模式：`nodes` 表 + `edges` 表。依赖路径和子图查询通过 PostgreSQL CTE 递归实现，无需图数据库。社团规模（50–500 节点/项目）下查询性能足够。

---

## 模板

`TemplateService` 管理可复用的 Graph 骨架，新项目可选择模板作为起始结构。模板本身也存储为 Graph，`is_template: true` 标记区分。模板中通常预置若干 Checkpoint 节点，定义项目的阶段划分。
