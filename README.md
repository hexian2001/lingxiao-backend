# Lingxiao Backend

凌霄后端 monorepo，包含两个可独立消费的 npm 包：

- **`@lingxiao-office/sdk`**：可复用 Agent 引擎，包含 LLM 客户端、ToolRegistry、`createAgentLoop`、Session/Team/Blackboard/DAG 等能力。
- **`@lingxiao-office/web-api`**：基于 SDK 的 HTTP / ACP / SSE / WebSocket 服务层，包含可扩展的 Web API extension surface。

## 安装

### 局部安装到自己的项目

```bash
npm install @lingxiao-office/sdk @lingxiao-office/web-api
```

### 全局安装 CLI / 服务包

```bash
npm install -g @lingxiao-office/web-api
```

安装后可使用 `lingxiao-web-api` bin 启动服务。

### 从源码编译开发

```bash
git clone https://github.com/hexian2001/lingxiao-office-sdk.git
cd lingxiao-office-sdk
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
npm install /path/to/lingxiao-office-sdk-1.0.1.tgz \
  /path/to/lingxiao-office-web-api-1.0.1.tgz
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

源码变化后重新构建：

```bash
cd /path/to/lingxiao_backend
npm run build
```

## 更新

### 更新 npm 包

```bash
# 局部安装的项目
npm update @lingxiao-office/sdk @lingxiao-office/web-api

# 或指定版本
npm install @lingxiao-office/sdk@latest @lingxiao-office/web-api@latest

# 全局安装的 CLI
npm update -g @lingxiao-office/web-api
```

### 从源码更新

```bash
cd /path/to/lingxiao_backend
git pull
npm install
npm run build
```

## SDK 快速开始

```ts
import {
  createAgentLoop,
  createLLMClientFromConfig,
  createToolRegistry,
} from '@lingxiao-office/sdk';

// ① 接上 LLM — 直接传 apiKey / baseUrl / model，无需配置文件
const llm = createLLMClientFromConfig({
  apiKey: 'sk-...',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-opus-4-8',
  provider: 'anthropic', // OpenAI 兼容端点可不传，默认 'openai'
});

// ② 拿工具 — 50+ 内置工具
const registry = createToolRegistry();

// ③ 跑循环 — 自动处理 LLM 调用 + tool_calls + 结果回灌
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
console.log(result.finishReason, result.rounds);
```

**`permissionContext.mode` 权限模式：**

| 模式 | 说明 | 适用场景 |
|---|---|---|
| `'yolo'` | 全部允许，无沙箱限制 | 开发/测试/教学 |
| `'dev'` | 允许本地操作，网络受限 | 本地开发 |
| `'networked'` | 允许白名单网络访问 | 生产环境 |
| `'strict'` | 最严格，需逐工具授权 | 高安全要求 |

## Web API 快速开始

```ts
import { createServer, startServer } from '@lingxiao-office/web-api';

// 独立创建并启动服务
const { fastify } = await createServer();
await startServer();
```

> **注意**：Web API 的 `createServer()` 会查找 `web/dist/index.html` 作为前端静态资源。
> 当前 npm 包只包含后端 API 服务，不包含前端 UI。
> 如果需要完整 Web UI，请使用 [lingxiao-coding](https://www.npmjs.com/package/@lingxiao-office/lingxiao-coding) 主项目。

## Web API Extension

```ts
import { defineWebApiExtension } from '@lingxiao-office/web-api/extension';

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

## 文档

- [SDK/Web API 文档地图](./docs/README.md)
- [安装、导入与扩展开发](./docs/package-consumption.md)
- [API Reference](./docs/api-reference.md)
- [NPM 发布指南](./docs/release-npm.md)
- [Pentest Agent 教学项目](./examples/pentest-agent/README.md)

## 验证

```bash
# 构建
npm run build

# 分层验证（SDK 不依赖 Web API）
npm run verify:layering

# 包消费验证（打包后按真实包名导入测试）
npm run verify:package-consumption
```

## License

MIT
