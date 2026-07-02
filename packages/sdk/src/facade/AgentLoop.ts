import { contentToPlainText, thinkingBlocksToText } from '../contracts/types/Message.js';
import type {
  ChatMessage,
  ChatResponse,
  LLMClient,
  ToolCall,
  ToolDefinition,
} from '../llm/types.js';
import type { ToolRegistry } from '../tools/Registry.js';
import type { ToolContext, ToolResult } from '../tools/Tool.js';

export type AgentLoopFinishReason = 'done' | 'no_tool_call' | 'max_rounds' | 'aborted' | 'error';

export interface AgentLoopThinkingEvent {
  round: number;
  thinking: string;
  response: ChatResponse;
}

export interface AgentLoopMessageEvent {
  round: number;
  message: ChatMessage;
  messages: ChatMessage[];
}

export interface AgentLoopToolCallEvent {
  round: number;
  toolCall: ToolCall;
  args: unknown;
}

export interface AgentLoopToolResultEvent {
  round: number;
  toolCall: ToolCall;
  args: unknown;
  result: ToolResult;
  message: ChatMessage;
}

export interface AgentLoopRoundEvent {
  round: number;
  response: ChatResponse;
  text: string;
  messages: ChatMessage[];
  toolCalls: ToolCall[];
  finishReason?: AgentLoopFinishReason;
}

export interface AgentLoopHooks {
  /** Called when a response contains structured thinking blocks. */
  onThinking?: (event: AgentLoopThinkingEvent) => void | Promise<void>;
  /** Called whenever the facade appends an assistant or tool message. */
  onMessage?: (event: AgentLoopMessageEvent) => void | Promise<void>;
  /** Called before a tool is executed. */
  onToolCall?: (event: AgentLoopToolCallEvent) => void | Promise<void>;
  /** Called after a tool result has been appended as an observe message. */
  onToolResult?: (event: AgentLoopToolResultEvent) => void | Promise<void>;
  /** Called once per LLM round after done/no-tool/tool-replay handling for that round. */
  onRound?: (event: AgentLoopRoundEvent) => void | Promise<void>;
}

export interface AgentLoopDoneEvent {
  response: ChatResponse;
  text: string;
  messages: ChatMessage[];
  round: number;
}

export interface CreateAgentLoopOptions {
  llm: LLMClient;
  registry: ToolRegistry;
  messages: ChatMessage[];
  /** Runtime model id/snapshot id passed to the existing LLM client. */
  model: string;
  /** Explicit tool definitions. Defaults to registry.getDefinitions(toolNames). */
  tools?: ToolDefinition[];
  /** Optional allow-list used only when tools is omitted. */
  toolNames?: string[];
  toolContext?: ToolContext;
  maxRounds?: number;
  maxTokens?: number;
  done?: (event: AgentLoopDoneEvent) => boolean | Promise<boolean>;
  isDone?: (event: AgentLoopDoneEvent) => boolean | Promise<boolean>;
  hooks?: AgentLoopHooks;
  signal?: AbortSignal;
  /** Override tool-result serialization before it is appended as role=tool content. */
  serializeToolResult?: (event: { result: ToolResult; toolCall: ToolCall; args: unknown; round: number }) => string;
  /** Safe default cap for serialized tool-result messages. Set to false to disable. */
  maxToolResultChars?: number | false;
}

export interface AgentLoopResult {
  messages: ChatMessage[];
  rounds: number;
  finishReason: AgentLoopFinishReason;
  lastResponse?: ChatResponse;
  error?: unknown;
}

export interface AgentLoop {
  run(): Promise<AgentLoopResult>;
}

function parseToolArguments(toolCall: ToolCall): unknown {
  const raw = toolCall.function.arguments;
  if (!raw || !raw.trim()) return {};
  return JSON.parse(raw);
}

function defaultSerializeToolResult(result: ToolResult): string {
  if (typeof result.data === 'string') {
    return result.success === false && result.error ? `${result.data}\n${result.error}` : result.data;
  }
  if (result.data !== undefined && result.data !== null) {
    try {
      return JSON.stringify(result.data);
    } catch {
      // Fall through to the full-result fallback below.
    }
  }
  if (result.error) return `ERROR: ${result.error}`;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function truncateToolResult(text: string, maxChars: number | false | undefined): string {
  const limit = maxChars ?? 8_000;
  if (limit === false || text.length <= limit) return text;
  return `${text.slice(0, limit)}…(+${text.length - limit})`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function createAgentLoop(options: CreateAgentLoopOptions): AgentLoop {
  const maxRounds = options.maxRounds ?? 10;

  return {
    async run(): Promise<AgentLoopResult> {
      const messages: ChatMessage[] = [...options.messages];
      const tools = options.tools ?? options.registry.getDefinitions(options.toolNames);
      const donePredicate = options.done ?? options.isDone;
      let lastResponse: ChatResponse | undefined;
      let rounds = 0;

      try {
        while (rounds < maxRounds) {
          if (options.signal?.aborted) {
            return { messages, rounds, finishReason: 'aborted', lastResponse };
          }

          const round = rounds + 1;
          const response = await options.llm.generateContent({
            messages,
            model: options.model,
            tools,
            maxTokens: options.maxTokens,
            signal: options.signal,
          });
          lastResponse = response;
          rounds = round;

          const text = contentToPlainText(response.content);
          const thinking = thinkingBlocksToText(response.thinking);
          if (thinking) {
            await options.hooks?.onThinking?.({ round, thinking, response });
          }

          const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: response.content,
            tool_calls: response.tool_calls,
            thinking: response.thinking,
          };
          messages.push(assistantMessage);
          await options.hooks?.onMessage?.({ round, message: assistantMessage, messages });

          if (donePredicate && await donePredicate({ response, text, messages, round })) {
            await options.hooks?.onRound?.({
              round,
              response,
              text,
              messages,
              toolCalls: response.tool_calls ?? [],
              finishReason: 'done',
            });
            return { messages, rounds, finishReason: 'done', lastResponse };
          }

          const toolCalls = response.tool_calls ?? [];
          if (toolCalls.length === 0) {
            await options.hooks?.onRound?.({
              round,
              response,
              text,
              messages,
              toolCalls,
              finishReason: 'no_tool_call',
            });
            return { messages, rounds, finishReason: 'no_tool_call', lastResponse };
          }

          for (const toolCall of toolCalls) {
            if (options.signal?.aborted) {
              return { messages, rounds, finishReason: 'aborted', lastResponse };
            }

            const args = parseToolArguments(toolCall);
            await options.hooks?.onToolCall?.({ round, toolCall, args });

            let result: ToolResult;
            try {
              result = await options.registry.execute(
                toolCall.function.name,
                args,
                { ...options.toolContext, toolCallId: toolCall.id },
              );
            } catch (error) {
              result = {
                success: false,
                data: null,
                error: error instanceof Error ? error.message : String(error),
              };
            }

            const serialized = options.serializeToolResult
              ? options.serializeToolResult({ result, toolCall, args, round })
              : defaultSerializeToolResult(result);
            const toolMessage: ChatMessage = {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: truncateToolResult(serialized, options.maxToolResultChars),
            };
            messages.push(toolMessage);
            await options.hooks?.onMessage?.({ round, message: toolMessage, messages });
            await options.hooks?.onToolResult?.({ round, toolCall, args, result, message: toolMessage });
          }

          await options.hooks?.onRound?.({ round, response, text, messages, toolCalls });
        }

        return { messages, rounds, finishReason: 'max_rounds', lastResponse };
      } catch (error) {
        if (options.signal?.aborted || isAbortError(error)) {
          return { messages, rounds, finishReason: 'aborted', lastResponse };
        }
        return { messages, rounds, finishReason: 'error', lastResponse, error };
      }
    },
  };
}
