// Real, source-grounded data for the landing "Qwen 能力展示 + 模型对比" sections.
//
// Integrity rules (enforced by tests/landingData.test.js):
//  - QWEN_MODELS mirrors server/models.js MODEL_WHITELIST verbatim (the test
//    imports both and asserts they stay in sync — the frontend cannot import
//    server/ at runtime because it is not served to the browser).
//  - ENGINEERING_STATS mirrors real repo facts.
//  - Every CROSS_VENDOR numeric cell carries a non-empty `source` (an id present
//    in SOURCES) and `asOf` date — no unsourced numbers may appear on the page.
//
// Cross-vendor benchmark numbers are fast-moving and differ by source AND by
// index version. We therefore lock each value to a single dated source, never
// normalize across index versions, and surface a visible disclaimer + links.

// Mirrors server/models.js:1-9 (id / label / speed / note verbatim).
export const QWEN_MODELS = [
  { id: "qwen-turbo", label: "Qwen Turbo", speed: "最快", note: "适合简单问答，响应最快" },
  { id: "qwen-plus", label: "Qwen Plus", speed: "快", note: "均衡性能" },
  { id: "qwen-max", label: "Qwen Max", speed: "中", note: "更强推理，适合复杂任务" },
  { id: "qwen-long", label: "Qwen Long", speed: "中", note: "超长上下文，适合大文档" },
  { id: "qwen3.6-flash", label: "Qwen3.6 Flash", speed: "快", note: "新一代快速模型" },
  { id: "qwen3.6-max-preview", label: "Qwen3.6 Max Preview", speed: "慢", note: "最强能力，队列较慢" },
  { id: "qwen3.7-max", label: "Qwen3.7 Max", speed: "慢", note: "默认，最新旗舰模型", isDefault: true },
];

// Mirrors server/config.js run-time defaults (factual, not invented).
export const RUN_CONFIG = [
  { label: "默认模型", value: "qwen3.7-max" },
  { label: "Temperature", value: "0.25" },
  { label: "Top-p", value: "0.8" },
  { label: "端点", value: "DashScope 兼容模式 /compatible-mode/v1" },
  { label: "流式输出", value: "支持（SSE 逐 token）" },
  { label: "工具调用", value: "支持（tool_choice=auto）" },
  { label: "联网搜索", value: "支持（DashScope enable_search）" },
  { label: "Agent 上限", value: "5 轮 / 8 个工具步" },
];

// Real repo facts — drive the count-up stat counters.
export const ENGINEERING_STATS = [
  { key: "tests", value: 120, label: "自动化测试", suffix: "" },
  { key: "tools", value: 10, label: "Agent 工具", suffix: "" },
  { key: "toolCategories", value: 5, label: "工具类别", suffix: "" },
  { key: "chartTypes", value: 5, label: "图表类型", suffix: "" },
  { key: "models", value: 7, label: "可选模型", suffix: "" },
  { key: "extraDeps", value: 0, label: "额外运行依赖", suffix: "" },
];

// Real engineering capabilities to showcase (all grounded in repo source).
export const ENGINEERING_CAPABILITIES = [
  { title: "真 Agent 工具循环", text: "ReAct 式循环，10 个工具分 local / web / memory / analysis / output 五类，步数封顶 8，memory_write 触发 human-in-the-loop 确认。" },
  { title: "结构化 HTML 输出契约", text: "白名单标签 + 后端 sanitizer，回答恒为 section/表格/图表占位/结论结构，前端稳定渲染。" },
  { title: "确定性 CSV 状态机", text: "单遍字符状态机解析，正确处理引号、转义、内嵌换行与 BOM，相同输入恒定输出。" },
  { title: "五类图表自渲染", text: "line / bar / pie / scatter / table，从 <table class=\"chart-data\"> 直接出图，坏数据自动回退表格。" },
  { title: "本地持久化", text: "IndexedDB（profiles/conversations/messages/attachments），不可用时回退内存 Map。" },
  { title: "安全防线", text: "web_fetch SSRF（私网/云元数据/IPv6 映射拦截 + 逐跳校验），file_search ReDoS（拒绝嵌套量词/回引/超长 pattern）。" },
];

// Cited, dated cross-vendor data. NEVER mix index versions in one comparison.
export const SOURCES = [
  { id: "llm-stats", label: "llm-stats.com — Qwen3.7 Max", url: "https://llm-stats.com/models/qwen3.7-max", asOf: "2026-06" },
  { id: "artificialanalysis", label: "Artificial Analysis — Models / Intelligence Index", url: "https://artificialanalysis.ai/models", asOf: "2026-06" },
  { id: "digitalapplied", label: "Digital Applied — Qwen 3.7 Max (2026)", url: "https://www.digitalapplied.com/blog/qwen-3-7-max-alibaba-flagship-ai-model-2026", asOf: "2026-06" },
  { id: "qwen-official", label: "Qwen 官方博客 — Qwen3.7", url: "https://qwen.ai/blog?id=qwen3.7", asOf: "2026-06" },
];

export const CROSS_VENDOR = {
  disclaimer:
    "外部评测数字随版本更新，且不同来源/指数版本口径不一。以下截至 2026-06，每项均标注来源，仅供参考；请以各官方与 Artificial Analysis 最新数据为准。",
  // Qwen3.7 Max headline metrics — each cell sourced + dated.
  flagship: {
    id: "qwen3.7-max",
    label: "Qwen 3.7 Max",
    released: "2026-05",
    metrics: [
      { name: "上下文窗口", value: "1,000,000 tokens", source: "llm-stats", asOf: "2026-06" },
      { name: "价格 · 输入/输出 (每 1M)", value: "$1.25 / $3.75（Novita）", source: "llm-stats", asOf: "2026-06" },
      { name: "AA 智能指数 (v4.0)", value: "56.6 · #1 中文模型", source: "digitalapplied", asOf: "2026-06" },
      { name: "HMMT Feb-2026 数学", value: "97.1", source: "artificialanalysis", asOf: "2026-06" },
      { name: "SWE-bench Verified", value: "80.4", source: "qwen-official", asOf: "2026-06" },
      { name: "幻觉率（越低越好）", value: "22.9% · frontier 最低", source: "digitalapplied", asOf: "2026-06" },
    ],
  },
  // External leaderboard shown as a SEPARATE reference (single index version).
  // Qwen's own AA figure is v4.0, so it is intentionally NOT placed inside this
  // v4.1 list — they are different rulers and must not be normalized.
  intelligenceIndex: {
    title: "Artificial Analysis 智能指数 · v4.1 榜单（参考）",
    note: "Qwen 自身公开值为 v4.0 口径（56.6），与此 v4.1 榜单非同一标尺，故并列参考而非归一化对比。",
    source: "artificialanalysis",
    asOf: "2026-06",
    rows: [
      { model: "Claude Fable 5", score: 60 },
      { model: "Claude Opus 4.8", score: 56 },
      { model: "GPT-5.5 (xhigh)", score: 55 },
      { model: "Claude Opus 4.7", score: 54 },
    ],
  },
};
