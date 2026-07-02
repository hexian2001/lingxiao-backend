# RFC 0002: Declarative Team Runtime Facade

Status: Draft  
Depends on: RFC 0000 and RFC 0001  
Task: T-23  
Scope: SDK Team DX design candidate, not an implementation.

## Summary

The Team facade should be a declarative mapper from roster, stage DAG, and Blackboard seed into existing SDK team/blackboard capabilities. It should **not** wrap `SessionManager` as a universal orchestration object.

The evidence points to a narrow, safe shape: the pentest teaching layer already has roles, a stage DAG, and a blackboard seed while explicitly saying it does not create new tools, start multiple processes, or fake SDK APIs (`examples/pentest-agent/src/orchestration.ts:1-24`; `examples/pentest-agent/src/orchestration.ts:86-115`; `examples/pentest-agent/src/orchestration.ts:145-162`). SDK runtime already has Team/Blackboard tools and collaboration mode gates (`packages/sdk/src/tools/index.ts:189-192`; `packages/sdk/src/core/ModeToolPolicy.ts:168-190`; `packages/sdk/src/runtime/SessionManagerRuntime.ts:2220-2235`). The facade should connect those facts without hiding the larger runtime cost of SessionManager/session setup (`packages/sdk/src/runtime/SessionRuntime.ts:136-170`; `packages/sdk/src/runtime/SessionManagerRuntime.ts:257-285`).

## Evidence Anchors

| ID | Evidence |
| --- | --- |
| T1 | The example orchestration layer states it intentionally does not add tools, start multiple processes, or pretend the SDK has extra APIs; it compiles team-thinking into prompts/runtime notes (`examples/pentest-agent/src/orchestration.ts:1-10`; T-19 work_note `note_1782973892587_olsqbs5kv`). |
| T2 | The example has a declarative `STAGE_DAG` with stage IDs, owners, dependencies, objectives, and done conditions (`examples/pentest-agent/src/orchestration.ts:86-115`; T-20 verify report `scratchpad/T-20_verify.md`). |
| T3 | The example has `createBlackboardSeed(target)` with target, accepted scope, finding statuses, storage policy, and finding schema (`examples/pentest-agent/src/orchestration.ts:145-162`). |
| T4 | SDK ToolRegistry registers `team_manage`, `team_message`, `team_inbox`, and `blackboard` as built-in tools (`packages/sdk/src/tools/index.ts:189-192`; T-19 work_note `note_1782973892587_olsqbs5kv`). |
| T5 | Team tools are mode/role/roster gated: `team_manage` is leader-only in team mode, and `team_message`/`team_inbox` require roster membership (`packages/sdk/src/core/ModeToolPolicy.ts:168-190`; T-17 work_note `note_1782974945104_qbs2sadt9`). |
| T6 | `setCollaborationMode(sessionId, 'solo' | 'team')` is a capability switch; comments state an active team is established through `team_manage(action="create")` and should not be coupled to the toggle itself (`packages/sdk/src/runtime/SessionManagerRuntime.ts:2220-2235`). |
| T7 | Session runtime setup constructs Workspace, TaskBoard, MessageBus, token tracker, LLM, ToolRegistry, and binds registry/team mailbox to database/session scope; this is too broad for a first declarative Team facade (`packages/sdk/src/runtime/SessionRuntime.ts:136-170`). |
| T8 | SessionManagerRuntime constructor depends on DB/emitter/base workspace, attaches team mailbox database, and persists full session runtime state (`packages/sdk/src/runtime/SessionManagerRuntime.ts:257-285`). |
| T9 | T-17 and T-19 both warn against a universal Team/SessionManager facade and recommend declarative roster/DAG/blackboard seed mapping first (`implementations/T-17.md`; `implementations/T-19.md`; work_notes `note_1782974945104_qbs2sadt9`, `note_1782973892587_olsqbs5kv`). |

## Problem

The SDK has real team capabilities, but current developer-facing examples mix three concepts:

- teaching-only team simulation in prompt/orchestration files (`T1`),
- declarative data that can plausibly become runtime input (`T2`, `T3`),
- actual SDK tools and mode gates that enforce team semantics (`T4`, `T5`, `T6`).

If the next API jumps directly to `createTeam()` or `createLingxiaoTeamRuntime()` as a universal wrapper over SessionManager, it would hide a large runtime dependency graph and overstate what the current example proves (`T7`, `T8`, `T9`).

## Goals

- Define a low-risk Team facade as a **plan builder** or **mapper** from declarative inputs to existing SDK capabilities (`T2`, `T3`, `T4`).
- Keep runtime mutations explicit: enabling team mode, creating active team, sending messages, inbox reads, and blackboard writes should remain observable tool/runtime actions (`T4`, `T5`, `T6`).
- Preserve the distinction between teaching simulation and real Team runtime. The example can supply roster/DAG/blackboard data, but the SDK facade must not imply the current prompt-only layer already runs distributed agents (`T1`, `T9`).
- Produce artifacts that are easy to validate: generated tool calls, blackboard seed writes, TaskBoard/DAG projections, and warnings for unsupported roles or invalid dependencies (`T2`, `T3`, `T5`).

## Non-goals

- Do not wrap `SessionManager` into a catch-all public facade. Evidence shows SessionManager/session runtime crosses DB, emitter, workspace, board, bus, LLM, ToolRegistry, team mailbox, workflow, and scheduler concerns (`T7`, `T8`).
- Do not claim the pentest teaching layer is a real multi-process or multi-agent scheduler; it explicitly says it is not (`T1`).
- Do not bypass ModeToolPolicy gates. The facade should respect leader/team/roster constraints rather than executing team tools through a privileged side path (`T5`).
- Do not hard-code pentest roles, CTF stages, vulnerability schemas, or the `8080` gateway caveat into generic SDK defaults; those are example inputs in `orchestration.ts` (`T2`, `T3`).
- Do not create a new blackboard implementation when the SDK already exposes a `blackboard` tool and existing storage conventions (`T3`, `T4`).

## API Candidate

The candidate API is deliberately framed as a mapper/plan, not an omnipotent runtime.

```ts
export interface TeamRosterMember {
  id: string;
  title?: string;
  mission?: string;
  prompt?: string;
}

export interface TeamDagStage {
  id: string;
  title?: string;
  owner: string;
  dependsOn?: string[];
  objective?: string;
  doneWhen?: string;
}

export interface BlackboardSeed {
  target?: string;
  acceptedScope?: string;
  findingStatuses?: string[];
  storage?: string[];
  schema?: Record<string, string>;
}

export interface TeamRuntimePlanInput {
  sessionId: string;
  roster: TeamRosterMember[];
  dag?: TeamDagStage[];
  blackboard?: BlackboardSeed;
}

export interface TeamRuntimePlan {
  mode: 'team';
  toolCalls: Array<{
    name: 'team_manage' | 'blackboard';
    args: Record<string, unknown>;
  }>;
  taskBoardSeed?: TeamDagStage[];
  warnings: string[];
}

export function createTeamRuntimePlan(input: TeamRuntimePlanInput): TeamRuntimePlan;
```

Implementation follow-up may add a separate executor, but only if it calls existing public runtime/tool paths and exposes results:

```ts
export async function applyTeamRuntimePlan(options: {
  plan: TeamRuntimePlan;
  registry: ToolRegistry;
  toolContext: ToolContext;
}): Promise<Array<{ name: string; result: ToolResult }>>;
```

### Candidate Mapping Rules

- Convert `roster` into a `team_manage` create/update action; do not silently create team state outside the tool/runtime gate (`T4`, `T5`, `T6`).
- Convert `blackboard` seed into `blackboard` tool calls or an equivalent explicit seed structure; do not create a second blackboard storage layer (`T3`, `T4`).
- Convert `dag` into a TaskBoard-compatible projection or plan metadata only after validating stage IDs, missing dependencies, cycles, and owner references (`T2`).
- Return warnings for example-only fields that cannot yet be executed by SDK runtime; do not pretend prompt-only behavior became runtime scheduling (`T1`, `T9`).
- Require caller-provided `sessionId`, registry, and tool context when applying a plan; do not internally instantiate SessionManager (`T7`, `T8`).

## Benefits

- Gives developers a concrete upgrade path from the existing teaching data to real SDK team tools without changing the meaning of those examples (`T1`, `T2`, `T3`, `T4`).
- Keeps ModeToolPolicy, roster membership, and collaboration-mode constraints visible and testable (`T5`, `T6`).
- Avoids a public API that would need to own DB/session/workspace/workflow lifecycle before the evidence supports it (`T7`, `T8`).
- Creates a stable, serializable artifact (`TeamRuntimePlan`) suitable for docs, dry runs, and tests before runtime mutation (`T2`, `T3`, `T9`).

## Risks

- A plan-only facade may feel less convenient than `createTeam()`, but it matches the evidence and prevents accidental over-commitment to SessionManager internals (`T7`, `T8`, `T9`).
- Mapping blackboard seed fields too rigidly could bake pentest-specific schema into SDK defaults; the schema must stay caller-provided (`T3`).
- Applying a plan through `ToolRegistry.execute` will surface existing permission/mode errors; this is desirable but must be documented so users understand why a roster/mode setup can fail (`T4`, `T5`, `T6`).
- DAG projection could imply scheduling semantics that are not yet implemented; the API should distinguish planning/validation from execution (`T1`, `T2`).

## Migration Strategy

1. Keep the current pentest orchestration file as declarative sample data; do not rewrite it as runtime scheduling until the mapper exists (`T1`, `T2`, `T3`).
2. Add `createTeamRuntimePlan` as a pure function first. Unit tests should cover roster, DAG, blackboard seed, invalid owners, missing dependencies, and warnings (`T2`, `T3`).
3. Add optional `applyTeamRuntimePlan` only after tests prove it uses `ToolRegistry.execute` and preserves ModeToolPolicy behavior (`T4`, `T5`).
4. Update docs/examples to show before/after: prompt-only teaching data becomes a dry-run plan, then an explicitly applied runtime plan. Do not use `createTeam()` terminology unless a real runtime API exists (`T1`, `T9`).

## Verification Strategy

- Pure-function tests for `createTeamRuntimePlan` with the current `TEAM_ROSTER`, `STAGE_DAG`, and `createBlackboardSeed` output from the pentest example (`T2`, `T3`).
- Negative tests for duplicate role IDs, DAG cycles, missing owners, missing dependency stages, and invalid blackboard schema values (`T2`, `T3`).
- Tool execution tests with a mock registry that verifies calls target `team_manage` and `blackboard`, not direct SessionManager internals (`T4`, `T7`, `T8`).
- Runtime integration tests, if added later, must exercise `setCollaborationMode`, active-team creation through `team_manage`, roster gating, and team inbox/message restrictions (`T5`, `T6`).
