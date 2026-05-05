# Dependency Tracking

记录当前仓库中**滞后于上游 latest** 的依赖、滞后原因，以及未来升级时需要适配的破坏性变更。

> **更新策略：** 见 [CLAUDE.md → Dependency hygiene](../CLAUDE.md#dependency-hygiene)。新增依赖一律取 `npm view <pkg> dist-tags.latest`；现有依赖按表中"优先级"逐一升级，每个依赖（或紧耦合分组）独立 PR，升级后跑全套测试 + dev boot。

最近一次审计：2026-05-05。命令：`pnpm outdated -r`。

## 滞后总览（按优先级）

| 包 | 当前 | 上游 latest | 落差 | 优先级 | 状态 |
|---|---|---|---|---|---|
| `vitest` (`@swc/core` 链路) | 1.6.1 | 4.1.5 | -3 major | 高 | 已升级 (2026-05-05) → 4.1.5 |
| `prisma` + `@prisma/client` | 5.22.0 | 7.8.0 | -2 major | 高 | 已升级 (2026-05-05) → 7.8.0 |
| `@nestjs/*`（core, common, platform-fastify, platform-socket.io, websockets, testing） | 10.4.22 | 11.1.19 | -1 major | 高 | 已升级 (2026-05-05) → 11.1.19 |
| `@nestjs/cli` | 10.4.9 | 11.0.21 | -1 major | 高 | 已升级 (2026-05-05) → 11.0.21 |
| `@anthropic-ai/sdk` | 0.24.3 | 0.93.0 | 多次小版本累积，含 Messages/Tool 重大重构 | 高 | 待升（Orchestrator 上线前必须） |
| `next` (apps/web) | 14.2.35 | 16.2.4 | -2 major | 中 | 待升（web 仅脚手架） |
| `react` + `react-dom` + `@types/react*` | 18.3.x | 19.2.x | -1 major | 中 | 跟随 Next 升 |
| `typescript` | 6.0.3 | 6.0.3 | — | 中 | 已升级 (2026-05-05) |
| `pnpm`（packageManager 字段） | 9.0.0 | 10.x | -1 major | 低 | 当前可用，无阻塞 |
| `turbo` | 2.9.8 | 2.9.9 | patch | 低 | 自然滚动即可 |

## 单包升级笔记

### `vitest` 1.6.1 → 4.1.5（高）

**为什么滞后：** 计划文件直接抄了 `^1.5.0`，未查 latest。

**升级时要适配：**
- `MockInstance` 泛型签名在 2.x 已变（参见 `graph-event.worker.spec.ts` 中绕过的写法）。升级后简化为 `vi.spyOn(...)` 直接推断即可。
- `vitest/config` 在 3.x 引入了 `projects` API 替代 `workspace`，但当前我们用单文件 config，无影响。
- Vite 主版本会跟着跳到 7/8，其插件接口（`unplugin-swc` 等）需同步检查兼容矩阵。
- `--include` CLI 标志在 1.x 不存在；当前用 `vitest.e2e.config.ts` 解决，4.x 已恢复 `--include`，但配置文件方案兼容更好，保留即可。
- Coverage provider 默认从 c8 → v8。如需覆盖率报表需新增 `@vitest/coverage-v8`。

**升级命令：**
```bash
pnpm add -D vitest@latest --filter @zet-plane/server
# 跑一次 unit + e2e 验证
pnpm --filter @zet-plane/server test && pnpm --filter @zet-plane/server test:e2e
```

### `prisma` + `@prisma/client` 5.22 → 7.x（高）

**为什么滞后：** 计划写时 `^5.13.0`，至今未升级。

**升级时要适配：**
- Prisma 6 起 ESM/CJS 双发模式默认值有调整，确认 `nest build` 输出的 CJS 仍正常加载。
- 6.x 引入了 `prismaSchemaFolder` 预览特性、对 `@@id`/`@@unique` 的 introspection 行为有微调。
- 7.x 即将（或已经）发布的破坏性变更需要在升级时先读其 release notes，重点看 `$transaction` 和 `findFirst` 的语义。
- 升级后必须 `pnpm prisma generate` 并跑 migration deploy，确保 `schema.prisma` 与生成 client 同步。

**升级命令：**
```bash
pnpm add prisma@latest @prisma/client@latest --filter @zet-plane/server
pnpm --filter @zet-plane/server prisma generate
pnpm --filter @zet-plane/server prisma migrate deploy
```

- 升级时切到 Prisma 7 新生成器 `prisma-client`，输出至 `src/generated/client`；导入统一用 `@generated/client` 路径别名（见 `tsconfig.json` `paths` 与 `nest-cli.json`）。

### `@nestjs/*` 10.x → 11.x（高）

**为什么滞后：** 计划锁定 NestJS 10。

**升级时要适配：**
- NestJS 11 默认 Fastify 5（当前 platform-fastify 内部仍是 4）。检查 `FastifyAdapter` 初始化和 hooks 签名。
- 11.x 切换到 `eventemitter3` v6 与 `rxjs` 8 的兼容仍在验证中，密切看 issue tracker。
- `@nestjs/bullmq` v11 已就绪，本仓库已用 `^11.0.4`，与 NestJS 11 升级链路对齐。
- `@nestjs/testing` 中 `Test.createTestingModule().compile()` 接口稳定，但 11 的 logger 默认行为有变（多了结构化日志）。

**注意：** 升级 NestJS 前先升 `@nestjs/cli`，否则 `nest build` 可能报 schematics 不匹配。

**升级结果 (2026-05-05)：** 无破坏性变更；`FastifyAdapter` 默认无参数构造即可，`nest-cli.json` 无需修改，全部 gate（build / 68 unit / 4 e2e / dev boot）零改动通过。

### `@anthropic-ai/sdk` 0.24 → 0.93（高，Orchestrator 上线前必须）

**为什么滞后：** 计划中保留了一个非常老的 SDK 版本，且 Orchestrator 模块尚未实现，没有被实际使用。

**升级时要适配：** 这是跨度最大的一项。0.24 → 0.93 之间至少经历了：
- Messages API 重构（取代 Completions）
- Tool use 接口稳定化
- Streaming 事件结构调整
- Prompt caching、Files、Citations 等新能力

**实操建议：** Orchestrator 模块开始动工前 **直接装 latest**，跳过迁移；同时按 [CLAUDE.md → Dependency hygiene](../CLAUDE.md#dependency-hygiene) 用 context7 MCP 查最新文档，不要凭记忆写 SDK 调用。

### `next` 14 → 16（中）

**为什么滞后：** apps/web 目前只是脚手架（README/landing），没有实际页面。

**升级时要适配：**
- App Router 已成默认，14→16 删了一些 Pages Router 兼容标志。
- React 19 是必要前置（见下条）。
- Turbopack dev 默认开启，build 仍 webpack。
- `next/font`、`next/image`、`next/cache` 接口变更检查。

**实操建议：** Dashboard 实际开发开始时一次性升到 latest，不要先用 14 写页面再迁移。

### `react` + `react-dom` 18 → 19（中）

跟随 Next 一起升即可。19 的破坏性变更主要是：
- `useFormState` → `useActionState` 重命名
- `forwardRef` 大部分场景不再必要
- `<Context.Provider>` 简化为直接 `<Context>`
- `propTypes` / `defaultProps` 函数组件已移除

### `typescript` 5.9 → 6.0（中）

**升级时要适配：**
- 部分内置 lib types 收紧；可能在严格模式下暴露隐藏类型错误。
- `verbatimModuleSyntax` 行为微调。
- 升级后跑一次 `pnpm -r build` 才能暴露所有 type 错误（`tsc --noEmit` 不够）。

### `pnpm` 9 → 10（低）

`packageManager` 字段记的是 9.0.0；本机用 9.x 已能跑。10.x 主要变化是 lockfile 格式 v9，升级后第一次 install 会重新生成 lockfile，注意 commit。

## 升级顺序建议

1. ~~`typescript` 5 → 6（独立，先跑通编译）~~ ✓ 已完成 (2026-05-05)
2. ~~`vitest` 1 → 4（独立 PR）~~ ✓ 已完成 (2026-05-05)
3. ~~`prisma` 5 → 7（独立 PR，含 client 与 cli）~~ ✓ 已完成 (2026-05-05)
4. ~~`@nestjs/*` 10 → 11（独立 PR，cli + core/common/platform/testing/websockets 一起）~~ ✓ 已完成 (2026-05-05)
5. `@anthropic-ai/sdk` 等 Orchestrator 模块开发时直接装 latest
6. `next` + `react` + `@types/react*` 等 Dashboard 启动时一并升

每条都需要：upgrade → `pnpm test` → `pnpm test:e2e` → `pnpm dev` 启动验证 → 更新本文件状态。
