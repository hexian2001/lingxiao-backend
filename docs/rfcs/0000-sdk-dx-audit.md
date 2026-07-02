# RFC 0000: SDK/Web API DX Evidence Audit

Status: Draft  
Task: T-23  
Scope: evidence-driven API design notes only; no implementation in this RFC set.

## Summary

This RFC records the audited developer-experience facts that constrain the follow-up RFCs for Agent loop, Team runtime, and Web API extension APIs. The package split already gives `@lingxiao-office/sdk` a reusable engine boundary and `@lingxiao-office/web-api` a protocol service boundary: SDK package metadata describes an embeddable backend engine and exposes `.` plus `./*`; Web API package metadata describes HTTP/ACP/SSE/WebSocket service use and depends on `@lingxiao-office/sdk` (`packages/sdk/package.json:2-17`, `packages/web-api/package.json:2-20`, `packages/web-api/package.json:36-44`). The layering verifier scans SDK source and package dependencies to reject SDK-to-Web-API coupling, while Web API-to-SDK remains the intended direction (`scripts/verify-layering.mjs:40-75`).

The accepted audit evidence says the low-risk DX work is not a new product surface invented from scratch. It is a small set of facades over already-observed seams: SDK main entry exports LLM and ToolRegistry primitives but no public Agent loop facade; the pentest example repeats LLM setup, ToolRegistry setup, tool-calling loop, and message replay; Web API route registration is centralized and manual in `server.ts` (T-17 work_note `note_1782974945104_qbs2sadt9`; T-19 work_note `note_1782973892587_olsqbs5kv`; T-18 work_note `note_1782974531888_tfb7mqbcg`; `packages/sdk/src/index.ts:31-50`; `examples/pentest-agent/src/agent.ts:88-202`; `packages/web-api/src/server.ts:464-500`).

## Evidence Anchors

| ID | Evidence |
| --- | --- |
| E-SDK-EXPORT | SDK public package exports are `.` and `./*`, with main entry exporting `createLLMClient`, LLM types, `ToolRegistry`, `createToolRegistry`, Tool types, and `BaseAgent` but not `AgentRoundExecutor`/`AgentCore` (`packages/sdk/package.json:8-17`; `packages/sdk/src/index.ts:31-50`; T-22 verify report `scratchpad/T-22_verify.md`). |
| E-SDK-NO-FACADE | Source search over SDK found no `createAgentLoop`, `runAgentLoop`, `createLingxiaoAgent`, or `runToolCallingLoop` implementation (T-17 report `implementations/T-17.md`; T-22 verify report; local `code_search` over `packages/sdk/src`, no matches across 581 files). |
| E-CONTENT | `ChatResponse.content` is `MessageContent`, and `MessageContent` is `string | MessageContentPart[] | null`; `contentToPlainText` already normalizes strings, arrays, images, null, and unknowns (`packages/sdk/src/llm/types.ts:161-169`; `packages/sdk/src/contracts/types/Message.ts:75-114`). |
| E-LOOP | The pentest example repeats runtime snapshot + `createLLMClient`, `createToolRegistry().getDefinitions()`, `generateContent`, thinking/tool_calls replay, application sentinel, `registry.execute`, and tool-result replay (`examples/pentest-agent/src/agent.ts:88-202`; T-20 verify report `scratchpad/T-20_verify.md`). |
| E-ADVANCED | Existing advanced internals require richer dependency sets: `AgentRoundExecutor` accepts LLM, ToolRegistry, context controller, intervention handler, logger, and custom tool execution; `AgentCore` is a generic bounded loop; Session runtime constructs Workspace, TaskBoard, MessageBus, token tracking, LLM, ToolRegistry, and team mailbox integration (`packages/sdk/src/agents/AgentRoundExecutor.ts:24-120`; `packages/sdk/src/agents/AgentRoundExecutor.ts:120-173`; `packages/sdk/src/agents/runtime/AgentCore.ts:1-35`; `packages/sdk/src/runtime/SessionRuntime.ts:136-170`). |
| E-TEAM-SEED | The teaching orchestration layer explicitly does not add tools/processes or fake SDK APIs; it carries declarative roles, stage DAG, and blackboard seed data (`examples/pentest-agent/src/orchestration.ts:1-24`; `examples/pentest-agent/src/orchestration.ts:86-115`; `examples/pentest-agent/src/orchestration.ts:145-162`; T-19 work_note `note_1782973892587_olsqbs5kv`). |
| E-TEAM-RUNTIME | SDK already registers `team_manage`, `team_message`, `team_inbox`, and `blackboard`, and team mode is a capability switch gated by active team setup rather than a magic wrapper (`packages/sdk/src/tools/index.ts:189-192`; `packages/sdk/src/core/ModeToolPolicy.ts:168-190`; `packages/sdk/src/runtime/SessionManagerRuntime.ts:2220-2235`). |
| E-WEB-ROUTES | Web API public entry exports server lifecycle helpers; `createServerWithDeps` accepts runtime dependencies but no extension/route-registry parameter; route registration is a long manual block in `server.ts`; the returned object lacks typed extension context fields (`packages/web-api/src/index.ts:17-27`; `packages/web-api/src/server.ts:193-203`; `packages/web-api/src/server.ts:464-500`; `packages/web-api/src/server.ts:656`). |
| E-WEB-SEAMS | Existing route modules have a repeatable seam of `register*Routes(fastify, deps)`; ACP can route `@agent` prompts through `sessionManager.sendAgentInput`; SSE forwarding is driven by typed event whitelists and typed forwarder helpers (`packages/web-api/src/web-server/SessionRoutes.ts:39-48`; `packages/web-api/src/web-server/AcpHandler.ts:492-503`; `packages/web-api/src/web-server/SseBridge.ts:44-60`; `packages/web-api/src/web-server/SseBridge.ts:614-635`). |
| E-WEB-AUTH-FOLLOWUP | Browser screencast routes declare/destructure `requireServerToken`, read query `token`, and contain comments about manual WebSocket auth; local search found no actual `requireServerToken` call in the file, so this RFC set records only a follow-up security review, not a completed finding (`packages/web-api/src/web-server/BrowserScreencastRoutes.ts:17-50`; local `code_search` for `requireServerToken`/`token`). |

## Problem Statement

The current SDK API is powerful but forces application code to choose between low-level primitives and advanced runtime internals: main entry provides LLM and ToolRegistry primitives, while current loop helpers are either absent from the public entry or require advanced dependencies (`E-SDK-EXPORT`, `E-SDK-NO-FACADE`, `E-ADVANCED`). The pentest example proves the repeated low-level loop shape with concrete setup, tool execution, and replay code (`E-LOOP`).

The current Team story has real runtime capabilities and tool gates, but the safest external DX improvement is a declarative mapping from roster/DAG/blackboard seed into existing team/blackboard primitives, not a broad wrapper over SessionManager (`E-TEAM-SEED`, `E-TEAM-RUNTIME`, `E-ADVANCED`).

The current Web API extension story requires editing `server.ts` route imports/registration and coordinating event/auth/session deps manually, even though route modules already follow a recognizable registration seam (`E-WEB-ROUTES`, `E-WEB-SEAMS`).

## Non-goals

- Do not implement code in this RFC task; T-23 is documentation only and cites accepted evidence (`T-23 task description`; T-17/T-18/T-19 reports).
- Do not promote `./*` deep imports to stable public API merely because package exports permit them; the SDK export audit separates main-entry stability from advanced/internal subpaths (`E-SDK-EXPORT`, T-17 work_note `note_1782974945104_qbs2sadt9`).
- Do not promise a heavy `createLingxiaoAgent` in this RFC set; advanced runtime construction already crosses SessionManager, workspace, board, bus, LLM, ToolRegistry, team mailbox, and intervention concerns (`E-ADVANCED`).
- Do not package the current pentest prompt, CTF completion sentinel, report formatting, or teaching-only team simulation as generic SDK behavior; the example evidence marks those as application/domain concerns (`E-LOOP`, `E-TEAM-SEED`, T-19 work_note `note_1782973892587_olsqbs5kv`).
- Do not make the Web API extension RFC resolve BrowserScreencastRoutes WebSocket auth; evidence only supports creating a separate security review follow-up (`E-WEB-AUTH-FOLLOWUP`, T-18/T-21 evidence).

## API Candidate Index

| RFC | Candidate | Evidence basis |
| --- | --- | --- |
| RFC 0001 | `contentToPlainText` main-entry export and `createAgentLoop` thin facade | Existing content normalizer and repeated pentest loop (`E-CONTENT`, `E-LOOP`, `E-SDK-NO-FACADE`). |
| RFC 0002 | `createTeamRuntimePlan` or equivalent declarative roster/DAG/blackboard seed mapping | Existing declarative teaching data plus team/blackboard tools and mode gates (`E-TEAM-SEED`, `E-TEAM-RUNTIME`). |
| RFC 0003 | Route registry plus typed extension context for `@lingxiao-office/web-api` | Existing `register*Routes(fastify, deps)` seam and manual `server.ts` registration block (`E-WEB-ROUTES`, `E-WEB-SEAMS`). |

## Benefits

- The proposed Agent loop work removes repeated example-level setup while reusing observed primitives instead of replacing them (`E-LOOP`, `E-SDK-EXPORT`).
- The proposed Team runtime work documents declarative inputs already present in the example and maps them to existing runtime/tool gates instead of inventing a universal manager wrapper (`E-TEAM-SEED`, `E-TEAM-RUNTIME`).
- The proposed Web API extension work moves route additions from a central manual edit block toward a typed registration seam already used by route modules (`E-WEB-ROUTES`, `E-WEB-SEAMS`).

## Risks

- Stabilizing too much of `./*` would turn advanced/internal paths into a broad compatibility contract without evidence that those paths are low-cost public APIs (`E-SDK-EXPORT`, `E-ADVANCED`).
- A broad Agent facade could hide model/content/tool replay edge cases already exposed by the pentest loop, including `MessageContent` shape and thinking/tool_calls replay (`E-CONTENT`, `E-LOOP`).
- A broad Team facade could couple public API to SessionManager internals and mode gates that currently require DB/session/team setup (`E-ADVANCED`, `E-TEAM-RUNTIME`).
- A Web API extension API without typed auth/session/event context could repeat the current scattered dependency problem rather than improving it (`E-WEB-ROUTES`, `E-WEB-SEAMS`).

## Migration Strategy

1. Treat this RFC set as a design checkpoint and keep current public imports valid while adding only explicitly proposed stable exports in implementation follow-ups (`E-SDK-EXPORT`, `E-SDK-NO-FACADE`).
2. Implement RFC 0001 first because it has the smallest observed surface: content normalization and one tool-calling loop (`E-CONTENT`, `E-LOOP`).
3. Prototype RFC 0002 as a pure mapper from declarative roster/DAG/blackboard seed to existing tools/mode gates before exposing runtime mutation helpers (`E-TEAM-SEED`, `E-TEAM-RUNTIME`).
4. Prototype RFC 0003 with internal route registry tests before adding third-party extension loading or broad lifecycle hooks (`E-WEB-ROUTES`, `E-WEB-SEAMS`).

## Verification Strategy

- RFC 0001 implementation should have mock LLM/registry tests for string content, array content, null content, thinking replay, tool_calls replay, tool errors, max rounds, and user-provided done predicate; these cases come directly from `MessageContent` and pentest-loop evidence (`E-CONTENT`, `E-LOOP`, T-17/T-19 next_steps).
- RFC 0002 implementation should test that declarative inputs produce planned team/blackboard/tool actions without requiring direct SessionManager wrapping; this follows the example seed and runtime gate evidence (`E-TEAM-SEED`, `E-TEAM-RUNTIME`).
- RFC 0003 implementation should test route registration ordering, typed context contents, auth propagation, and SSE/ACP event contracts before accepting external extensions (`E-WEB-ROUTES`, `E-WEB-SEAMS`).
- A separate follow-up should audit BrowserScreencastRoutes WebSocket authentication with focused security tests; this is intentionally outside RFC 0003 implementation scope (`E-WEB-AUTH-FOLLOWUP`).
