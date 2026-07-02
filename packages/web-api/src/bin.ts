#!/usr/bin/env node
/**
 * @lingxiao-office/web-api CLI 启动器
 *
 * 全局安装后可直接运行：
 *   npm i -g @lingxiao-office/web-api
 *   lingxiao-web-api          # 启动服务（含端口回退 / 端口文件 / watchdog）
 *
 * 环境变量：
 *   LINGXIAO_WEB_PORT   显式指定端口（0 或未设置则走配置 / 随机端口）
 */
import { startServer } from './server.js';

startServer().catch((err: unknown) => {
  // 启动失败必须 fail-loud：否则守护进程会静默退出，调用方无从排查。
  console.error('[lingxiao-web-api] 启动失败:', err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
