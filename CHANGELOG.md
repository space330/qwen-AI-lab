# 版本更新记录 · Changelog

本文件记录 Qwen Agent Lab 的版本演进。格式参考 [Keep a Changelog](https://keepachangelog.com/)，
日期为 ISO（YYYY-MM-DD）。详细验收见 `docs/` 下各版本验收文档与 `docs/v2.0-v2.1-delivery-acceptance-report.md`。

> 说明：当前应用版本已提升为 `2.2.0`，历史版本条目保留各自交付时的语境。

---

## [2.1.0] - 2026-06-06 · 输出与生态增强（功能交付）

### 新增
- **任意范围多选导出**：Export Mode + 消息复选框 + 底部浮动 Dock（全选 / HTML 下载 / PDF 打印 / 取消），支持连续与非连续勾选。
- **主题化 Standalone HTML 导出**（`src/utils/exportReport.js`）：选中卡片包成自包含 HTML，内嵌 Lysandra 暗色玻璃主题与图表样式，离线可独立渲染、无外部依赖。
- **PDF 一键打印**：`@media print` 隐藏顶栏/侧栏/输入坞/复选框/Dock，仅渲染选中卡片，`break-inside: avoid` 防切割。
- **实时「吐字式」流式渲染**：后端 `streamQwenOnce` 经 `delta` 事件流式回传 token，前端打字机动画 + 闪烁光标，结束换入渲染后 HTML。
- **五大图表自愈**（`src/components/chartPolisher.js`）：折线 / 柱状 / 饼图 / 散点 / 表格的极值裁剪、空值兜底、单点降级。

### 优化
- **防崩环境变量解析**（`server/config.js`）：`parseIntEnv` / `parseFloatEnv`，非法值安全回退默认。
- **高精度 CSV 分词**（`src/utils/fileParser.js`）：状态机 `tokenizeCsv`，正确处理单元格内换行与带逗号 quoted 字段。
- **安全**：导出标题 `escapeHtml` 防 XSS；图表除零 / NaN 守卫；卡片内容仅取自后端白名单净化节点。

### 验收
- 9 项人工 + 自动化验收全部通过（`docs/v2.1-acceptance.md`）；自动化断言增至 76。

---

## [2.0.0] - 2026-06-04 · 真·Agent（ReAct 工具调用循环）

### 新增
- **Agent 执行核心**（`server/agentExecutor.js` `runAgent`）：ReAct 多步工具循环，async generator，与传输/服务商解耦。
- **内置工具**：`calculator`（自实现解析器，非 eval，除零报错）、`file_reader`（按行读附件）、`web_search`（默认 `provider=qwen` 复用 DashScope key 的千问内置搜索，可选 `bocha`/`mock`）。
- **统一 toolSteps 契约**：`step/tool/status/args/result/error/durationMs`，贯通流式事件、最终响应、前端状态与 IndexedDB 持久化。
- **工具链时光轴**：前端按 toolSteps 渲染运行/完成/错误时间线。

### 优化 / 修复
- `/api/qwen/chat`（非流式）接入完整 Agent 循环；Chat 模式严格不调用工具。
- 新增 `AGENT_MAX_ITERATIONS`（5）、`AGENT_MAX_TOOL_STEPS`（8）上限与 `agentTruncatedReason` 标记。
- 工具错误 / 未知工具 → `tool_error` 回填不崩溃；真实搜索失败不静默降级。
- 版本号统一为 `2.0.0`（README / package.json / package-lock.json / 数据导出）。

### 验收
- 16 项验收全部通过（`docs/v2.0-acceptance.md`）；问题清单 P0–P2 全部修复（`docs/v2.0-issues.md`）。

---

## [1.2.0] - 2026-06-04 · 对话体验升级（基线）

### 新增
- 多轮上下文（摘要 + 最近 8 轮）、会话 CRUD / 搜索 / 自动标题、按模式隔离会话、本地个人档案、数据导出与清除。

### 存储 / 接口
- 会话数据由 `localStorage v6` 迁移到原生 IndexedDB（迁移成功前保留旧数据，不可用时降级内存模式）。
- `/api/qwen/chat(/stream)` 支持 `context`；新增 `POST /api/qwen/conversation-summary`；后端限制历史角色 / 轮次 / 长度。

### 验收
- 12 项验收通过（`docs/v1.2-acceptance.md`），破坏性操作与长会话手感保留人工确认。

---

## [2.2.0] - 2026-06-15 · V2.2 工具生态

### 新增 · 工具治理层（Phase 0）
- 工具元数据契约：`category / dangerous / requiresConfirmation / timeoutMs / maxResultChars`。
- **人工确认门**：`requiresConfirmation` 工具执行前暂停，时光轴弹「允许 / 拒绝」；拒绝/超时/断连均回填模型自适应（`POST /api/qwen/agent/confirm`，`AGENT_CONFIRM_TIMEOUT_MS` 默认 120s）。
- 单工具超时（默认 20s）与结果截断（默认 6000 字符）由执行器统一强制。
- 时光轴显示工具分类徽标（本地 / 联网 / 记忆 / 分析 / 产出）与「待确认 / 已拒绝」状态。

### 新增 · 7 个工具（零新依赖）
- `file_search`：上传文件内关键词 / 正则定位（先搜后读）。
- `data_analyzer`：CSV 列画像、分组聚合、Top-N、条件过滤（复用状态机 CSV 解析器，确定性计算）。
- `chart_generator`：意图→图表类型映射 + 数据校验，经 chartSpec 桥接前端图表管线（已实测「分析→出图」闭环）。
- `report_builder`：把章节组装为全转义安全报告 HTML（无脚本可存活）。
- `web_fetch`：URL 正文 / 元数据 / 链接提取；http(s)-only + 内网网段 SSRF 防护（localhost 放行）。
- `memory_search` / `memory_write`：本地持久记忆（`server/data/agent-memory.json`，带来源/时间，容量上限 500 条，同句去重）；**写入走人工确认门**，已实测跨会话召回。

### 修复
- Agent 答案中图表占位位于 `<section>` 之外时 chartSpec 抽取为空：增加全文档兜底扫描。
- 移动端控制台横向溢出：新增 `@media (max-width:1099px)` 单列自适应布局与横向模式条。
- 隐藏抽屉撑大文档宽度：`html { overflow-x: clip }`；移动端头像拉伸为椭圆：锁定尾列 + 固定尺寸。
- 依赖中危 DoS：express→4.22.2、qs→6.15.2（`npm audit` 0 漏洞）。
- 安全修复（2026-06-16）：`web_fetch` 改为手动重定向并逐跳执行 SSRF 校验，阻止跳转到坏协议、内网和保留网段；`guardFetchUrl` 补充 IPv6-mapped IPv4 与 IPv6 私网/链路本地地址识别；`file_search` 在构造正则前拒绝高风险 ReDoS pattern，同时保留普通正则搜索能力。

### 优化
- 多选导出精修：`isExportableMessage` 仅放行真实用户/AI 内容、`Esc` 退出导出、Dock 计数 `N / M`、移动端 Dock 自适应。
- 官网/控制台融合（2026-06-17）：`/app` 内新增集成欢迎层，进入控制台不重置会话状态，顶栏 Lysandra 可再次唤起欢迎界面；独立 `/` 官网首页继续保留。

### 后续候选（V2.3 或独立评估）
- `document_parser`（需引入 PDF/DOCX/XLSX 解析依赖，单独评估）与 `browser_reader`（Playwright，建议降级 V2.3）。

> V2.2 设计来源：`D:\design\qwen-agent-lab-v2.2-tools-design.md`；方向占位见 `docs/v2.2-direction.md`。
# 2026-06-17 · Liquid Glass 视觉系统升级

## 优化

- 将官网首页、`/app` 集成欢迎层、控制台壳层、顶部栏、侧栏、AI 输出面板、消息卡、输入区、会话抽屉、个人面板和导出 Dock 的液态玻璃效果统一为 CSS token 系统。
- 新增 `--glass-bg-shell / rail / panel / card / control / float / overlay`、统一边框、阴影和 blur 层级，减少散装 rgba 与重复大面积 `backdrop-filter`。
- 收敛欢迎层、抽屉和导出 Dock 的大半径 blur，保留主层透亮感，同时降低嵌套玻璃的性能负担。

## 验收

- 新增 `tests/liquidGlass.test.js`，固定关键玻璃层必须引用共享 tokens。
- `npm.cmd test`：102/102 通过。

---

## [Unreleased] - 2026-06-17 · Welcome Qwen Showcase

### 新增
- 官网首页补齐 Qwen 能力展示区、模型浏览器、跨厂商来源化对比、工程能力统计与 Qwen 工程能力卡片。
- 新增 `landingInteractive.js`，支持 Qwen 模型芯片切换与详情面板更新。
- 扩展 `landingMotion.js`，支持视差、指针倾斜、计数器递增，并提供 reduced-motion 降级。

### 验收
- `node --test tests/landingMotion.test.js tests/landingInteractive.test.js tests/landing.test.js`：15/15 通过。
- 工程统计同步到当前完整测试数：120。

---

## [Unreleased] - 2026-06-17 · Landing 12-Scene Motion Upgrade

### 新增
- 将官网首页展示叙事从原来的大块结构拆成 12 个显式 `data-landing-scene` 场景：hero、status、qwen flagship、runtime、model browser、leaderboard、sources、capabilities、engineering stats、output、workflow、cta。
- 增加轻量转场钩子：`fade`、`scale`、`rise-soft`、`flip-soft`、`slide-up`、`zoom-fluid`，全部保持在 opacity/transform 范围内。
- 入口按钮支持 `data-transition`，不同入口可触发不同进入控制台动画。

### 验收
- 新增 landing 渲染测试覆盖 12 个展示场景和多样转场钩子。
