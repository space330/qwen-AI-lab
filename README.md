# Qwen Agent Lab

基于 Qwen 打造的本地优先 AI agent，当前版本 `2.2.0`，面向个人自用、轻办公和文字工作场景。

## 工程同步死规定

任何工程改动、功能交付、验收结果、版本号变更、仓库治理变更或重要架构调整，完成前必须同步到 Obsidian 对应项目节点。没有完成 Obsidian 同步，不允许宣称任务完成。

默认同步位置：

- `C:\Users\lenovo\Documents\Obsidian Vault\Qwen Agent Lab.md`
- `C:\Users\lenovo\Documents\Obsidian Vault\QWEN AI AGENT LAB 总体架构.md`
- `C:\Users\lenovo\Documents\Obsidian Vault\源码工作区清点.md`
- 必要时新增对应版本、验收、问题清单或收束记录节点。

## 当前能力

- 控制台式界面：顶部栏、左侧模式栏、中间 AI 输出区、底部固定输入区。
- 支持普通对话、Agent 模式、文档总结、CSV 分析和设置页切换。
- **Agent 模式（V2.0）**：真正的工具调用循环（ReAct），后端按 mode 分流，自主调用内置工具并通过 NDJSON 把每一步实时推送到前端「工具链时光轴」。
  - 内置工具：`calculator`（精确数学计算）、`file_reader`（按行读取已上传附件）、`web_search`（默认复用 DashScope key 的千问内置联网搜索，开箱即用；可切博查 Bocha 或 Mock）。
  - 工具循环上限默认 5 步（`AGENT_MAX_ITERATIONS`），超限自动收束为最终答案，避免死循环。
- **工具生态（V2.2）**：在工具治理层（分类徽标 / 单工具超时 / 结果截断 / 人工确认门）之上新增 7 个工具：
  - 本地：`file_search`（先定位再用 `file_reader` 精读）；分析：`data_analyzer`（CSV 列画像 / 分组聚合 / Top-N / 过滤，确定性计算不靠模型心算）。
  - 产出：`chart_generator`（校验图表规格并接入前端图表管线出图）、`report_builder`（把结论组装成转义安全的结构化报告 HTML）。
  - 联网：`web_fetch`（抓取 URL 正文 / 元数据 / 链接；内网网段 SSRF 防护，localhost 显式放行）。
  - 记忆：`memory_search` / `memory_write`（本地持久记忆，存于 `server/data/`，带来源与时间；**写入前需用户在时光轴中点「允许」**——`requiresConfirmation` 人工确认门，超时 `AGENT_CONFIRM_TIMEOUT_MS` 自动取消）。
  - 安全边界：本批次无任意代码执行、无浏览器操作、无本地文件写删；所有工具结果为有界结构化 JSON（单工具超时 + 结果截断）。
- 支持输入文本、上传或粘贴 `txt / md / csv` 文件。
- 支持 HTML 结构化回答；图表占位 / 数据表抽取 / 前端图表渲染用于文档总结、CSV 分析与 Agent 模式（普通对话已收紧为简短结构化输出，不含图表）。
- 支持快捷键输入：发送、聚焦输入框、打开文件选择、复制输出。
- 支持多轮对话上下文，只发送摘要与最近 8 个完整问答轮次。
- 支持新建、搜索、切换、重命名、删除和按模式隔离会话。
- 使用 IndexedDB 保存会话、消息、单会话附件和本地个人档案。
- 长会话自动后台摘要；摘要失败不会中断正常回答。
- 支持本地昵称、内置头像、默认模型和默认模式，以及全部数据导出与清除。
- API Key 仅由 Express 后端读取，不暴露给前端。

## 后端配置

复制示例配置为根目录 `.env`，并填入后端密钥：

```powershell
Copy-Item src/.env.example .env
```

`.env` 示例：

```env
PORT=5173
QWEN_API_KEY=你的千问 DashScope API Key
QWEN_MODEL=qwen3.7-max
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_TIMEOUT_MS=120000
QWEN_SLOW_MODEL_TIMEOUT_MS=240000
QWEN_MAX_TOKENS=1200
QWEN_REPORT_MAX_TOKENS=3200
QWEN_SUMMARY_MAX_TOKENS=700
QWEN_FILE_CHAR_LIMIT=6000

# Agent（V2.0）
AGENT_MAX_ITERATIONS=5
AGENT_MAX_TOOL_STEPS=8
# web_search 服务商：qwen（默认，复用 DashScope key 的千问内置搜索）| bocha | mock
WEB_SEARCH_PROVIDER=qwen
QWEN_SEARCH_MODEL=qwen-plus
# provider=bocha 时使用的博查 key（留空回退 Mock，仅后端读取）
BOCHA_API_KEY=
BOCHA_BASE_URL=https://api.bochaai.com/v1
```

> Agent 模式的 `web_search` **默认复用现有 `QWEN_API_KEY`，通过千问内置联网搜索返回实时结果，无需额外凭据**。如需结构化网页链接，可将 `WEB_SEARCH_PROVIDER` 设为 `bocha` 并配置 `BOCHA_API_KEY`。建议 Agent 模式使用支持函数调用的模型（如 `qwen3.7-max`、`qwen-max`、`qwen-plus`）。

## 运行方式

```powershell
cd "D:\Qwen Agent Lab"
npm install
npm start
```

打开：

```text
http://127.0.0.1:5173/
```

## API

- `GET /api/health`：检查服务和 Qwen 配置状态。
- `POST /api/qwen/plan`：生成回答规划。
- `POST /api/qwen/chat`：返回结构化 JSON。
- `POST /api/qwen/chat/stream`：NDJSON 流式返回。chat 等模式推送 `status` / `result` / `error`；Agent 模式额外推送 `tool_start` / `tool_result` / `tool_error`，供前端实时渲染工具链时光轴。
- `POST /api/qwen/conversation-summary`：后台压缩较早的会话消息。

## 测试

```powershell
npm test
```
