# Zet Plane — 高层架构设计

---

## 架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Remote Endpoints (server-side)                   │
│  GitHub · Feishu · QQ · Grafana · Aliyun · User Input · ...        │
└──────────┬──────────────────────────────────────────────┬───────────┘
           │ Webhook / Poll / Manual                      │ Notify / Push
           ▼                                              ▲
┌──────────────────────────────────────────────────────────────────────┐
│                         Adapter Layer                               │
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ GitHub   │ │ Feishu   │ │ QQ       │ │ Monitor  │ │ Manual   │  │
│  │ Adapter  │ │ Adapter  │ │ Adapter  │ │ Adapter  │ │ Adapter  │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │
│       │             │            │             │            │        │
│       └─────────────┴────────────┴─────────────┴────────────┘        │
│                          ▼ Normalized Event                         │
└──────────────────────────┬──────────────────────────────────────────┘
           ▲ Client Push (HTTP)
           │
┌──────────────────────────────────────────────────────────────────────┐
│                   Local Endpoints (client-side)                     │
│                                                                     │
│  ┌──────────────────────┐  ┌──────────────────────┐                 │
│  │  Claude Code         │  │  Codex               │                 │
│  │  Hook (Stop/PostTool)│  │  Plugin              │                 │
│  └──────────┬───────────┘  └──────────┬───────────┘                 │
│             │                         │                             │
│             └──────────┬──────────────┘                             │
│                        ▼                                            │
│              zet-plane-cli (本地 SDK)                               │
│              • 摘要提取 · 隐私过滤 · 离线缓冲 · HTTP Push           │
└──────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        Event Pipeline                               │
│                                                                     │
│  Ingest ──▶ Deduplicate ──▶ Enrich ──▶ Route ──▶ Event Store (PG)  │
│                                          │                          │
│                              ┌───────────┴───────────┐              │
│                   [确定性状态变更]              [需 LLM 分析]        │
│                              ▼                       ▼              │
└──────────────────────────────────────────────────────────────────────┘
                               │                       │
                               │           ┌───────────┘
                               │           ▼
                               │  ┌─────────────────────────────────────┐
                               │  │        Agent Orchestrator           │
                               │  │  （唯一有"智能"的主动处理层）        │
                               │  │                                     │
                               │  │  EventRouter  ──▶  TaskQueue(BullMQ)│
                               │  │  Scheduler    ──▶  TaskExecutor     │
                               │  │                      │              │
                               │  │              ┌───────┴──────┐       │
                               │  │              ▼              ▼       │
                               │  │          LLMClient    Adapter.notify│
                               │  └──────┬──────────────────────────────┘
                               │         │ 读上下文 / 写分析结果
                               ▼         ▼
         ┌──────────────────────────────────────────────────────┐
         │                  Domain Services                     │
         │                                                      │
         │  ┌───────────────────────┐  ┌──────────────────────┐ │
         │  │  Scaffold Graph       │  │  Knowledge           │ │
         │  │  Engine               │  │  Sedimentation       │ │
         │  │  （被动领域服务）      │◀─┼─▶  Engine            │ │
         │  │                       │  │  （被动领域服务）     │ │
         │  │  • GraphService       │  │  • KnowledgeService  │ │
         │  │  • LifecycleService   │  │  • RevisionService   │ │
         │  │  • QueryService       │  │  • LinkingService    │ │
         │  │  • TemplateService    │  │                      │ │
         │  └───────────┬───────────┘  └──────────┬───────────┘ │
         │              │   API Layer 直接 CRUD    │             │
         └──────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        Storage Layer (PostgreSQL)                    │
│                                                                     │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐    │
│  │ Event Store│  │ Graph Store│  │ Knowledge  │  │ Task Store │    │
│  │            │  │            │  │ Store      │  │            │    │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         API Layer                                   │
│                                                                     │
│  REST API (CRUD / Query)    WebSocket (Real-time Updates)           │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                      Web Dashboard                            │  │
│  │  Graph Viewer · Knowledge Browser · Timeline · Settings       │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 运行时 | Node.js + TypeScript | 团队技术栈，生态成熟 |
| Web 框架 | NestJS | 模块化架构天然匹配分层设计，DI 容器便于 Adapter 插拔 |
| 数据库 | PostgreSQL | 关系模型适合 Graph 存储（邻接表），JSONB 支持半结构化知识条目 |
| ORM | Prisma | 类型安全，迁移管理清晰 |
| 队列 | BullMQ (Redis) | 轻量，支持延迟任务和重试，用于 Agent 任务调度 |
| 实时通信 | WebSocket (socket.io) | 推送 Graph 状态变更和知识更新 |
| LLM 接口 | Anthropic SDK / OpenAI SDK | Agent 分析和知识提取的 LLM 能力 |

---

## 核心模块设计

### 1. Adapter Layer（适配器层）

**职责**：将异构的外部端侧事件归一化为系统内部统一事件格式，同时提供向外推送通知的能力。

**设计原则**：对应 specs 原则四「适配而非依赖端侧」——任何 Adapter 的增删不影响核心逻辑。

```
interface NormalizedEvent {
  id: string;                     // 全局唯一
  source: AdapterType;            // 'github' | 'feishu' | 'qq' | 'monitor' | 'manual' | 'claude-code' | 'codex'
  sourceEventId: string;          // 原始事件 ID（用于去重）
  type: string;                   // 'commit' | 'pr_opened' | 'message' | 'alert' | 'ai-session' | ...
  timestamp: Date;
  actor?: string;                 // 触发人
  payload: Record<string, any>;   // 原始数据（JSONB 存储）
  metadata: {
    projectId: string;
    relatedNodeIds?: string[];    // 关联的 Graph 节点（可由 Enrich 阶段填充）
  };
}
```

**Adapter 接口**：

```
interface Adapter {
  type: AdapterType;

  // 事件驱动：注册 webhook 回调
  registerWebhook(config: WebhookConfig): Promise<void>;

  // 定时补充：拉取自 lastSyncAt 以来的事件
  poll(lastSyncAt: Date): Promise<NormalizedEvent[]>;

  // 反向推送：通知到端侧
  notify(target: NotifyTarget, message: NotifyMessage): Promise<void>;

  // 客户端推送：接收 zet-plane-cli 上报的本地事件（Local Adapter 专用）
  handleClientPush?(payload: unknown, token: string): Promise<NormalizedEvent>;
}
```

每个 Adapter 作为独立的 NestJS Module，通过 DI 注册。新增信息源 = 新增一个 Module，实现 `Adapter` 接口。

**Local Adapter（本地推送型）** 与 Remote Adapter 的区别：

| | Remote Adapter | Local Adapter |
|---|---|---|
| 运行位置 | 服务端 | 开发者本地机器（CLI） |
| 触发方式 | webhook 入站 / 服务端 poll | 本地 hook 触发，主动 HTTP Push |
| 典型实现 | GitHub, Feishu, QQ | Claude Code, Codex |
| 离线处理 | 服务端等待重连 | CLI 本地缓冲，恢复后补传 |

**Claude Code 集成方式**（`zet-plane-cli`）：

```jsonc
// .claude/settings.json
{
  "hooks": {
    "Stop": [{
      "command": "zet-plane upload-session --project $ZET_PROJECT_ID"
    }]
  }
}
```

`zet-plane-cli` 在 session 结束时自动执行：读取 session 摘要 → 隐私过滤（可配置排除敏感文件） → 压缩为 `ai-session` 类型的 NormalizedEvent → POST 到 `POST /api/ingest`。开发者全程无感知。

---

### 2. Event Pipeline（事件管线）

**职责**：统一处理所有进入系统的事件，保证有序、去重、可追溯。

```
Ingest ──▶ Deduplicate ──▶ Enrich ──▶ Route ──▶ Persist
```

| 阶段 | 说明 |
|---|---|
| **Ingest** | 接收 Adapter 提交的 NormalizedEvent，校验格式 |
| **Deduplicate** | 基于 `source + sourceEventId` 去重，防止 webhook 重发 |
| **Enrich** | 关联 Graph 节点（通过启发式规则 + LLM 辅助匹配），补充 `relatedNodeIds` |
| **Route** | 根据事件类型和关联节点，分发到对应引擎处理 |
| **Persist** | 追加写入 Event Store（PostgreSQL 表，按时间分区） |

Event Pipeline 本身是同步的 NestJS 中间件链。耗时操作（LLM 调用、知识提取）由 Route 阶段投递到 BullMQ 异步处理。

---

### Domain Services 调用关系

三个组件**不是对等关系**：Graph Engine 和 Knowledge Engine 是被动领域服务，Agent Orchestrator 是唯一主动的智能层。

```
API Layer ──直接 CRUD──▶ Scaffold Graph Engine
API Layer ──直接 CRUD──▶ Knowledge Sedimentation Engine

Event Pipeline ──[确定性变更]──▶ Scaffold Graph Engine
Event Pipeline ──[需分析事件]──▶ Agent Orchestrator
                                     │ 读上下文 / 写分析结果
                                     ▼
                           Scaffold Graph Engine
                           Knowledge Sedimentation Engine
```

**两个核心约束**：

1. **KE 必须锚定到 Node**：KnowledgeEntry 的 `nodeId` 是强制字段，不存在游离于 Graph 之外的知识条目。知识沉淀的导航结构由 Graph 提供，后来者通过节点找到对应的上下文，而非在平铺列表中搜索。

2. **Core Checkpoint**：每个项目流程中存在若干核心检查点节点（`type: 'checkpoint'`），作为阶段性验证门。Checkpoint 完成时 Agent 自动触发该阶段的知识汇总，也是新成员理解项目阶段进展的主要入口。

详细设计见各自文档：

- [Scaffold Graph Engine](./design/scaffold-graph-engine.md) — Graph 结构、节点生命周期、Checkpoint 机制、模板管理
- [Knowledge Sedimentation Engine](./design/knowledge-sedimentation-engine.md) — KE 与 Node 的强绑定、渐进式沉淀、修订历史
- [Agent Orchestrator](./design/agent-orchestrator.md) — 混合任务调度、LLM 集成、能力边界执行

---

## 数据模型（PostgreSQL Schema 概要）

```sql
-- 项目
CREATE TABLE projects (
  id          UUID PRIMARY KEY,
  name        TEXT NOT NULL,
  config      JSONB,  -- Adapter 配置、模板偏好等
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Scaffold Graph 节点
CREATE TABLE nodes (
  id          UUID PRIMARY KEY,
  project_id  UUID REFERENCES projects(id),
  type        TEXT NOT NULL,       -- 'milestone' | 'task' | 'decision' | 'review' | 'custom'
  status      TEXT NOT NULL,       -- 'planned' | 'active' | 'blocked' | 'completed' | 'abandoned'
  title       TEXT NOT NULL,
  description TEXT,
  owner       TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Scaffold Graph 边
CREATE TABLE edges (
  id        UUID PRIMARY KEY,
  from_id   UUID REFERENCES nodes(id) ON DELETE CASCADE,
  to_id     UUID REFERENCES nodes(id) ON DELETE CASCADE,
  type      TEXT NOT NULL,         -- 'depends_on' | 'blocks' | 'related_to'
  UNIQUE(from_id, to_id, type)
);

-- 事件存储
CREATE TABLE events (
  id              UUID PRIMARY KEY,
  source          TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  type            TEXT NOT NULL,
  actor           TEXT,
  payload         JSONB NOT NULL,
  project_id      UUID REFERENCES projects(id),
  related_node_ids UUID[],
  timestamp       TIMESTAMPTZ NOT NULL,
  ingested_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source, source_event_id)
);

-- 知识条目
CREATE TABLE knowledge_entries (
  id          UUID PRIMARY KEY,
  node_id     UUID REFERENCES nodes(id),
  project_id  UUID REFERENCES projects(id),
  type        TEXT NOT NULL,       -- 'decision' | 'context' | 'blocker' | 'lesson' | 'handoff' | 'ai-session-context'
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  sources     JSONB NOT NULL,      -- [{eventId, excerpt}]
  created_by  TEXT NOT NULL,       -- 'agent' | 'user'
  confidence  REAL,
  status      TEXT NOT NULL,       -- 'draft' | 'confirmed' | 'superseded'
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 知识条目修订历史（渐进式沉淀）
CREATE TABLE knowledge_revisions (
  id          UUID PRIMARY KEY,
  entry_id    UUID REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  diff_reason TEXT,                -- 本次修订的原因
  sources     JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Agent 任务
CREATE TABLE agent_tasks (
  id          UUID PRIMARY KEY,
  project_id  UUID REFERENCES projects(id),
  trigger     TEXT NOT NULL,       -- 'event' | 'scheduled'
  type        TEXT NOT NULL,       -- 'analyze' | 'summarize' | 'detect_stale' | 'notify' | ...
  status      TEXT NOT NULL,       -- 'queued' | 'running' | 'completed' | 'failed'
  input       JSONB,
  output      JSONB,
  error       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
```

---

## 关键数据流

### 流程一：PR 合并 → 知识沉淀

```
1. GitHub Webhook 推送 PR merged 事件
2. GitHub Adapter 归一化为 NormalizedEvent
3. Event Pipeline:
   - Deduplicate: 检查 source_event_id
   - Enrich: 根据 PR title/branch 名匹配关联 Graph 节点
   - Route: 分发到 Knowledge Sedimentation Engine
   - Persist: 写入 Event Store
4. Agent Orchestrator 创建 Task:
   - 读取 PR diff、review comments、关联 issue
   - LLM 分析：提取决策原因、被否决的替代方案、遗留风险
   - 生成 draft KnowledgeEntry，关联到 Graph 节点
5. 用户在 Dashboard 看到 draft KE，确认或编辑
```

### 流程二：定时检测停滞节点

```
1. Scheduler 触发 detect_stale 任务（每日）
2. Agent 查询所有 status='active' 且超过 N 天无关联事件的节点
3. 对每个停滞节点:
   - 查看最近的关联事件和 KE，分析可能的阻塞原因
   - 生成 blocker 类型的 draft KE
   - 推送通知到节点 owner（通过 Adapter notify）
4. 节点状态标记建议（不自动变更，由用户决定）
```

### 流程三：Claude Code Session → 知识沉淀

```
1. 开发者在项目目录下使用 Claude Code，session 结束时 Stop hook 自动触发
2. zet-plane-cli 执行:
   - 读取 Claude Code session 摘要（对话 + tool calls 概要）
   - 隐私过滤：剔除配置中标记的敏感文件内容
   - 压缩为 NormalizedEvent { source: 'claude-code', type: 'ai-session' }
   - 离线缓冲检查：若服务器不可达，写入本地队列，下次自动补传
   - POST /api/ingest（Bearer token 鉴权）
3. Event Pipeline 处理:
   - Deduplicate: 基于 session ID 去重
   - Enrich: 从 session 内容中提取提及的文件/模块，关联 Graph 节点
   - Route: 分发到 Knowledge Sedimentation Engine
4. Agent 分析 session，提取:
   - 开发者遇到的决策点（为什么选 A 不选 B）
   - 遇到的阻塞（卡在哪里、如何解决）
   - 被否决的方案（AI 提议但被拒绝的设计）
   - 生成 'ai-session-context' 类型 draft KE，关联到 Graph 节点
5. 用户确认 KE，沉淀为可被后来者独立理解的记录
```

### 流程四：新成员 Onboarding

```
1. 新成员打开 Dashboard，选择项目
2. 看到 Scaffold Graph 全局视图（节点 + 依赖 + 状态）
3. 点击任意节点，查看:
   - 节点描述和当前状态
   - 关联的 KnowledgeEntries（按时间排序）
   - 每个 KE 的 sources（可追溯到原始事件）
4. 通过 Timeline 视图查看项目整体演变
5. 无需询问老成员即可理解「为什么这样设计」
```

---

## 项目结构（Monorepo）

```
zet-plane/
├── apps/
│   ├── server/                    # NestJS 主服务
│   │   ├── src/
│   │   │   ├── adapters/          # Adapter 模块
│   │   │   │   ├── github/
│   │   │   │   ├── feishu/
│   │   │   │   ├── qq/
│   │   │   │   ├── monitor/
│   │   │   │   ├── manual/
│   │   │   │   ├── claude-code/   # Local Adapter（接收 client push）
│   │   │   │   └── codex/         # Local Adapter（接收 client push）
│   │   │   ├── pipeline/          # Event Pipeline
│   │   │   ├── graph/             # Scaffold Graph Engine
│   │   │   ├── knowledge/         # Knowledge Sedimentation Engine
│   │   │   ├── agent/             # Agent Orchestrator
│   │   │   ├── api/               # REST + WebSocket controllers
│   │   │   └── common/            # 共享类型、工具
│   │   └── prisma/                # Prisma schema & migrations
│   └── web/                       # 前端 Dashboard
├── packages/
│   ├── shared/                    # 前后端共享类型定义
│   └── cli/                       # zet-plane-cli（本地 SDK，发布为 npm 包）
│       ├── src/
│       │   ├── session/           # 读取 Claude Code / Codex session 摘要
│       │   ├── filter/            # 隐私过滤（排除敏感文件路径等）
│       │   ├── uploader/          # HTTP Push + 离线缓冲
│       │   └── index.ts           # CLI 入口：zet-plane upload-session
├── docs/
│   ├── specs.md
│   └── architecture.md
└── package.json                   # Monorepo root (pnpm workspace)
```

---

## 非功能性考量

### 规模估算

目标用户为社团/小型团队（5-30 人），单项目事件量约：
- 日均事件：~100-500 条（commits, messages, PR activities）
- Graph 节点：~50-500 per project
- 知识条目：~10-100 per project per month

此规模下 **单实例 PostgreSQL + 单 Node.js 进程** 完全足够，无需分布式架构。

### 可用性

- 系统宕机不阻塞开发（原则二：引导而非约束）。团队可以在系统离线时正常使用 GitHub/飞书，系统恢复后通过 poll 补充遗漏事件。
- 数据持久性依赖 PostgreSQL 常规备份策略。

### 安全

- Adapter 凭证（GitHub Token, Feishu App Secret 等）加密存储，不进入日志。
- LLM 调用时脱敏：代码内容可传递给 LLM 分析，但需在项目配置中明确授权。
- API 访问通过 JWT 鉴权，成员权限与项目绑定。

---

## Trade-off 分析

| 决策 | 选择 | 替代方案 | 取舍 |
|---|---|---|---|
| Graph 存 PostgreSQL | 邻接表 + CTE | Neo4j / 图数据库 | 牺牲复杂图查询性能（社团规模不需要），换取运维简单和技术栈统一 |
| NestJS | 模块化 DI 框架 | Express + 手动分层 | 增加框架学习成本，换取 Adapter 插拔的结构化支持 |
| BullMQ | 轻量任务队列 | RabbitMQ / Kafka | 牺牲消息持久性保证，换取部署简单（仅需 Redis） |
| draft → confirmed | 人工确认 Agent 产出 | 全自动入库 | 牺牲自动化程度，换取知识库质量可控 |
| Monorepo | 前后端统一管理 | 多仓库 | 增加构建复杂度，换取类型共享和版本一致性 |
| Event 全量存储 | 所有事件持久化到 Event Store | 只存分析结果 | 增加存储量，换取完整溯源能力和后续重新分析的可能 |

---

## 未来演进方向

以下不在 v1 范围内，但架构设计时已预留扩展点：

1. **多项目支持**：`projects` 表已就位，所有实体通过 `project_id` 隔离
2. **Adapter Marketplace**：Adapter 接口标准化后可支持社区贡献的第三方 Adapter
3. **知识搜索**：引入向量数据库（pgvector）支持语义搜索
4. **Graph Template 共享**：跨项目复用 Scaffold Graph 模板
5. **权限细粒度化**：节点级别的可见性控制
