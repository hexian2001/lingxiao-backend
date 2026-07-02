/**
 * interactive-chat — 交互式多轮对话 REPL
 *
 * 展示如何用 createAgentLoop 实现持续交互：
 * - messages 历史在外层累积，每轮新建 loop
 * - hooks 展示工具调用和 assistant 输出
 * - 支持 stream 模式（注释说明）
 *
 * 运行：cd examples/interactive-chat && npm start
 * 退出：输入 exit
 */
import * as readline from 'node:readline';
import {
  createAgentLoop,
  createLLMClientFromConfig,
  createToolRegistry,
  contentToPlainText,
  type ChatMessage,
} from '@lingxiao-office/sdk';

const apiKey = process.env.LX_API_KEY ?? 'sk-...';
const baseUrl = process.env.LX_BASE_URL ?? 'https://api.openai.com/v1';
const model = process.env.LX_MODEL ?? 'gpt-4o';

const llm = createLLMClientFromConfig({ apiKey, baseUrl, model });
const registry = createToolRegistry();

// 外层维护完整对话历史
let messages: ChatMessage[] = [
  { role: 'system', content: '你是一个能调用工具的助手。用中文回答。' },
];

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask() {
  rl.question('你 > ', async (input) => {
    const trimmed = input.trim();
    if (trimmed === 'exit') { console.log('再见！'); rl.close(); return; }
    if (!trimmed) { ask(); return; }

    messages.push({ role: 'user', content: trimmed });

    const loop = createAgentLoop({
      llm,
      registry,
      model,
      messages, // 传入累积的历史
      toolContext: { workspace: process.cwd(), permissionContext: { mode: 'yolo' } },
      maxRounds: 8,
      hooks: {
        onToolCall: ({ toolCall }) => console.log(`  🔧 ${toolCall.function.name}`),
        onRound: ({ text, toolCalls }) => {
          if (text && toolCalls.length === 0) console.log(`AI > ${text}`);
        },
      },
      // stream: true,  // 网关只支持 SSE 时启用
    });

    const result = await loop.run();
    messages = result.messages; // 关键：用 loop 返回的完整历史替换

    if (result.finishReason === 'error') {
      console.log(`  ⚠️ 出错: ${result.error}`);
    }
    ask(); // 继续下一轮
  });
}

console.log('🤖 凌霄交互式对话（输入 exit 退出）\n');
ask();
