# zet-plane

项目级图结构编排引擎：以节点/边组织 Scaffold 与 Growth 任务，通过环检测自动升级 Checkpoint，由 BullMQ 推送领域事件。



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
