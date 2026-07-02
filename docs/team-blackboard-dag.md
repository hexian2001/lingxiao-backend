# Team / Blackboard / DAG 使用指南

本文讲 `@lingxiao-office/sdk` 里最适合构建多 Agent 协作的三件事：

- **Team**：让 Leader 建 roster、给成员发消息、收 inbox、形成 request/ack 闭环。
- **Blackboard**：让多个 Agent 把事实、意图、证据、关系写进同一张知识图。
- **TaskBoard DAG**：用任务依赖表达“先做什么、后做什么、哪些任务可并行”。

本版文档只展示 Team / Blackboard / DAG，不展示 Eternal / Workflow。若你只是做单 Agent，也可以只用 `createLLMClient()` + `createToolRegistry()`；Team/Blackboard/DAG 是在任务变复杂、需要协作时再打开的能力。

---

## 1. 总体模型

凌霄 SDK 的协作不是把所有流程写死成工作流，而是给 Leader 三类可组合能力：

```text
用户目标
  ↓
Leader 判断任务结构
  ├─ Team：谁适合做？谁要 review？怎么广播/私信/ack？
  ├─ Blackboard：哪些事实已确认？哪些假设待验证？证据在哪里？
  └─ TaskBoard DAG：哪些任务依赖哪些任务？哪些已经 ready？
```

推荐思路：

1. **Leader 先建任务 DAG**：把复杂目标拆成可验证子任务，设置 `blockedBy` 依赖。
2. **Leader 再建 Team roster**：给成员命名和分工，例如 `recon`、`operator`、`reviewer`。
3. **执行中持续写 Blackboard**：发现先写成 tentative/likely，验证后再升级为 confirmed。
4. **所有跨人协作走消息闭环**：需要答复时用 `type: 'request'` + `request_id`，处理完用 `type: 'ack'`。

---

## 2. Team：roster、消息、收件箱

Team 的常规入口是 ToolRegistry 工具：

- `team_manage`
- `team_message`
- `team_inbox`

不要直接依赖内部 `TeamMailbox` 细节；它属于 runtime 内部协作实现。外部开发者应通过工具层或完整 `SessionManager` 使用 Team 能力。

### 2.1 打开 Team 模式

真实 Team Runtime 通常由 `SessionManager` 管理：

```ts
import { DatabaseManager, SessionManager } from '@lingxiao-office/sdk';
import { createEventEmitter } from '@lingxiao-office/sdk/core/EventEmitter.js';

const db = new DatabaseManager('/tmp/lingxiao-sdk.db');
const emitter = createEventEmitter();
const manager = new SessionManager(db, emitter, process.cwd());

const sessionId = await manager.createSession('实现并验证 SDK 文档', process.cwd(), { idle: true });
const result = manager.setCollaborationMode(sessionId, 'team');
console.log(result.message);
```

`setCollaborationMode(sessionId, 'team')` 只是打开团队能力开关；真正建团仍由 Leader 使用 `team_manage(action: 'create')` 完成。

### 2.2 创建团队

```ts
import { createToolRegistry } from '@lingxiao-office/sdk';

const registry = createToolRegistry();

await registry.execute('team_manage', {
  action: 'create',
  team_name: 'sdk-docs',
  leader: 'leader',
  members: ['api-writer', 'example-dev', 'reviewer'],
  description: 'SDK 文档、示例和验收团队',
  workspace: process.cwd(),
}, { sessionId, agentName: 'leader' });
```

常用 `team_manage` action：

| action | 用途 |
| --- | --- |
| `create` | 创建 team，提供 `team_name`、`leader`、`members` |
| `edit` | 增删成员、改名、设置 leader |
| `list_members` | 查看 roster |
| `status` | 查看 team 状态 |
| `task_board` | 查看成员任务板 |
| `delete` | 删除 team |

### 2.3 发送 P2P / 广播消息

普通同步消息：

```ts
await registry.execute('team_message', {
  target_type: 'team',
  target: 'sdk-docs',
  intent: 'decision_record',
  content: 'API 文档采用三层口径：主入口、子路径高级 API、工具层入口。',
  artifact_paths: ['docs/api-reference.md'],
}, { sessionId, agentName: 'leader' });
```

需要明确答复的 request：

```ts
await registry.execute('team_message', {
  target_type: 'member',
  target: 'reviewer',
  intent: 'review_request',
  type: 'request',
  request_id: 'docs-api@v1',
  content: '请复核 docs/api-reference.md 是否存在杜撰 API。',
  artifact_paths: ['docs/api-reference.md'],
}, { sessionId, agentName: 'leader' });
```

收到 request 后，处理者用同一个 `request_id` 回 ack：

```ts
await registry.execute('team_message', {
  target_type: 'member',
  target: 'leader',
  intent: 'review_result',
  type: 'ack',
  request_id: 'docs-api@v1',
  verdict: 'PASS',
  content: '已复核，通过。未发现不存在的 API。',
  evidence_refs: ['docs/api-reference.md'],
}, { sessionId, agentName: 'reviewer' });
```

### 2.4 读取 inbox

```ts
const inbox = await registry.execute('team_inbox', {
  unread_only: true,
  mark_read: true,
  limit: 20,
}, { sessionId, agentName: 'reviewer' });
```

推荐约定：

- 开始任务先读 inbox，避免漏掉依赖和冲突通知。
- 结束前再读 inbox，确认没有未处理 request/ack。
- 普通广播不用填 `request_id`；只有 request/ack 需要稳定 ID。

---

## 3. Blackboard：共享事实、意图和证据

Blackboard 的常规入口同样是 ToolRegistry 工具：

```ts
await registry.execute('blackboard', args, { sessionId, agentName: 'leader' });
```

它把团队协作中的“口头信息”变成结构化知识图：

| 节点/边 | 用途 |
| --- | --- |
| fact | 已观察到的事实，可带 evidence 和 confidence |
| intent | 待执行/待探索目标，可带 priority |
| contract | 用 tags/kind 表达跨模块契约 |
| design_doc | 用于沉淀方案或架构判断 |
| edge | 表达 depends_on/supports/contradicts/refines 等关系 |

### 3.1 写入事实

```ts
await registry.execute('blackboard', {
  action: 'write_fact',
  title: 'ToolRegistry execute signature confirmed',
  content: 'ToolRegistry.execute(name, args, context?) returns Promise<ToolResult>.',
  tags: ['sdk', 'contract'],
  confidence: 'confirmed',
  evidence: [{
    type: 'file',
    ref: 'packages/sdk/src/tools/Registry.ts',
    location: '1427',
    snippet: 'async execute(name: string, args: unknown, context?: ToolContext): Promise<ToolResult>',
  }],
}, { sessionId, agentName: 'api-writer' });
```

### 3.2 声明意图

```ts
await registry.execute('blackboard', {
  action: 'declare_intent',
  title: '补齐 Team/Blackboard/DAG 文档',
  content: '写 docs/team-blackboard-dag.md，覆盖 Team roster、Blackboard graph、TaskBoard DAG。',
  tags: ['docs', 'team'],
  priority: 3,
}, { sessionId, agentName: 'leader' });
```

### 3.3 建立关系

```ts
await registry.execute('blackboard', {
  action: 'add_edge',
  from_node_id: 'intent-docs-api',
  to_node_id: 'fact-toolregistry-signature',
  edge_type: 'depends_on',
  metadata: { reason: 'API 文档必须先核对真实签名' },
}, { sessionId, agentName: 'leader' });
```

### 3.4 读取图谱

```ts
const summary = await registry.execute('blackboard', {
  action: 'read_graph',
  query_type: 'summary',
}, { sessionId, agentName: 'leader' });

const contracts = await registry.execute('blackboard', {
  action: 'read_graph',
  query_type: 'nodes_by_kind',
  kind: 'contract',
}, { sessionId, agentName: 'leader' });
```

推荐写法：

- 不确定的发现写 `confidence: 'tentative'`。
- 经过文件/测试/日志验证后再写 `confirmed`。
- 重要 API/数据结构变化用 `tags: ['contract']` 或 `kind: 'contract'` 的查询口径沉淀。
- 旧事实过期时用 `supersede_node`，不要悄悄覆盖历史。

---

## 4. TaskBoard DAG：任务依赖和可分发队列

`TaskBoard` 是主入口导出的 core API：

```ts
import { TaskBoard } from '@lingxiao-office/sdk';
```

DAG 依赖由 `blockedBy` / `blocks` 表达。核心模式是：创建任务 → 查询 ready/dispatchable → 分配给 Agent → 任务完成后依赖自动推进。

```ts
const board = new TaskBoard('session-docs');

board.createTask(
  'T-1',
  '核对 SDK 导出',
  '读取 packages/sdk/src/index.ts 和 package exports。',
  'research',
);

board.createTask(
  'T-2',
  '编写 API Reference',
  '基于 T-1 证据写 docs/api-reference.md。',
  'coding',
  ['T-1'],
);

board.createTask(
  'T-3',
  '验收文档',
  '检查文档存在、链接有效、无杜撰 API。',
  'qa',
  ['T-2'],
);

const ready = board.getDispatchable();
for (const task of ready) {
  board.assignTask(task.id, 'agent-doc-writer');
}
```

注意：不要写 `board.dispatch()`；当前真实 API 使用 `getDispatchable()` / `getReadyTasks()` 取候选任务，再用 `assignTask(id, agentId)` 进入 running。

---

## 5. Team + Blackboard + DAG 的最小组合

下面是一个可嵌入宿主的组合骨架：

```ts
import { TaskBoard, createToolRegistry } from '@lingxiao-office/sdk';

const registry = createToolRegistry();
const board = new TaskBoard(sessionId, undefined, undefined, process.cwd());

// 1) DAG：拆任务
board.createTask('T-1', '实现', '完成功能代码。', 'coding');
board.createTask('T-2', '复核', '复核实现和测试证据。', 'qa', ['T-1']);

// 2) Team：建 roster
await registry.execute('team_manage', {
  action: 'create',
  team_name: 'feature-team',
  leader: 'leader',
  members: ['coder', 'reviewer'],
}, { sessionId, agentName: 'leader' });

// 3) Blackboard：写初始目标
await registry.execute('blackboard', {
  action: 'declare_intent',
  title: 'Feature delivery',
  content: '按 DAG 完成功能实现与复核。',
  tags: ['delivery'],
  priority: 2,
}, { sessionId, agentName: 'leader' });

// 4) 分配 ready 任务
for (const task of board.getDispatchable()) {
  await registry.execute('team_message', {
    target_type: 'member',
    target: 'coder',
    intent: 'transfer_request',
    type: 'request',
    request_id: `${task.id}@v1`,
    content: `请处理任务 ${task.id}: ${task.subject}`,
  }, { sessionId, agentName: 'leader' });
  board.assignTask(task.id, 'coder');
}
```

真实产品中，Leader 可以根据上下文随时调整：新增任务、修改依赖、广播风险、把结论写入黑板、请求 reviewer 复核。重点不是把流程写死，而是把协作状态结构化，让 Agent 可以可靠地继续推进。

---

## 6. 与教学示例的关系

[`examples/pentest-agent`](../examples/pentest-agent/README.md) 是一个单进程教学项目。它用 TypeScript 数据结构和 prompt briefing 展示：

- Team roster：`leader` / `recon` / `operator` / `reporter` / `reviewer` 角色视角。
- Stage DAG：`scope → recon → enumeration → exploit → evidence → report → review`。
- Blackboard seed：候选发现、已验证事实、证据路径和报告路径。

该示例不是伪造新的 SDK API，也不是新增一堆低价值安全工具；它继续使用 SDK 内置 `createLLMClient()`、`createToolRegistry()` 和工具调用 loop。若要升级为真正 Team Runtime，按本文口径接入 `SessionManager.setCollaborationMode()`、`team_manage`、`team_message`、`team_inbox` 和 `blackboard`。

---

## 7. 设计原则

- **事实优先**：Blackboard 写事实时附 evidence；不确定就标 tentative。
- **消息闭环**：需要答复就用 request/ack，不需要就普通广播。
- **DAG 不僵化**：依赖图描述当前计划，Leader 可根据证据新增/调整任务。
- **工具层优先**：Team/Blackboard 推荐通过 ToolRegistry 工具使用，避免耦合内部 mailbox/graph。
- **Leader 保持灵活**：SDK 给 Leader 能力面，不强迫固定流程；复杂任务由 Leader 自己在 Team、Blackboard、DAG 之间切换控制。
