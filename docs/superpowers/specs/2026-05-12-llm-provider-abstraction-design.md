# LLM Provider Abstraction Design

**Date:** 2026-05-12
**Status:** Implemented

---

## 一、背景与目标

Orchestrator 当前在 `task-runner.service.ts` 中硬编码了模型选择逻辑，且在 `agent/agent-graph.ts` 中直接依赖 `ChatAnthropic`。目标是：

1. 将 LLM 配置（provider、model、api_key、base_url 等）外置到 `config.yaml`，通过 NestJS DI 注入
2. 定义 `IChatProvider` / `IEmbeddingProvider` 接口，隔离各 provider 的 SDK 细节
3. 支持 Anthropic（native SDK）、OpenAI（标准端点）、以及任意 OpenAI-compatible 端点（SiliconFlow、Groq 等）

---

## 二、Config 结构

### 2.1 `config.yaml` 新增

```yaml
orchestrator:
  llm:
    taskModels:
      default:
        provider: anthropic
        model: claude-haiku-4-5-20251001
        api_key: ""
      checkpoint:
        provider: anthropic
        model: claude-sonnet-4-6
        api_key: ""
    embeddingModel:
      provider: openai
      model: text-embedding-3-small
      api_key: ""
```

完整 provider 配置字段（所有字段均可出现在任意 model config 中）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `provider` | enum | ✅ | `anthropic` \| `openai` \| `siliconflow` \| `deepseek` \| … |
| `model` | string | ✅ | 具体模型名 |
| `api_key` | string | ✅ | API 密钥 |
| `base_url` | string | ❌ | 自定义端点（OpenAI-compatible 必填） |
| `temperature` | number | ❌ | 默认 undefined（由 SDK 决定） |
| `max_tokens` | number | ❌ | 默认 undefined |

OpenAI-compatible 示例（DeepSeek，当前配置）：
```yaml
    taskModels:
      default:
        provider: deepseek
        model: deepseek-v4-pro
        base_url: "https://api.deepseek.com/v1"
        api_key: "sk-..."
      checkpoint:
        provider: deepseek
        model: deepseek-v4-pro
        base_url: "https://api.deepseek.com/v1"
        api_key: "sk-..."
```

SiliconFlow 示例：
```yaml
    taskModels:
      default:
        provider: siliconflow
        model: Pro/zai-org/GLM-5.1
        base_url: "https://api.siliconflow.cn/v1"
        api_key: "sk-..."
        temperature: 0.7
        max_tokens: 1024
```

### 2.2 `integrations` 变更

`integrations.anthropic.apiKey` 和（如有）`integrations.openai.apiKey` 对 LLM 不再有意义，从 schema 中移除。`integrations` 仅保留 webhook secrets（`github.webhookSecret`、`feishu.appId/appSecret`）。

### 2.3 Zod schema 新增

```typescript
const llmModelConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'siliconflow', 'deepseek']),  // 扩展时在此添加
  model: z.string().min(1),
  api_key: z.string().default(''),
  base_url: z.string().url().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
})

const orchestratorLlmSchema = z.object({
  taskModels: z.record(z.string(), llmModelConfigSchema).refine(
    (v) => 'default' in v,
    { message: 'taskModels must contain a "default" entry' },
  ).default({
    default: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', api_key: '' },
    checkpoint: { provider: 'anthropic', model: 'claude-sonnet-4-6', api_key: '' },
  }),
  embeddingModel: llmModelConfigSchema.default({
    provider: 'openai', model: 'text-embedding-3-small', api_key: '',
  }),
})
```

---

## 三、Provider 接口与实现

### 3.1 接口（`llm/interfaces.ts`）

```typescript
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'

export interface IChatProvider {
  createChatModel(): BaseChatModel
}

export interface IEmbeddingProvider {
  embed(text: string): Promise<number[]>
}
```

参数已在构造时从 config 注入，调用方无需再传模型名。

### 3.2 Provider 路由规则

```
provider 值         内部 SDK 实现
──────────────────────────────────────────────────────
anthropic         → AnthropicProvider   (ChatAnthropic)
openai            → OpenAiCompatibleProvider (ChatOpenAI)
siliconflow       → OpenAiCompatibleProvider (ChatOpenAI + base_url)
deepseek          → OpenAiCompatibleProvider (ChatOpenAI + base_url)
新增 provider     → 在 PROVIDER_SDK_MAP 加一行 + Zod enum 加一项
```

`PROVIDER_SDK_MAP`（`llm/llm-provider.registry.ts`）：
```typescript
const PROVIDER_SDK_MAP = {
  anthropic: 'anthropic',
  openai: 'openai-compatible',
  siliconflow: 'openai-compatible',
  deepseek: 'openai-compatible',
} as const satisfies Record<ProviderType, 'anthropic' | 'openai-compatible'>
```

### 3.3 `AnthropicProvider`（`llm/providers/anthropic.provider.ts`）

- 实现 `IChatProvider`
- 内部使用 `ChatAnthropic({ model, apiKey, ... })`

### 3.4 `OpenAiCompatibleProvider`（`llm/providers/openai-compatible.provider.ts`）

- 实现 `IChatProvider` + `IEmbeddingProvider`
- Chat：使用 `ChatOpenAI({ model, apiKey, configuration: { baseURL } })`
- Embedding：使用 `OpenAI` client 的 `embeddings.create`

---

## 四、LlmProviderRegistry（`llm/llm-provider.registry.ts`）

NestJS `@Injectable()`，注入 `AppConfig`。

```typescript
class LlmProviderRegistry {
  getChatModelForTask(taskType: OrchestratorTaskType): BaseChatModel
  embed(text: string): Promise<number[]>
}
```

内部逻辑：
1. `getChatModelForTask`：查 `config.orchestrator.llm.taskModels[taskType]`，fallback 到 `default`；按 `PROVIDER_SDK_MAP` 路由到对应 provider；调用 `provider.createChatModel()`
2. `embed`：查 `config.orchestrator.llm.embeddingModel`；路由到 `OpenAiCompatibleProvider`；调用 `provider.embed(text)`

Provider 实例在 registry 构造时按需创建：遍历所有 taskModel config + embeddingModel config，按 provider 类型去重后实例化，存入内部 Map。

---

## 五、修改现有文件

| 文件 | 变更 |
|------|------|
| `src/config/app.config.ts` | 新增 `orchestrator.llm` schema；移除 `integrations.anthropic/openai.apiKey` |
| `config.yaml` / `config.yaml.example` | 新增 `orchestrator.llm` 块；移除 anthropic apiKey |
| `agent/agent-graph.ts` | `BuildOptions.model: string` → `BuildOptions.llm: BaseChatModel` |
| `runtime/task-runner.service.ts` | 注入 `LlmProviderRegistry` 和 `PromptBuilderService`；移除硬编码 model 选择 |
| `orchestrator.module.ts` | 注册 `LlmProviderRegistry`、`PromptBuilderService` |
| `prompt/prompt-builder.service.ts` | 新增，封装 system prompt 和 user message 的组装逻辑 |

---

## 六、数据流

```
TaskRunnerService.runAgenticLoop(task)
  → registry.getChatModelForTask(task.type)
      → taskModels[task.type] ?? taskModels.default     // config 查表
      → PROVIDER_SDK_MAP[config.provider]               // 路由
      → AnthropicProvider / OpenAiCompatibleProvider
      → provider.createChatModel()                      // BaseChatModel
  → buildAgentGraph({ tools, systemPrompt, llm })       // llm 替代原来的 model string

TaskRunnerService.runEmbedding(task)
  → registry.embed(text)
      → embeddingModel config
      → OpenAiCompatibleProvider.embed(text)
```

---

## 七、目录结构

```
src/orchestrator/
├── llm/
│   ├── interfaces.ts
│   ├── llm-provider.registry.ts
│   └── providers/
│       ├── anthropic.provider.ts
│       └── openai-compatible.provider.ts
├── prompt/
│   └── prompt-builder.service.ts   # skill → systemPrompt + ctx → userMessage
├── agent/
│   └── agent-graph.ts              # BuildOptions.llm: BaseChatModel
...
```

---

## 八、测试策略

- `LlmProviderRegistry` 单元测试：mock `AppConfig`，验证 task type → provider 路由、fallback 到 default、未知 provider 抛错
- `AnthropicProvider` / `OpenAiCompatibleProvider` 单元测试：mock langchain SDK，验证构造参数正确传递
- `agent-graph.spec.ts` 更新：`buildAgentGraph` 接收 mock `BaseChatModel` 而非 model string
