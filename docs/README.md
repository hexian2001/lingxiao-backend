# @lingxiao-office/sdk 文档

`@lingxiao-office/sdk` 是凌霄后端拆分后的可复用 Agent 引擎包：它包含 LLM 客户端、工具系统、Agent loop、会话编排、Team 协作、Blackboard 知识图和 TaskBoard DAG。SDK 不依赖 Web API，可以嵌入 CLI、服务端、教学项目或你自己的产品线。

> 本版文档聚焦外部开发者最常用且已在源码中确认的能力：LLM、ToolRegistry、Agent loop、SessionManager、Team、Blackboard、TaskBoard DAG 与 Contracts。无人值守/工作流相关内部能力不作为本版展示重点。

## 文档地图

| 文档 | 适合谁 | 内容 |
| --- | --- | --- |
| [快速开始](./getting-started.md) | 第一次接入 SDK 的开发者 | SDK 能力概览、最小 createAgentLoop + ToolRegistry loop |
| [安装、导入与扩展开发](./package-consumption.md) | 要把包装进自己项目的开发者 | 局部/全局安装、从源码编译开发、npm pack、本地消费 smoke、Web API extension |
| [API Reference](./api-reference.md) | 要写代码集成 SDK/Web API 的开发者 | 真实导出、子路径导入、签名、示例、注意事项 |
| [Team / Blackboard / DAG](./team-blackboard-dag.md) | 要构建多 Agent 协作的开发者 | Team 模式、黑板知识图、TaskBoard DAG 的概念和推荐用法 |
| [Pentest Agent 教学项目](../examples/pentest-agent/README.md) | 想看完整可运行示例的开发者 | 用 SDK 内置工具构建安全评估/CTF Agent，展示 Team/Blackboard/DAG 风格编排 |
| [NPM 发布指南](./release-npm.md) | 要把包发布到 npm 的维护者 | npm 登录、组织创建、预检、dry-run、正式发布和验证安装 |

## 推荐阅读路径

1. 先看 [快速开始](./getting-started.md)，理解 SDK 的能力分层。
2. 再看 [安装、导入与扩展开发](./package-consumption.md)，确认局部安装、全局安装和 package smoke 路线。
3. 再看 [API Reference](./api-reference.md)，按真实导出选择主入口或子路径导入。
4. 如果要做多 Agent 协作，看 [Team / Blackboard / DAG](./team-blackboard-dag.md)。
5. 最后运行 [Pentest Agent 教学项目](../examples/pentest-agent/README.md)，观察真实工具调用、证据保存和报告生成。

## 安装与导入

```bash
npm install @lingxiao-office/sdk @lingxiao-office/web-api
```

主入口只导出经过确认的稳定 API：

```ts
import {
  contentToPlainText,
  createAgentLoop,
  createLLMClient,
  createToolRegistry,
  Tool,
  TaskBoard,
  MessageBus,
  SessionManager,
} from '@lingxiao-office/sdk';
```

部分高级 runtime 能力通过 package `exports` 的 `./*` 子路径访问，例如：

```ts
import { createContentGenerator } from '@lingxiao-office/sdk/llm/ContentGenerator.js';
import { AgentRoundExecutor } from '@lingxiao-office/sdk/agents/AgentRoundExecutor.js';
import { AgentCore } from '@lingxiao-office/sdk/agents/runtime/AgentCore.js';
```

## 公共 API 边界

- **推荐优先使用主入口**：`@lingxiao-office/sdk` 暴露 LLM、工具系统、基础 core、SessionManager 与 contracts 类型。
- **子路径是高级 API**：适合需要精确控制 agent loop 或 runtime 装配的开发者；升级时请关注 changelog。
- **Team/Blackboard 推荐走工具层**：外部 Agent 常规入口是 `ToolRegistry` 中的 `team_manage`、`team_message`、`team_inbox`、`blackboard`，而不是直接操作内部 mailbox/graph 对象。
- **Web API 是独立服务包**：HTTP/SSE/WebSocket 服务层属于 `@lingxiao-office/web-api`，可从主入口导入 `createServer` / `createServerWithDeps` / `startServer`。
- **Web API extension 可稳定导入**：需要挂业务 route 时，从 `@lingxiao-office/web-api` 或 `@lingxiao-office/web-api/extension` 导入 `WebApiRouteRegistry`、`defineWebApiExtension`，并通过 `createServerWithDeps` 的 extensions 选项注册。
- **安装消费可本地验证**：运行 `npm run verify:package-consumption` 会打包 SDK/Web API 到临时 consumer，并按真实包名导入验证。
