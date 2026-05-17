# Agent Orchestrator 人工评估协议

**日期**: 2026-05-14  
**更新**: 2026-05-15（对齐 feat/agent-orchestrator 当前实现）  
**适用版本**: feat/agent-orchestrator  
**评估形式**: 方案 A — 独立场景 Playbook  
**场景数**: 10

---

## 协议说明

### 格式约定

每个场景卡包含：

- **目标**：本场景验证的核心假设
- **前置数据（Setup）**：运行前需要在数据库中准备的状态
- **触发输入（Trigger）**：向 orchestrator 发送的任务
- **执行步骤**：评估员操作顺序
- **观察点**：需要检查的输出字段或日志
- **通过标准（Pass Criteria）**：明确的 Pass / Fail 判断规则
- **记录表**：每次评估填写的结果字段

### Step 0：创建项目（每个场景必须先执行）

每个场景都在一个独立的项目中运行，避免场景间数据干扰。`POST /projects` 会原子创建：project 实体 + root 节点（`isProjectRoot=true`）+ staging 节点（`isStagingRoot=true`）。

```ts
// 1. 创建项目（同时初始化 root 节点和 staging 节点）
const projectRes = await app.inject({
  method: 'POST',
  url: '/projects',
  payload: { name: `eval-s<N>-${Date.now()}` },
})
// 期望: projectRes.statusCode === 201
// 返回: { id: projectId, name, createdAt, updatedAt }

const projectId = projectRes.json().id

// 2. 查询系统节点（root / staging 不在 GET /nodes 列表中，需直接查 Prisma）
const rootNode = await prisma.node.findFirst({ where: { projectId, isProjectRoot: true } })
const stagingNode = await prisma.node.findFirst({ where: { projectId, isStagingRoot: true } })

const rootNodeId = rootNode.id
const stagingNodeId = stagingNode.id
```

### 通用执行方式

```ts
// publisher.publish() 必须包含 sourceId，用于幂等键生成: sha256(sourceType:sourceId:taskType)
// 同一 sourceId+taskType 组合只会创建一个任务（重复 publish 返回 created: false）
const result = await publisher.publish({
  projectId,
  type,                            // OrchestratorTaskType
  sourceType,                      // OrchestratorSourceType
  sourceId: `manual-${Date.now()}`, // 每次测试使用唯一值，避免幂等去重
  input,
})
await runtime.execute(result.taskId)
const task = await prisma.orchestratorTask.findUnique({ where: { id: result.taskId } })
```

`task.modelResult` 是 `AgentInsight` JSON：
```ts
interface AgentInsight {
  summary: string
  signalType: 'progress' | 'blocker' | 'decision' | 'risk' | 'learning' | 'noise'
  confidence: number  // 0–1
  evidence: Array<{ sourceType: 'node'|'knowledge_entry'|'task'; sourceId: string; note: string }>
}
```

### 场景依赖顺序（建议执行顺序）

```
S-8（Tool 调用基线）→ S-10（skip 判断）→ S-1（growth node）→ S-5（staging 流程）
→ S-2（node 驱动）→ S-7（知识精度）→ S-3（知识驱动成环 + checkpoint 提升）
→ S-6（checkpoint 决策包 + 人工通知）→ S-4（知识触发阶段转换）→ S-9（skills 效率）
```

---

## S-1: Growth Node 自主延伸

**目标**: 给定一个 scaffold 节点，agent 能在该节点下自主创建子 growth 节点并建立正确边关系。

### Setup

```ts
// Step 0: 执行通用 Step 0，获取 projectId / rootNodeId

// 创建 N1
const n1Res = await app.inject({
  method: 'POST',
  url: `/projects/${projectId}/nodes`,
  payload: {
    title: '支付网关集成',
    description: '负责第三方支付接入，包含签名验证、回调处理、对账三个核心模块',
    type: 'scaffold',
  },
})
const N1 = n1Res.json()
```

### Trigger

```ts
await publisher.publish({
  projectId,
  type: 'event_anchor',
  sourceType: 'manual',
  sourceId: `manual-s1-${Date.now()}`,
  input: {
    text: '和技术负责人确认了支付网关集成的拆解方案：需要实现三个独立子模块——签名验证服务、回调幂等处理器、对账任务调度器。每个子模块需要独立开发和测试，最终组合到网关集成节点下。',
  },
})
```

### 执行步骤

1. 初始化项目 + 创建 N1
2. 发布任务，调用 `runtime.execute()`
3. 查询所有节点和边

### 观察点

| 字段 | 查询方式 |
|------|---------|
| 新建节点列表 | `prisma.node.findMany({ where: { projectId } })` |
| 新建边列表 | `prisma.edge.findMany({ where: { projectId } })` |
| modelResult.signalType | `task.modelResult` |
| agent tool call 序列 | console 日志（LangGraph trace） |

### 通过标准

| 条件 | 判断 |
|------|------|
| ≥1 个新节点被创建，type=growth | ✅ Pass / ❌ Fail |
| 新节点通过 composition 边连接到 N1 | ✅ Pass / ❌ Fail |
| 未出现游离节点（无父边的新节点） | ✅ Pass / ❌ Fail |
| signalType 为 progress 或 decision | ✅ Pass / ❌ Fail |

### 记录表

```
执行时间:
LLM 提供商:
新建节点数:
新建边数:
edge.type 分布:
signalType:
confidence:
迭代轮次 (recursionLimit 内实际轮次):
备注 / 异常:
```

---

## S-2: Node 驱动合理性

**目标**: 不同性质的输入（决策 / 新功能 / bug 修复）下，agent 的行为区分是否合理。

### Setup

```ts
// Step 0: 执行通用 Step 0，获取 projectId

// 创建 N1、N2
const N1 = (await app.inject({ method: 'POST', url: `/projects/${projectId}/nodes`,
  payload: { title: 'Redis 缓存层', type: 'scaffold' } })).json()

const N2 = (await app.inject({ method: 'POST', url: `/projects/${projectId}/nodes`,
  payload: { title: '用户服务', type: 'scaffold' } })).json()
```

### Trigger

依次独立执行三个任务（每个任务单独 publish + execute）：

**输入 A（决策类）**:
```ts
input: { text: '架构评审结论：缓存层统一选用 Redis，不考虑 Memcached。原因是 Redis 支持更丰富的数据结构，且团队已有运维经验。' }
```

**输入 B（新功能类）**:
```ts
input: { text: '需要新增完整的用户权限管理模块，包含 RBAC 角色分配、权限继承树、操作审计日志三个子系统，预计独立开发周期 3 周。' }
```

**输入 C（Bug 修复类）**:
```ts
input: { text: '修复了 Redis TTL 设置过短（5分钟）导致延迟支付回调被误判为重复请求的 bug。已将 TTL 调整为 30 分钟并上线。' }
```

每个任务的 sourceId 须不同（如 `manual-s2a-${Date.now()}`、`manual-s2b-...`、`manual-s2c-...`）。

### 执行步骤

1. 分别执行 A、B、C 三个任务
2. 记录每次执行后新增的节点数、知识条目数、signalType

### 通过标准

| 输入 | 期望行为 | 判断 |
|------|---------|------|
| A（决策） | 不创建新节点，创建 decision 类知识条目锚定到 N1 | ✅ / ❌ |
| B（新功能） | 创建 ≥1 个新 growth 节点 | ✅ / ❌ |
| C（bug 修复） | 不创建新节点，创建 pitfall 或 finding 类知识条目 | ✅ / ❌ |

> 核心：B 要建节点，A 和 C 不该建节点。知识条目 category 只有 `decision | pitfall | finding | context`，没有 `risk`。

### 记录表

```
输入 A: 新节点数=_, 知识条目数=_, signalType=_, 行为合理=Y/N
输入 B: 新节点数=_, 知识条目数=_, signalType=_, 行为合理=Y/N
输入 C: 新节点数=_, 知识条目数=_, signalType=_, 行为合理=Y/N
整体评价:
```

---

## S-3: 知识驱动成环 + Checkpoint 提升

**目标**: 当知识输入驱动 agent 更新图结构并形成依赖环时，graph engine 能检测到 cycle，并自动提升 checkpoint / 派生 checkpoint 任务。

### Setup

```ts
// Step 0: 执行通用 Step 0，获取 projectId

const NA = (await app.inject({ method: 'POST', url: `/projects/${projectId}/nodes`,
  payload: { title: '认证模块', type: 'scaffold' } })).json()

const NB = (await app.inject({ method: 'POST', url: `/projects/${projectId}/nodes`,
  payload: { title: 'Token 服务', type: 'growth' } })).json()

const NC = (await app.inject({ method: 'POST', url: `/projects/${projectId}/nodes`,
  payload: { title: '会话管理', type: 'growth' } })).json()

// 先建立线性 dependency 链: NA → NB → NC
await app.inject({ method: 'POST', url: `/projects/${projectId}/edges`,
  payload: { fromId: NA.id, toId: NB.id, type: 'dependency', createdBy: 'human' } })

await app.inject({ method: 'POST', url: `/projects/${projectId}/edges`,
  payload: { fromId: NB.id, toId: NC.id, type: 'dependency', createdBy: 'human' } })
```

### Trigger

```ts
await publisher.publish({
  projectId,
  type: 'event_anchor',
  sourceType: 'manual',
  sourceId: `manual-s3-${Date.now()}`,
  input: {
    text: [
      `新增架构约束：会话管理（节点 ID: ${NC.id}）现在必须直接依赖认证模块（节点 ID: ${NA.id}）暴露的统一鉴权接口。`,
      '这是已经确认的结构调整，不是候选方案，也不是讨论稿。',
      '请直接把这条依赖关系更新到项目图中，并保留必要的结构化结论。',
    ].join('\n'),
  },
})
```

### 执行步骤

1. 创建线性 dependency 链 NA → NB → NC
2. 发布 `event_anchor` 任务并执行
3. 查询是否新增了 `NC → NA` 环边
4. 查询是否自动生成 `checkpoint` 类型任务

### 观察点

| 字段 | 期望 |
|------|------|
| event_anchor task.status | succeeded |
| 新增环边 | `NC → NA` 被创建 |
| checkpoint task | 自动派生，`type=checkpoint` 且 `sourceType=graph_event` |
| checkpoint 节点 | `isCheckpoint=true` |

### 通过标准

| 条件 | 判断 |
|------|------|
| event_anchor task.status = succeeded | ✅ / ❌ |
| `NC → NA` 环边已写入图 | ✅ / ❌ |
| 自动生成新的 checkpoint task | ✅ / ❌ |
| checkpoint task 的 sourceId 对应 cycle 中某个节点，且该节点 `isCheckpoint=true` | ✅ / ❌ |

### 记录表

```
event_anchor task.status:
signalType:
confidence:
新增环边:
checkpointTask.id:
checkpointTask.sourceId:
checkpointNode.isCheckpoint:
备注:
```

---

## S-4: 知识触发阶段转换 + 自主建节点

**目标**: 当输入的知识总结暗示一个阶段完成时，agent 能自主判断并为下一阶段创建新节点。

> **约束说明**: agent 的 `create_node` 工具只能创建 `growth` 类型节点（type 硬编码）。本场景验证 agent 能否识别阶段语义并新建节点，节点类型预期为 `growth`，而非 `scaffold`。若认为下一阶段应由人工建 scaffold 节点，需在记录表中注明。

### Setup

```ts
// Step 0: 执行通用 Step 0，获取 projectId

// 创建节点（模拟第一阶段接近尾声）
const N1 = (await app.inject({ method: 'POST', url: `/projects/${projectId}/nodes`,
  payload: { title: '基础建设阶段', type: 'scaffold' } })).json()

for (const title of ['数据库设计', '认证系统', '核心 API']) {
  const n = (await app.inject({ method: 'POST', url: `/projects/${projectId}/nodes`,
    payload: { title, type: 'growth' } })).json()
  // 设为 completed
  await app.inject({ method: 'PATCH', url: `/nodes/${n.id}`,
    payload: { status: 'completed' } })
}
```

### Trigger

```ts
await publisher.publish({
  projectId,
  type: 'event_anchor',
  sourceType: 'manual',
  sourceId: `manual-s4-${Date.now()}`,
  input: {
    text: '第一阶段核心模块全部完成并稳定上线：数据库设计、认证系统、核心 API 均已通过生产验证。项目正式进入扩展阶段，下一步需要启动数据分析平台和用户运营系统的建设。',
  },
})
```

### 执行步骤

1. 创建节点结构
2. 发布任务并执行
3. 查询执行后的所有节点

### 通过标准

| 条件 | 判断 |
|------|------|
| 有新节点被创建（type=growth） | ✅ / ❌ |
| 新节点的 title 或 description 反映"第二阶段/扩展阶段"语义 | ✅ / ❌ |
| signalType ∈ {decision, learning} | ✅ / ❌ |
| 未误删或修改已有 completed 节点 | ✅ / ❌ |

### 记录表

```
新节点数:
新节点 type (growth/scaffold):
新节点 title:
新节点是否有明确的阶段语义 (Y/N):
signalType:
备注（若 agent 未建节点，分析原因）:
```

---

## S-5: Staging → 真实 Node 切换

**目标**: 对于语义模糊、难以立即归属节点的知识，agent 先进 staging；对明确可归属的知识，直接锚定到正确节点。

> **Staging 说明**: Staging 节点是 `isStagingRoot=true` 的系统节点，随项目创建自动生成。知识条目进入 staging = `entry.nodeId = stagingNode.id`，不存在独立的 `status=staging` 字段。

### Setup

```ts
// Step 0: 执行通用 Step 0，获取 projectId / stagingNodeId

// 创建业务节点
const N1 = (await app.inject({ method: 'POST', url: `/projects/${projectId}/nodes`,
  payload: { title: '支付系统', description: '负责所有支付相关逻辑', type: 'scaffold' } })).json()

const N2 = (await app.inject({ method: 'POST', url: `/projects/${projectId}/nodes`,
  payload: { title: '消息推送', description: '用户通知和推送服务', type: 'scaffold' } })).json()
```

### Trigger

```ts
await publisher.publish({
  projectId,
  type: 'event_anchor',
  sourceType: 'manual',
  sourceId: `manual-s5-${Date.now()}`,
  input: {
    text: [
      '1. 支付系统中发现一个重要 pitfall：第三方支付回调存在重放风险，必须加幂等校验。（这条明确属于支付系统）',
      '2. 团队讨论了一个新想法：是否引入消息队列来解耦通知服务。目前还没有决定，需要进一步调研。（归属不明确）',
      '3. 今天团队建设活动很顺利，大家状态不错。（与项目无关）',
    ].join(' '),
  },
})
```

### 执行步骤

1. 初始化项目，建 N1 + N2（Step 0 已建 rootNode + stagingNode）
2. 发布任务并执行
3. 查询 `knowledgeEntry` 表（按 projectId 过滤）

### 观察点

| 检查项 | 查询 |
|--------|------|
| 知识条目列表 | `prisma.knowledgeEntry.findMany({ where: { projectId } })` |
| 条目的 nodeId 归属 | 对比 stagingNodeId / N1.id / N2.id |
| to_staging tool 是否被调用 | console 日志 |

### 通过标准

| 条件 | 判断 |
|------|------|
| 知识点 1 的 entry.nodeId = N1.id | ✅ / ❌ |
| 知识点 2 进入 staging（entry.nodeId = stagingNodeId） | ✅ / ❌ |
| 知识点 3 未被创建为任何 entry（被 skip 或不沉淀） | ✅ / ❌ |
| 无 entry 被错误归属到无关节点 | ✅ / ❌ |

### 记录表

```
stagingNodeId:
entry 总数:
entry 归属分布 (nodeId → count):
staging entry 数:
知识点1 归属正确 (Y/N):
知识点2 进入 staging (Y/N):
知识点3 未沉淀 (Y/N):
备注:
```

---

## S-6: Checkpoint 决策包 + 人工通知

**目标**: 当 graph engine 已因成环提升 checkpoint 后，checkpoint task 能整理决策包、生成知识条目，并通过 `notify_human` 进入人工确认流。

> **设计口径**: cycle 的判定与 checkpoint 提升由 graph engine 负责；agent 不在建边前预判是否成环。`notify_human` 是 checkpoint task 的职责，而不是 `event_anchor` 的前置守门。

### Setup

```ts
// Step 0: 执行通用 Step 0，获取 projectId
// 先按 S-3 的 setup + trigger 执行到“自动生成 checkpoint task”为止
// 记录自动派生出的 checkpointTask.id 和 checkpointNodeId
```

### Trigger

```ts
await runtime.execute(checkpointTask.id)
```

### 执行步骤

1. 先完成 S-3，确保已得到自动派生的 checkpoint task
2. 单独执行该 checkpoint task
3. 查询 checkpoint task 的状态、知识条目和人工通知结果

### 通过标准

| 条件 | 判断 |
|------|------|
| task.status = waiting_for_approval | ✅ / ❌ |
| 至少创建 1 条决策类知识条目（draft for human review） | ✅ / ❌ |
| `notify_human` tool 被调用（console 日志） | ✅ / ❌ |
| 决策条目内容包含背景 / 风险分析 / 建议 | ✅ / ❌ |

### 记录表

```
task.status:
checkpointNodeId:
决策条目数:
决策条目标题:
notify_human 调用 (Y/N):
notify_human reason 内容:
迭代轮次:
备注:
```

---

## S-7: 长项目中的知识精度（沉淀 + 检索）

**目标**: 在已有大量知识条目的项目中，新事件能精确锚定到正确节点，且不产生重复沉淀。

### Setup

```ts
// Step 0: 执行通用 Step 0，获取 projectId

// 创建业务节点
const N1 = (await app.inject({ method: 'POST', url: `/projects/${projectId}/nodes`,
  payload: { title: '支付系统', type: 'scaffold' } })).json()

const N2 = (await app.inject({ method: 'POST', url: `/projects/${projectId}/nodes`,
  payload: { title: '库存系统', type: 'scaffold' } })).json()

const N3 = (await app.inject({ method: 'POST', url: `/projects/${projectId}/nodes`,
  payload: { title: '用户系统', type: 'scaffold' } })).json()

// 预埋知识条目（含 embedding）
// createEntry 会自动发布 knowledge.entry.created 事件 → 触发 embedding 任务
// 需等待 embedding 任务完成（或直接调用 runtime.execute(embeddingTaskId)）

const seedEntries = [
  { nodeId: N1.id, category: 'pitfall', title: 'Redis TTL 设置过短导致支付回调重复' },
  { nodeId: N1.id, category: 'decision', title: '第三方 API 限流策略：指数退避重试' },
  { nodeId: N1.id, category: 'context', title: '支付回调签名验证规范' },
  { nodeId: N2.id, category: 'decision', title: '库存超卖锁策略：悲观锁' },
  { nodeId: N2.id, category: 'decision', title: 'SKU 编码规范' },
  { nodeId: N2.id, category: 'pitfall', title: '库存快照设计：全量快照性能问题' },
  { nodeId: N3.id, category: 'decision', title: '密码加密算法：bcrypt 选型' },
  { nodeId: N3.id, category: 'decision', title: '用户 ID 生成策略：雪花算法' },
  { nodeId: N3.id, category: 'context', title: '会话 token 规范' },
]

for (const e of seedEntries) {
  const res = await app.inject({
    method: 'POST',
    url: `/projects/${projectId}/entries`,
    payload: { ...e, body: { text: e.title }, createdBy: 'human' },
  })
  const entry = res.json()
  // 等待 embedding 任务
  const embeddingTask = await prisma.orchestratorTask.findFirst({
    where: { projectId, type: 'embedding', input: { path: ['entryId'], equals: entry.id } },
  })
  if (embeddingTask) await runtime.execute(embeddingTask.id)
}
```

### Trigger

依次执行 3 个 event_anchor 任务，每个明确指向特定节点：

```
任务 A: "我们再次遭遇了 Redis TTL 问题，这次是库存锁的过期时间设置不当。"  → 期望锚定 N2
任务 B: "用户密码存储方案已评审通过，维持现有的 bcrypt 方案。"              → 期望锚定 N3
任务 C: "支付回调被第三方平台重放了两次，幸好幂等校验拦住了。"              → 期望锚定 N1
```

每个任务使用独立的 sourceId（如 `manual-s7a-${Date.now()}`）。

### 观察点

- 每次任务后新建的 `knowledgeEntry.nodeId`
- `search_knowledge` 的 topK 召回结果（查 console 日志）
- 是否有内容重复的 entry 被重新创建

### 通过标准

| 条件 | 判断 |
|------|------|
| 任务 A 的 entry.nodeId = N2.id | ✅ / ❌ |
| 任务 B 的 entry.nodeId = N3.id | ✅ / ❌ |
| 任务 C 的 entry.nodeId = N1.id | ✅ / ❌ |
| 无内容实质重复的新 entry 被创建 | ✅ / ❌ |
| search_knowledge 召回结果与任务主题相关（top-1 精准） | ✅ / ❌ |

### 记录表

```
任务A: entry.nodeId=_, 期望=N2, 正确(Y/N), top-1召回相关(Y/N)
任务B: entry.nodeId=_, 期望=N3, 正确(Y/N), top-1召回相关(Y/N)
任务C: entry.nodeId=_, 期望=N1, 正确(Y/N), top-1召回相关(Y/N)
重复沉淀数:
锚定准确率: _/3
备注:
```

---

## S-8: Tool 调用正确性 & 时机

**目标**: 验证 agent 在综合场景下每个工具调用的参数合法性和调用时序合理性。

### Setup

```ts
// Step 0: 执行通用 Step 0，获取 projectId

const N1 = (await app.inject({ method: 'POST', url: `/projects/${projectId}/nodes`,
  payload: { title: '基础设施层', type: 'scaffold' } })).json()

const N2 = (await app.inject({ method: 'POST', url: `/projects/${projectId}/nodes`,
  payload: { title: '数据库连接池', type: 'growth' } })).json()
```

### Trigger

```ts
await publisher.publish({
  projectId,
  type: 'event_anchor',
  sourceType: 'manual',
  sourceId: `manual-s8-${Date.now()}`,
  input: {
    text: '数据库连接池优化已完成：最大连接数从 10 调整为 50，并增加了连接健康检查机制。这是一个重要的基础设施决策，请记录为知识并更新节点状态为 completed。同时需要为下一步的缓存层搭建创建一个新节点。',
  },
})
```

### 执行步骤

1. 打开 LangGraph trace 日志（或 console）
2. 执行任务
3. 逐条记录 tool 调用序列

### 期望调用序列（参考）

```
1. get_node 或 search_nodes   → 读取现有节点
2. update_node_status          → 将 N2 置为 completed
3. create_knowledge_entry      → 在 N2 下创建 decision 类条目
4. create_node                 → 创建"缓存层"growth 节点
5. create_edge                 → 连接新节点到 N1（composition）
```

> **注意**: 工具名为 snake_case（`get_node`、`update_node_status`、`create_knowledge_entry`、`create_node`、`create_edge`）。

### 通过标准

| 条件 | 判断 |
|------|------|
| 所有 tool 调用的 projectId 与任务一致 | ✅ / ❌ |
| 所有 nodeId 参数指向实际存在的节点 | ✅ / ❌ |
| 先读后写（读操作出现在写操作之前） | ✅ / ❌ |
| 无重复调用同一 tool 相同参数 | ✅ / ❌ |
| 无调用被 domain service 拒绝（DomainServiceError） | ✅ / ❌ |

### 记录表

```
实际调用序列:
1.
2.
3.
...
非法参数调用 (Y/N, 描述):
Domain service 拒绝次数:
总 tool 调用次数:
迭代轮次:
备注:
```

---

## S-9: Skills 效率评审

**目标**: 对比有/无特定 skill 时，agent 完成同一任务的效率差异（迭代轮次、工具调用数、输出质量）。

### 方法

选取 **S-1（Growth Node 自主延伸）** 作为基准场景，分两组运行。每组使用独立 projectId（通过 `POST /projects` 创建，如 name `eval-s9a-...` / `eval-s9b-...`）隔离两组数据。

- **对照组（无目标 skill）**: SkillRegistry 中移除与 `event_anchor` 相关的非 base skill
- **实验组（有目标 skill）**: 恢复完整 skill 配置

每组运行 **2 次**，取平均值，消除 LLM 随机性。

### 观察指标

| 指标 | 对照组均值 | 实验组均值 |
|------|-----------|-----------|
| 迭代轮次（graph recursion depth） | | |
| tool 调用总次数 | | |
| 正确创建 growth 节点（Y/N） | | |
| signalType 正确（Y/N） | | |
| confidence 均值 | | |
| summary 语义质量（主观 1-5 分） | | |

### 通过标准

| 条件 | 判断 |
|------|------|
| 实验组迭代轮次 ≤ 对照组 × 0.8（减少 ≥20%）或质量更高 | ✅ / ❌ |
| 实验组无明显行为退化（正确率不降） | ✅ / ❌ |

### 记录表

```
被评审的 skill 名称:
对照组 run1: 迭代=_, tools=_, 节点正确=_, confidence=_
对照组 run2: 迭代=_, tools=_, 节点正确=_, confidence=_
实验组 run1: 迭代=_, tools=_, 节点正确=_, confidence=_
实验组 run2: 迭代=_, tools=_, 节点正确=_, confidence=_
效率提升比例:
skill 描述是否需要调整 (Y/N, 建议):
```

---

## S-10: 无关信息正确 Skip

**目标**: 当输入的事件与项目无任何关联时，agent 正确调用 `skip` tool 退出，task 状态为 `succeeded`，`signalType` 为 `noise`，且不创建任何节点或知识条目。

### Setup

```ts
// Step 0: 执行通用 Step 0，获取 projectId

const N1 = (await app.inject({ method: 'POST', url: `/projects/${projectId}/nodes`,
  payload: { title: '电商平台后端', type: 'scaffold' } })).json()
```

### Trigger 组合（依次独立执行）

每个任务使用独立的 sourceId（`manual-s10a-...`、`manual-s10b-...`、`manual-s10c-...`）。

**输入 A（纯噪音）**:
```ts
input: { text: '今天午饭吃了炒饭，下午开了个很无聊的同步会议。' }
```

**输入 B（相关但非技术信息）**:
```ts
input: { text: '老板说 Q3 的 KPI 目标是提升 20% 的用户留存，大家要加油。' }
```

**输入 C（另一个项目的信息）**:
```ts
input: { text: '移动端团队今天修复了 iOS 推送通知的 badge 计数 bug，已合并到 main。' }
```

### 执行步骤

1. 分别执行三个任务
2. 检查每个任务的 status 和 modelResult
3. 确认无新增节点或知识条目

### 通过标准

| 条件 | 判断 |
|------|------|
| 输入 A: task.status=succeeded, signalType=noise | ✅ / ❌ |
| 输入 B: task.status=succeeded（skip 或 noise） | ✅ / ❌ |
| 输入 C: task.status=succeeded（skip 或 noise） | ✅ / ❌ |
| 三次执行后零新增节点 | ✅ / ❌ |
| 三次执行后零新增知识条目 | ✅ / ❌ |
| `skip` tool 在 ≥1 次中被调用（console 日志） | ✅ / ❌ |

> 注：输入 B 和 C 有一定模糊性。如 agent 为 B 沉淀了一条 `finding` 或 `context` 类知识而非 skip，属于可接受的边界行为，需人工判断是否合理。（知识条目 category 只有 `decision | pitfall | finding | context`，没有 `risk`。）

### 记录表

```
输入A: status=_, signalType=_, 新节点=_, 新条目=_, skip调用=Y/N
输入B: status=_, signalType=_, 新节点=_, 新条目=_, 行为合理=Y/N
输入C: status=_, signalType=_, 新节点=_, 新条目=_, 行为合理=Y/N
整体 skip 准确率（噪音被正确过滤）:
边界案例备注:
```

---

## 汇总评分表

执行完所有场景后填写：

| 场景 | 关键指标 | Pass(✅) / Fail(❌) / 边界(⚠️) |
|------|---------|-------------------------------|
| S-1 Growth Node 延伸 | growth 节点创建 + 正确边 | |
| S-2 Node 驱动合理性 | 三类输入行为区分正确 | |
| S-3 知识驱动成环 + Checkpoint 提升 | 环边创建 + checkpoint task 自动派生 | |
| S-4 知识触发阶段转换 | 新节点语义正确（type=growth） | |
| S-5 Staging 流程 | 明确知识锚点准确 + 模糊入 stagingNode | |
| S-6 Checkpoint 决策包 + 人工通知 | waiting_for_approval + decision draft + notify_human | |
| S-7 长项目知识精度 | 锚定准确率 ≥ 2/3 + 无重复沉淀 | |
| S-8 Tool 调用正确性 | 无非法参数 + 时序合理 | |
| S-9 Skills 效率 | 迭代减少 ≥20% 或质量提升 | |
| S-10 无关信息 Skip | 噪音零沉淀 | |

**总体通过率**: ___ / 10

**优先修复项**（Fail 场景）:

**需讨论的边界行为**（⚠️ 场景）:
