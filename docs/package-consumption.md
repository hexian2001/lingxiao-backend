# 安装、导入与扩展开发

本文面向外部开发者，说明如何把 `@lingxiao-office/sdk` 和 `@lingxiao-office/web-api` 当作普通 npm 包消费：本地安装、全局安装、导入 SDK facade、嵌入 Web API 服务，以及注册 Web API extension。

## 安装方式

### 局部安装到项目

```bash
npm install @lingxiao-office/sdk @lingxiao-office/web-api
```

适合把凌霄能力嵌入自己的 CLI、服务端或产品后端。

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

### 全局安装

如果你要验证 CLI / bin 入口，可以在本地打包后手动全局安装：

```bash
npm pack ./packages/sdk
npm pack ./packages/web-api
npm install -g ./lingxiao-sdk-1.0.0.tgz ./lingxiao-web-api-1.0.0.tgz
```

全局安装适合验证 `lingxiao-web-api` bin 是否进入 PATH；库开发仍推荐局部安装。

### 从源码编译开发

```bash
git clone <your-lingxiao-backend-repo-url>
cd lingxiao_backend
npm install
npm run build
npm run verify:layering
npm run verify:package-consumption
```

### 从源码打包后安装

```bash
npm install
npm run build
npm pack ./packages/sdk
npm pack ./packages/web-api

cd /path/to/your-app
npm install /path/to/lingxiao_backend/lingxiao-sdk-1.0.0.tgz \
  /path/to/lingxiao_backend/lingxiao-web-api-1.0.0.tgz
```

### 源码联调开发

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

源码变化后回到仓库根目录重新执行：

```bash
npm run build
```

## SDK：主入口导入

```ts
import {
  contentToPlainText,
  createAgentLoop,
  createLLMClient,
  createToolRegistry,
} from '@lingxiao-office/sdk';
```

推荐从主入口使用稳定 facade：

- `contentToPlainText`：把 LLM 返回的 string / content parts / null 统一转成文本。
- `createAgentLoop`：封装 LLM 调用、tool_calls 执行、tool result 回灌和 done predicate。
- `createLLMClient`：创建 LLM client。
- `createToolRegistry`：注册 SDK 内置工具并导出工具定义。

最小结构：

```ts
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

业务 prompt、完成标记、报告格式、错误退避策略仍应留在应用层。

## Web API：服务入口导入

```ts
import {
  createServer,
  createServerWithDeps,
  startServer,
} from '@lingxiao-office/web-api';
```

- `createServer()`：独立创建完整 Web API 服务。
- `createServerWithDeps(...)`：复用已有 DB / SessionManager，适合集成到宿主进程。
- `startServer()`：按包内 daemon/CLI 逻辑启动服务。

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

传给 Web API：

```ts
await createServerWithDeps(db, sessionManager, {
  extensions: [helloExtension],
});
```

`WebApiExtensionContext` 当前包含：

- `fastify`
- `requireServerToken`
- `sessionManager`
- `repos`
- `getActiveSessionId`
- `connectionManager`
- `eventEmitter`

约束：

- 非公开 route 应调用 `requireServerToken`。
- 不要从 extension 直接导入 Web API 内部 server 全局状态。
- Extension 注册顺序按数组顺序保留。
- Browser screencast WebSocket auth 是独立安全审查项，不应由 extension facade 隐式绕过。

## 验证清单

开发者接入前建议跑：

```bash
npm run build
npm run verify:layering
npm run verify:package-consumption
```

这三项分别证明：

- SDK 和 Web API 都能编译。
- SDK 不依赖 Web API，Web API 正向依赖 SDK。
- 打包后可按真实 npm 包名导入，并可注册 Web API extension route。
