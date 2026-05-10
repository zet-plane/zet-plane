# 项目模型 — 设计

**日期**: 2026-05-09
**状态**: 待实现
**替代**: 在 [Scaffold Graph Engine 设计](./2026-05-04-scaffold-graph-engine-design.md) 和 [Knowledge Engine 设计](./2026-05-05-knowledge-engine-design.md) 中默认的"projectId 为自由字符串"的假设。

---

## 1. 问题

`projectId` 目前是 `Node`、`Edge`、`KnowledgeEntry` 上的自由 `String` 列。系统没有 `Project` 表、没有生命周期，也没有负责项目级不变式的服务。直接后果有两点：

1. **`initProjectRoot(projectId)` 接受任意字符串。** 一次拼写错误就会静默创建一个全新的"项目"，并生成它自己的根节点。没有任何权威的项目列表可用于校验。
2. **知识锚定到了"没有锚点"的节点。** "知识必须在图内"这一架构不变式被满足，但外层壳"图必须属于已知项目"没有约束入口。

`Project` 模型用于补齐聚合层级顶部的缺口：

```
Project（新增）
  └── Node           （projectId 列，业务代码校验）
  └── Edge           （projectId 列，业务代码校验）
  └── KnowledgeEntry （projectId 列，业务代码校验）
       └── KnowledgeRevision
```

## 2. 范围

**包含内容：**

- 一个带元数据（`name`、`description`）的 `Project` 聚合根。
- 业务代码（`ProjectService.assertExists`）在 `Graph` 与 `Knowledge` 模块的所有写入路径前校验项目存在性，不使用数据库 FK 约束。
- `POST /projects` 在同一事务里创建项目 **以及** 项目根节点。
- 新增 `ProjectEventPublisher` 作为 BullMQ 出口，负责 `project.created` / `project.deleted`。

**不包含（明确 YAGNI）：**

- 数据库外键约束（`ON DELETE CASCADE`）—— 由业务代码保证引用完整性。
- 项目生命周期状态（active / archived）—— 留待未来规范。
- 成员、角色、JWT 作用域。
- 按项目配置（LLM key、适配器凭据、编排器策略）。
- 软删除 / 恢复。
- 介于 Project 与 Node 之间的 `Graph` 实体。Knowledge Engine 规范里的"单项目多图"概念仍保持隐式（由边的可达性编码），留待未来规范。
- 数据库层面阻止跨项目边。继续沿用当前的服务层校验。

**该模式的参考：**

- **Vendure**（NestJS，开源）— `ChannelService` 作为多租户根；`ChannelModule` 直接 DI 引入子功能服务以同步引导默认值。
- **GitLab** — `Projects::CreateService` 在一次 ActiveRecord 事务中编排默认分支 / 受保护分支 / 仓库创建。
- **Sentry** — `Organization` 创建时同步创建默认项目 + 团队；用提交后信号处理非不变式反应。

共同点：**引导不变式必须放在聚合根拥有的同步事务里，而不是放在事件驱动的反应中。** 事件仅用于非不变式的下游消费者。

## 3. 数据模型

### 3.1 新表

```prisma
model Project {
  id          String   @id @default(uuid())
  name        String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

`Node`、`Edge`、`KnowledgeEntry` 上现有的 `projectId String` 列保持不变，不添加 FK 约束。引用完整性由 `ProjectService.assertExists` 在各写入路径的业务层保证。

## 4. 模块结构

新增 `apps/server/src/project/`：

```
project/
├── dto/project.dto.ts
├── repository/project.repository.ts
├── project.service.ts
├── project.service.spec.ts
├── project.controller.ts
├── project.controller.spec.ts
├── events/project-event-publisher.ts
└── project.module.ts
```

分层与 `GraphModule` 一致：

```
ProjectController → ProjectService → ProjectRepository → PrismaService
                          │
                          ├──→ ProjectEventPublisher (BullMQ, post-commit)
                          └──→ NodeService.initProjectRootInternal (during create)
```

### 4.1 依赖方向

- `ProjectModule` 导出 `ProjectService`。
- `ProjectModule` `imports: [GraphModule]`，以便 `ProjectService.create` 调用 `NodeService.initProjectRootInternal`。
- `GraphModule` 与 `KnowledgeModule` `imports: [ProjectModule]`，以便各自服务调用 `ProjectService.assertExists`。

这是一个**单向模块依赖**：`Project ⇄ Graph` 表面看有环，但在服务调用层是非对称的——Project 负责启动时编排 Graph，Graph 在写入时向 Project 询问。NestJS 仅在需要时通过 `forwardRef` 解决导入环；实践中只要双方都导出服务即可。如果 DI 图报错，就在后加载的一侧使用 `forwardRef` 兜底。

### 4.2 **不**迁移的内容

- `GraphRepository.initProjectRoot` 保持现有语义，但其**唯一公开调用方**改为 `ProjectService.create`。Graph controller 旧的"init project"入口将被移除。
- `NodeService.initProjectRoot` 重命名为 `initProjectRootInternal`，表明它不是面向 controller 的操作。行为不变；它跳过 `assertExists`，因为它运行在 `Project` 创建事务内，此时项目行还未提交。

## 5. API 面

| 方法 | 路径 | 请求体 | 返回 | 说明 |
|---|---|---|---|---|
| POST | `/projects` | `{ name, description? }` | 201 `ProjectDto` | 单个事务中创建项目 + 根节点 |
| GET | `/projects` | — | `ProjectDto[]` | 返回所有项目 |
| GET | `/projects/:id` | — | `ProjectDto` | 未找到则 404 |
| PATCH | `/projects/:id` | `{ name?, description? }` | `ProjectDto` | 未找到则 404 |
| DELETE | `/projects/:id` | — | 204 | 硬删除；由 `ProjectRepository` 在单一事务中按顺序批量清理子表 |

**`ProjectDto`**：`{ id, name, description, createdAt, updatedAt }`。

**移除的路由（破坏性变更）**：

- 任何既有的 `POST /graph/projects/:id/init` 或等价接口。CLI / Web 客户端必须先 `POST /projects` 获取 `projectId`。这是项目层面的可接受变更（目前没有生产调用方）。

## 6. 服务方法

### 6.1 `ProjectService`

```ts
class ProjectService {
  create(dto: CreateProjectDto): Promise<Project>
  // tx:
  //   1. INSERT INTO Project
  //   2. nodeService.initProjectRootInternal(project.id, tx)
  //   3. (commit)
  //   4. eventPublisher.emit('project.created', { projectId, rootNodeId })

  update(id: string, dto: UpdateProjectDto): Promise<Project>
  // assertExists 后更新

  remove(id: string): Promise<void>
  // 删除路径完全在 ProjectRepository 层执行，不经过
  // NodeService / EdgeService / KnowledgeEntryService，以避免：
  //   1. 触发它们各自的 assertExists / 级联逻辑（语义冲突）
  //   2. N+1 的逐条删除
  //
  // Node 在此处走 hard delete（deleteMany），与图引擎单节点删除策略
  // （归档 status: archived）不同。Project 销毁是领域级别的清除，
  // 不存在孤儿数据问题，hard delete 是正确语义。
  //
  // tx（单一事务，顺序不可颠倒）:
  //   1. 统计子项 counts（快照，非精确）
  //   2. deleteMany KnowledgeRevisions（WHERE entryId IN entries of project）
  //   3. deleteMany KnowledgeEntries  （WHERE projectId = id）
  //   4. deleteMany Edges             （WHERE projectId = id）
  //   5. deleteMany Nodes             （WHERE projectId = id）
  //   6. delete     Project           （WHERE id = id）
  // → commit → emit 'project.deleted' 并附带 counts

  findById(id: string): Promise<Project>      // 404 if missing
  list(): Promise<Project[]>

  assertExists(id: string): Promise<void>
  // 不存在则 404 PROJECT_NOT_FOUND
  // 存在时静默通过
}
```

### 6.2 守卫插入点

**`projectId` 来源**：Node / Edge / Knowledge 的 API 路由已采用 `/graph/:projectId/...` 形式，`projectId` 来自路径参数，由各 Controller 从 `@Param` 取出后传入 Service。客户端无法在请求体中绕过路径层直接指定 projectId。Project 在此扮演校验点角色：路由结构保证了 projectId 必须显式声明，`assertExists` 保证了它必须是已知项目。

`assertExists(projectId)` 必须是每个写方法的**第一行**：

| 服务 | 方法 |
|---|---|
| `NodeService` | `createNode`, `updateStatus`, `resolveCheckpoint`, `deleteNode` |
| `EdgeService` | `createEdge`, `repointEdge`, `deleteEdge` |
| `KnowledgeEntryService` | `create`, `update`, `archive`, every other write path |

**读路径**（`list*`、`getById`）**不**调用 `assertExists`。

**例外**：`NodeService.initProjectRootInternal` 不调用 `assertExists`，因为它在项目行对外可见之前执行。它仅对 `ProjectService` 包可见。

## 7. 事件

新增 `ProjectEventPublisher`，队列名 `project-events`。其提交后语义与 `GraphEventPublisher` 一致：绝不在 `$transaction` 回调内部入队。

```ts
type ProjectEvent =
  | { type: 'project.created'; projectId: string; rootNodeId: string }
  | { type: 'project.deleted'; projectId: string; cascadedCounts: { nodes: number; edges: number; entries: number } }
```

`project.deleted` 携带 `cascadedCounts` —— 服务层在同一事务中（删除前一刻）统计子项，并把快照附到提交后事件上。这与 `graph.node.deleted` 的 `affectedNodeIds` 字段一致。

本 PR 不实现 worker —— 会与现有 `graph-events` 的 consumer 一起加入 README 待办清单。

## 8. 迁移计划

新增文件：`apps/server/prisma/migrations/<timestamp>_add_project_table/migration.sql`。

在 schema 修改后执行 `prisma migrate dev --name add_project_table` 生成。人工检查必须确认：

1. `CREATE TABLE "Project" (...)` — 仅包含 id、name、description、createdAt、updatedAt，无枚举类型
2. `Node`、`Edge`、`KnowledgeEntry` 的 `projectId` 列**不添加** FK 约束

开发库没有重要数据，迁移无需回填 SQL。

## 9. 测试

按项目 TDD 约定：

| 文件 | 覆盖内容 |
|---|---|
| `project.service.spec.ts` | `create` 在 `initProjectRootInternal` 抛错时回滚；`assertExists` 在缺失时 → 404；在存在时通过；`remove` 调用 repository 的批量删除而非子模块 Service；`remove` 事件携带删除前统计的 counts。 |
| `project.controller.spec.ts` | 5 个端点的 route → service 方法映射。 |
| `project.repository.ts` | 不写单测（与 `GraphRepository` 一致）。 |
| `node.service.spec.ts`（修改） | 新增 describe 块：`'when project does not exist'` → 所有写入抛 `NotFoundException`。 |
| `edge.service.spec.ts`（修改） | 同上。 |
| `knowledge-entry.service.spec.ts`（修改） | 同上。 |

级联删除路径的 E2E 覆盖将延后到 README 待办所述的整体 E2E 套件中。

## 10. 待定问题

设计阶段无问题。实现过程中可能暴露 `ProjectModule ⇄ GraphModule` 的 NestJS DI 环问题——若发生，使用 `forwardRef` 解决，并用行内注释解释编排关系，而不是重构模块依赖。

## 11. 实施顺序

1. 修改 schema + `prisma migrate dev`（仅新增 `Project` 表，不改现有表）。
2. 创建 `ProjectModule` 骨架：repository、service stub、controller、DTO、event publisher。
3. 实现 `ProjectService.create` + `assertExists`，并覆盖完整 spec。
4. 将 `ProjectModule` 接入 `GraphModule.imports` 和 `KnowledgeModule.imports`。
5. 在 `NodeService` / `EdgeService` / `KnowledgeEntryService` 的写路径添加 `assertExists`；更新各自 spec。
6. 重命名 `initProjectRoot` → `initProjectRootInternal`；移除旧 controller 路由；更新 `graph.controller.spec.ts`。
7. 实现 `ProjectService` 其余方法（update、remove）与事件载荷。
8. 冒烟测试：`POST /projects`、`POST /graph/.../nodes`（无效 projectId 返回 404）、`DELETE /projects/:id` 后子表清空。

每一步按项目现有约定各自独立提交。
