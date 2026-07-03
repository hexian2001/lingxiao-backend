# @lingxiao-office/web-api

凌霄剑域 Web API：基于 `@lingxiao-office/sdk` 的 HTTP/ACP/SSE/WebSocket 服务层，供各产品线通过 Web 协议消费后端引擎。

## 安装

```bash
npm install @lingxiao-office/web-api
```

## 快速开始

```ts
import {
  createServer,
  createServerWithDeps,
  startServer,
} from '@lingxiao-office/web-api';

// 独立创建完整服务
const server = await createServer();
await startServer(server, { port: 8080 });
```

## 复用已有依赖嵌入宿主进程

```ts
import { createServerWithDeps } from '@lingxiao-office/web-api';

const server = await createServerWithDeps({
  database: existingDb,
  sessionManager: existingSessionManager,
  extensions: [myExtension],
});
```

## Web API Extension

不修改 `server.ts` 即可挂载业务 route：

```ts
import {
  defineWebApiExtension,
  WebApiRouteRegistry,
} from '@lingxiao-office/web-api/extension';

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

## CLI

```bash
npx lingxiao-web-api
# 或全局安装后
npm install -g @lingxiao-office/web-api
lingxiao-web-api
```

## 文档

- [完整文档](https://github.com/hexian2001/lingxiao-backend/tree/main/docs)
- [安装、导入与扩展开发](https://github.com/hexian2001/lingxiao-backend/blob/main/docs/package-consumption.md)
- [NPM 发布指南](https://github.com/hexian2001/lingxiao-backend/blob/main/docs/release-npm.md)

## License

MIT
