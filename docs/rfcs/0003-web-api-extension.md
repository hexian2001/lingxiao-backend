# RFC 0003: Web API Extension Surface

Status: Draft  
Depends on: RFC 0000  
Task: T-24 repair  
Scope: Web API DX design candidate, not an implementation.

## Summary

`@lingxiao-office/web-api` already has a clean product boundary over `@lingxiao-office/sdk`, but extension DX is still manual: route modules exist, yet `server.ts` centrally wires each route by hand. This RFC proposes a typed extension context plus route registry so internal and third-party Web API extensions can register routes/events without editing the central server assembly for every new surface.

This is evidence-backed by T-18/T-21: Web API route registration is concentrated in `packages/web-api/src/server.ts:455-533`; route modules already follow `registerXRoutes(fastify, deps)` patterns such as ACP (`packages/web-api/src/web-server/AcpRoutes.ts:19-28`); SSE event bridging is centralized in `SseBridge.start()` (`packages/web-api/src/web-server/SseBridge.ts:180-211`); layering is guarded by `scripts/verify-layering.mjs` and must remain SDK-independent from Web API.

## Evidence Anchors

| ID | Evidence |
| --- | --- |
| W1 | `server.ts` has one central route registration block and manually calls every `register*Routes(...)` (`packages/web-api/src/server.ts:455-533`; T-18 work_note `note_1782974531888_tfb7mqbcg`; T-21 verify `note_1782975243508_soeg7go9a`). |
| W2 | ACP routes are already modular and accept typed dependencies: `registerAcpRoutes(fastify, { sessionManager, connectionManager, acpHandler, requireServerToken })` (`packages/web-api/src/web-server/AcpRoutes.ts:19-28`). |
| W3 | ACP connect/JSON-RPC/disconnect routes enforce `requireServerToken` before handling requests (`packages/web-api/src/web-server/AcpRoutes.ts:31-33`, `packages/web-api/src/web-server/AcpRoutes.ts:111-114`, `packages/web-api/src/web-server/AcpRoutes.ts:131-134`). |
| W4 | SSE bridge centralizes event forwarding and already separates symmetric forwarders from special transforms (`packages/web-api/src/web-server/SseBridge.ts:180-211`, `packages/web-api/src/web-server/SseBridge.ts:214-220`). |
| W5 | Browser screencast WebSocket route contains a manual auth comment/path rather than a normal `requireServerToken` call, so it must be handled as a separate security review, not hidden inside the extension facade (`packages/web-api/src/web-server/BrowserScreencastRoutes.ts:45-50`; T-18 next_steps; T-21 verification). |
| W6 | T-21 code search found no existing `registerWebApiExtension` or `createServerWithDeps` extension parameter, so this is a real DX gap, not a duplicate of an existing API (T-21 verification). |
| W7 | The layering verifier enforces SDK must not import Web API, while Web API may depend on SDK (`scripts/verify-layering.mjs`; T-18/T-21 evidence). |

## Goals

1. Add a typed Web API extension registration seam.
2. Keep `server.ts` responsible for core bootstrapping, but stop requiring every future route to be manually wired in the central block.
3. Give extensions typed access to stable server dependencies: Fastify instance, auth guard, session manager, event emitter/SSE bridge hooks, connection manager, repositories, and selected SDK facades.
4. Preserve current route behavior and auth requirements.
5. Keep SDK/Web API layering intact: extension APIs live in `@lingxiao-office/web-api`, not `@lingxiao-office/sdk`.

## Non-goals

- Do not move Web API route registration into `@lingxiao-office/sdk`.
- Do not expose every internal server dependency as public API.
- Do not load arbitrary untrusted extension code in this RFC.
- Do not change existing ACP/SSE/WebSocket protocol semantics.
- Do not treat BrowserScreencastRoutes WebSocket auth as solved by this RFC; it needs focused security review.
- Do not implement `createServerWithDeps` before the typed context and route registry are validated.

## Proposed Surface

### `WebApiExtensionContext`

```ts
export interface WebApiExtensionContext {
  fastify: FastifyInstance;
  requireServerToken: AuthFn;
  sessionManager: SessionManager;
  repos: unknown;
  getActiveSessionId: () => string | undefined;
  connectionManager?: ConnectionManager;
  eventEmitter?: EventEmitter;
}
```

The first implementation should keep this internal or explicitly beta until dependency types are stable. The context exists to prevent route modules from importing random server globals.

### `WebApiExtension`

```ts
export interface WebApiExtension {
  readonly name: string;
  register(context: WebApiExtensionContext): void | Promise<void>;
}
```

### Route registry

```ts
export class WebApiRouteRegistry {
  register(extension: WebApiExtension): void;
  registerAll(context: WebApiExtensionContext): Promise<void>;
}
```

Core server assembly can then become:

```ts
const registry = new WebApiRouteRegistry();
registry.register(coreSessionRoutesExtension);
registry.register(coreAcpRoutesExtension);
for (const extension of options.extensions ?? []) registry.register(extension);
await registry.registerAll(context);
```

This keeps the current `registerXRoutes(fastify, deps)` modules usable while creating a typed registration seam.

## Migration Strategy

1. Introduce `WebApiExtensionContext`, `WebApiExtension`, and `WebApiRouteRegistry` inside `packages/web-api/src/web-server/extension` or equivalent.
2. Wrap one low-risk existing route module, preferably ACP or a small settings/info route, as an internal extension without changing route behavior.
3. Add tests or smoke checks proving old routes still register.
4. Only after one route is migrated, allow `createServer` options to accept an `extensions?: WebApiExtension[]` array.
5. Keep all existing direct `registerXRoutes` calls until migration is complete; avoid big-bang route rewrites.

## Risks

- Over-broad context can turn into a new global bag. Keep the initial context minimal and typed.
- If extension order is implicit, route precedence bugs can appear. Registry should preserve insertion order and document ordering.
- Auth bypass risk: every extension must use `requireServerToken` or explicitly declare public routes.
- Event stream coupling risk: exposing raw emitter/SSE bridge too early can lock internal event names as public API.
- Browser screencast WebSocket auth is already special and should be audited separately (`W5`).

## Validation Strategy

- Existence/type tests: import `WebApiExtension`, `WebApiExtensionContext`, and `WebApiRouteRegistry` from the intended Web API path.
- Route registration test: register a dummy extension and assert a test route is reachable.
- Core route regression: ACP routes still enforce `requireServerToken` (`W2`, `W3`).
- Layering test: `npm run verify:layering` still passes; SDK must not import Web API (`W7`).
- Build test: `npm run build --workspace=@lingxiao-office/web-api` and root `npm run build` pass.
- Security follow-up: dedicated review/test for `BrowserScreencastRoutes` WebSocket auth, because the current code has a manual query-token auth path (`packages/web-api/src/web-server/BrowserScreencastRoutes.ts:45-50`).

## Deferred Follow-ups

- Public plugin loading policy.
- Stable typed event subscription facade for SSE/WS.
- BrowserScreencastRoutes WebSocket auth hardening.
- Example extension package after the internal registry proves stable.
