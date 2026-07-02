# Lingxiao Backend

凌霄后端 monorepo，包含两个可独立消费的包：

- `@lingxiao-office/sdk`：可复用 Agent 引擎，包含 LLM client、ToolRegistry、`createAgentLoop`、Session/Team/Blackboard/DAG 等能力。
- `@lingxiao-office/web-api`：基于 SDK 的 HTTP / ACP / SSE / WebSocket 服务层，包含可扩展的 Web API extension surface。

## 一键给外部开发者的安装命令

### 局部安装到自己的项目

```bash
npm install @lingxiao-office/sdk @lingxiao-office/web-api
```

适合在自己的 Node 服务、CLI 或产品后端中开发 Agent 和 Web API extension。

### 全局安装 CLI / 服务包

```bash
npm install -g @lingxiao-office/web-api
```

安装后可使用 `lingxiao-web-api` bin。库开发仍建议局部安装。

## 从源码编译开发

```bash
git clone <your-lingxiao-backend-repo-url>
cd lingxiao_backend
npm install
npm run build
npm run verify:layering
npm run verify:package-consumption
```

这些命令会验证：

- SDK 和 Web API 都能编译。
- SDK 不依赖 Web API，Web API 正向依赖 SDK。
- 两个包能被真实打包并在临时 consumer 项目中按包名导入。
- Web API extension route 能注册并返回 200。

## 从源码打包后安装

用于发版前或没有发布到 registry 时的本地安装验证。

```bash
npm install
npm run build
npm pack ./packages/sdk
npm pack ./packages/web-api

# 局部安装到你的应用
cd /path/to/your-app
npm install /path/to/lingxiao_backend/lingxiao-sdk-1.0.0.tgz \
  /path/to/lingxiao_backend/lingxiao-web-api-1.0.0.tgz

# 或全局安装 CLI / 服务包
npm install -g /path/to/lingxiao_backend/lingxiao-web-api-1.0.0.tgz
```

## 源码联调开发

适合你正在同时改凌霄包和外部应用。

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

改源码后重新构建：

```bash
cd /path/to/lingxiao_backend
npm run build
```

## SDK 最小导入

```ts
import {
  contentToPlainText,
  createAgentLoop,
  createLLMClient,
  createToolRegistry,
} from '@lingxiao-office/sdk';
```

`createAgentLoop` 负责 LLM 调用、tool calls、工具执行和结果回灌；业务 prompt、完成条件、报告格式仍由应用层控制。

## Web API 最小导入

```ts
import {
  createServer,
  createServerWithDeps,
  startServer,
} from '@lingxiao-office/web-api';
```

## Web API extension 最小导入

```ts
import {
  defineWebApiExtension,
  WebApiRouteRegistry,
} from '@lingxiao-office/web-api/extension';
```

示例：

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

然后把 extension 传给 Web API server 的 extensions 选项。

## 文档

- [SDK/Web API 文档地图](./docs/README.md)
- [安装、导入与扩展开发](./docs/package-consumption.md)
- [API Reference](./docs/api-reference.md)
- [NPM 发布指南](./docs/release-npm.md)
- [Pentest Agent 教学项目](./examples/pentest-agent/README.md)
