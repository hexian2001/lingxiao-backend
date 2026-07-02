import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contentToPlainText,
  createAgentLoop,
  ToolRegistry,
  type ChatMessage,
  type ChatResponse,
  type LLMClient,
} from '../index.js';

function createMockLlm(responses: ChatResponse[]): LLMClient {
  const queue = [...responses];
  return {
    async generateContent() {
      const response = queue.shift();
      if (!response) throw new Error('unexpected LLM call');
      return response;
    },
    async *generateContentStream() {
      const response = queue.shift();
      if (!response) throw new Error('unexpected LLM stream call');
      return response;
    },
    async generateContentWithCallbacks() {
      const response = queue.shift();
      if (!response) throw new Error('unexpected LLM callback call');
      return response;
    },
    async countTokens() {
      return { totalTokens: 0 };
    },
    async close() {},
  };
}

function createRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register({
    name: 'echo',
    description: 'Echoes input text',
    schema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
      additionalProperties: false,
    },
    async execute(args: unknown) {
      return { success: true, data: { echoed: (args as { text?: string }).text ?? '' } };
    },
  });
  registry.register({
    name: 'fail',
    description: 'Returns a tool error',
    schema: { type: 'object', properties: {}, additionalProperties: false },
    async execute() {
      return { success: false, data: null, error: 'boom' };
    },
  });
  return registry;
}

test('contentToPlainText handles string and array content from main SDK entry', () => {
  assert.equal(contentToPlainText('plain text'), 'plain text');
  assert.equal(
    contentToPlainText([
      { type: 'text', text: 'hello' },
      { type: 'text', text: 'world' },
    ]),
    'hello\nworld',
  );
});

test('createAgentLoop executes tool_calls and replays assistant/tool messages', async () => {
  const registry = createRegistry();
  const toolCall = {
    id: 'call_echo',
    type: 'function' as const,
    function: { name: 'echo', arguments: JSON.stringify({ text: 'hi' }) },
  };
  const llm = createMockLlm([
    { content: [{ type: 'text', text: 'calling tool' }], tool_calls: [toolCall] },
    { content: 'done' },
  ]);
  const toolResults: string[] = [];

  const result = await createAgentLoop({
    llm,
    registry,
    model: 'mock-model',
    messages: [{ role: 'user', content: 'start' }],
    maxRounds: 2,
    done: ({ text }) => text === 'done',
    hooks: {
      onToolResult: ({ message }) => toolResults.push(String(message.content)),
    },
  }).run();

  assert.equal(result.finishReason, 'done');
  assert.equal(result.rounds, 2);
  assert.equal(result.messages[1]?.role, 'assistant');
  assert.equal(result.messages[1]?.tool_calls?.[0], toolCall);
  assert.equal(result.messages[2]?.role, 'tool');
  assert.equal(result.messages[2]?.tool_call_id, 'call_echo');
  assert.equal(result.messages[2]?.content, '{"echoed":"hi"}');
  assert.deepEqual(toolResults, ['{"echoed":"hi"}']);
});

test('createAgentLoop replays tool errors as tool messages', async () => {
  const registry = createRegistry();
  const llm = createMockLlm([
    {
      content: 'will fail',
      tool_calls: [{
        id: 'call_fail',
        type: 'function',
        function: { name: 'fail', arguments: '{}' },
      }],
    },
  ]);

  const result = await createAgentLoop({
    llm,
    registry,
    model: 'mock-model',
    messages: [{ role: 'user', content: 'start' }],
    maxRounds: 1,
  }).run();

  assert.equal(result.finishReason, 'max_rounds');
  const toolMessage = result.messages.find((message): message is ChatMessage => message.role === 'tool');
  assert.equal(toolMessage?.tool_call_id, 'call_fail');
  assert.match(String(toolMessage?.content), /ERROR: boom/);
});

test('createAgentLoop stops on done predicate before executing tools', async () => {
  const registry = createRegistry();
  let called = false;
  registry.register({
    name: 'should_not_run',
    description: 'Should not execute when done predicate matches',
    schema: { type: 'object', properties: {}, additionalProperties: false },
    async execute() {
      called = true;
      return { success: true, data: 'unexpected' };
    },
  });

  const llm = createMockLlm([
    {
      content: 'DONE sentinel',
      tool_calls: [{
        id: 'call_skip',
        type: 'function',
        function: { name: 'should_not_run', arguments: '{}' },
      }],
    },
  ]);

  const result = await createAgentLoop({
    llm,
    registry,
    model: 'mock-model',
    messages: [{ role: 'user', content: 'start' }],
    done: ({ text }) => text.includes('DONE'),
  }).run();

  assert.equal(result.finishReason, 'done');
  assert.equal(result.rounds, 1);
  assert.equal(called, false);
  assert.equal(result.messages.some((message) => message.role === 'tool'), false);
});


test('createAgentLoop surfaces hooks and captures thrown tool errors', async () => {
  const registry = createRegistry();
  registry.register({
    name: 'thrower',
    description: 'Throws at execution time',
    schema: { type: 'object', properties: {}, additionalProperties: false },
    async execute() {
      throw new Error('thrown boom');
    },
  });

  const toolCall = {
    id: 'call_throw',
    type: 'function' as const,
    function: { name: 'thrower', arguments: '{}' },
  };
  const llm = createMockLlm([
    {
      content: [{ type: 'text', text: 'thinking then tool' }],
      thinking: [{ type: 'thinking', text: 'reasoning', signature: 'sig' }],
      tool_calls: [toolCall],
    },
  ]);
  const events: string[] = [];

  const result = await createAgentLoop({
    llm,
    registry,
    model: 'mock-model',
    messages: [{ role: 'user', content: 'start' }],
    maxRounds: 1,
    hooks: {
      onThinking: ({ thinking }) => events.push(`thinking:${thinking}`),
      onMessage: ({ message }) => events.push(`message:${message.role}`),
      onToolCall: ({ toolCall: call }) => events.push(`tool:${call.function.name}`),
      onToolResult: ({ result }) => events.push(`result:${result.success}`),
      onRound: ({ toolCalls }) => events.push(`round:${toolCalls.length}`),
    },
  }).run();

  assert.equal(result.finishReason, 'max_rounds');
  assert.deepEqual(events, [
    'thinking:reasoning',
    'message:assistant',
    'tool:thrower',
    'message:tool',
    'result:false',
    'round:1',
  ]);
  const toolMessage = result.messages.find((message): message is ChatMessage => message.role === 'tool');
  assert.equal(toolMessage?.tool_call_id, 'call_throw');
  assert.match(String(toolMessage?.content), /thrown boom/);
});
