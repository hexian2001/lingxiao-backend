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

## 文档索引

- [文档首页](./README.md) — 文档地图和推荐阅读路径
- [安装、导入与扩展开发](./package-consumption.md) — 局部/全局安装、package smoke、Web API extension
- [API 参考](./api-reference.md) — 真实导出、子路径、高级 runtime 与工具层入口
- [Team / Blackboard / DAG](./team-blackboard-dag.md) — 团队、黑板、任务 DAG 的概念和用法
- [Pentest Agent 教学示例](../examples/pentest-agent/) — 从单 agent 到团队协作的完整实战
