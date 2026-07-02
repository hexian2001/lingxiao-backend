# 示例索引

本目录包含凌霄 SDK 的使用示例，从最简单的单任务 Agent 到完整的交互式多轮对话。

## 示例列表

| 示例 | 说明 | 适合场景 |
|---|---|---|
| [`single-task/`](./single-task/) | 最简单的单任务 Agent：检查工作目录文件，展示 `createAgentLoop` 基础用法 | 第一次接触凌霄 SDK，想跑通最小闭环 |
| [`interactive-chat/`](./interactive-chat/) | 完整交互式多轮对话 REPL：readline 输入、消息历史累积、hooks 展示工具调用 | 需要构建聊天机器人或交互式 Agent |
| [`pentest-agent/`](./pentest-agent/) | 自主渗透测试 Agent：多策略、CTF/realworld 识别、完整报告生成 | 想看凌霄 SDK 在复杂领域任务中的实战能力 |

## 运行方式

每个示例目录都有 `package.json`，进入对应目录后：

```bash
npm install
npm start        # 使用 tsx 直接运行 TypeScript
```

或在本仓库根目录开发时，先构建 SDK：

```bash
# 根目录
npm install
npm run build

# 然后进入示例目录
cd examples/single-task
npm install
npm start
```

## 环境变量

所有示例使用以下环境变量（均有占位默认值，方便快速试跑）：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `LX_API_KEY` | `sk-...` | LLM API Key |
| `LX_BASE_URL` | `https://api.openai.com/v1` | LLM 网关地址 |
| `LX_MODEL` | `gpt-4o` | 模型名 |

替换为你自己的 API Key 和网关地址即可运行。
