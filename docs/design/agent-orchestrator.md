# Agent Orchestrator — 设计文档

## 职责

系统中唯一主动调用 LLM 的组件。编排事件驱动和定时两种任务，读取 Graph/Knowledge 上下文，把分析结果写回这两个引擎。是平面「无感整理」能力的执行层。

---

## 内部模块

```
EventRouter            — 从 Pipeline Route 阶段接收事件，映射为 Task 类型，投入队列
TaskScheduler          — Cron 注册表，触发定时任务
TaskQueue              — BullMQ 队列，管理优先级、重试、延迟
TaskExecutor           — Worker 进程，按 Task 类型分发到 Handler
  ├── AnalyzeHandler          — 事件分析 → 读 Graph 上下文 → LLM → 写 draft KE
  ├── CheckpointSummaryHandler— Checkpoint 完成 → 汇总前置节点 KE → LLM → 写 checkpoint-summary KE
  ├── SummarizeHandler        — 周期摘要 → 读 KE + Graph → LLM → Adapter.notify
  ├── DetectStaleHandler      — 扫描 active 节点 → 判断停滞 → 写 blocker KE + 建议通知
  └── NotifyHandler           — 纯转发：调用目标 Adapter 的 notify 方法
LLMClient              — 封装 Anthropic/OpenAI SDK，统一 prompt 入口和 token 计量
```

---

## 混合触发模式

| 触发方式 | Handler | 示例 |
|---|---|---|
| 事件驱动 | AnalyzeHandler | PR 合并 → 提取决策上下文 → draft KE |
| 事件驱动 | CheckpointSummaryHandler | Checkpoint 节点完成 → 汇总该阶段所有 KE → checkpoint-summary KE |
| 事件驱动 | NotifyHandler | 节点状态变更 → 通知 owner |
| 定时（30 min）| EventRouter | poll 各 Adapter 补充遗漏事件 |
| 定时（每日）| DetectStaleHandler | 扫描 active 超 N 天未更新节点 |
| 定时（每周）| SummarizeHandler | 项目进展摘要推送飞书/QQ |

---

## Task 生命周期

```
queued ──▶ running ──▶ completed
              │
              └──▶ failed（写入 error，BullMQ 按配置重试）
```

所有 Task 持久化到 `agent_tasks` 表，保留 `input` / `output` / `error`，可用于审计和调试。

---

## AnalyzeHandler 执行流程

```
1. 从 TaskQueue 取出 Task（含 eventId）
2. 读取原始事件（Event Store）
3. 读取关联节点的 Graph 上下文（Scaffold Graph Engine）
4. 读取该节点已有的 KE 列表（Knowledge Sedimentation Engine）
5. 构建 LLM prompt：事件内容 + Graph 上下文 + 已有 KE + 输出标准
6. 调用 LLMClient
7. 解析输出：新建 draft KE 或追加 Revision 到已有 KE
8. 写入 Knowledge Sedimentation Engine
```

---

## 能力边界执行（对应 specs 原则一）

TaskExecutor 内部硬编码写入白名单，只允许：

- 写入 `knowledge_entries` / `knowledge_revisions`（通过 Knowledge Engine）
- 写入 `agent_tasks`（任务状态更新）
- 调用 `Adapter.notify`（推送通知到端侧）
- 向 Scaffold Graph Engine 写入带 `suggested: true` 的状态变更建议

**不存在**写入 GitHub / 飞书项目内容的调用路径。边界在编译时成立，不依赖运行时检查。

---

## LLMClient

统一封装 Anthropic SDK 和 OpenAI SDK，对上层 Handler 屏蔽具体 provider：

```
LLMClient
  ├── complete(prompt, options) — 单次调用
  ├── stream(prompt, options)   — 流式调用（用于长摘要生成）
  └── usage: TokenUsage         — 每次调用后记录 token 消耗，写入 agent_tasks.output
```

provider 通过项目配置选择，默认 Anthropic。
