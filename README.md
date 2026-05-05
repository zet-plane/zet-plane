# zet-plane

项目级图结构编排引擎：以节点/边组织 Scaffold 与 Growth 任务，通过环检测自动升级 Checkpoint，由 BullMQ 推送领域事件。

## 当前状态

**Scaffold Graph Engine 一期已交付**（2026-05-05）。完整实现 [scaffold-graph-engine 计划](docs/superpowers/plans/2026-05-04-scaffold-graph-engine.md) 的 8 个任务。

### 进度（8/8 ✓）

| Task | 内容 | 状态 |
|---|---|---|
| 1 | Prisma Schema + PrismaService（含 OnModuleDestroy 修复） | ✓ |
| 2 | CycleDetectorService（DFS + 入度，reference 边跳过） | ✓ |
| 3 | GraphEventPublisher + 5 种 BullMQ Job 类型 | ✓ |
| 4 | GraphRepository + 4 种删除策略（block/cascade/reparent×2） | ✓ |
| 5 | NodeService + 5 条状态护栏 + Checkpoint 解决 | ✓ |
| 6 | EdgeService（环检测集成） | ✓ |
| 7 | GraphController（全部路由） | ✓ |
| 8 | GraphModule + AppModule 装配 + Redis 连接 | ✓ |

### 测试（38/38 通过）

| Spec 文件 | 用例数 |
|---|---|
| cycle-detector.service.spec.ts | 10 |
| node.service.spec.ts | 11 |
| graph.controller.spec.ts | 7 |
| edge.service.spec.ts | 5 |
| graph-event.publisher.spec.ts | 5 |

GraphRepository 按计划不写单测（待 E2E 阶段覆盖）。

### 架构评估

✅ **整体良好**：分层（Controller→Service→Repository）清晰；CycleDetectorService 为纯函数；GraphEventPublisher 是 BullMQ 唯一出口；Checkpoint 升级与 Edge 创建在同一 `$transaction` 内，Job 在事务提交后推送。

## 后续任务

### 一、修复发现的 spec 偏差（优先级高）

1. **[edge.service.ts:78](apps/server/src/graph/edge/edge.service.ts#L78) `replaceNodeEdges` 跳过了环检测** — Spec §5.5 要求与 POST /edges 共享环检测和 Checkpoint 升级流程，当前直接 swap 后无条件发 `graph.edge.created`，可能漏掉环。
2. **[graph.controller.ts:67](apps/server/src/graph/graph.controller.ts#L67) `deleteNode` 使用 `@Query` 而 Spec §5.6 要求 request body** — API 契约偏差，需统一。
3. **[node.service.ts:102-103](apps/server/src/graph/node/node.service.ts#L102-L103) `completed → X` 冻结守卫未在 Spec §4 描述** — 需在设计文档补完，或确认意图后从代码移除。
4. **[node.service.ts:117](apps/server/src/graph/node/node.service.ts#L117) `UNRESOLVED_DEPENDENCY` 未排除 archived 依赖** — 与同函数中 children 检查处理不一致（children 已正确忽略 archived）。
5. **[graph.repository.ts:50-62](apps/server/src/graph/repository/graph.repository.ts#L50-L62) `initProjectRoot` 存在 TOCTOU 竞态** — 建议 `(projectId, isProjectRoot)` 加部分唯一索引或改用 `upsert`。

### 二、补齐单元测试覆盖

服务层多个方法仅在 mock 中桩出但未被测试调用：

- **NodeService**：`createNode` / `deleteNode` / `listProjectNodes` / `getSubgraph` / `initProjectRoot`
- **EdgeService**：`deleteEdge` / `replaceNodeEdges` / `listProjectEdges`
- **GraphController**：`listProjectNodes` / `getSubgraph` / `deleteEdge` / `replaceNodeEdges` / `listProjectEdges` 路由

### 三、E2E / 基础设施

- 接入 Postgres + Redis 的 E2E 测试（覆盖 GraphRepository 与事务边界）
- 本地 `pnpm dev` 启动验证（依赖 Redis 与 Postgres 实例）
- BullMQ Job Worker 端实现（当前仅有 Publisher）

### 四、下一阶段（按设计文档）

进入 Knowledge / Orchestrator / Event-pipeline 模块（`apps/server/src/` 下已留目录）。

## 技术栈

NestJS 10 · Prisma 5 · PostgreSQL · BullMQ 5 · Vitest 1 · TypeScript 5

## 项目结构

```
apps/server/src/
├── graph/                # 已交付：图引擎
│   ├── cycle/            # CycleDetectorService（纯函数）
│   ├── events/           # GraphEventPublisher（BullMQ 出口）
│   ├── node/             # NodeService（状态护栏）
│   ├── edge/             # EdgeService（环检测集成）
│   ├── repository/       # GraphRepository（Prisma 封装）
│   ├── graph.controller.ts
│   └── graph.module.ts
├── prisma/               # PrismaService
├── adapters/             # 待实现
├── api/                  # 待实现
├── event-pipeline/       # 待实现：BullMQ Worker
├── knowledge/            # 待实现
└── orchestrator/         # 待实现
```

## 文档

- [设计文档](docs/superpowers/specs/2026-05-04-scaffold-graph-engine-design.md)
- [实施计划](docs/superpowers/plans/2026-05-04-scaffold-graph-engine.md)
