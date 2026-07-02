import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIContentGenerator } from './OpenAIContentGenerator.js';

function makeGenerator(name: string): OpenAIContentGenerator {
  return new OpenAIContentGenerator({
    modelId: name,
    apiModelName: name,
    provider: 'openai',
    apiKey: 'test-key',
    baseUrl: `https://${name}.example.invalid/v1`,
  });
}

/**
 * Stub client.chat.completions.create with a handler that inspects the request body.
 * The handler receives the request params and returns a fake response.
 * This allows tests to differentiate streaming vs non-streaming calls.
 */
function stubCreateWithHandler(
  generator: OpenAIContentGenerator,
  handler: (params: Record<string, unknown>) => unknown,
): void {
  const mutable = generator as unknown as {
    client: {
      chat: {
        completions: {
          create: (params: Record<string, unknown>) => Promise<unknown>;
        };
      };
    };
  };
  mutable.client = {
    chat: {
      completions: {
        create: async (params: Record<string, unknown>) => handler(params),
      },
    },
  };
}

/**
 * Stub client.chat.completions.create to always return the same response
 * (legacy helper for simple tests).
 */
function stubCreate(generator: OpenAIContentGenerator, response: unknown): void {
  stubCreateWithHandler(generator, () => response);
}

/**
 * Build a fake async-iterable stream from an array of chunks,
 * simulating an SSE streaming response.
 */
function fakeStream(chunks: unknown[]): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

// When both non-streaming and streaming return undefined (e.g. provider is down),
// the fallback path also fails. The original "Empty non-streaming response" error
// is caught by the fallback, and the streaming path throws its own error
// (TypeError: undefined is not iterable → classified as unknown_error).
// We verify that an error is still surfaced to the caller.
test('OpenAIContentGenerator generateContent surfaces error when both non-streaming and streaming return undefined', async () => {
  const generator = makeGenerator('openai-both-undefined-response');
  stubCreate(generator, undefined);

  await assert.rejects(
    () => generator.generateContent({
      messages: [{ role: 'user', content: 'hello' }],
      model: 'openai-both-undefined-response',
    }),
    (error: unknown) => {
      // The error now comes from the streaming fallback path, not parseNonStreamingResponse.
      // undefined is not async-iterable → TypeError → classified as unknown_error.
      const candidate = error as { llmErrorKind?: string; message?: string };
      assert.ok(candidate.message, 'error should have a message');
      return true;
    },
  );
});

// SSE-only gateway scenario: non-streaming request gets undefined body (SSE not parsed as JSON),
// but streaming request works. generateContent should transparently fall back to streaming.
test('OpenAIContentGenerator generateContent transparently falls back to streaming when non-streaming returns empty body', async () => {
  const generator = makeGenerator('openai-sse-only-gateway');
  // Non-streaming call → undefined (SSE body not parseable as JSON)
  // Streaming call → valid SSE chunks
  stubCreateWithHandler(generator, (params) => {
    if (params.stream === true) {
      return fakeStream([
        {
          id: 'chatcmpl-sse-test',
          model: 'provider-model-id',
          choices: [{ delta: { content: 'Hello' }, finish_reason: null }],
        },
        {
          id: 'chatcmpl-sse-test',
          model: 'provider-model-id',
          choices: [{ delta: { content: ' world' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
        },
      ]);
    }
    // Non-streaming: return undefined to simulate SSE-only gateway
    return undefined;
  });

  const response = await generator.generateContent({
    messages: [{ role: 'user', content: 'ping' }],
    model: 'openai-sse-only-gateway',
  });

  // Fallback should be transparent: caller gets the streaming result as if it was non-streaming
  assert.equal(response.content, 'Hello world');
  assert.equal(response.model, 'provider-model-id');
  assert.equal(response.finish_reason, 'stop');
  assert.equal(response.was_output_truncated, false);
});

// Non-"Empty non-streaming response" errors should NOT trigger fallback — they should propagate as-is.
test('OpenAIContentGenerator generateContent does not fall back on malformed response errors (non-empty)', async () => {
  const generator = makeGenerator('openai-no-fallback-on-malformed');
  stubCreate(generator, { id: 'chatcmpl-test', model: 'openai-no-fallback-on-malformed' });

  await assert.rejects(
    () => generator.generateContent({
      messages: [{ role: 'user', content: 'hello' }],
      model: 'openai-no-fallback-on-malformed',
    }),
    (error: unknown) => {
      const candidate = error as { llmErrorKind?: string; message?: string };
      assert.equal(candidate.llmErrorKind, 'network_error');
      assert.match(candidate.message ?? '', /no choices returned/);
      return true;
    },
  );
});



test('OpenAIContentGenerator non-streaming parses valid completion response', async () => {
  const generator = makeGenerator('openai-nonstream-valid-response');
  stubCreate(generator, {
    id: 'chatcmpl-test',
    model: 'provider-model-id',
    choices: [
      {
        message: { role: 'assistant', content: 'pong' },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
  });

  const response = await generator.generateContent({
    messages: [{ role: 'user', content: 'ping' }],
    model: 'openai-nonstream-valid-response',
  });

  assert.equal(response.content, 'pong');
  assert.equal(response.model, 'provider-model-id');
  assert.equal(response.finish_reason, 'stop');
  assert.equal(response.was_output_truncated, false);
  assert.equal(response.usage?.prompt_tokens, 3);
  assert.equal(response.usage?.completion_tokens, 2);
  assert.equal(response.usage?.total_tokens, 5);
});
