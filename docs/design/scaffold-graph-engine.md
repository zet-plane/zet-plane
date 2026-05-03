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
        ├── type     — 'milestone' | 'task' | 'decision' | 'review' | 'custom'
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

## Agent 建议机制

Agent Orchestrator 不能直接变更节点状态。写入时附带 `suggested: true` 标记，由用户在 Dashboard 确认后 `LifecycleService` 才执行真正的转换。

---

## 存储

邻接表模式：`nodes` 表 + `edges` 表。依赖路径和子图查询通过 PostgreSQL CTE 递归实现，无需图数据库。社团规模（50–500 节点/项目）下查询性能足够。

---

## 模板

`TemplateService` 管理可复用的 Graph 骨架，新项目可选择模板作为起始结构。模板本身也存储为 Graph，`is_template: true` 标记区分。
