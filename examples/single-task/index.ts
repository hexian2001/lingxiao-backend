/**
 * single-task — 最简单的单任务 Agent
 *
 * 用 createAgentLoop 让 Agent 检查当前工作目录有哪些文件，
 * 展示 SDK 最小闭环：接 LLM → 拿工具 → 跑循环。
 *
 * 运行：cd examples/single-task && npm start
 */
import { createAgentLoop, createLLMClientFromConfig, createToolRegistry } from '@lingxiao-office/sdk';

const apiKey = process.env.LX_API_KEY ?? 'sk-...';
const baseUrl = process.env.LX_BASE_URL ?? 'https://api.openai.com/v1';
const model = process.env.LX_MODEL ?? 'gpt-4o';

// ① 接上 LLM — 直接传 apiKey / baseUrl / model
const llm = createLLMClientFromConfig({ apiKey, baseUrl, model });

// ② 拿工具注册表（50+ 内置工具，含 file_read / list_dir / shell 等）
const registry = createToolRegistry();

// ③ 跑循环 — 让 Agent 自己用工具检查工作目录
const loop = createAgentLoop({
  llm,
  registry,
  model,
  messages: [
    { role: 'system', content: '你是一个文件检查助手。请使用工具完成任务并报告结果。' },
    { role: 'user', content: '请检查当前工作目录有哪些文件和子目录，简要列出。' },
  ],
  toolContext: {
    workspace: process.cwd(),
    permissionContext: { mode: 'yolo' },
  },
  maxRounds: 5,
  hooks: {
    onToolCall: ({ toolCall }) => console.log(`  🔧 调用工具: ${toolCall.function.name}`),
  },
});

const result = await loop.run();

console.log(`\n✅ 完成！轮次: ${result.rounds}, 结束原因: ${result.finishReason}`);

// 取最后一条 assistant 消息的文本作为最终回复
const lastAssistant = [...result.messages].reverse().find(m => m.role === 'assistant');
if (lastAssistant && typeof lastAssistant.content === 'string') {
  console.log(`\nAgent 回复:\n${lastAssistant.content}`);
}
