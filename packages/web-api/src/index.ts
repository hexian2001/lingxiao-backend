/**
 * @lingxiao-office/web-api — 库入口
 *
 * 基于 @lingxiao-office/sdk 的 HTTP / ACP / SSE / WebSocket 服务层。
 * 供各产品线以库方式嵌入消费：
 *
 *   import { createServer, startServer } from '@lingxiao-office/web-api';
 *   const { fastify, token } = await createServer();
 *   await fastify.listen({ host: '127.0.0.1', port: 3000 });
 *
 * 或直接启动带端口回退 / 端口文件 / watchdog 的完整守护进程：
 *
 *   import { startServer } from '@lingxiao-office/web-api';
 *   await startServer();
 */

export {
  createServer,
  createServerWithDeps,
  startServer,
  findAvailablePort,
  readPortFile,
  writePortFile,
  removePortFile,
  warnIfInsecureHostBinding,
  shouldExemptFromRateLimit,
  type CreateServerWithDepsOptions,
} from './server.js';

export {
  WebApiRouteRegistry,
  defineWebApiExtension,
  type WebApiExtension,
  type WebApiExtensionContext,
} from './web-server/ExtensionRegistry.js';
