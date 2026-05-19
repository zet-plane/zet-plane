# Event Pipeline — 设计文档

**日期**：2026-05-19  
**状态**：已确认，待实现

---

## 背景与目标

Event Pipeline 是 Zet Plane 架构中的"事件归一化 + 路由"层，位于 Adapter Layer 与 Domain Services / Agent Orchestrator 之间。

**职责**：将来自不同外部来源（GitHub、飞书、Claude Code Hook、手动触发）的异构事件，经过接收、去重、项目归属解析、路由后，分发到两个下游：
- **确定性变更** → 直接调 Domain Service（Graph / Knowledge）
- **需 LLM 分析** → 发布到 Orchestrator 任务队列

**不在范围内**：LLM 调用、语义理解、节点预匹配、Adapter 验证逻辑以外的任何业务判断。

---

## 架构方案：统一队列 + 中心 Worker（方案 A）

```
外部来源                       EventPipelineModule
─────────                     ───────────────────────────────────────────────
GitHub Webhook   ──POST──▶    WebhookController
Feishu Webhook   ──POST──▶      └─ /webhooks/:source
Claude Hook CLI  ──POST──▶
Manual API       ──POST──▶
                                  │ enqueue(NormalizedEvent)
                                  ▼
                              BullMQ: incoming-events
                                  │
                                  ▼
                              EventPipelineWorker
                                ├── DeduplicationService  (idempotency key → PG)
                                ├── EnrichmentService     (resolve projectId)
                                ├── RoutingTable          (static rules)
                                └── dispatch
                                      ├── direct      ──▶ NodeService / EdgeService
                                      └── orchestrate ──▶ OrchestratorTaskPublisher
                                            │
                                            ▼
                                      Event Store (PG incoming_events)
```

---

## §1 — HTTP 入口层

### 端点

```
POST /webhooks/:source
```

统一入口，`:source` 取值为 `EventSource`（`github` | `feishu` | `claude_hook` | `manual` | `cli`）。未知 source → 404。

### AdapterRegistry

每个 Adapter 实现 `IWebhookAdapter` 接口，并在 `EventPipelineModule` 初始化时向 `AdapterRegistry` 注册自身。`AdapterRegistry` 以 `source` 为键维护映射表。

```typescript
// apps/server/src/event-pipeline/adapters/adapter.interface.ts
export interface IWebhookAdapter<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly source: EventSource
  normalize(payload: unknown, headers: Record<string, string>): NormalizedEvent<TPayload>
}
```

### WebhookController 职责

1. 从路径参数取 `source`，通过 `AdapterRegistry.get(source)` 查找对应 Adapter；找不到 → 404
2. 调 Adapter，将原始 payload + headers 转为 `NormalizedEvent`（含验签）
3. 将 `NormalizedEvent` 推入 BullMQ `incoming-events` 队列
4. 返回 `{ received: true }`，不等待处理结果

验签失败或 payload 无法解析 → 返回 400，不入队。Controller 本身不感知任何具体来源。

---

## §2 — NormalizedEvent（内部契约）

```typescript
// apps/server/src/event-pipeline/types.ts

export type EventSource = 'github' | 'feishu' | 'claude_hook' | 'manual' | 'cli' // 'cli' 占位，暂不实现

export interface NormalizedEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  source: EventSource
  eventType: string         // 'github.push' | 'feishu.message' | 'claude_hook.session_end' | ...
  idempotencyKey: string    // 唯一键，用于去重
  sourceProjectHint: string // 原始项目标识，如 "org/repo"、飞书群 chat_id
  occurredAt: Date
  payload: TPayload
}

export type RouteTarget = 'direct' | 'orchestrate'

// 各来源的 payload 类型约束，在对应 adapter 文件中定义并 export
// 示例：
//   GithubAdapter → NormalizedEvent<GithubPushPayload>
//   FeishuAdapter → NormalizedEvent<FeishuMessagePayload>
//
// IWebhookAdapter 接口签名：
//   normalize(...): NormalizedEvent<TPayload>
//
// BullMQ 入队边界使用无参数基础类型 NormalizedEvent（即 TPayload = Record<string, unknown>），
// Worker 侧不感知具体 payload 结构，Orchestrator 按需解析。
```

**各 Adapter 的 idempotencyKey 构造规则**：

| 来源 | idempotencyKey |
|------|---------------|
| GitHub | `github:{X-GitHub-Delivery}` |
| 飞书 | `feishu:{message_id}` |
| Claude Hook | `claude_hook:{hook_event_id}`（调用方在推送前生成 UUID，随 payload 一起发送） |
| Manual | `manual:{uuid}`（调用方生成并传入） |
| CLI（占位） | `cli:{uuid}`（zet-plane CLI 生成，暂不实现） |

---

## §3 — 数据模型

### `incoming_events` 表

```prisma
model IncomingEvent {
  id             String              @id @default(uuid())
  source         EventSource
  idempotencyKey String              @unique @map("idempotency_key")
  projectId      String?             @map("project_id")
  eventType      String              @map("event_type")
  payload        Json
  status         IncomingEventStatus @default(pending)
  routedTo       String?             @map("routed_to")  // 'direct' | 'orchestrate'
  error          Json?
  createdAt      DateTime            @default(now()) @map("created_at")
  updatedAt      DateTime            @updatedAt @map("updated_at")

  @@index([projectId], map: "idx_incoming_events_project_id")
  @@index([status],    map: "idx_incoming_events_status")
  @@map("incoming_events")
}

enum EventSource {
  github
  feishu
  claude_hook
  manual
  cli        // 占位，zet-plane CLI 接入时实现
  @@map("event_source")
}

enum IncomingEventStatus {
  pending
  processing
  routed
  deduplicated
  failed
  @@map("incoming_event_status")
}
```

双重作用：**去重锁**（dedup 先写后处理）+ **审计日志**（全链路可追溯）。

### `project_source_mappings` 表

记录「外部来源标识 → projectId」的绑定关系，由用户在配置界面手动维护。

```prisma
model ProjectSourceMapping {
  id          String      @id @default(uuid())
  projectId   String      @map("project_id")
  source      EventSource
  sourceKey   String      @map("source_key")  // e.g. "org/repo"、飞书群 chat_id
  createdAt   DateTime    @default(now()) @map("created_at")

  @@unique([source, sourceKey], map: "uk_project_source_mappings_source_key")
  @@index([projectId],          map: "idx_project_source_mappings_project_id")
  @@map("project_source_mappings")
}
```

---

## §4 — EventPipelineWorker：四步流水线

### 步骤 1：DeduplicationService

```
输入：NormalizedEvent.idempotencyKey
查询：SELECT FROM incoming_events WHERE idempotency_key = ?
  - 已存在 → 更新 status=deduplicated，终止（正常结束，不重试）
  - 不存在 → INSERT INTO incoming_events (status=processing)，继续
```

先写 DB 再处理，确保 BullMQ 重试时 dedup 检查能命中，防止重复处理。

### 步骤 2：EnrichmentService

```
输入：NormalizedEvent.source + sourceProjectHint
查询：SELECT FROM project_source_mappings WHERE source = ? AND source_key = ?
  - 找到 → 得到 projectId，继续
  - 找不到 → 更新 status=failed, error={reason:'no_project_mapping'}，终止（不重试）
  - DB 瞬时失败 → 抛异常，由 BullMQ 重试
```

### 步骤 3：RoutingTable（静态规则）

纯 TypeScript 常量，不注入 DI：

```typescript
// apps/server/src/event-pipeline/pipeline/routing-table.ts
export const ROUTING_RULES: Record<string, RouteTarget> = {
  // MVP 阶段所有外部事件均发 Orchestrator 分析：
  // github.push 虽然语义明确，但缺乏 branch→node 映射表，无法确定性地写 Domain。
  // 当未来引入显式映射（如 project_branch_mappings 表）后，可将特定 eventType 改为 'direct'。
  'github.push':              'orchestrate',
  'github.pull_request':      'orchestrate',
  'github.issues':            'orchestrate',
  'feishu.message':           'orchestrate',
  'claude_hook.session_end':  'orchestrate',
  'claude_hook.tool_use':     'orchestrate',
  'manual':                   'orchestrate',
  // 'cli.*': 'orchestrate',  // 占位，zet-plane CLI 接入时补充具体 eventType
}

export const DEFAULT_ROUTE: RouteTarget = 'orchestrate'  // 未知类型保守策略
```

> **`direct` 路径架构上保留**，当前路由表中暂未使用。未来当某类事件有明确的 Domain 操作（如"project_source_mapping 绑定的 repo 发生 tag 事件 → 直接归档对应节点"），可在路由表中单独标注为 `'direct'`，无需改动 Worker 结构。

### 步骤 4：dispatch

- `direct` → 调对应 Domain Service 方法（如 `NodeService.updateStatus`）
- `orchestrate` → 调 `OrchestratorTaskPublisher.publish()`，`type=event_anchor`

dispatch 完成后，将 `incoming_events.status` 更新为 `'routed'`，写入 `routed_to`。

---

## §5 — 模块文件结构

```
apps/server/src/event-pipeline/
├── event-pipeline.module.ts
├── types.ts
│
├── webhook/
│   ├── webhook.controller.ts
│   └── webhook.controller.spec.ts
│
├── pipeline/
│   ├── event-pipeline.worker.ts
│   ├── event-pipeline.worker.spec.ts
│   ├── deduplication.service.ts
│   ├── deduplication.service.spec.ts
│   ├── enrichment.service.ts
│   ├── enrichment.service.spec.ts
│   └── routing-table.ts
│
├── adapters/
│   ├── adapter.interface.ts
│   ├── adapter.registry.ts
│   ├── github.adapter.ts
│   ├── feishu.adapter.ts
│   ├── claude-hook.adapter.ts
│   ├── manual.adapter.ts
│   └── cli.adapter.ts          ← 占位，暂不实现
│
└── repository/
    ├── incoming-event.repository.ts
    └── incoming-event.repository.spec.ts
```

### DI 注册

```typescript
@Module({
  imports: [
    BullModule.registerQueue({ name: INCOMING_EVENTS_QUEUE }),
    forwardRef(() => GraphModule),
    forwardRef(() => OrchestratorModule),
  ],
  providers: [
    WebhookController,
    EventPipelineWorker,
    DeduplicationService,
    EnrichmentService,
    IncomingEventRepository,
    AdapterRegistry,
    GithubAdapter,
    FeishuAdapter,
    ClaudeHookAdapter,
    ManualAdapter,
    // CliAdapter,  // 占位，zet-plane CLI 接入时注册至 AdapterRegistry
  ],
  exports: [],  // Pipeline 是终点，不导出
})
export class EventPipelineModule {}
```

---

## §6 — 错误处理与重试

### BullMQ 配置

```typescript
defaultJobOptions: {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: true,
  removeOnFail: false,   // 失败 job 保留便于排查
}
```

### 各步骤失败策略

| 步骤 | 失败场景 | 处理方式 |
|------|---------|---------|
| 验签（Controller） | 签名不合法 | 400，不入队 |
| Adapter 解析 | payload 字段缺失 | 400，不入队 |
| Deduplication | DB 写失败（瞬时） | 抛异常 → BullMQ 重试 |
| Deduplication | 幂等键已存在 | 正常结束，不重试 |
| Enrichment | 无 project mapping | `status=failed`，不重试（配置问题） |
| Enrichment | DB 查询失败（瞬时） | 抛异常 → BullMQ 重试 |
| Routing dispatch | direct / orchestrate 失败 | 抛异常 → BullMQ 重试 |

### 幂等性

Domain Service 有状态机守卫，`OrchestratorTaskPublisher` 有 idempotencyKey 唯一约束，BullMQ 重试不产生副作用。

---

## §7 — 测试策略

所有测试为纯单元测试，mock 外部依赖，无需真实 DB 或 Redis。

| 组件 | 核心测试场景 |
|------|------------|
| `AdapterRegistry` | 已注册 source→返回对应 Adapter；未知 source→抛异常 |
| `WebhookController` | 已注册 source→通过 registry 分发入队；未知 source→404；验签失败→400 |
| `GithubAdapter` | 合法 payload→正确 NormalizedEvent；缺字段→400 |
| `FeishuAdapter` | 同上，message_id 为 idempotencyKey |
| `ClaudeHookAdapter` | 同上，hook_event_id 为 idempotencyKey |
| `CliAdapter` | 占位，zet-plane CLI 接入时补充 |
| `DeduplicationService` | 新键→写 DB 返回 'new'；已存在→返回 'duplicate'；DB 失败→抛异常 |
| `EnrichmentService` | hint 存在→返回 projectId；不存在→抛 NoProjectMappingError |
| `EventPipelineWorker` | happy path orchestrate；dedup 命中短路；enrich 失败→status=failed；direct→NodeService 被调用 |
| `routing-table.ts` | 每个已知 eventType 路由正确；未知类型→'orchestrate' |

Repository 层不做单元测试，留给未来 E2E。

---

## 约束与边界

- Pipeline 不调 LLM，不做语义判断
- Adapter 只做字段映射，不决定路由
- `direct` 路由的具体 Domain 方法绑定，随 eventType 增加逐步补充（初期只实现 `github.push`）
- `project_source_mappings` 的 CRUD API 不在本次范围内（留给配置界面迭代）
