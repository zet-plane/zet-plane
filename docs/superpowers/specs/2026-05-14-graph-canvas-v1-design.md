# Graph Canvas v1 — 设计文档

**日期**：2026-05-14
**状态**：设计完成，待实现

---

## 一、背景

`apps/server` 的 Scaffold Graph Engine 已交付，对外暴露 REST 接口（`GET /projects/:id/nodes`、`GET /projects/:id/edges`、`GET /nodes/:id/subgraph` 及各类 CRUD）。`apps/web` 的栈已锁定（Vite + React 19 + TanStack Router/Query + Zustand + `@xyflow/react` v12 + Tailwind v4 + shadcn/ui），但 Canvas 路由仍只有写死的 demo（两节点、一条边）。

本文档定义 Graph Canvas 的 v1 设计，作为 `feat/domain-dashbord` 分支上 Domain Dashboard 系列前端工作的起点。

---

## 二、范围

### v1 包含

- 多项目路由结构 (`/projects` → `/projects/:projectId/graph`)
- 读路径完整闭环：拉取 → 文本测量 → 布局 → 渲染
- 节点/容器/依赖边的视觉编码体系（状态优先）
- 节点选中与右侧详情面板（含知识条目预览）
- 空 / 加载 / 错误状态
- 刷新策略（focus refresh + "Updated Xs ago" 提示）

### v1 明确不包含

- 任何编辑能力（创建/重命名/状态变更/连边/删除/拖动）
- Staging 节点（`staging_root` 及其子树）
- Viewport（zoom/pan）写入 URL
- WebSocket 实时推送（仅留出升级路径）
- `createdBy: human/agent` 的视觉通道（只在详情面板里出现）
- 多 workspace、协作、权限边界

---

## 三、用户任务定位

Canvas v1 服务**单一用户任务：状态感知（Status Awareness）**。

用户的两个使用模式：

1. **Survey（概览）**：扫一眼整张图，回答"项目当前状态如何？哪里出了问题？Agent 长出了什么？"
2. **Triage（分诊）**：发现红色信号后，点进去，看节点详情和挂载的知识条目，找出根因。

设计上所有取舍服从这两个模式。明确不为 **Planning（规划编辑）**、**Knowledge Navigation（知识浏览）**、**Execution Monitoring（事件实时回放）** 三类任务做优化——它们各自有更合适的载体或留待 v2+。

---

## 四、视图模型

### 整图渲染，不做下钻

打开项目的 Canvas，看到的是整个项目的所有节点与边（除 staging 外）。不做"先看根、点开下钻"的导航。

**理由**：状态感知需要 gestalt——一眼看到红的就在哪。下钻会把"项目里有没有问题"变成"逐层点击找问题"，与任务定位冲突。

### 组合关系即视觉容纳

`composition` 边表达的是父子结构，**不画成箭头**，而是渲染成 xyflow v12 原生的嵌套父节点（`parentId` + `extent: 'parent'`）。子节点视觉上"装"在父节点容器里。

这样：

- 画面上的箭头数量降到只剩 `dependency` 一种——每一根箭头都是有意义的信号。
- 容器自身可以承载子树的聚合状态（见第六节）。
- 后续如果要做"折叠子树"，是这套模型的自然扩展，而非重做。

### 多项目、子路由

路由结构：

| 路径 | 用途 |
|---|---|
| `/` | 重定向到 `/projects`（若全局只有一个项目则可直接重定向到该项目的 graph） |
| `/projects` | 项目列表（v1 最简版本：name + last updated + 点击进入） |
| `/projects/:projectId` | Layout 路由，渲染左侧 rail + breadcrumb 等共享 chrome |
| `/projects/:projectId/graph` | Canvas 本体 |
| `?nodeId=<uuid>` | Canvas 上的选中态，可深链分享 |

文件位置（TanStack Router 文件路由约定）：

```
src/router/
  projects.tsx                         # /projects 列表
  projects.$projectId.tsx              # Layout route
  projects.$projectId.graph.tsx        # Canvas
```

当前 `src/router/index.tsx` 的 demo 逻辑迁出，`/` 改为重定向。

---

## 五、视觉编码体系（Scheme A：状态优先）

所有颜色值通过 CSS 自定义属性 / Tailwind theme tokens 暴露，**组件内严禁硬编码颜色**。换主题 = 改一个文件。

### 通道分配

| 通道 | 编码的维度 |
|---|---|
| 颜色（`--status-active` / `--status-blocked` / `--status-completed` / `--status-archived`） | `NodeStatus`：active / blocked / completed / archived |
| 边框样式 | `NodeType`：solid = `scaffold`，dashed = `growth` |
| 角落 glyph | `isCheckpoint`（旗标）+ `checkpointResolution`（小符号，未设置不显示） |
| 数字 badge | 该节点上的 `KnowledgeEntry` 数量（中性色，不与状态色竞争） |
| 选中 ring | 中性强调色（如 indigo），明确**不是**状态色，避免与 status 通道混淆 |
| `createdBy` | **不进入视觉通道**，仅在详情面板展示 |

### 默认配色（v1，蓝色系）

参考语义 → token → 默认值：

```
--status-active     → 蓝（neutral 信号）
--status-blocked    → 红
--status-completed  → 绿
--status-archived   → 灰
--accent-selection  → indigo
--neutral-badge     → slate
```

具体色值在 `apps/web/src/index.css` 集中维护。后续替换 brand 配色只改这一处。

---

## 六、容器状态聚合

容器（即有子节点的父节点）需要把子树的状态"卷起来"给 Survey 模式用。

### 规则

1. **Transitive tint**：容器的背景色 = 其所有后代中**最严重**状态的色（按严重度排序：blocked > active > completed > archived）。任何深度上的 blocked 后代，都会让所有祖先容器一直冒红。
2. **数字 badge**：容器 header 上显示一个精确分布，例如 `2 blocked / 12 active / 5 done`。
3. **Archived 排除**：归档节点不参与聚合。一颗"全归档"的子树读出来是灰色，而不是绿色。
4. **Completed 容器封顶**：当容器自身是 `completed` 时，整体读 solid green，不再反映后代。语义上 completed 是终态、不可逆，子树视为封存。

### 设计意图

- Tint 是 *alarm* 通道："有问题，看这里。"
- Badge 是 *triage* 通道："多严重、占比多少。"
- 两者搭配防止"红疲劳"——`2 blocked / 200 total` 与 `40 blocked / 200 total` 第一眼都是红，但第二眼用户立刻知道严重程度。

### 实现说明

聚合是纯函数：对组合树做一次 reduce。`useMemo` 缓存于组合拓扑的 hash。状态变化（数据 refetch）触发重算；hover/select/zoom 不重算。

---

## 七、依赖边样式

依赖边是 Canvas 上**唯一**的箭头（组合关系已被容纳关系吸收），所以每根边都是高密度信号。

### 状态敏感的边样式

边的样式是 `target.status` 的纯函数：

| `target.status` | 边样式 |
|---|---|
| `blocked` / `archived` | 红色（标记"这是一根阻塞中的依赖"） |
| `completed` | 静音绿 / 淡化（"这根依赖已满足，不再拉扯 source"） |
| `active` | 中性灰（默认） |

**语义解读**：边的颜色表达的是"这根依赖现在对 source 的影响"。红边 = source 卡在这。这给了 source 节点为什么 blocked 的视觉链路。

### 焦点交互（hover / select）

- 鼠标 hover 或选中某节点时：该节点的所有出边/入边强调（加粗 + 不变暗），其余边淡化到 ~25% 不透明度。
- 不持久——离开 hover、改变选中即恢复。
- 不重新布局。

---

## 八、布局管线

xyflow 不内置布局，节点坐标必须前端算出来。

```
fetch nodes + edges (TanStack Query, 两个 query 并行)
   ↓
pretext.prepare(node.title, font)              ← 每节点一次，缓存于 text+font hash
pretext.layout(prepared, maxNodeWidth)         ← 得到 {width, height}
   ↓
ELK Worker：传入有尺寸的节点 + 边 + parentId
   - algorithm: layered
   - direction: DOWN
   - hierarchyHandling: INCLUDE_CHILDREN
   ↓
返回每个节点的 {x, y}
   ↓
React Flow 渲染（不再触发 reflow）
```

### 关键选择

- **ELK over dagre**：ELK 对嵌套布局是一等公民，跨容器的依赖箭头路径合理。dagre 的 cluster 支持是后补的，跨群边路由不可控。
- **Worker 化**：500 节点级别的 ELK 一次布局耗时百毫秒量级，放主线程会卡顿，放 Worker（`elk.bundled.js` 的 worker 版本）异步交付即可。
- **Pretext over DOM 测量**：DOM 测量触发 reflow，500 节点必卡。Pretext 用 Canvas API 一次性测量、纯算术布局，零 reflow，且原生支持 CJK / emoji / 双向文本。

### 重新布局的触发

仅在**拓扑变化**时触发：节点新增/删除、边新增/删除、`parentId` 变更。状态变化、选中、hover、文本不变的状态更新——**不重新布局**。

拓扑变化的判定用一个稳定 hash（`nodes.map(n => n.id+n.parentId).join('|') + edges.map(e => e.id).join('|')`）作 `useMemo` 依赖。

---

## 九、页面结构

三栏布局：

```
┌─────────────┬─────────────────────────────────────────┬─────────────────┐
│ Left rail   │ Canvas                                   │ Detail panel    │
│             │                                          │ (right)         │
│ project     │  React Flow + nested containers          │                 │
│ switcher    │                                          │  selected node  │
│             │                          ┌──── minimap   │  fields         │
│ breadcrumb  │  "Updated 32s ago" chip  │   (bottom-    │                 │
│             │                          │   right,      │  knowledge      │
│ (future:    │                          │   status-     │  entries list   │
│  knowledge, │                          │   tinted)     │                 │
│  timeline)  │                          └────           │  outgoing/in    │
│             │                                          │  deps list      │
└─────────────┴─────────────────────────────────────────┴─────────────────┘
```

### 左侧 rail

v1 内容：

- 项目切换器（dropdown 或简单列表）
- Breadcrumb（项目名 → "Graph"）

留位但不实现：知识浏览、Timeline 等 sibling tabs。

### 中间 Canvas chrome

- **Minimap**：bottom-right corner，使用 xyflow 内置 `<MiniMap />`，但节点颜色按 status 着色（自定义 `nodeColor` prop）。Survey 模式的远观信号。
- **"Updated Xs ago" chip**：bottom-left 或 top-right，显示距上次成功 fetch 的时间。点击触发手动 refetch。补 (b) 刷新策略的盲区。
- **Fit View 控件 + 缩放控件**：xyflow 内置 `<Controls />`，默认位置。
- **Legend**（图例）：折叠式，展开后说明颜色 / 边框 / glyph 的含义。第一次访问可默认展开。

### 右侧详情面板

选中节点时填入；无选中时显示空态文案（"Select a node to see details"）。

v1 字段：

- `title`（粗体大字）
- `description`（如有）
- `type`（scaffold / growth）
- `status` 当前值
- `createdBy`（human / agent）
- `createdAt` / `updatedAt`
- Checkpoint 信息（若 `isCheckpoint`）：旗标 + 解析方式（continue / loop）
- **Knowledge entries** 列表：每项显示 category（decision / pitfall / finding / context）+ title + status（draft / published / deprecated）+ updatedAt。点击展开 body（inline，可折叠）。
- **Outgoing dependencies**：目标节点列表，每项可点击 → 选中目标节点（更新 `?nodeId=`）。
- **Incoming dependencies**：来源节点列表，行为同上。

**不在 v1 详情面板里**：编辑表单、评论、事件时间轴、变更历史。

---

## 十、URL 状态

| 段 | 用途 |
|---|---|
| `:projectId`（路径） | 项目维度 |
| `?nodeId=<uuid>` | 选中态。深链可分享。 |
| Viewport（x / y / zoom） | **不进入 URL**。挂载时：若 `?nodeId=` 存在则 center + zoom 该节点；否则 `fitView`。 |

理由：状态感知的链接最有用的形式是"看这个节点"，不是"看这个具体的 pan/zoom"。把 viewport 进 URL 会带来无意义的写抑制噪音和分享时的奇怪体验。

---

## 十一、数据获取与刷新

### 查询

两个并行查询：

```ts
useQuery({ queryKey: ['project', projectId, 'nodes'], queryFn: () => listProjectNodes(projectId) })
useQuery({ queryKey: ['project', projectId, 'edges'], queryFn: () => listProjectEdges(projectId) })
```

实际可包成一个 `useProjectGraph(projectId)` hook，对外返回 `{ data: ProjectGraph, isLoading, error, dataUpdatedAt }`，并通过 selector 装配出 xyflow 需要的 `nodes[]` 与 `edges[]`（包含尺寸与位置）。

### 刷新策略（v1）

- TanStack Query 默认值：`refetchOnWindowFocus: true`、`refetchOnReconnect: true`。
- **不启用** `refetchInterval`。
- "Updated Xs ago" chip：基于 `dataUpdatedAt` 渲染相对时间；点击触发 `refetch()`。

### WS 升级路径（v2，预留）

后端事件管线落地后，前端只需：

```ts
ws.on('graph.changed', ({ projectId }) => {
  queryClient.invalidateQueries({ queryKey: ['project', projectId] })
})
```

三行代码触发自动 refetch。**Canvas 自身无需任何改造**。

---

## 十二、状态

| 状态 | 处理 |
|---|---|
| **空项目**（仅有自动创建的 project root） | Canvas 居中渲染 root 节点 + 文案 "This project doesn't have any work nodes yet"。v1 read-only 不带 CTA。 |
| **加载中**（首次 fetch + ELK 布局未完成） | Chrome（左 rail、面板骨架）正常渲染；中央放居中的 spinner + "Laying out…" 文案。 |
| **错误**（任一查询失败） | 不渲染部分图。中央错误卡：错误信息 + Retry 按钮。 |
| **空选中**（无 `?nodeId=`） | 右侧详情面板显示 "Select a node to see details"。 |

---

## 十三、与现有代码的差异

`apps/web/src/router/index.tsx` 当前是单文件 demo（写死两节点、一个 `CreateNodePanel`）。落地 v1 时：

1. 整体迁移到 `projects.$projectId.graph.tsx`，并替换写死数据为查询结果。
2. `CreateNodePanel` **删除**（v1 read-only，没有 write 路径要演示）。该组件的真正归宿是 v2 编辑路径。
3. `/` 改为 redirect。
4. 现有 `features/graph/` 三个空目录（`layout/`、`components/`、`hooks/`）逐步填入：
   - `layout/` → ELK worker + pretext 接入
   - `components/` → `NodeCard`、`ContainerCard`、`DependencyEdge`、`Legend`、`UpdatedAgo`、`DetailPanel`
   - `hooks/` → `useProjectGraph`、`useNodeAggregation`、`useLayoutedGraph`

---

## 十四、实现切片顺序

按依赖关系排序，每片可独立提交：

1. **路由骨架** — `/projects`、`/projects/:id/graph`、`/` redirect。`projects.tsx` 列表用最简表格。
2. **读路径** — `useProjectGraph(projectId)`：并行查询 + 装配 `ProjectGraph` 类型。
3. **布局管线** — pretext + ELK Worker，输出有 `{x, y}` 的节点；裸 xyflow 渲染（无样式）。Smoke：能画对。
4. **视觉编码** — `NodeCard`、`ContainerCard`、`DependencyEdge`；CSS variable 调色板；容器聚合 hook；状态敏感的边。
5. **选中与详情面板** — `?nodeId=` 双向绑定；面板字段；inline 展开 knowledge body；deps 列表跳转。
6. **Chrome 完善** — Minimap（status-tinted）、Updated Xs ago、Legend、Controls。
7. **状态** — 空 / 加载 / 错误。
8. **打磨 + e2e** — Playwright canvas smoke：选中节点、URL 更新、Detail panel 显示。

---

## 十五、后续路径（v2+，明确不在 v1 范围）

- **编辑路径**：创建节点 / 修改 status / 解析 checkpoint / 创建依赖边 / 删除（4 种策略）。对应后端已具备的 PATCH / POST / DELETE 接口。详情面板就地变成编辑表单。
- **WS 推送**：见第十一节。Canvas 不需改造。
- **Staging 可视化**：单独 inbox 面板或 `/projects/:id/staging` 路由，结构上与 v1 Canvas 解耦。
- **折叠/展开容器**：在第六节聚合 badge 上挂折叠交互，被折叠的容器只显示 badge 不显示子节点。需要重新布局。
- **`createdBy` 视觉通道**：若日常使用中"agent 长的 vs 人手画的"成为高频判别需求，把它从详情面板升到节点角标。
- **多 workspace / 协作**：后端模型不变前不做。
- **Viewport 持久化**：若用户反馈强烈再加，按 query string + write throttle 实现。

---

## 附录：跨文档引用

- 项目层与 Schema：[2026-05-09-project-model-design.md](./2026-05-09-project-model-design.md)
- Graph Engine 后端：[2026-05-04-scaffold-graph-engine-design.md](./2026-05-04-scaffold-graph-engine-design.md)
- Reference edge 已下线：[2026-05-07-drop-reference-edge.md](./2026-05-07-drop-reference-edge.md)
- 共享契约层：[2026-05-11-shared-contracts-design.md](./2026-05-11-shared-contracts-design.md)
- Knowledge Engine：[2026-05-05-knowledge-engine-design.md](./2026-05-05-knowledge-engine-design.md)
- Staging Node（v1 不渲染，留作上下文）：[2026-05-10-knowledge-staging-node-design.md](./2026-05-10-knowledge-staging-node-design.md)
