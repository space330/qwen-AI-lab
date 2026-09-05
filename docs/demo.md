# 离线演示模式（Demo Mode）

> 目的：**不配置任何 API Key、不联网**，也能把 Qwen Agent Lab 的完整形态跑给别人看。

```powershell
npm install
npm run demo
```

打开 http://127.0.0.1:5173/ ，右上角「API 状态」会显示 **演示模式**。

## 演示模式做了什么（以及没做什么）

| | 真实 | 脚本 |
| --- | --- | --- |
| 模型这一轮说什么（调哪个工具、最终 HTML） | | ✅ 本地脚本 |
| 工具执行（calculator / data_analyzer / chart_generator / file_search / file_reader / memory_*） | ✅ 后端真跑 | |
| ReAct 循环、步数上限、工具超时与结果截断 | ✅ | |
| `requiresConfirmation` 人工确认门 | ✅ | |
| NDJSON 流式事件与工具链时光轴 | ✅ | |
| HTML 白名单清洗与前端图表管线 | ✅ | |
| 会话 / 附件 / 记忆持久化 | ✅ | |

也就是说：**只有“模型说话”这一层是假的，工程链路全是真的。** 工具参数由脚本从
*你实际上传的文件*和*上一步真实的工具输出*里推导，所以换一份 CSV，图表和结论也会跟着变。

每条演示回答末尾都带一个「演示模式」小节，避免被误当成真实模型输出。启动时终端也会打印同样的提示。

- 演示模式下 `web_search` 强制走离线 mock provider，检索结果带 `[Mock]` 前缀，**不出网**。
- 配置好 `QWEN_API_KEY` 后用 `npm start` 启动，即可切回真实千问模型，代码路径完全一致。

## 五分钟演示脚本

准备：仓库根目录的 `月度销售趋势.csv` 和 `Agent-ReAct-解析.md` 直接可用作上传素材。

### 1. 普通对话（30 秒）

模式：**对话** → 输入「这个项目能做什么？」

看点：流式吐字、结构化 HTML 分节、右侧会话抽屉里自动建的会话（存在浏览器 IndexedDB）。

### 2. Agent · 精确计算（30 秒）

模式：**Agent** → 输入「帮我算一下 1342 * 9482 + 284.22」

看点：工具链时光轴里出现 `calculator` 一步，参数、返回值、耗时都在。结果 `12725128.22`
来自后端的递归下降求值器，不是模型心算。

### 3. Agent · CSV 分析并出图（90 秒 · 主菜）

模式：**Agent** → 上传 `月度销售趋势.csv` → 输入「分析销量趋势并出图」

看点：一条问题触发三步真实工具调用——

1. `data_analyzer(profile)`：列画像，认出「月份」是标签列、「产品A销量」是数值列；
2. `data_analyzer(aggregate)`：按月分组求和（列名来自上一步的真实结果）；
3. `chart_generator(trend)`：校验图表规格，前端据此渲染折线图。

最终答案里的「首尾变化 +91.7%」「峰值 2024-12」是从工具返回的数据算出来的。

### 4. Agent · 记忆写入与人工确认门（60 秒 · 安全叙事）

模式：**Agent** → 输入「记住我以后看数据都要折线图」

看点：`memory_search`（只读）直接执行；`memory_write` 停下来，时光轴弹出「允许 / 拒绝」。

- 点**拒绝**：最终答案会明说「没有写入」——未经允许后端不落盘。
- 点**允许**：写入 `server/data/`，再问一次「记住…」时 `memory_search` 就能查到上一条。

建议先演示「拒绝」，再演示「允许」，对比最有说服力。

### 5. Agent · 大文档先定位再精读（45 秒）

模式：**Agent** → 上传 `Agent-ReAct-解析.md` → 输入「这个文档里 ReAct 状态机是怎么讲的」

看点：`file_search` 先给出命中行号，`file_reader` 只读那一段——大文件不会被整体塞进上下文。

### 6. 文档总结 / CSV 分析（各 30 秒）

模式：**文档总结** 上传 md，或 **CSV 分析** 上传 csv。这两个模式下演示模式给出的行数、
列画像、标题层级全部来自后端确定性解析，不是编的。

## 脚本路由规则

演示模式按下面的顺序匹配输入，选定一个剧本（`server/demoModel.js` 里的 `pickScenario`）：

| 顺序 | 命中条件 | 剧本 | 工具链 |
| --- | --- | --- | --- |
| 1 | 含「记住 / 记一下 / 别忘 / remember」 | memory | `memory_search` → `memory_write`（确认门） |
| 2 | 上传了 csv | csv | `data_analyzer` ×2 → `chart_generator` |
| 3 | 含算式，或「计算 / 算一下 / calculate」 | calc | `calculator` |
| 4 | 上传了 txt / md | file | `file_search` → `file_reader` |
| 5 | 其它（默认） | research | `web_search`(mock) → `report_builder` |

## 相关配置

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `DEMO_MODE` | `0` | `1` 时启用演示模型；`npm run demo` 会自动设置 |
| `DEMO_LATENCY_MS` | `350` | 每一轮"模型"的模拟思考时间 |
| `DEMO_STREAM_INTERVAL_MS` | `16` | 流式吐字的块间隔，调大更"慢镜头" |

演示模式下 `WEB_SEARCH_PROVIDER` 被强制为 `mock`，`.env` 里的设置不会生效。

## 常见问题

- **图表没出来？** 只有 `chart_generator` 成功、且最终 HTML 里同时有 `<table class="chart-data">`
  和 `<div id="chart1"></div>` 时才渲染。CSV 至少要有一个标签列 + 一个数值列、两行以上数据。
- **确认门没弹出来？** 确认门只在流式路径（前端正常发送）生效；`AGENT_CONFIRM_TIMEOUT_MS`
  默认 120 秒，超时自动取消。
- **想清掉演示写入的记忆？** 删掉 `server/data/` 即可（该目录已被 .gitignore 忽略）。
