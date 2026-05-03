# Knowledge Sedimentation Engine — 设计文档

## 职责

KnowledgeEntry 的领域服务。管理知识条目的生命周期、渐进式修订历史，以及与 Graph 节点和事件的关联关系。不调用 LLM，不主动发起操作。

---

## 内部模块

```
KnowledgeService — KE 的 CRUD，draft / confirmed / superseded 状态流转
RevisionService  — 渐进式修订历史，每次内容更新追加 Revision 记录
LinkingService   — KE ↔ Node、KE ↔ Event 的关联关系维护
```

---

## KnowledgeEntry 结构

```
KnowledgeEntry
  ├── id
  ├── nodeId              — 【必填】锚定到的 Graph 节点，不允许为空
  ├── type                — 'decision' | 'context' | 'blocker' | 'lesson'
  │                          | 'handoff' | 'ai-session-context' | 'checkpoint-summary'
  ├── title
  ├── content             — 人类可读的自然语言，能被无上下文的后来者独立理解
  ├── sources: EventRef[] — [{eventId, excerpt}]，溯源到原始事件
  ├── createdBy           — 'agent' | 'user'
  ├── confidence          — Agent 生成时附带（0–1），用于 Dashboard 排序
  ├── status              — 'draft' | 'confirmed' | 'superseded'
  └── revisions[]         — 渐进式修订历史（见下）
```

**`nodeId` 强制约束**：KE 必须锚定到一个 Graph 节点，不存在游离的知识条目。知识的导航结构由 Graph 提供——后来者通过节点找到上下文，不在平铺列表中搜索。如果一条知识找不到合适的节点，应先在 Graph 中补充节点，再关联 KE。

---

## 状态流转

```
Agent 生成  ──▶ draft ──▶ confirmed（用户确认或编辑后保存）
                  │
                  └──▶ superseded（被同节点新 KE 取代，保留历史）

用户直接创建 ──▶ confirmed
```

Agent 生成的 KE 默认为 `draft`，不污染知识库，由用户在 Dashboard 审阅确认（对应 specs 原则三：沉淀面向人）。

---

## 渐进式修订

每次 `KnowledgeService` 更新 KE 内容时，`RevisionService` 追加一条 `KnowledgeRevision`：

```
KnowledgeRevision
  ├── id
  ├── entryId
  ├── content     — 本次版本的完整内容快照
  ├── diffReason  — 本次修订原因（新事件触发 / 用户手动编辑 / Agent 补充）
  ├── sources     — 触发本次修订的事件引用
  └── createdAt
```

修订历史只追加，不删除，保留完整演变轨迹。

---

## 知识条目类型说明

| type | 含义 | 典型来源 |
|---|---|---|
| `decision` | 技术/产品决策及其原因 | PR review、飞书讨论 |
| `context` | 背景信息、外部约束 | Issue 描述、人工输入 |
| `blocker` | 阻塞原因及解决过程 | 停滞节点检测、commit message |
| `lesson` | 踩坑记录，供后来者规避 | 事后总结、人工输入 |
| `handoff` | 交接说明，面向接替者 | 成员离开时触发 |
| `ai-session-context` | AI 辅助开发过程中的决策讨论 | Claude Code / Codex session |
| `checkpoint-summary` | Checkpoint 完成时的阶段性汇总 | Checkpoint 节点完成事件（Agent 自动生成） |

---

## `content` 质量标准

写入 `content` 字段时（无论 Agent 还是用户），应能回答：

> 一个对这个项目没有任何了解的新成员，读完这条记录，能否独立复现当时的判断？

Agent 生成时 prompt 中强制包含此标准作为输出约束。
