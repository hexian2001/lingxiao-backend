import type { FastifyInstance } from 'fastify';
import type { SessionManager } from '@lingxiao-office/sdk/core/SessionManager.js';
import type { EventEmitter } from '@lingxiao-office/sdk/core/EventEmitter.js';
import type { ConnectionManager } from './ConnectionManager.js';
import type { AuthFn } from './types.js';

/**
 * Public context passed to @lingxiao-office/web-api extensions.
 *
 * Keep this deliberately small and typed: it exposes the stable server seams an
 * extension needs to register routes without importing server globals or editing
 * server.ts. New fields should be added only when a route module has a proven
 * need for them.
 */
export interface WebApiExtensionContext {
  /** The Fastify application. Extensions register routes/hooks on this object. */
  fastify: FastifyInstance;
  /** Server-token guard. Non-public routes should call this before handling. */
  requireServerToken: AuthFn;
  /** SDK session manager used by core Web API routes. */
  sessionManager: SessionManager;
  /** Repository adapter used by route modules. Kept opaque until a stable repo API is published. */
  repos: unknown;
  /** Current active session resolver shared by Web/TUI routes. */
  getActiveSessionId: () => string | undefined;
  /** ACP/SSE connection manager, exposed for protocol-aware extensions. */
  connectionManager: ConnectionManager;
  /** SDK event emitter backing SSE/ACP updates. */
  eventEmitter: EventEmitter;
}

/** A route/event extension for @lingxiao-office/web-api. */
export interface WebApiExtension {
  readonly name: string;
  register(context: WebApiExtensionContext): void | Promise<void>;
}

/** Convenience helper for inline extensions while preserving the public shape. */
export function defineWebApiExtension(extension: WebApiExtension): WebApiExtension {
  return extension;
}

/**
 * Ordered registry for Web API extensions.
 *
 * The registry intentionally preserves insertion order. Core server code can
 * register built-ins first and user extensions later; callers can reason about
 * route precedence without hidden sorting.
 */
export class WebApiRouteRegistry {
  private readonly extensions: WebApiExtension[] = [];
  private readonly names = new Set<string>();

  constructor(extensions: readonly WebApiExtension[] = []) {
    for (const extension of extensions) this.register(extension);
  }

  register(extension: WebApiExtension): this {
    if (!extension || typeof extension.name !== 'string' || !extension.name.trim()) {
      throw new Error('WebApiExtension.name must be a non-empty string');
    }
    if (typeof extension.register !== 'function') {
      throw new Error(`WebApiExtension ${extension.name} must provide a register(context) function`);
    }
    if (this.names.has(extension.name)) {
      throw new Error(`Duplicate WebApiExtension name: ${extension.name}`);
    }
    this.names.add(extension.name);
    this.extensions.push(extension);
    return this;
  }

  list(): readonly WebApiExtension[] {
    return this.extensions;
  }

  async registerAll(context: WebApiExtensionContext): Promise<void> {
    for (const extension of this.extensions) {
      await extension.register(context);
    }
  }
}
