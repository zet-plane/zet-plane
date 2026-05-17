# zet-plane

项目级图结构编排引擎：以节点/边组织 Scaffold 任务，通过 LLM Agent 主动分析事件，将洞察沉淀为 Knowledge 条目，由 BullMQ 推送领域事件。

## 模块交付状态

| 模块 | 状态 | 说明 |
|------|------|------|
| Scaffold Graph Engine | ✅ 完成 | 节点/边 CRUD、环检测、Checkpoint 升级、状态机守卫、BullMQ 事件发布 |
| Knowledge Engine | ✅ 完成 | 知识条目 CRUD、Revision 管理、语义搜索、锚定 Graph 节点 |
| Project Module | ✅ 完成 | 项目生命周期管理 |
| Agent Orchestrator | ✅ 完成 | ReAct 循环、LLM 多 Provider、上下文构建、技能注册、读写工具集、Eval 套件 |
| API Layer | 🚧 占位 | REST/WebSocket 对外接口未实现 |
| Event Pipeline | 🚧 占位 | 事件入口归一化、去重、路由未实现 |
| Adapter Layer | 🚧 占位 | GitHub / Feishu webhook 适配未实现 |
| Web Dashboard | ✅ 完成 | 图可视化 Canvas、ELK 自动布局、Detail / Staging 面板、项目切换 |
| @zet-plane/contracts | ✅ 完成 | 前后端共享 API 类型契约（nodes / edges / knowledge / projects）|

## 常用命令

```bash
# 后端开发
cd apps/server
pnpm dev                              # nest start --watch（端口 3000）
pnpm test                             # vitest run（单元测试，无需 infra）
pnpm test:watch                       # watch 模式
pnpm vitest run path/to/file.spec.ts  # 单文件
pnpm vitest run -t "test name"        # 按名称过滤

# Eval 套件（需 ANTHROPIC_API_KEY 或 OPENAI_API_KEY）
pnpm vitest run --config vitest.eval.config.ts

# E2E（需 PostgreSQL + Redis）
pnpm test:e2e

# 数据库
pnpm prisma migrate dev --name <name>
pnpm prisma generate
pnpm prisma studio                    # GUI at localhost:5555

# 前端开发
cd apps/web
pnpm dev                              # Vite dev server（端口 5173）
pnpm test                             # vitest run
pnpm build                            # tsc + vite build

# 工作区级
pnpm -w build / dev / lint / test     # 通过 Turbo 从根目录执行
```

## 基础设施依赖

| 服务 | 用途 | 默认地址 |
|------|------|---------|
| PostgreSQL | 主数据库 | `DATABASE_URL` 环境变量 |
| Redis | BullMQ 队列 | `REDIS_HOST` / `REDIS_PORT`，默认 `localhost:6379` |

单元测试全量 mock，无需任何 infra。

## Agent Orchestrator

Orchestrator 是系统唯一的主动智能层，基于 ReAct（Reason + Act）循环：

```
事件触发 → 上下文构建 → Agent 推理 → 工具调用 → 结论 / 人工通知
```

**读工具**：`get-node` · `get-subgraph` · `get-task-history` · `search-nodes` · `search-knowledge`

**写工具**：`create-node` · `create-edge` · `move-node` · `update-node-status` · `to-staging` ·
`create-knowledge-entry` · `revise-knowledge-entry` · `write-embedding` · `skip` · `conclude` · `notify-human`

**LLM Provider**：Anthropic (`claude-*`) 和 OpenAI-compatible（DeepSeek 等）通过 `LlmProviderRegistry` 动态选择。

**Eval 套件**（`test/eval/`，S1–S10）：覆盖增长节点处理、节点驱动、Checkpoint 升级、阶段转换、Staging、环检测、知识精度、工具正确性、技能效率、Skip 等核心场景。

## Web Dashboard

基于 React 19 + Vite + TanStack Router，图可视化使用 React Flow（`@xyflow/react`），布局计算通过 ELK Web Worker 异步执行。

**路由**

| 路径 | 功能 |
|------|------|
| `/projects` | 项目列表 |
| `/projects/:projectId` | 项目 Layout（Breadcrumb、ProjectSwitcher）|
| `/projects/:projectId/graph` | 图 Canvas（节点/边渲染、DetailPanel、StagingPanel）|

**关键模块**

- `features/graph/layout/` — ELK 布局引擎 + Worker，自动计算节点坐标与尺寸
- `features/graph/domain/` — 纯函数领域逻辑（aggregate-status、breadcrumb、canvas-view、topology-hash）
- `features/graph/components/` — 所有图 UI 组件（HeroToken、KnowledgePill、DependencyEdge、StagingPanel 等）
- `features/graph/hooks/` — 数据获取与导航 hooks（useProjectGraph、useLayoutedGraph、useCanvasNavigation）
- `lib/api-client.ts` — 基于 `@zet-plane/contracts` 的类型安全 HTTP 客户端
- `stores/graph-view.store.ts` — Zustand 全局 UI 状态（hover 节点等）

## 文档

- [总体架构](docs/architecture.md)
- [Scaffold Graph Engine 设计](docs/superpowers/specs/2026-05-04-scaffold-graph-engine-design.md)
- [Knowledge Engine 设计](docs/superpowers/specs/2026-05-05-knowledge-engine-design.md)
- [Agent Orchestrator 设计](docs/superpowers/specs/2026-05-11-agent-orchestrator-design.md)
- [Orchestrator Eval 协议](docs/superpowers/specs/2026-05-14-agent-orchestrator-evaluation-protocol.md)
- [Graph 渲染模型设计](docs/superpowers/specs/2026-05-16-graph-rendering-model.md)
- [Graph 开发布局设计](docs/superpowers/specs/2026-05-15-graph-development-layout-design.md)
- [Claude Code 开发指南](CLAUDE.md)
