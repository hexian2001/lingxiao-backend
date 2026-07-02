# @lingxiao-office/sdk API Reference

本文只记录当前 SDK 源码中已确认存在的导出、子路径和工具入口。若某能力不是主入口稳定导出，会明确标注为“子路径高级 API”或“推荐通过工具层/SessionManager 使用”。

## 1. 导入边界

### 主入口：`@lingxiao-office/sdk`

`packages/sdk/src/index.ts` 直接导出常用能力：

```ts
import {
  // Agent loop facade
  contentToPlainText,
  createAgentLoop,
  type AgentLoopResult,

  // LLM
  createLLMClient,
  LLMClientManager,
  type ContentGenerator,
  type GenerateContentParams,
  type ChatMessage,
  type ChatResponse,
  type ToolCall,

  // Tools
  Tool,
  ToolRegistry,
  createToolRegistry,
  type ToolContext,
  type ToolResult,

  // Core orchestration
  MessageBus,
  TaskBoard,
  SessionManager,
  type SessionState,

  // Agent base class
  BaseAgent,
  type AgentConfig,

  // Contracts helpers/types
  EMPTY_TOKEN_USAGE,
  parseEventEnvelope,
  type ToolContract,
  type ToolScope,
  type EventEnvelope,
  type WorkflowState,
} from '@lingxiao-office/sdk';
```

### 子路径高级 API

`packages/sdk/package.json` 提供 `"./*"` 子路径导出，所以可以按模块路径导入高级能力：

```ts
import { createContentGenerator } from '@lingxiao-office/sdk/llm/ContentGenerator.js';
import { AgentRoundExecutor } from '@lingxiao-office/sdk/agents/AgentRoundExecutor.js';
import { AgentCore } from '@lingxiao-office/sdk/agents/runtime/AgentCore.js';
import { createMessageBus, getMessageBus } from '@lingxiao-office/sdk/core/MessageBus.js';
import { createEventEmitter, getEventEmitter } from '@lingxiao-office/sdk/core/EventEmitter.js';
import { SharedLedger, ContractHotSync } from '@lingxiao-office/sdk/core/index.js';
```

注意：子路径 API 更接近 runtime 内部结构，适合高级嵌入；若只是让 Agent 协作，优先使用 ToolRegistry 暴露的 `team_*` / `blackboard` 工具。

### Web API 主入口与 extension 子入口

`@lingxiao-office/web-api` 暴露服务启动和扩展注册入口：

```ts
import {
  createServer,
  createServerWithDeps,
  startServer,
  WebApiRouteRegistry,
  defineWebApiExtension,
  type WebApiExtension,
  type WebApiExtensionContext,
} from '@lingxiao-office/web-api';

import {
  WebApiRouteRegistry as WebApiRouteRegistryFromSubpath,
} from '@lingxiao-office/web-api/extension';
```

---

## 2. Agent loop facade

### `contentToPlainText(content)`

把 LLM `content` 统一转成纯文本，支持 string、content parts、null 和未知对象。

```ts
const text = contentToPlainText(response.content);
```

### `createAgentLoop(options)`

用于替代手写 `generateContent` / `tool_calls` / `registry.execute` / tool result 回灌样板。

**参数说明：**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `llm` | `LLMClient` | ✓ | — | LLM 客户端，由 `createLLMClientFromConfig()` 或 `createLLMClient()` 创建 |
| `registry` | `ToolRegistry` | ✓ | — | 工具注册表，由 `createToolRegistry()` 创建 |
| `messages` | `ChatMessage[]` | ✓ | — | 初始消息数组（通常含 system + user） |
| `model` | `string` | ✓ | — | 模型名或 snapshot id，与创建 LLM 客户端时一致 |
| `tools` | `ToolDefinition[]` | ✗ | `registry.getDefinitions()` | 显式工具列表，不传则用注册表全部工具 |
| `toolNames` | `string[]` | ✗ | — | 工具白名单，仅当 `tools` 未传时生效 |
| `toolContext` | `ToolContext` | ✗ | — | 工具执行上下文（见下方说明） |
| `maxRounds` | `number` | ✗ | `10` | 最大循环轮次 |
| `maxTokens` | `number` | ✗ | — | 每轮 LLM 调用的 max_tokens |
| `done` | `(event) => boolean` | ✗ | — | 完成判定函数。不传则跑到 LLM 不再调工具或达到 maxRounds |
| `hooks` | `AgentLoopHooks` | ✗ | — | 回调钩子：`onThinking`/`onMessage`/`onToolCall`/`onToolResult`/`onRound` |
| `signal` | `AbortSignal` | ✗ | — | 中断信号 |

**`done` predicate 说明：**

- **传了 `done`**：每轮 LLM 响应后调用，返回 `true` 则结束循环（`finishReason: 'done'`）。
- **不传 `done`**：循环在 LLM 不再调用工具时自动结束（`finishReason: 'no_tool_call'`），或达到 `maxRounds`（`finishReason: 'max_rounds'`）。
- 大多数场景不需要 `done`——让 agent 自己决定何时停。

**`toolContext` 结构：**

```ts
interface ToolContext {
  workspace?: string;           // 工作目录，文件操作工具的根路径
  sessionId?: string;           // 会话 ID
  agentId?: string;             // Agent ID
  permissionContext?: {         // 权限上下文（见下方说明）
    mode: 'strict' | 'dev' | 'networked' | 'yolo';
  };
}
```

**`permissionContext.mode` 权限模式：**

| 模式 | 说明 | 适用场景 |
|---|---|---|
| `'yolo'` | 全部允许，无沙箱限制 | 开发/测试/教学，agent 可自由执行 shell、网络请求、文件操作 |
| `'dev'` | 允许本地操作，网络受限 | 本地开发，允许 shell 和文件操作但限制网络 |
| `'networked'` | 允许白名单网络访问 | 生产环境，需要指定 `allowedHosts` |
| `'strict'` | 最严格，需要逐工具授权 | 高安全要求环境 |

> **新手建议**：开发阶段用 `'yolo'`，生产部署用 `'strict'` 或 `'dev'`。

完整示例：

```ts
const loop = createAgentLoop({
  llm,
  registry,
  model: 'claude-opus-4-8',
  messages,
  toolContext: {
    workspace: process.cwd(),
    permissionContext: { mode: 'yolo' },
  },
  maxRounds: 10,
  // done 可不传——agent 自己决定何时停
  hooks: {
    onToolCall: ({ toolCall }) => console.log(`调用工具: ${toolCall.function.name}`),
    onToolResult: ({ result }) => console.log(`工具结果: ${result.success ? '✓' : '✗'}`),
  },
});

const result: AgentLoopResult = await loop.run();
console.log(result.finishReason, result.rounds);
```

**`AgentLoopResult` 返回值：**

```ts
interface AgentLoopResult {
  messages: ChatMessage[];      // 完整对话历史（含工具调用和结果）
  rounds: number;                // 实际执行的轮次
  finishReason: 'done' | 'no_tool_call' | 'max_rounds' | 'aborted' | 'error';
  lastResponse?: ChatResponse;   // 最后一轮 LLM 响应
  error?: unknown;               // 如果出错
}
```

应用仍应自己决定 prompt、完成标记、报告格式和错误退避策略。

---

## 3. LLM

### `createLLMClientFromConfig(config)` — 推荐，一行接上 LLM

直接传 `apiKey` / `baseUrl` / `model`，无需配置文件或 ModelManager。这是最简单的 LLM 接入方式。

```ts
import { createLLMClientFromConfig } from '@lingxiao-office/sdk';

const llm = createLLMClientFromConfig({
  apiKey: 'sk-...',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-opus-4-8',
  provider: 'anthropic', // 可选，默认 'openai'（OpenAI 兼容端点）
});

const response = await llm.generateContent({
  model: 'claude-opus-4-8',
  messages: [{ role: 'user', content: '用一句话介绍凌霄 SDK。' }],
  maxTokens: 512,
});

console.log(response.content);
```

**参数说明：**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `apiKey` | `string` | ✓ | API Key |
| `baseUrl` | `string` | ✓ | API Base URL，如 `https://api.anthropic.com` 或 `https://api.openai.com/v1` |
| `model` | `string` | ✓ | 实际发送给 API 的模型名，如 `claude-opus-4-8` 或 `gpt-4o` |
| `provider` | `'openai' \| 'anthropic'` | ✗ | Provider 类型，默认 `'openai'`。Anthropic 原生端点用 `'anthropic'`，OpenAI 兼容端点（含第三方中转）用 `'openai'` |

> **provider 怎么选？**
> - `anthropic`：直连 Anthropic 官方 API（`https://api.anthropic.com`），使用 Anthropic Messages API 格式
> - `openai`：OpenAI 兼容端点（`https://api.openai.com/v1` 或任何兼容端点），使用 Chat Completions 格式
> - 大多数第三方中转/聚合服务（如 OneAPI、OpenRouter）用 `'openai'`

`ChatResponse.content` 的类型是 `MessageContent`，可能是字符串，也可能是结构化 content parts。推荐用 `contentToPlainText()` 统一提取文本：

```ts
import { contentToPlainText } from '@lingxiao-office/sdk';
const text = contentToPlainText(response.content);
```

### `createLLMClient(modelOrProvider?)` — 高级，通过配置或 snapshot 接入

```ts
function createLLMClient(
  modelOrProvider?: string | 'openai' | 'anthropic' | 'auto',
): LLMClientManager;
```

- 主入口导出：`@lingxiao-office/sdk`。
- 返回对象实现 `ContentGenerator` 接口。
- 参数通常传模型 id 或 runtime snapshot id。
- 不传参数时会读取 SDK 配置中的 `llm.leader_model`；若未配置会抛错。

通过 ModelManager 创建 runtime snapshot 的方式（适合动态管理多个模型）：

```ts
import { createLLMClient } from '@lingxiao-office/sdk';
import { getModelManager } from '@lingxiao-office/sdk/config/ModelManager.js';

const snapshotId = getModelManager().createRuntimeSnapshot('anthropic', 'claude-opus-4-8', {
  apiKey: process.env.LX_API_KEY!,
  baseUrl: process.env.LX_BASE_URL ?? 'http://127.0.0.1:8080',
});

const llm = createLLMClient(snapshotId);
const response = await llm.generateContent({
  model: snapshotId,
  messages: [{ role: 'user', content: '用一句话介绍凌霄 SDK。' }],
  maxTokens: 512,
});
```

`createRuntimeSnapshot()` 返回的是 snapshot id 字符串，不是 snapshot 对象；将这个字符串传给 `createLLMClient()` 和 `generateContent({ model })`。

`ChatResponse.content` 的类型是 `MessageContent`，可能是字符串，也可能是结构化 content parts。不要假设它一定是数组：

```ts
const text = typeof response.content === 'string'
  ? response.content
  : JSON.stringify(response.content);
```

### `createContentGenerator(config)`（子路径高级 API）

```ts
interface ContentGeneratorConfig {
  modelId: string;
  apiModelName: string;
  provider: 'openai' | 'anthropic';
  apiKey: string;
  baseUrl: string;
  useVercelAI?: boolean;
}

function createContentGenerator(config: ContentGeneratorConfig): ContentGenerator;
```

导入：

```ts
import { createContentGenerator } from '@lingxiao-office/sdk/llm/ContentGenerator.js';
```

适用场景：你不想依赖全局 `ModelManager`，而是直接用显式 provider/baseUrl/apiKey 创建 LLM 生成器。

```ts
const llm = createContentGenerator({
  provider: 'anthropic',
  modelId: 'local-opus',
  apiModelName: 'claude-opus-4-8',
  apiKey: process.env.LX_API_KEY!,
  baseUrl: 'http://127.0.0.1:8080',
});
```

### `ContentGenerator` 接口

```ts
interface ContentGenerator {
  generateContent(params: GenerateContentParams): Promise<ChatResponse>;
  generateContentStream(
    params: GenerateContentParams,
    callbacks?: StreamCallbacks,
  ): AsyncGenerator<StreamEvent, ChatResponse, undefined>;
  generateContentWithCallbacks(
    params: GenerateContentParams,
    callbacks?: StreamCallbacks,
  ): Promise<ChatResponse>;
  countTokens(params: CountTokensParams): Promise<CountTokensResult>;
  close(): Promise<void>;
  recycle?(): void;
  warmup?(): Promise<void>;
  getProviderKey?(model: string): string | null;
}

interface GenerateContentParams {
  messages: ChatMessage[];
  model: string;
  tools?: ToolDefinition[];
  signal?: AbortSignal;
  maxTokens?: number;
  sampling?: { temperature?: number; top_p?: number };
}
```

---

## 4. Tool system

### `createToolRegistry()`

```ts
function createToolRegistry(): ToolRegistry;
```

`createToolRegistry()` 会创建 `ToolRegistry`，注册 SDK 内置工具，并应用 settings 中的 user-defined tool 配置。

```ts
import { createToolRegistry } from '@lingxiao-office/sdk';

const registry = createToolRegistry();
const tools = registry.getDefinitions(['shell', 'http_request', 'file_create']);
```

### `ToolRegistry`

常用方法：

```ts
class ToolRegistry {
  register(tool: Tool): void;
  registerDeferred(name: string, factory: () => Tool): void;
  unregister(name: string): boolean;
  get(name: string): Tool | undefined;
  getDefinitions(
    toolNames?: string[],
    options?: ToolDefinitionOptions,
  ): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  execute(name: string, args: unknown, context?: ToolContext): Promise<ToolResult>;
}
```

最小 tool-calling loop：

```ts
import { createLLMClient, createToolRegistry, type ChatMessage } from '@lingxiao-office/sdk';
import { getModelManager } from '@lingxiao-office/sdk/config/ModelManager.js';

const model = getModelManager().createRuntimeSnapshot('anthropic', 'claude-opus-4-8', {
  apiKey: process.env.LX_API_KEY!,
  baseUrl: process.env.LX_BASE_URL ?? 'http://127.0.0.1:8080',
});
const llm = createLLMClient(model);
const registry = createToolRegistry();

const messages: ChatMessage[] = [
  { role: 'system', content: '你是一个谨慎的工程助手。' },
  { role: 'user', content: '列出当前目录文件。' },
];

for (let round = 1; round <= 8; round += 1) {
  const response = await llm.generateContent({
    model,
    messages,
    tools: registry.getDefinitions(['list_dir']),
    maxTokens: 2048,
  });

  messages.push({
    role: 'assistant',
    content: response.content,
    tool_calls: response.tool_calls,
    thinking: response.thinking,
  });

  if (!response.tool_calls?.length) break;

  for (const call of response.tool_calls) {
    const args = JSON.parse(call.function.arguments || '{}');
    const result = await registry.execute(call.function.name, args, {
      workspace: process.cwd(),
      permissionContext: { mode: 'yolo' },
    });

    messages.push({
      role: 'tool',
      tool_call_id: call.id,
      content: JSON.stringify(result),
    });
  }
}
```

### `Tool` 基类

```ts
abstract class Tool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: z.ZodTypeAny;
  readonly exposedParameters?: z.ZodTypeAny;
  readonly scope: ToolScope = 'worker';

  getExecutionTimeoutMs?(args: unknown, context?: ToolContext): number | null | undefined;
  abstract execute(args: unknown, context?: ToolContext): Promise<ToolResult>;
  getSchema(): Record<string, unknown>;
}
```

自定义工具示例：

```ts
import { Tool, createToolRegistry, type ToolContext, type ToolResult } from '@lingxiao-office/sdk';
import { z } from 'zod';

class EchoTool extends Tool {
  readonly name = 'echo';
  readonly description = 'Echo input text.';
  readonly parameters = z.object({ text: z.string() });

  async execute(args: unknown, _context?: ToolContext): Promise<ToolResult> {
    const { text } = this.parameters.parse(args);
    return { success: true, data: { text } };
  }
}

const registry = createToolRegistry();
registry.register(new EchoTool());
```

`ToolResult` 来自 contracts：

```ts
interface ToolResult {
  success: boolean;
  data: unknown;
  error?: string;
}
```

---

## 5. Advanced Agent loop internals

### `AgentRoundExecutor`（子路径高级 API）

导入：

```ts
import { AgentRoundExecutor } from '@lingxiao-office/sdk/agents/AgentRoundExecutor.js';
```

真实签名：

```ts
interface AgentRoundExecutorDeps {
  llm: ContentGenerator;
  toolRegistry?: ToolRegistry;
  contextController?: AgentContextController;
  interventionHandler?: AgentInterventionHandler;
  logger?: { debug?: (msg: string, ...args: unknown[]) => void };
  maxRounds?: number;
  model?: string;
}

interface ExecuteRoundOptions {
  model?: string;
  tools?: ToolDefinition[];
  round?: number;
  signal?: AbortSignal;
  executeToolCall?: (toolCall: ToolCall) => Promise<ToolResultContent>;
}

class AgentRoundExecutor {
  constructor(deps: AgentRoundExecutorDeps);
  executeRound(
    messages: ChatMessage[],
    systemPrompt: string,
    options?: ExecuteRoundOptions,
  ): Promise<RoundResult>;
}
```

它封装了“单轮 LLM → tool_calls → tool result message”的执行逻辑，适合你已经有消息数组、LLM 和 ToolRegistry，但不想手写每轮细节。

### `AgentCore`（子路径高级 API）

导入：

```ts
import { AgentCore } from '@lingxiao-office/sdk/agents/runtime/AgentCore.js';
```

真实签名：

```ts
type ReasoningLoopStep<T> =
  | { type: 'continue' }
  | { type: 'repeat' }
  | { type: 'reset_budget' }
  | { type: 'break'; result?: T };

type ReasoningLoopTerminationReason = 'max_rounds' | 'max_runtime';

interface AgentCoreRunOptions<T> {
  maxRounds: number;
  maxRuntimeMinutes: number;
  shouldStop?: () => boolean;
  onStopped?: () => T | Promise<T>;
  onBoundReached: (reason: ReasoningLoopTerminationReason) => ReasoningLoopStep<T> | Promise<ReasoningLoopStep<T>>;
  runRound: (roundNumber: number) => ReasoningLoopStep<T> | Promise<ReasoningLoopStep<T>>;
}

class AgentCore<T = string> {
  run(options: AgentCoreRunOptions<T>): Promise<T | undefined>;
}
```

最小用法：

```ts
const core = new AgentCore<string>();
const result = await core.run({
  maxRounds: 5,
  maxRuntimeMinutes: 2,
  runRound: async (round) => {
    if (round >= 3) return { type: 'break', result: 'done' };
    return { type: 'continue' };
  },
  onBoundReached: async (reason) => ({ type: 'break', result: `stopped: ${reason}` }),
});
```

`AgentCore` 是有界 reasoning loop driver。真正多 Agent 会话建议使用 `SessionManager` 或完整 runtime，而不是直接把它当 Team runtime。

---

## 6. SessionManager

主入口导出：

```ts
import { SessionManager } from '@lingxiao-office/sdk';
```

`SessionManager` 是会话级高级 runtime 入口，负责创建会话、管理 Leader/Worker、TaskBoard、MessageBus、ToolRegistry、模式切换等。构造函数依赖 SDK 内部持久化和事件系统：

```ts
class SessionManager {
  constructor(db: DatabaseManager, emitter: EventEmitter, baseWorkspace?: string);

  getSession(sessionId: string): SessionState | undefined;
  listSessions(): Session[];
  getSessionHistory(sessionId: string): unknown[];
  getSessionTools(sessionId: string): { /* tool metadata */ };
  getSessionToolRegistry(sessionId?: string): ToolRegistry | undefined;

  createSession(
    userRequest: MessageContent | object,
    workspacePath?: string,
    options?: { idle?: boolean },
  ): Promise<string>;

  sendUserInput(
    sessionId: string,
    message: MessageContent,
    options?: { interrupt?: boolean; source?: string },
  ): Promise<void>;

  sendAgentInput(
    sessionId: string,
    agentName: string,
    message: MessageContent,
  ): Promise<SendAgentInputResult>;

  setCollaborationMode(
    sessionId: string,
    mode: 'solo' | 'team',
  ): { ok: boolean; message: string };

  cancelTask(
    sessionId: string,
    taskId: string,
    reason?: string,
  ): Promise<CancelTaskResult>;
}
```

注意事项：

- 外部产品如果只需要单 Agent loop，通常用 `createLLMClient` + `createToolRegistry` 更轻。
- 如果要使用真实 Team Runtime，推荐通过 `SessionManager.setCollaborationMode(sessionId, 'team')` 切到团队模式，再由 Leader 使用工具层 `team_manage` 创建 team。
- `SessionManager` 是高级 runtime API；它会装配数据库、事件、工具、上下文压缩、agent 生命周期等完整能力。

最小装配示例（适合嵌入式宿主）：

```ts
import { DatabaseManager, SessionManager } from '@lingxiao-office/sdk';
import { createEventEmitter } from '@lingxiao-office/sdk/core/EventEmitter.js';

const db = new DatabaseManager('/tmp/lingxiao-sdk.db');
const emitter = createEventEmitter();
const manager = new SessionManager(db, emitter, process.cwd());

const sessionId = await manager.createSession('分析当前项目结构', process.cwd(), { idle: true });
const modeResult = manager.setCollaborationMode(sessionId, 'team');
console.log(modeResult.message);
```

---

## 7. TaskBoard / DAG

主入口导出：

```ts
import { TaskBoard } from '@lingxiao-office/sdk';
```

核心签名：

```ts
class TaskBoard {
  constructor(sessionId: string, db?: DatabaseManager, emitter?: EventEmitter, workspaceRoot?: string);

  createTask(
    id: string,
    subject: string,
    description: string,
    agentType: string,
    blockedBy?: string[],
    blocks?: string[],
    scope?: TaskScopeConfig,
    context?: string,
    options?: {
      origin?: string;
      goal?: string;
      taskType?: 'bootstrap' | 'reason' | 'explore' | 'generic';
      orchestration?: OrchestrationTaskMetadata;
      preferred_agent_name?: string;
    },
  ): Task;

  updateTask(id: string, updates: Partial<...>): Task;
  assignTask(id: string, agentId: string): Task | undefined;
  getDispatchable(): Task[];
  allTerminal(): boolean;
}
```

DAG 依赖通过 `blockedBy` / `blocks` 表达。不要调用不存在的 `dispatch()`；正确模式是查询可分发任务，再用 `assignTask()` 标记 running。

```ts
const board = new TaskBoard('session-demo');

board.createTask('T-1', '侦察', '识别入口和服务指纹', 'research');
board.createTask('T-2', '验证漏洞', '基于侦察结果验证可利用点', 'coding', ['T-1']);

const ready = board.getDispatchable();
for (const task of ready) {
  board.assignTask(task.id, 'agent-recon');
}
```

---

## 8. MessageBus

主入口导出 `MessageBus`；子路径提供工厂：

```ts
import { MessageBus } from '@lingxiao-office/sdk';
import { createMessageBus, getMessageBus } from '@lingxiao-office/sdk/core/MessageBus.js';
```

核心签名：

```ts
class MessageBus {
  constructor(
    maxHistorySize?: number,
    emitter?: EventEmitter,
    maxHistoryBytes?: number,
    transport?: Transport,
  );

  send<K extends BusMessageType>(
    from: string,
    to: string,
    type: K,
    payload: BusMessagePayloadMap[K],
  ): string;

  subscribe(recipient: string, handler: MessageHandler): () => void;
}

function createMessageBus(
  maxHistorySize?: number,
  emitter?: EventEmitter,
  maxHistoryBytes?: number,
  transport?: Transport,
): MessageBus;

function getMessageBus(): MessageBus;
```

适用场景：进程内 Agent/服务组件消息通信。对普通 Team 协作，优先用工具层 `team_message` / `team_inbox`，因为它们带 roster、ack/request 闭环和 artifact awareness 约定。

---

## 9. Team tools

Team 常规入口是 ToolRegistry 中的工具，而不是直接操作内部 `TeamMailbox`。`createToolRegistry()` 已注册：

- `team_manage`
- `team_message`
- `team_inbox`

### `team_manage`

```ts
type TeamManageAction = 'create' | 'delete' | 'edit' | 'list_members' | 'status' | 'task_board';

interface TeamManageArgs {
  action: TeamManageAction;
  team_name?: string;
  description?: string;
  leader?: string;
  members?: string[];
  workspace?: string;
  edit_action?: 'add' | 'remove' | 'rename' | 'set_leader' | 'list';
  member?: string;
  new_name?: string;
  include_terminal?: boolean;
}
```

创建团队示例：

```ts
await registry.execute('team_manage', {
  action: 'create',
  team_name: 'analysis-team',
  leader: 'leader',
  members: ['recon', 'operator', 'reviewer'],
  description: '分析、执行、复核三角色团队',
  workspace: process.cwd(),
}, { sessionId, agentName: 'leader' });
```

### `team_message`

```ts
type TeamMessageIntent =
  | 'message'
  | 'transfer_request'
  | 'transfer_accept'
  | 'review_request'
  | 'review_result'
  | 'clarification_request'
  | 'pairing_request'
  | 'conflict_notice'
  | 'coordination_result'
  | 'decision_record';

interface TeamMessageArgs {
  intent?: TeamMessageIntent;
  target_type: 'member' | 'team';
  target: string;
  content: string;
  urgency?: 'normal' | 'urgent';
  type?: 'normal' | 'ack' | 'request';
  request_id?: string;
  requires_ack?: boolean;
  task_id?: string;
  source_task_id?: string;
  target_task_id?: string;
  artifact_paths?: string[];
  evidence_refs?: string[];
  verdict?: 'PASS' | 'FAIL' | 'BLOCKED' | 'UNKNOWN';
  next_action?: string;
}
```

`type='request'`、`type='ack'` 或 `requires_ack=true` 时必须提供非空 `request_id`。普通通知不知道 request id 时直接省略。

```ts
await registry.execute('team_message', {
  target_type: 'member',
  target: 'reviewer',
  intent: 'review_request',
  type: 'request',
  request_id: 'api-contract@v1',
  content: '请复核 api-contract@v1 是否与实现一致。',
  artifact_paths: ['docs/api-reference.md'],
}, { sessionId, agentName: 'leader' });
```

### `team_inbox`

```ts
interface TeamInboxArgs {
  unread_only?: boolean; // 默认 true
  mark_read?: boolean;   // 默认 true
  limit?: number;        // 1..50，默认 20
}
```

```ts
const inbox = await registry.execute('team_inbox', {
  unread_only: true,
  mark_read: true,
  limit: 20,
}, { sessionId, agentName: 'reviewer' });
```

---

## 10. Blackboard

Blackboard 常规入口也是 ToolRegistry 工具：

```ts
await registry.execute('blackboard', args, { sessionId, agentName: 'leader' });
```

`blackboard` 的 action：

```ts
type BlackboardAction =
  | 'write_fact'
  | 'declare_intent'
  | 'add_edge'
  | 'supersede_node'
  | 'read_graph';
```

常用参数：

```ts
interface BlackboardArgs {
  action: BlackboardAction;

  // write_fact / declare_intent
  title?: string;
  content?: string;
  tags?: string[];
  confidence?: 'confirmed' | 'likely' | 'tentative';
  evidence?: Array<{
    type: 'file' | 'test_result' | 'log_output' | 'url' | 'observation';
    ref: string;
    location?: string;
    snippet?: string;
  }>;
  priority?: number; // declare_intent: 1..10, 1 highest

  // add_edge
  from_node_id?: string;
  to_node_id?: string;
  edge_type?: 'depends_on' | 'supports' | 'contradicts' | 'refines' | 'supersedes' | 'produces' | 'consumes';
  metadata?: Record<string, string>;

  // supersede_node
  old_node_id?: string;
  new_title?: string;
  new_content?: string;
  new_tags?: string[];
  new_confidence?: 'confirmed' | 'likely' | 'tentative';

  // read_graph
  query_type?: 'summary' | 'node_by_id' | 'nodes_by_kind' | 'nodes_by_tag' | 'edges_from' | 'edges_to' | 'subgraph';
  node_id?: string;
  kind?: 'fact' | 'intent' | 'hint' | 'origin' | 'goal' | 'contract' | 'design_doc';
  tag?: string;
  max_depth?: number; // 1..5
}
```

写事实并读取摘要：

```ts
await registry.execute('blackboard', {
  action: 'write_fact',
  title: 'API contract v1 confirmed',
  content: 'ToolRegistry.execute(name, args, context?) returns Promise<ToolResult>.',
  tags: ['contract', 'sdk'],
  confidence: 'confirmed',
  evidence: [{ type: 'file', ref: 'packages/sdk/src/tools/Registry.ts', location: '1427' }],
}, { sessionId, agentName: 'leader' });

const graph = await registry.execute('blackboard', {
  action: 'read_graph',
  query_type: 'summary',
}, { sessionId, agentName: 'leader' });
```

`BlackboardGraph` concrete class 存在于 SDK 内部/子路径，但对普通开发者不建议直接操作；推荐通过 `blackboard` 工具或完整 runtime 维护图谱一致性。

---

## 11. Contracts

Contracts 是 SDK 内部跨层契约类型的统一来源。主入口 re-export 了常用 contracts 类型和 helper；完整 contracts barrel 可通过子路径访问：

```ts
import type {
  ToolContract,
  ToolContext,
  ToolResult,
  EventEnvelope,
  BaseMessage,
  SessionPhase,
  WorkflowState,
} from '@lingxiao-office/sdk/contracts/index.js';
```

`ToolContract` 核心形态：

```ts
interface ToolContract {
  readonly name: string;
  readonly description: string;
  readonly scope?: ToolScope;
  readonly schema?: JsonSchema;
  readonly input_schema?: JsonSchema;
  readonly parameters?: unknown;
  getSchema?(): JsonSchema;
  getExecutionTimeoutMs?(args: unknown, context?: ToolContext): number | null | undefined;
  execute(args: unknown, context?: ToolContext): Promise<ToolResult | unknown> | ToolResult | unknown;
}
```

`ContractHotSync` 和 `SharedLedger` 位于 `@lingxiao-office/sdk/core/index.js` 子路径，属于高级协作/交付 runtime 能力。若只是让 Agent 写契约和事实，优先通过 `blackboard` 工具沉淀 `contract` / `design_doc` 节点；若要把它们作为正式公共 facade，建议在 SDK 后续版本新增明确 barrel/facade 导出和示例测试。

---

## 注意事项

- 本文示例以 TypeScript/ESM 为准，导入子路径时保留 `.js` 后缀。
- `createRuntimeSnapshot()` 返回的是 snapshot id 字符串，不是 snapshot 对象；将这个字符串传给 `createLLMClient()` 和 `generateContent({ model })`。
- `ChatResponse.content` 不保证是数组；按 `MessageContent` 处理。
- Team/Blackboard 的推荐入口是工具层；不要在外部代码里依赖内部 mailbox/graph 的非稳定细节。
- `SessionManager` 能控制完整 runtime，但也意味着你需要提供数据库、事件系统和 workspace；单 Agent demo 更适合用 LLM + ToolRegistry loop。
