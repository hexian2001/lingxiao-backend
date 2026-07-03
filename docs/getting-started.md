# 凌霄 SDK 能力概览

> `@lingxiao-office/sdk` —— 把任意 LLM 变成会自己调工具、自己组团队、自己推进任务的自主 Agent 引擎。

## 这是什么

凌霄 SDK 是一个 Agent 开发基座。你给它一个 LLM，它还你一个能自主干活的 Agent——不是"调一下工具就停"的脚本，而是会自己侦察、自己判断、自己组队、自己收尾的智能体。

跟市面 agent 框架的区别：

| | 普通 agent 框架 | 凌霄 SDK |
|---|---|---|
| 核心能力 | LLM + 工具调用 | LLM + 工具 + **多 agent 编排** + **共享黑板** + **契约对齐** + **任务 DAG** |
| 单 agent | ✅ | ✅ |
| 多 agent 组队 | 要自己拼 | **内置 Team 模式：roster / 消息 / 任务图** |
| agent 间共享状态 | 手搓 | **内置 Blackboard 知识图** |
| 接口对齐 | 口头约定 | **契约热同步，类型级保证** |
| 任务依赖管理 | 自己写 | **内置 TaskBoard DAG** |
| 工具生态 | 自己造 | **50+ 内置工具 + MCP + 插件** |

一句话：**别的框架给你积木，凌霄给你工地+施工队+图纸协同。**

## 能力分层

### 引擎层 — 单 agent 的全部力量

| 能力 | 入口 | 干什么 |
|---|---|---|
| LLM 客户端 | `createLLMClientFromConfig({ apiKey, baseUrl, model })` | 一行接上任意 Anthropic/OpenAI 兼容端点，内置 thinking、重试、熔断、token 计数 |
| LLM 客户端（高级） | `createLLMClient(snapshotId)` | 通过 ModelManager 创建 runtime snapshot，适合动态模型管理 |
| 工具系统 | `createToolRegistry()` | 一次性拿到 50+ 内置工具（shell/http/file/code_search/memory/...），也支持继承 `Tool` 自定义 |
| Agent 循环 | `createAgentLoop()` | 封装 reason → act → observe 闭环，自动处理 tool_calls、工具执行和结果回灌 |
| BaseAgent | `BaseAgent` 类 | 需要完整生命周期管理时继承它（含 maxIterations / 超时 / 事件） |

### 编排层 — 多 agent 怎么协同

| 能力 | 入口 | 干什么 |
|---|---|---|
| SessionManager | `SessionManager` | 会话级编排：一个会话里管多 agent、共享上下文、驱动循环 |
| TaskBoard | `TaskBoard` | 任务图：建任务、设依赖（blocked_by）、追踪状态、DAG 拓扑 |
| MessageBus | `createMessageBus()` / `getMessageBus()` | 进程内消息总线：agent 间异步通信、事件驱动 |
| EventEmitter | `createEventEmitter()` / `getEventEmitter()` | 事件系统：监听 agent 行为、工具调用、状态变化 |

### 协作层 — 凌霄的差异化

| 能力 | 入口 | 干什么 |
|---|---|---|
| Team 模式 | `team_manage` / `team_message` / `team_inbox` | 多 agent 组团：建 roster、P2P/广播消息、收件箱、任务转派 |
| Blackboard | `blackboard` 工具 | 共享知识图：多个 agent 往同一黑板写事实/意图/关系，互相依赖 |
| Contracts | `blackboard` contract/design_doc 节点 / `@lingxiao-office/sdk/core/index.js` 高级子路径 | 接口契约沉淀：普通 Agent 推荐写黑板，正式热同步能力属于高级 runtime |

### 记忆层 — 跨轮次、跨会话

| 能力 | 入口 | 干什么 |
|---|---|---|
| Memory | `memory` / `memory_read` / `memory_write` | 持久化记忆：agent 自己存发现、查线索，避免重复劳动 |
| Database | `DatabaseManager` | 会话/任务/消息持久化存储 |

### 扩展层 — 接入一切

| 能力 | 入口 | 干什么 |
|---|---|---|
| MCP | `mcp` 工具 | 接入任意 MCP server 的 tools/resources/prompts |
| 插件 | `plugins/` | 插件系统：贡献 skills/tools/MCP |
| Skills | `skill_names` | 领域知识注入：给 agent 绑定执行流程和约束 |

## 快速开始

```typescript
import { createAgentLoop, createLLMClientFromConfig, createToolRegistry } from '@lingxiao-office/sdk';

// ① 接上 LLM — 直接传 apiKey / baseUrl / model，无需配置文件或 ModelManager
const llm = createLLMClientFromConfig({
  apiKey: 'sk-...',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-opus-4-8',
  provider: 'anthropic', // OpenAI 兼容端点可不传，默认 'openai'
});

// ② 拿工具
const registry = createToolRegistry();
const tools = registry.getDefinitions();

// ③ 跑循环
const loop = createAgentLoop({
  llm,
  registry,
  model: 'claude-opus-4-8',
  tools,
  messages: [
    { role: 'system', content: '你是一个助手。' },
    { role: 'user', content: '帮我查一下当前目录有哪些文件。' },
  ],
  toolContext: {
    workspace: process.cwd(),
    permissionContext: { mode: 'yolo' },
  },
  maxRounds: 8,
});

const result = await loop.run();
console.log(result.finishReason, result.rounds);
```

`createLLMClientFromConfig()` 一行接上任意 LLM，直接传 `apiKey` / `baseUrl` / `model`。
`createAgentLoop()` 帮你处理 LLM 调用、tool_calls、工具执行和观察结果回灌。想要多 agent 组队、共享黑板、契约对齐？往下看各能力详解。

> **高级用法**：如果你需要动态管理多个模型，可以用 `getModelManager().createRuntimeSnapshot()` + `createLLMClient(snapshotId)`，详见 [API 参考](./api-reference.md)。

## 交互式多轮对话

`createAgentLoop` 每次调用处理一个完整的 reason → act → observe 循环。要实现 REPL 式交互式聊天，关键思路是：**在外层累积 `messages` 历史，每轮用户输入后新建一个 loop，把上一轮的 `result.messages` 替换回去。**

```typescript
import * as readline from 'node:readline';
import { createAgentLoop, createLLMClientFromConfig, createToolRegistry, contentToPlainText } from '@lingxiao-office/sdk';

const llm = createLLMClientFromConfig({
  apiKey: process.env.LX_API_KEY ?? 'sk-...',
  baseUrl: process.env.LX_BASE_URL ?? 'https://api.openai.com/v1',
  model: process.env.LX_MODEL ?? 'gpt-4o',
});

const registry = createToolRegistry();

// 外层维护完整对话历史
let messages: any[] = [
  { role: 'system', content: '你是一个能调用工具的助手。' },
];

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function chat() {
  rl.question('你 > ', async (input) => {
    if (input.trim() === 'exit') { rl.close(); return; }

    // 把用户输入追加到历史，然后新建 loop
    messages.push({ role: 'user', content: input });

    const loop = createAgentLoop({
      llm,
      registry,
      model: process.env.LX_MODEL ?? 'gpt-4o',
      messages,                // 传入累积的历史
      toolContext: { workspace: process.cwd(), permissionContext: { mode: 'yolo' } },
      maxRounds: 8,
      hooks: {
        onToolCall: ({ toolCall }) => console.log(`  [tool] ${toolCall.function.name}`),
        onRound: ({ text, toolCalls }) => {
          if (text && toolCalls.length === 0) console.log(`AI > ${text}`);
        },
      },
      // stream: true,  // 网关只支持 SSE 时启用
    });

    const result = await loop.run();

    // 用 loop 返回的完整历史替换外层 messages
    messages = result.messages;

    chat(); // 继续下一轮
  });
}

chat();
```

**要点：**

- `messages` 在外层用 `let` 声明，每轮结束后用 `result.messages` 替换——loop 内部会追加 assistant 回复和 tool 结果。
- 每轮用户新输入后**新建**一个 `createAgentLoop`，传入累积的 `messages`。loop 本身是无状态的。
- `hooks.onRound` 在每轮 LLM 响应后触发，`toolCalls.length === 0` 表示 agent 不再调工具、给出最终回复。
- 如果你的网关只支持 SSE 流式响应，取消 `stream: true` 注释即可，SDK 会自动切换到 `generateContentWithCallbacks` 路径。

> 完整可运行示例见 [`examples/interactive-chat/`](../examples/interactive-chat/)。

## createAgentLoop 的局限性与升级路径

### 无自动上下文压缩

`createAgentLoop` 是轻量 facade，**不包含**自动上下文压缩。每轮对话的 messages 会持续累积，当总 token 超过模型 context window 时会报错。

**应对方法（在交互式 REPL 中）：**

```typescript
// 简单策略：超过 N 轮时只保留 system + 最近 K 条消息
const MAX_HISTORY = 20;
if (messages.length > MAX_HISTORY + 1) {
  messages = [
    messages[0], // 保留 system prompt
    ...messages.slice(-(MAX_HISTORY)),
  ];
}
```

> 需要自动压缩、session 持久化和完整生命周期管理，使用 `SessionManager`（见下文）。

### 记忆工具共享 `~/.lingxiao/memory/`

`createToolRegistry()` 内置 `memory` / `memory_read` / `memory_write` 工具，读写路径为 `~/.lingxiao/memory/`。**多个进程或多个 loop 实例共用同一目录**，天然跨进程共享。

```typescript
// Agent A 写入
await registry.execute('memory', {
  action: 'save',
  name: 'project-notes',
  content: '发现了一个 API 性能瓶颈……',
  type: 'project',
  description: '性能分析笔记',
  scope: 'user',
}, { workspace: process.cwd() });

// Agent B（另一个进程）读取同一条记忆
const result = await registry.execute('memory_read', {
  action: 'load',
  name: 'project-notes',
  scope: 'user',
}, { workspace: process.cwd() });
```

配置和 skill 定义同样从 `~/.lingxiao/` 加载（模块导入时自动读取 `settings.json`）。

### 何时从 `createAgentLoop` 升级到 `SessionManager`

| 场景 | 推荐 |
|------|------|
| 单任务、脚本、中短对话（< 50 轮） | `createAgentLoop` |
| 交互式 REPL，需要手动管理历史 | `createAgentLoop` + 手动截断 |
| 长期对话、需要自动压缩上下文 | `SessionManager` |
| 多 Agent 协作（Team 模式） | `SessionManager` |
| 需要持久化 session 到数据库 | `SessionManager` |
| 需要 TaskBoard DAG、agent 生命周期管理 | `SessionManager` |

`SessionManager` 的装配成本更高（需要 `DatabaseManager`、`EventEmitter`、workspace），详见 [API 参考 § SessionManager](./api-reference.md#6-sessionmanager)。

## 文档索引

- [文档首页](./README.md) — 文档地图和推荐阅读路径
- [安装、导入与扩展开发](./package-consumption.md) — 局部/全局安装、package smoke、Web API extension
- [API 参考](./api-reference.md) — 真实导出、子路径、高级 runtime 与工具层入口
- [Team / Blackboard / DAG](./team-blackboard-dag.md) — 团队、黑板、任务 DAG 的概念和用法
- [Pentest Agent 教学示例](../examples/pentest-agent/) — 从单 agent 到团队协作的完整实战
