# RFC 0001: Thin Agent Loop Facade

Status: Draft  
Depends on: RFC 0000  
Task: T-23  
Scope: SDK DX design candidate, not an implementation.

## Summary

Add the smallest evidence-backed SDK facade in two steps:

1. Export the existing `contentToPlainText` helper from the SDK main entry.
2. Add a thin `createAgentLoop` helper that wires an existing LLM client, ToolRegistry, messages, tool definitions, tool execution, assistant replay, tool-result replay, stop predicates, and lifecycle hooks.

This RFC intentionally does **not** commit to a heavy `createLingxiaoAgent`. Evidence shows the reusable seam is the low-level tool-calling loop repeated in the pentest example, while the heavier runtime path involves SessionManager, Workspace, TaskBoard, MessageBus, team mailbox, context/intervention handlers, and other dependencies (`examples/pentest-agent/src/agent.ts:88-202`; `packages/sdk/src/runtime/SessionRuntime.ts:136-170`; `packages/sdk/src/agents/AgentRoundExecutor.ts:24-120`).

## Evidence Anchors

| ID | Evidence |
| --- | --- |
| A1 | SDK main entry currently exports LLM and ToolRegistry primitives (`createLLMClient`, LLM types, `ToolRegistry`, `createToolRegistry`) plus `BaseAgent`, but not a loop facade (`packages/sdk/src/index.ts:31-50`; T-17 work_note `note_1782974945104_qbs2sadt9`). |
| A2 | `ChatResponse.content` is `MessageContent`; `MessageContent` can be `string`, content-part array, or `null` (`packages/sdk/src/llm/types.ts:161-169`; `packages/sdk/src/contracts/types/Message.ts:75-76`). |
| A3 | `contentToPlainText` already handles string, array, null, images, image blob refs, unknown objects, filtering, and newline joining (`packages/sdk/src/contracts/types/Message.ts:83-114`). |
| A4 | SDK main entry re-exports only selected contracts values and does not currently list `contentToPlainText`, although `contracts/index.ts` re-exports the Message module for subpath/internal consumers (`packages/sdk/src/index.ts:52-80`; `packages/sdk/src/contracts/index.ts:1-10`). |
| A5 | Pentest agent currently defines a local `extractText(content)` helper and uses it on `resp.content`, duplicating a weaker version of SDK normalization (`examples/pentest-agent/src/agent.ts:47-55`; `examples/pentest-agent/src/agent.ts:140`). |
| A6 | Pentest agent repeats runtime snapshot + `createLLMClient`, `createToolRegistry`, `getDefinitions`, tool context, `generateContent`, assistant thinking/tool_calls replay, app-specific completion sentinel, `registry.execute`, and tool-result replay (`examples/pentest-agent/src/agent.ts:88-202`; T-20 verify report `scratchpad/T-20_verify.md`). |
| A7 | Existing `registry.execute` is the central tool execution path and already owns validation/error/scope/mode handling; ToolResult normalization exists inside Registry (`packages/sdk/src/tools/Registry.ts:137-175`; `packages/sdk/src/tools/Registry.ts:1420-1445`; T-17 work_note `note_1782974945104_qbs2sadt9`). |
| A8 | `AgentRoundExecutor` is an advanced single-round executor with LLM, optional ToolRegistry, context controller, intervention handler, logger, max rounds, and model dependencies; it also supports custom `executeToolCall` and message replay but is not a no-setup public loop facade (`packages/sdk/src/agents/AgentRoundExecutor.ts:24-120`; `packages/sdk/src/agents/AgentRoundExecutor.ts:120-173`). |
| A9 | Search over `packages/sdk/src` found no `createAgentLoop`, `runAgentLoop`, `createLingxiaoAgent`, or `runToolCallingLoop` implementation; T-17/T-22 independently reached the same conclusion (`implementations/T-17.md`; `scratchpad/T-22_verify.md`; local `code_search`). |

## Problem

SDK users who want a basic tool-calling Agent currently have to assemble primitives by hand. The pentest example is useful precisely because it shows the repeated shape: create the LLM, create the registry, collect tool definitions, call `generateContent`, normalize response text, preserve `thinking` and `tool_calls`, execute each tool via `registry.execute`, and append tool results to messages (`A6`, `A7`).

The first papercut is content handling. SDK already has `contentToPlainText`, but the main entry does not currently expose it, and the example reimplements a narrower helper (`A2`, `A3`, `A4`, `A5`).

The second papercut is the loop itself. No public `createAgentLoop` exists today, and the advanced runtime/executor APIs are too broad to stabilize as a first DX facade (`A8`, `A9`).

## Goals

- Make `contentToPlainText` available from the SDK main entry so example/application code does not copy a partial content normalizer (`A2`, `A3`, `A4`, `A5`).
- Provide a thin `createAgentLoop` that automates only the observed, repeated LLM + ToolRegistry + message replay loop (`A6`, `A7`, `A9`).
- Keep domain prompts, stop conditions, reporting behavior, workspace policy, and hooks application-owned; the pentest sentinel and report path logic are domain/application behavior (`examples/pentest-agent/src/agent.ts:159-162`; `examples/pentest-agent/src/agent.ts:215-221`; T-19 work_note `note_1782973892587_olsqbs5kv`).
- Preserve explicit dependency injection: caller supplies LLM/client or model factory, registry or registry factory, initial messages, tool context, and lifecycle hooks (`A1`, `A6`, `A7`).

## Non-goals

- Do not add or promise `createLingxiaoAgent` in this RFC. The audited low-risk seam is a loop helper, while a full agent would need to decide how to wrap advanced runtime/session/team/workflow dependencies (`A8`; `packages/sdk/src/runtime/SessionRuntime.ts:136-170`).
- Do not hide `thinking` or `tool_calls`; evidence from the pentest example and `AgentRoundExecutor` shows assistant messages must preserve them for multi-round continuity (`examples/pentest-agent/src/agent.ts:151-157`; `packages/sdk/src/agents/AgentRoundExecutor.ts:122-128`).
- Do not make `PENTEST_COMPLETE`, pentest prompt construction, report file discovery, or retry policy SDK defaults; those are example/domain policies (`examples/pentest-agent/src/agent.ts:109-113`; `examples/pentest-agent/src/agent.ts:131-137`; `examples/pentest-agent/src/agent.ts:159-162`; `examples/pentest-agent/src/agent.ts:215-221`; T-19 work_note `note_1782973892587_olsqbs5kv`).
- Do not replace `ToolRegistry.execute`; the evidence-backed helper should call it or accept an equivalent execution callback, not invent a second tool permission/validation path (`A7`).
- Do not stabilize all advanced `./*` imports as part of this facade; package `./*` exists, but T-17/T-22 separated public main entry from advanced/internal subpaths (`packages/sdk/package.json:8-17`; `scratchpad/T-22_verify.md`).

## API Candidate

The names and signatures below are candidates for implementation follow-up. They are not current API promises.

```ts
export { contentToPlainText } from './contracts/index.js';

export interface AgentLoopHooks {
  onRoundStart?: (event: { round: number; messages: ChatMessage[] }) => void | Promise<void>;
  onResponse?: (event: { round: number; response: ChatResponse; text: string }) => void | Promise<void>;
  onToolCall?: (event: { round: number; toolCall: ToolCall; args: unknown }) => void | Promise<void>;
  onToolResult?: (event: { round: number; toolCall: ToolCall; result: ToolResult }) => void | Promise<void>;
  onFinish?: (event: AgentLoopResult) => void | Promise<void>;
}

export interface CreateAgentLoopOptions {
  llm: LLMClient;
  registry: ToolRegistry;
  messages: ChatMessage[];
  model?: string;
  tools?: ToolDefinition[];
  toolContext: ToolContext;
  maxRounds?: number;
  maxTokens?: number;
  isDone?: (event: { response: ChatResponse; text: string; messages: ChatMessage[]; round: number }) => boolean | Promise<boolean>;
  hooks?: AgentLoopHooks;
  signal?: AbortSignal;
}

export interface AgentLoopResult {
  messages: ChatMessage[];
  rounds: number;
  finishReason: 'done' | 'no_tool_call' | 'max_rounds' | 'aborted' | 'error';
  lastResponse?: ChatResponse;
  error?: unknown;
}

export function createAgentLoop(options: CreateAgentLoopOptions): {
  run(): Promise<AgentLoopResult>;
};
```

### Candidate Behavior

- Default `tools` to `registry.getDefinitions()` when not supplied, mirroring the example setup (`examples/pentest-agent/src/agent.ts:96-100`).
- On each round, call `llm.generateContent({ messages, model, tools, maxTokens, signal })`, matching the example's direct LLM call (`examples/pentest-agent/src/agent.ts:123-130`).
- Derive `text` with `contentToPlainText(response.content)` instead of application-local partial extraction (`A2`, `A3`, `A5`).
- Append assistant message with `content`, `tool_calls`, and `thinking` unchanged (`examples/pentest-agent/src/agent.ts:151-157`; `packages/sdk/src/agents/AgentRoundExecutor.ts:122-128`).
- If `isDone` returns true, stop with `finishReason: 'done'`; this keeps `PENTEST_COMPLETE` as an application predicate, not an SDK default (`examples/pentest-agent/src/agent.ts:159-162`).
- For each tool call, parse JSON arguments, call `registry.execute(call.function.name, args, toolContext)`, stringify/truncate according to caller hook or safe default, and append a `role: 'tool'` message with `tool_call_id` (`examples/pentest-agent/src/agent.ts:173-200`; `packages/sdk/src/tools/Registry.ts:1420-1445`).
- Stop on no tool calls with `finishReason: 'no_tool_call'` unless caller's `isDone` or continuation hook chooses to add another user message; the pentest example currently injects a continuation prompt itself, so the facade should expose a hook rather than hard-code that text (`examples/pentest-agent/src/agent.ts:165-170`).

## Benefits

- Removes duplicated weak `extractText` logic and exposes the SDK's existing content normalizer from the main entry (`A3`, `A4`, `A5`).
- Reduces example/application boilerplate while preserving the exact loop semantics that made the pentest example work: LLM call, thinking/tool call preservation, registry execution, and observe replay (`A6`, `A7`).
- Avoids premature commitment to heavy runtime abstractions whose dependency graph is already visibly broader (`A8`; `packages/sdk/src/runtime/SessionRuntime.ts:136-170`).
- Creates a focused test surface: mock LLM, mock registry, known message arrays, and deterministic stop predicate, instead of full SessionManager integration (`A6`, `A8`, T-17 next_steps in `implementations/T-17.md`).

## Risks

- If `createAgentLoop` hides too much, applications may lose control over retry, continuation prompts, truncation, and report logic currently explicit in the example (`examples/pentest-agent/src/agent.ts:131-137`; `examples/pentest-agent/src/agent.ts:165-170`; `examples/pentest-agent/src/agent.ts:215-221`).
- If `ToolResult` stringification is not configurable, the facade may accidentally bake pentest-specific output limits or presentation into generic SDK code (`examples/pentest-agent/src/agent.ts:188-200`).
- If `model` defaults are unclear, the facade may reintroduce ambiguity between runtime snapshot IDs and wire model names; prior evidence already found model-resolution bugs in the broader split context, so tests should cover explicit model handling (Leader context summary; `packages/sdk/src/llm/Client.ts:216-222`).
- If the facade reuses advanced internals without careful public boundaries, it could stabilize dependencies that T-17 classified as advanced/internal (`A8`, T-17 work_note `note_1782974945104_qbs2sadt9`).

## Migration Strategy

1. Export `contentToPlainText` from `@lingxiao-office/sdk` main entry first; this is additive and backed by existing implementation (`A3`, `A4`).
2. Update the pentest example to import `contentToPlainText` and remove local `extractText` as the first validation of lower boilerplate (`A5`).
3. Add `createAgentLoop` behind a small public barrel only after tests cover the exact loop behavior from the example (`A6`, `A7`).
4. Migrate the example to `createAgentLoop` only if all domain-specific behavior remains in the example through `messages`, `isDone`, and hooks (`examples/pentest-agent/src/agent.ts:109-113`; `examples/pentest-agent/src/agent.ts:159-162`; `examples/pentest-agent/src/agent.ts:215-221`).

## Verification Strategy

- Type tests: main entry can import `contentToPlainText`, `createAgentLoop`, and related types without deep subpath imports (`A1`, `A4`).
- Unit tests for `contentToPlainText`: string, array text parts, image placeholders, image blob refs, null, and unknown objects (`A2`, `A3`).
- Unit tests for `createAgentLoop`: one no-tool response, one tool-call response, multiple tool calls, tool error return, thrown tool error, `thinking` preservation, `tool_calls` preservation, max rounds, abort signal, and `isDone` predicate (`A6`, `A7`).
- Example regression: pentest agent still controls prompt, retry wording, `PENTEST_COMPLETE`, and report-path presentation after any migration (`examples/pentest-agent/src/agent.ts:109-221`; T-20 verify report).
