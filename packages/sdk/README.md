# @lingxiao-office/sdk

凌霄剑域可复用 Agent 引擎 SDK：编排内核、Agent 运行时、LLM 客户端、工具系统、记忆系统。不依赖 Web API，可直接嵌入任意产品线。

## 安装

```bash
npm install @lingxiao-office/sdk
```

## 快速开始

```ts
import {
  contentToPlainText,
  createAgentLoop,
  createLLMClient,
  createToolRegistry,
} from '@lingxiao-office/sdk';

const llm = createLLMClient(runtimeSnapshot);
const registry = createToolRegistry();

const loop = createAgentLoop({
  llm,
  registry,
  model: 'claude-opus-4-8',
  messages: [
    { role: 'system', content: 'You are a helpful agent.' },
    { role: 'user', content: 'Inspect the workspace.' },
  ],
  toolContext: {
    workspace: process.cwd(),
    permissionContext: { mode: 'yolo' },
  },
  done: ({ text }) => text.includes('DONE'),
});

const result = await loop.run();
```

## 核心能力

| 能力 | 入口 | 说明 |
|---|---|---|
| LLM 客户端 | `createLLMClient()` | 接 Anthropic/OpenAI 兼容端点，内置 thinking、重试、token 计数 |
| 工具系统 | `createToolRegistry()` | 50+ 内置工具（shell/http/file/code_search/memory/...） |
| Agent 循环 | `createAgentLoop()` | 封装 LLM 调用 + tool_calls 执行 + 结果回灌 + done 判断 |
| 文本提取 | `contentToPlainText()` | 把 LLM 返回统一转成纯文本 |
| 会话管理 | `SessionManager` | 会话级编排：多 agent、共享上下文 |
| 任务图 | `TaskBoard` | 任务 DAG：建任务、设依赖、追踪状态 |
| 消息总线 | `MessageBus` | 进程内异步通信 |
| Team 协作 | `team_manage` / `team_message` / `team_inbox` | 多 agent 组团、P2P/广播消息 |
| Blackboard | `blackboard` 工具 | 共享知识图：多 agent 往同一黑板写事实 |
| 记忆系统 | `memory` / `memory_read` / `memory_write` | 持久化记忆 |
| MCP | `mcp` 工具 | 接入任意 MCP server 的 tools/resources/prompts |

## 子路径导入

部分高级 runtime 能力通过子路径访问：

```ts
import { createContentGenerator } from '@lingxiao-office/sdk/llm/ContentGenerator.js';
import { AgentRoundExecutor } from '@lingxiao-office/sdk/agents/AgentRoundExecutor.js';
import { AgentCore } from '@lingxiao-office/sdk/agents/runtime/AgentCore.js';
```

## 文档

- [完整文档](https://github.com/lingxiao-office/lingxiao-backend/tree/main/docs)
- [API Reference](https://github.com/lingxiao-office/lingxiao-backend/blob/main/docs/api-reference.md)
- [Team / Blackboard / DAG](https://github.com/lingxiao-office/lingxiao-backend/blob/main/docs/team-blackboard-dag.md)
- [Pentest Agent 教学项目](https://github.com/lingxiao-office/lingxiao-backend/tree/main/examples/pentest-agent)

## License

MIT
