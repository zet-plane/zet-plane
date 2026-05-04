# Zet Plane — 高层架构设计

---

## 架构总览

```
═══════════════════════════════════════════════════════════════════════════
                        DATA SOURCES (事件来源)
═══════════════════════════════════════════════════════════════════════════

  ┌─── Remote (Server-Side) ───┐       ┌─── Local (Client-Side) ───┐
  │                            │       │                           │
  │  GitHub · Feishu · QQ      │       │  Claude Code (Hook)       │
  │  Grafana · Aliyun · ...    │       │  Codex (Plugin)           │
  │                            │       │                           │
  └─────────────┬──────────────┘       └─────────────┬─────────────┘
                │                                    │
                │ Webhook / Poll                     │ Hook Trigger
                ▼                                    ▼
  ┌──────────────────────────┐       ┌──────────────────────────────┐
  │     Remote Adapters      │       │       zet-plane-cli          │
  │                          │       │       (本地 SDK)              │
  │  GitHub │ Feishu │ QQ    │       │  摘要提取 · 隐私过滤            │
  │  Monitor │ Manual        │       │  离线缓冲 · HTTP Push         │
  └─────────────┬────────────┘       └──────────────┬───────────────┘
                │                                    │
                └──────────┐    ┌────────────────────┘
                           ▼    ▼
═══════════════════════════════════════════════════════════════════════════
                    EVENT PIPELINE (事件管道)
═══════════════════════════════════════════════════════════════════════════

                    Normalized Event
                            │
                            ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Ingest ──▶ Deduplicate ──▶ Enrich ──▶ Route ──▶ Persist (PG)  │
  └─────────────────────────────────────────┬───────────────────────┘
                                            │
                          ┌─────────────────┼─────────────────┐
                          ▼                                   ▼
                ┌──────────────────┐              ┌──────────────────┐
                │  确定性状态变更     │             │   需 LLM 分析      │
                │  (直接写 Domain)   │             │   (派发 Task)     │
                └────────┬─────────┘              └────────┬─────────┘
                         │                                 │
                         │                                 ▼
═════════════════════════╪═════════════════════════════════════════════════
                    AGENT ORCHESTRATOR (唯一主动智能层)
═════════════════════════╪═════════════════════════════════════════════════
                         │
                         │         事件路由 ──▶ 任务队列
                         │         定时调度 ──▶ 任务执行
                         │                              │
                         │                    ┌─────────┴─────────┐
                         │                    ▼                   ▼
                         │              LLM 调用          Adapter 通知
                         │                    │            (回推通知)
                         │                    │                   │
                         ▼                    ▼                   │
═══════════════════════════════════════════════════════════════════╪═══════
                DOMAIN SERVICES (被动领域服务)                               │
═══════════════════════════════════════════════════════════════════╪═══════
                                                                  │
  ┌─────────────────────────┐      ┌─────────────────────────┐   │
  │  Scaffold Graph Engine  │◀────▶│  Knowledge Sedimentation │   │
  │                         │      │  Engine                  │   │
  │  项目脚手架与流程图谱      │      │  知识沉淀与修订管理        │   │
  │                         │      │                          │   │
  └────────────┬────────────┘      └────────────┬─────────────┘   │
               │                                │                 │
               └────────────────┬───────────────┘                 │
                                ▼                                  │
═══════════════════════════════════════════════════════════════════╪═══════
                STORAGE LAYER (PostgreSQL)                         │
══════════════════════════════════════════════════════════════════════════

  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
  │ Event Store│ │ Graph Store│ │  KE Store  │ │ Task Store │
  └────────────┘ └────────────┘ └────────────┘ └────────────┘
                                ▲
                                │
══════════════════════════════════════════════════════════════════════════
                    API & PRESENTATION (对外接口)
══════════════════════════════════════════════════════════════════════════

  REST API (CRUD / Query)          WebSocket (Real-time Push)
       │                                  │
       └──────────────┬───────────────────┘
                      ▼
  ┌────────────────────────────────────────────────────────────────┐
  │                     Web Dashboard                              │
  │  Graph Viewer · Knowledge Browser · Timeline · Settings        │
  └────────────────────────────────────────────────────────────────┘
```

**数据流简图（自顶向下）：**

```
  Remote Sources ──┐                ┌── Local Agents
                   ▼                ▼
              [ Adapter Layer ]
                      │
                      ▼  Normalized Event
              [ Event Pipeline ]
                   /        \
                  ▼          ▼
        [Direct CRUD]   [Agent Orchestrator]
                  \          /
                   ▼        ▼
             [ Domain Services ]
                      │
                      ▼
             [ PostgreSQL ]
                      │
                      ▼
             [ REST / WS API ]
                      │
                      ▼
             [ Web Dashboard ]
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
| 项目结构 | Turborepo + pnpm | 前后端分离、灵活扩展 |

---

## 核心模块设计

### 1. Adapter Layer（适配器层）

**职责**：将异构的外部端侧事件归一化为系统内部统一事件格式，同时提供向外推送通知的能力。

**设计原则**：对应 specs 原则四「适配而非依赖端侧」——任何 Adapter 的增删不影响核心逻辑。

[Adapter 设计文档](./design/adapter.md)

---

### 2. Event Pipeline（事件管线）

**职责**：统一处理所有进入系统的事件，保证有序、去重、可追溯。

[Event-Pipeline 设计文档](./design/event-pipeline.md)

---

### 3. Domain Services（领域服务层）

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

**核心约束**：知识条目必须锚定到 Graph 节点，不存在游离于 Graph 之外的知识——Graph 提供导航结构，Knowledge Engine 提供内容沉淀。

详细设计见各自文档：

- [Scaffold Graph Engine](./design/scaffold-graph-engine.md)
- [Knowledge Sedimentation Engine](./design/knowledge-sedimentation-engine.md)
- [Agent Orchestrator](./design/agent-orchestrator.md)

---

## 数据模型

存储层分为四个逻辑区域：Event Store（事件溯源）、Graph Store（脚手架图谱）、KE Store（知识条目）、Task Store（Agent 任务），均基于 PostgreSQL。

[数据模型详细设计](./design/model.md)

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