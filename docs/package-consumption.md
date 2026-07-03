# 安装、导入与扩展开发

本文面向外部开发者，说明如何把 `@lingxiao-office/sdk` 和 `@lingxiao-office/web-api` 当作普通 npm 包消费：本地安装、全局安装、导入 SDK facade、嵌入 Web API 服务，以及注册 Web API extension。

## 安装方式

### 局部安装到项目

```bash
npm install @lingxiao-office/sdk @lingxiao-office/web-api
```

适合把凌霄能力嵌入自己的 CLI、服务端或产品后端。

### 全局安装 CLI / 服务包

```bash
npm install -g @lingxiao-office/web-api
```

安装后可使用 `lingxiao-web-api` bin 启动服务。库开发仍推荐局部安装。

### 更新已安装的包

```bash
# 局部安装的项目
npm update @lingxiao-office/sdk @lingxiao-office/web-api

# 或指定版本
npm install @lingxiao-office/sdk@latest @lingxiao-office/web-api@latest

# 全局安装的 CLI
npm update -g @lingxiao-office/web-api
```

### 从源码编译开发

```bash
git clone https://github.com/hexian2001/lingxiao-backend.git
cd lingxiao-backend
npm install
npm run build
```

### 从源码打包后安装

```bash
npm install
npm run build
npm pack ./packages/sdk
npm pack ./packages/web-api

cd /path/to/your-app
npm install /path/to/lingxiao-office-sdk-1.0.8.tgz \
  /path/to/lingxiao-office-web-api-1.0.8.tgz
```

### 源码联调开发（npm link）

```bash
cd /path/to/lingxiao_backend
npm install
npm run build

cd packages/sdk
npm link

cd ../web-api
npm link

cd /path/to/your-app
npm link @lingxiao-office/sdk @lingxiao-office/web-api
```

源码变化后回到仓库根目录重新构建：

```bash
npm run build
```

### 本仓库本地 tgz 验证

开发本仓库时可以先构建并运行离线安装 smoke：

```bash
npm run verify:package-consumption
```

该脚本会：

1. 构建 `@lingxiao-office/sdk` 和 `@lingxiao-office/web-api`。
2. 对两个 workspace 包执行 `npm pack`。
3. 在临时 consumer 项目中展开 tarball。
4. 按真实包名导入主入口和 Web API extension 子入口。
5. 注册一个临时 extension route 并用 Fastify inject 验证返回 200。

默认不会访问 npm registry，也不会污染全局 npm 环境。

## SDK：主入口导入

```ts
import {
  createAgentLoop,
  createLLMClientFromConfig,
  createToolRegistry,
  contentToPlainText,
} from '@lingxiao-office/sdk';
```

推荐从主入口使用稳定 facade：

- `createLLMClientFromConfig({ apiKey, baseUrl, model })`：一行接上任意 LLM，直接传配置，无需 settings.json。
- `createAgentLoop`：封装 LLM 调用、tool_calls 执行、tool result 回灌和 done predicate。
- `createToolRegistry`：注册 SDK 内置工具并导出工具定义。
- `contentToPlainText`：把 LLM 返回的 string / content parts / null 统一转成文本。

最小结构：

```ts
const llm = createLLMClientFromConfig({
  apiKey: 'sk-...',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-opus-4-8',
  provider: 'anthropic', // OpenAI 兼容端点可不传，默认 'openai'
});
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
  // done 可不传 — agent 自己决定何时停
});

const result = await loop.run();
```

业务 prompt、完成标记、报告格式、错误退避策略仍应留在应用层。

### 何时启用 `stream: true`

当你的 LLM 网关**只支持 SSE 流式响应**时（例如某些本地代理或自建 inference gateway 不提供非流式 `/v1/chat/completions`），需要设置 `stream: true`：

```ts
const loop = createAgentLoop({
  // ...其他参数
  stream: true,  // SDK 自动切换到 generateContentWithCallbacks 路径
});
```

默认 `stream: false` 使用标准 `generateContent`，适用于 Anthropic 官方 API、OpenAI 官方 API 及大多数兼容端点。

### 交互式 REPL 模式最小结构

`createAgentLoop` 是无状态的——每次调用处理一个完整循环。要实现多轮交互式聊天，只需在外层维护 `messages` 历史：

```ts
let messages = [{ role: 'system', content: '你是一个助手。' }];

// 每轮用户输入后：
// 1. 把 user 消息追加到 messages
// 2. 新建 loop，传入 messages
// 3. 用 result.messages 替换外层 messages
const loop = createAgentLoop({ llm, registry, model, messages });
const result = await loop.run();
messages = result.messages;  // 关键：历史由 loop 返回
```

完整可运行示例见 [`examples/interactive-chat/`](../examples/interactive-chat/)。

> **高级用法**：如果你需要动态管理多个模型，可用 `getModelManager().createRuntimeSnapshot()` + `createLLMClient(snapshotId)`，详见 [API 参考](./api-reference.md)。

## Web API：服务入口导入

```ts
import {
  createServer,
  createServerWithDeps,
  startServer,
} from '@lingxiao-office/web-api';
```

- `createServer()`：独立创建完整 Web API 服务（会自动创建 DB、SessionManager 等内部依赖）。
- `createServerWithDeps(...)`：复用已有 DB / SessionManager，适合集成到宿主进程。
- `startServer()`：按包内 daemon/CLI 逻辑启动服务（读取配置、绑定端口、写端口文件）。

> **注意**：Web API 的 `createServer()` 会查找 `web/dist/index.html` 作为前端静态资源。
> 当前 npm 包只包含后端 API 服务，不包含前端 UI。
> 如果需要完整 Web UI，请使用 [lingxiao-coding](https://www.npmjs.com/package/@lingxiao-office/lingxiao-coding) 主项目。

## Web API extension

Web API extension 用于在不修改 `server.ts` 的情况下挂载业务 route。

主入口导入：

```ts
import {
  WebApiRouteRegistry,
  defineWebApiExtension,
} from '@lingxiao-office/web-api';
```

稳定子入口导入：

```ts
import {
  WebApiRouteRegistry,
  defineWebApiExtension,
} from '@lingxiao-office/web-api/extension';
```

定义 extension：

```ts
const helloExtension = defineWebApiExtension({
  name: 'hello-extension',
  register(context) {
    context.fastify.get('/api/v1/hello', async (request, reply) => {
      if (!context.requireServerToken(request, reply)) return;
      return { ok: true, activeSessionId: context.getActiveSessionId() };
    });
  },
});
```

然后把 extension 传给 `createServerWithDeps` 的 `extensions` 选项。
