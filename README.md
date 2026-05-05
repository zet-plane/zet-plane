# zet-plane

项目级图结构编排引擎：以节点/边组织 Scaffold 与 Growth 任务，通过环检测自动升级 Checkpoint，由 BullMQ 推送领域事件。

## 当前状态

**Scaffold Graph Engine 一期已交付并完成首轮加固**（2026-05-05）。完整实现 [scaffold-graph-engine 计划](docs/superpowers/plans/2026-05-04-scaffold-graph-engine.md) 的 8 个任务，并修复了首轮校验发现的全部 spec 偏差与 DI bug。

### 进度（8/8 ✓）

| Task | 内容 | 状态 |
|---|---|---|
| 1 | Prisma Schema + PrismaService（含 OnModuleDestroy） | ✓ |
| 2 | CycleDetectorService（DFS + 入度，reference 边跳过） | ✓ |
| 3 | GraphEventPublisher + 5 种 BullMQ Job 类型 | ✓ |
| 4 | GraphRepository + 4 种删除策略（block/cascade/reparent×2） | ✓ |
| 5 | NodeService + 5 条状态护栏 + Checkpoint 解决 | ✓ |
| 6 | EdgeService（环检测集成） | ✓ |
| 7 | GraphController（全部路由） | ✓ |
| 8 | GraphModule + AppModule 装配 + Redis 连接 | ✓ |

### 加固轮次（2026-05-05 第二批）

| 项 | 内容 |
|---|---|
| Spec 偏差修复 | 5 项全部完成（见 commits `50486b9..43496b9`） |
| 单元测试补齐 | 26 个新用例（commit `2ea6d08`） |
| BullMQ Worker | placeholder consumer 已就绪（commit `a0500d2`） |
| E2E 脚手架 | Vitest 双 project + 自动跳过无基础设施场景（commit `d990147`） |
| DI bug 修复 | NodeService/EdgeService 由 `import type` 引发的运行时 DI 解析失败（commit `b76a172`） |

### 测试（68/68 通过）

| Spec 文件 | 用例数 |
|---|---|
| node.service.spec.ts | 21 |
| edge.service.spec.ts | 14 |
| graph.controller.spec.ts | 13 |
| cycle-detector.service.spec.ts | 10 |
| graph-event.publisher.spec.ts | 5 |
| graph-event.worker.spec.ts | 5 |

E2E 套件位于 `apps/server/test/graph.e2e-spec.ts`，覆盖项目初始化、节点创建、环检测升级 Checkpoint、级联删除四个场景；运行命令 `pnpm test:e2e`，依赖本地 Redis + Postgres，否则自动跳过并打印 `E2E SKIPPED: infra not available`。

### 启动验证

`pnpm dev` 已可顺利完成 NestFactory 引导、AppModule + BullModule 装配、Provider 解析；唯一阻断是连接 Redis（6379）/ Postgres（5432）时的 `ECONNREFUSED`，需要本机或容器化的实例：

```bash
# 一次性本地基础设施（任选其一即可）
docker run -d --name zet-redis -p 6379:6379 redis:7-alpine
docker run -d --name zet-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=zet_plane_dev postgres:16
```

## 后续任务

### 下一阶段（按设计文档）

按 `apps/server/src/` 已留目录推进核心模块：

- **event-pipeline/** — 接入归一化事件管线（Ingest → Dedup → Enrich → Route → Persist），消费 Adapter Layer 输出。
- **adapters/** — GitHub / Feishu / Claude Code Hook 三个首批 Adapter；遵循"适配而非依赖"。
- **orchestrator/** — Agent Orchestrator（唯一主动智能层），订阅 graph-events 队列，对接 Anthropic SDK。
- **knowledge/** — Knowledge Sedimentation Engine，知识条目锚定 Graph 节点。
- **api/** — REST CRUD + WebSocket 实时推送（图状态 / 知识更新）。

### 持续改进（小项）

- 接入 CI 流水线运行 `pnpm test`，新增 PR 自动跑单元测试。
- 补充 GraphRepository 直接命中真实 Postgres 的 E2E 用例（当前仅覆盖跨服务流程）。
- BullMQ Worker 当前仅打日志，待 Orchestrator 上线后接入实际处理。

## 技术栈

NestJS 10 · Prisma 5 · PostgreSQL · BullMQ 5 · Vitest 1 · TypeScript 5

## 项目结构

```
apps/server/
├── prisma/                       # schema + migrations
├── src/
│   ├── graph/                    # 已交付：图引擎
│   │   ├── cycle/                # CycleDetectorService（纯函数）
│   │   ├── events/               # Publisher + Worker（BullMQ 出入口）
│   │   ├── node/                 # NodeService（状态护栏）
│   │   ├── edge/                 # EdgeService（环检测集成）
│   │   ├── repository/           # GraphRepository（Prisma 封装）
│   │   ├── graph.controller.ts
│   │   └── graph.module.ts
│   ├── prisma/                   # PrismaService
│   ├── adapters/                 # 待实现
│   ├── api/                      # 待实现
│   ├── event-pipeline/           # 待实现
│   ├── knowledge/                # 待实现
│   └── orchestrator/             # 待实现
└── test/
    └── graph.e2e-spec.ts         # 端到端用例（按需跳过）
```

## 常用命令

```bash
# 后端开发
cd apps/server
pnpm dev              # nest start --watch（端口 3000）
pnpm test             # vitest run（仅单元测试）
pnpm test:e2e         # E2E（需 Redis + Postgres）
pnpm test:all         # 全量

# 数据库
pnpm prisma migrate dev --name <name>
pnpm prisma generate
pnpm prisma studio
```

## 文档

- [总体架构](docs/architecture.md)
- [Scaffold Graph Engine 设计](docs/superpowers/specs/2026-05-04-scaffold-graph-engine-design.md)
- [Scaffold Graph Engine 实施计划](docs/superpowers/plans/2026-05-04-scaffold-graph-engine.md)
- [Claude Code 开发指南](CLAUDE.md)
