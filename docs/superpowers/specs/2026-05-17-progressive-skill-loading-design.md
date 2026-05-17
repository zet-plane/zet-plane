# Skill 渐进式加载设计

**日期：** 2026-05-17  
**状态：** 已确认

## 问题

当前 `SkillRegistry` 在模块初始化时（`onModuleInit`）把所有 skill 的完整正文读入内存，拼成一个大 system prompt 传给 agent。这带来三个问题：

1. **不可热更新**：修改 skill 文件必须重启服务才能生效
2. **agent 无自主权**：框架根据 task type 决定注入哪些 skill，agent 被动接受，无法组合或选择
3. **内容冗余**：所有 skill 内容无论是否用到都进入上下文，增加噪声

正确的模式（参考 Claude Code superpowers 体系）：定义一个元工具，agent 在执行过程中主动调用，按需加载 skill 内容，注入到自身上下文后继续推理。

## 设计

### 架构总览

```
启动时：SkillRegistry 只读 frontmatter → 轻量清单
                                              ↓
任务执行：ContextBuilderService 把清单填入 ctx.availableSkills
                                              ↓
         PromptBuilderService 在 userMessage 里渲染 skills 区域
                                              ↓
Agent 运行：调用 use_skill(name) → SkillRegistry.readSkillBody(name)
                                → 从磁盘读取正文 → 注入上下文
                                → agent 基于内容继续推理
```

### 两层分离

| 层 | 内容 | 加载时机 | 用途 |
|---|---|---|---|
| frontmatter | name / description / applicable_tasks | 启动时一次 | 生成清单，让 agent 知道有什么 |
| body | 完整操作指南 | agent 调用 `use_skill` 时 | 按需注入，指导实质动作 |

### Skill 文件约束

每个 skill 正文（body）**不超过 500 tokens**。这是写作规范，不做硬截断。如果 skill 内容确实需要更长，按 `##` 标题分 section，在设计上预留分段加载的扩展点（见「未来扩展」）。

---

## 组件变更

### 1. `SkillRegistry`

**去掉：**
- `onModuleInit` 全量加载逻辑
- 内存中缓存 skill 正文

**新增两个方法：**

```ts
// 启动时调用，只读 frontmatter，缓存清单
async loadManifest(): Promise<void>

// 返回 frontmatter 解析结果列表
listSkills(): SkillManifestEntry[]

// 按需读取 skill 正文（每次从磁盘读）
async readSkillBody(name: string): Promise<string | null>
```

```ts
type SkillManifestEntry = {
  name: string
  description: string
  applicableTasks: OrchestratorTaskType[]
}
```

`readSkillBody` 每次调用都从磁盘读文件（不缓存），保证 skill 修改后立即生效，无需重启。

`_base` skill（`base: true`）不进入 `listSkills()` 返回值，其正文继续直接写入 system prompt（全局通用，体积小，无需按需加载）。

### 2. `ContextBuilderService`

在 `OrchestratorContext` 中新增字段：

```ts
type OrchestratorContext = {
  // ...现有字段不变...
  availableSkills: SkillManifestEntry[]
}
```

`build(task)` 时调用 `skillRegistry.listSkills()`，填入 `ctx.availableSkills`。

### 3. `PromptBuilderService`

`buildUserMessage` 新增 skills 区域，与其他结构化上下文平级：

```ts
`Available skills: ${JSON.stringify(ctx.availableSkills)}`,
'',
'Call use_skill first to load your operating instructions, then act.',
```

`getSystemPrompt` 不再拼 skill 正文，只保留 `_base` 内容。

### 4. `use_skill` 工具

新增工具，加入 `TaskRunnerService.buildTools()` 的工具列表：

```ts
use_skill({ name: string })
```

- 调用 `skillRegistry.readSkillBody(name)`
- 成功：返回 skill 正文（markdown），agent 读取后继续
- 找不到：返回 `"Skill '{name}' not found. Available: [name1, name2, ...]"`
- 不抛出异常，让 agent 自行处理

工具描述（schema description）：

> 加载指定 skill 的操作指南。在执行任何实质动作之前调用，获取当前任务的行动规范。可多次调用以组合多个 skill。

---

## 执行流程（以 checkpoint 任务为例）

```
1. ContextBuilderService 填入 availableSkills 清单
2. PromptBuilderService 构建 userMessage，含 skills 区域
3. Agent 收到任务上下文，看到清单中有 checkpoint-analysis
4. Agent 调用 use_skill("checkpoint-analysis")
5. SkillRegistry 从磁盘读取 index.md 正文，返回给 agent
6. Agent 读取注入内容，按指南执行：get_node → get_subgraph → ... → conclude
```

---

## 不变的部分

- Skill 文件结构（`index.md` + frontmatter）完全不变
- 文件目录结构 `skills/orchestrator/{name}/index.md` 不变
- `_base` skill 的处理方式不变（直接写入 system prompt）
- 所有其他工具不变
- `buildUserMessage` 的其余字段不变

---

## 不变量

- agent 必须在执行实质动作前调用 `use_skill`（由 system prompt 指令保证，不在代码层强制）
- `readSkillBody` 永远从磁盘读，不缓存正文——保证热更新
- skill 正文 ≤ 500 tokens——写作规范，由 skill 作者保证

---

## 未来扩展

当某个 skill 需要超过 500 tokens 时，引入分段加载：

```ts
use_skill({ name: string, section?: string })
// section 为空：返回 skill 的 section 标题列表
// section 有值：返回对应 ## 标题下的内容
```

此时 agent 先拿到目录，再按需展开具体章节。当前设计不实现，接口预留。

---

## 不做的事

- 多级 skill 嵌套调用链路追踪（可观测性，延后）
- Skill 热监听（fs.watch），只需重启即可更新，代价可接受
- `list_skills` 独立工具（清单已在 `availableSkills` 上下文里，不需要额外工具）
