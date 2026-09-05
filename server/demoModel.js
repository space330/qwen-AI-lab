// ============================================================================
// Demo model — an offline, deterministic stand-in for the Qwen API.
//
// Enabled with DEMO_MODE=1 (`npm run demo`). It has the *exact* return shape of
// qwenClient.callQwen, so it can be swapped in at the single call site in
// index.js without touching the agent loop, the tool registry, the NDJSON
// stream or the frontend:
//   { content, toolCalls, message, model, usage, id, finishReason }
//
// What is faked and what is real:
//   - Faked: the model turn (which tool to call next, and the final HTML).
//   - Real: every tool execution, the ReAct loop, the confirmation gate, the
//     NDJSON stream, the sanitizer and the chart pipeline. Tool arguments are
//     derived from the *actual* uploaded file and from previous *actual* tool
//     results, so the demo adapts to whatever the visitor uploads instead of
//     replaying a fixed transcript.
//
// Every demo answer carries a visible "演示模式" section so canned output is
// never mistaken for a live model answer.
// ============================================================================

import { config } from "./config.js";
import { parseCsv } from "../src/utils/fileParser.js";

const DEMO_NOTE =
  '<section class="section" id="demo-note"><h2>演示模式</h2>' +
  "<p>本回答由本地演示脚本生成，未调用真实千问模型；" +
  "工具链中的每一步都是后端真实执行的结果。配置 QWEN_API_KEY 后用 npm start 启动即可切换为真实模型。</p>" +
  "</section>";

export async function callDemoModel({
  messages = [],
  model = null,
  tools = null,
  onDelta = null,
  demoContext = null,
  latencyMs = null,
  streamIntervalMs = null,
} = {}) {
  const wait = Number.isFinite(latencyMs) ? latencyMs : config.demoLatencyMs;
  const interval = Number.isFinite(streamIntervalMs) ? streamIntervalMs : config.demoStreamIntervalMs;
  const modelName = model || config.qwenModel;
  const mode = String(demoContext?.mode || inferMode(messages));

  await delay(wait);

  if (mode === "agent") {
    return agentTurn({ messages, tools, model: modelName, demoContext });
  }

  const content =
    mode === "probe"
      ? "演示模式已就绪（未调用真实模型）。"
      : mode === "conversation-summary"
        ? composeSummary()
        : composeAnswer({ mode, demoContext });

  if (typeof onDelta === "function") {
    await streamText(content, onDelta, interval);
  }

  return respond({ content, model: modelName, messages });
}

// ---------------------------------------------------------------------------
// Agent turn: pick the next scripted tool call, or produce the final answer.
// ---------------------------------------------------------------------------

function agentTurn({ messages, tools, model, demoContext }) {
  const priors = collectToolResults(messages);
  const scenario = pickScenario(demoContext);
  // One tool message per executed (or denied) step, so the count *is* the
  // scenario's cursor — denials advance it too, exactly like a real model that
  // sees the refusal and moves on.
  const stepIndex = priors.length;
  const hasTools = Array.isArray(tools) && tools.length > 0;
  const nextStep = hasTools ? scenario.steps[stepIndex] : null;
  const call = nextStep ? safeStep(nextStep, priors, scenario.ctx) : null;

  if (call?.name) {
    const toolCall = {
      id: `demo-${call.name}-${stepIndex + 1}`,
      type: "function",
      function: { name: call.name, arguments: JSON.stringify(call.args || {}) },
    };
    return respond({ content: "", toolCalls: [toolCall], model, messages });
  }

  return respond({ content: `${scenario.final(priors, scenario.ctx)}${DEMO_NOTE}`, model, messages });
}

function safeStep(step, priors, ctx) {
  try {
    return step(priors, ctx);
  } catch {
    // A malformed tool result must not crash the demo — fall through to the
    // final answer instead.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Scenario selection. Deterministic keyword routing over the user's input and
// the uploaded file; documented for demo drivers in docs/demo.md.
// ---------------------------------------------------------------------------

export function pickScenario(demoContext) {
  const input = String(demoContext?.input || "");
  const file = demoContext?.file || null;
  const text = input.toLowerCase();
  const base = { input, file };

  if (hasAny(text, ["记住", "记一下", "别忘", "remember"])) {
    return memoryScenario({ ...base, memo: extractMemo(input) });
  }
  if (file?.type === "csv") {
    return csvScenario(base);
  }
  const expression = extractExpression(input);
  if (expression || hasAny(text, ["计算", "算一下", "算下", "calculate"])) {
    return calcScenario({ ...base, expression: expression || "1342 * 9482 + 284.22" });
  }
  if (file?.content) {
    return fileScenario({ ...base, keyword: extractKeyword(input, file) });
  }
  return researchScenario({ ...base, query: input.trim() || "Qwen Agent Lab" });
}

// 1) Memory + human-in-the-loop confirmation gate.
function memoryScenario(ctx) {
  return {
    id: "memory",
    ctx,
    steps: [
      (priors, c) => ({ name: "memory_search", args: { query: c.memo.slice(0, 20), scope: "all", limit: 5 } }),
      (priors, c) => ({
        name: "memory_write",
        args: { scope: "profile", kind: "preference", content: c.memo },
      }),
    ],
    final(priors, c) {
      const found = lastData(priors, "memory_search")?.matches || [];
      const write = lastResult(priors, "memory_write");
      const saved = write?.data?.saved || null;
      const denied = Boolean(write && String(write.raw).startsWith("DENIED:"));

      const existing = found.length
        ? `<ul>${found
            .slice(0, 5)
            .map((item) => `<li>${esc(item.content || "")}（${esc(item.scope || "")} · ${esc(item.kind || "")}）</li>`)
            .join("")}</ul>`
        : "<p>本地记忆库中还没有相关条目。</p>";

      const outcome = denied
        ? "<p>你在时光轴里点了「拒绝」，这条记忆没有写入。写记忆是带确认门的工具，未经允许后端不会落盘。</p>"
        : saved
          ? `<p>已写入本地记忆：${esc(saved.content || c.memo)}（scope=${esc(saved.scope || "profile")}，kind=${esc(saved.kind || "preference")}）。文件位于 server/data/，随时可以删除。</p>`
          : "<p>这条记忆没有写入（确认超时或会话断开）。</p>";

      return (
        section("mem-1", "已有记忆", existing) +
        section("mem-2", "本次写入", outcome) +
        section(
          "mem-3",
          "这一步在演示什么",
          "<p>memory_write 的元数据里带 requiresConfirmation: true。Agent 循环执行到它时会暂停，向前端推送 tool_confirm 事件，等你在工具链时光轴里点「允许」或「拒绝」，超时则自动取消。read-only 的 memory_search 不需要确认，直接执行。</p>",
        )
      );
    },
  };
}

// 2) CSV → 列画像 → 分组聚合 → 图表规格。
function csvScenario(ctx) {
  return {
    id: "csv",
    ctx,
    steps: [
      () => ({ name: "data_analyzer", args: { operation: "profile" } }),
      (priors) => {
        const profile = lastData(priors, "data_analyzer");
        const columns = profile?.columns || [];
        const label = (columns.find((col) => !col.numeric) || columns[0])?.name;
        const metric = columns.find((col) => col.numeric)?.name;
        if (!label || !metric || label === metric) return null;
        return {
          name: "data_analyzer",
          args: { operation: "aggregate", group_by: label, metric, agg: "sum", limit: 20 },
        };
      },
      (priors) => {
        const agg = lastData(priors, "data_analyzer");
        const rows = Array.isArray(agg?.rows) ? agg.rows : [];
        if (!rows.length || !agg?.group_by) return null;
        // aggregate sorts by value (desc); a trend chart needs the label axis
        // back in its natural order.
        const data = [...rows]
          .sort((a, b) => String(a[agg.group_by]).localeCompare(String(b[agg.group_by]), "zh-CN"))
          .map((row) => ({ [agg.group_by]: row[agg.group_by], [agg.metric]: row.value }));
        return {
          name: "chart_generator",
          args: { data, intent: "trend", title: `${agg.metric} 趋势` },
        };
      },
    ],
    final(priors, c) {
      const profile = firstData(priors, "data_analyzer");
      const chart = lastData(priors, "chart_generator");
      const overview = profile?.columns?.length
        ? `<p>文件 ${esc(profile.file || c.file?.name || "uploaded.csv")} 共 ${Number(profile.rowCount) || 0} 行、${profile.columns.length} 列。</p>${columnTable(profile.columns)}`
        : "<p>没有解析出可用的表格结构。</p>";

      const chartSection = chart?.embed
        ? `<p>${esc(chart.chart?.title || "趋势图")}：由 chart_generator 校验后的规格，前端图表管线据此出图。</p>${chartDataTable(chart.embed)}<div id="chart1"></div>`
        : "<p>没有生成图表规格（数据行不足或缺少数值列）。</p>";

      const insight = chart?.chart?.data?.length ? trendInsight(chart.chart) : "<p>数据点不足，无法给出趋势判断。</p>";

      return (
        section("csv-1", "数据概览", overview) +
        section("csv-2", "趋势图表", chartSection) +
        section("csv-3", "结论", insight)
      );
    },
  };
}

// 3) 精确计算。
function calcScenario(ctx) {
  return {
    id: "calc",
    ctx,
    steps: [(priors, c) => ({ name: "calculator", args: { expression: c.expression } })],
    final(priors, c) {
      const data = lastData(priors, "calculator");
      const body = data
        ? `<table><thead><tr><th>表达式</th><th>结果</th></tr></thead><tbody><tr><td>${esc(data.expression || c.expression)}</td><td>${esc(String(data.result))}</td></tr></tbody></table>`
        : `<p>表达式 ${esc(c.expression)} 求值失败。</p>`;
      return (
        section("calc-1", "计算结果", body) +
        section(
          "calc-2",
          "为什么走工具",
          "<p>calculator 是后端的递归下降求值器（不使用 eval），对 + - * / % ^ 与括号做确定性计算。数值题交给工具而不是让模型心算，结果可复现、可核对。</p>",
        )
      );
    },
  };
}

// 4) 文档定位 → 精读。
function fileScenario(ctx) {
  return {
    id: "file",
    ctx,
    steps: [
      (priors, c) => ({ name: "file_search", args: { query: c.keyword, max_matches: 8 } }),
      (priors) => {
        const found = lastData(priors, "file_search");
        const first = found?.matches?.[0]?.line || 1;
        return { name: "file_reader", args: { start_line: first, end_line: first + 40, max_chars: 2000 } };
      },
    ],
    final(priors, c) {
      const found = lastData(priors, "file_search");
      const read = lastData(priors, "file_reader");
      const hits = found?.matches?.length
        ? `<p>在 ${esc(found.file || "文件")}（共 ${Number(found.totalLines) || 0} 行）中命中 ${found.matchCount} 处「${esc(found.query || c.keyword)}」：</p><ul>${found.matches
            .slice(0, 5)
            .map((item) => `<li>第 ${Number(item.line)} 行：${esc(item.preview || "")}</li>`)
            .join("")}</ul>`
        : `<p>没有命中「${esc(c.keyword)}」，改为从文件开头读取。</p>`;
      const excerpt = read?.content
        ? `<ul>${String(read.content)
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, 8)
            .map((line) => `<li>${esc(line.slice(0, 120))}</li>`)
            .join("")}</ul>`
        : "<p>没有读到内容。</p>";
      return (
        section("file-1", "定位", hits) +
        section("file-2", "精读片段", excerpt) +
        section(
          "file-3",
          "这一步在演示什么",
          "<p>先用 file_search 定位行号，再用 file_reader 按行范围精读——大文件不会被整体塞进模型上下文，工具结果还会被统一截断，成本和上下文都是有界的。</p>",
        )
      );
    },
  };
}

// 5) 联网检索 → 结构化报告（演示模式下 web_search 走 mock provider，不出网）。
function researchScenario(ctx) {
  return {
    id: "research",
    ctx,
    steps: [
      (priors, c) => ({ name: "web_search", args: { query: c.query, count: 3 } }),
      (priors, c) => {
        const search = lastData(priors, "web_search");
        const results = Array.isArray(search?.results) ? search.results : [];
        if (!results.length) return null;
        return {
          name: "report_builder",
          args: {
            title: `${c.query.slice(0, 40)} · 调研简报`,
            sections: [
              {
                heading: "检索到的来源",
                body: results.map((item) => `- ${item.title}（${item.url}）`).join("\n"),
              },
              {
                heading: "要点",
                body: results.map((item) => `- ${item.snippet}`).join("\n"),
              },
              {
                heading: "说明",
                body:
                  `本简报由 web_search（provider=${search?.source || "mock"}）与 report_builder 两个工具串联产出，` +
                  "报告 HTML 由后端工具组装并转义，模型不直接拼装最终 HTML。",
              },
            ],
          },
        };
      },
    ],
    final(priors, c) {
      const report = lastData(priors, "report_builder");
      if (report?.final_answer_html) return String(report.final_answer_html);
      const search = lastData(priors, "web_search");
      const results = Array.isArray(search?.results) ? search.results : [];
      return section(
        "res-1",
        `关于「${esc(c.query)}」`,
        results.length
          ? `<ul>${results.map((item) => `<li>${esc(item.title)}：${esc(item.snippet)}</li>`).join("")}</ul>`
          : "<p>本次检索没有返回结果。</p>",
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Non-agent answers (chat / document / csv / summary).
// ---------------------------------------------------------------------------

function composeAnswer({ mode, demoContext }) {
  const input = String(demoContext?.input || "").trim();
  const file = demoContext?.file || null;

  if (mode === "csv" && file?.content) return `${csvAnswer(file)}${DEMO_NOTE}`;
  if (mode === "document" && file?.content) return `${documentAnswer(file)}${DEMO_NOTE}`;
  return `${chatAnswer(input, file)}${DEMO_NOTE}`;
}

function chatAnswer(input, file) {
  const question = input || (file ? `对文件 ${file.name} 的提问` : "（空提问）");
  return (
    section("chat-1", "你的问题", `<p>${esc(question)}</p>`) +
    section(
      "chat-2",
      "演示模式能看到什么",
      "<ul>" +
        "<li>普通对话：结构化 HTML、流式吐字、会话与附件全部存在浏览器 IndexedDB 里。</li>" +
        "<li>Agent 模式：真实的 ReAct 工具循环与工具链时光轴（计算、CSV 分析、出图、检索、记忆确认门）。</li>" +
        "<li>文档总结 / CSV 分析：确定性解析出的结构与图表，不是模型编的。</li>" +
        "</ul>",
    ) +
    section(
      "chat-3",
      "下一步",
      "<p>切到 Agent 模式，试试「帮我算一下 1342 * 9482 + 284.22」或上传 月度销售趋势.csv 后问「分析销量趋势并出图」。完整脚本见 docs/demo.md。</p>",
    )
  );
}

function documentAnswer(file) {
  const lines = String(file.content).split(/\r?\n/);
  const nonEmpty = lines.filter((line) => line.trim());
  const headings = lines.filter((line) => /^#{1,6}\s+/.test(line.trim())).slice(0, 8);
  const structure = headings.length
    ? `<ul>${headings.map((line) => `<li>${esc(line.replace(/^#+\s*/, "").slice(0, 100))}</li>`).join("")}</ul>`
    : "<p>文档没有 Markdown 标题层级。</p>";
  const excerpt = `<ul>${nonEmpty
    .slice(0, 6)
    .map((line) => `<li>${esc(line.trim().slice(0, 120))}</li>`)
    .join("")}</ul>`;

  return (
    section(
      "doc-1",
      "文档概览",
      `<p>${esc(file.name || "文档")}：${lines.length} 行、${String(file.content).length} 字符、${nonEmpty.length} 个非空行。</p>`,
    ) +
    section("doc-2", "结构", structure) +
    section("doc-3", "开头摘录", excerpt)
  );
}

function csvAnswer(file) {
  const { headers, rows, summary } = parseCsv(String(file.content));
  if (!headers.length) {
    return section("csv-1", "解析失败", "<p>这个文件不是可解析的 CSV 表格。</p>");
  }
  const labelIndex = Math.max(0, summary.findIndex((col) => col.numericCount === 0));
  const metricIndex = summary.findIndex((col) => col.numericCount > 0);
  const canChart = metricIndex !== -1 && metricIndex !== labelIndex && rows.length >= 2;

  const overview = `<p>${esc(file.name || "data.csv")}：${rows.length} 行 × ${headers.length} 列。</p>${columnTable(
    summary.map((col) => ({
      name: col.header,
      filled: col.count,
      missing: col.emptyCount,
      numeric: col.numericCount > 0,
      min: col.min,
      max: col.max,
      avg: col.avg != null ? Math.round(col.avg * 100) / 100 : null,
    })),
  )}`;

  const chartBlock = canChart
    ? `<p>${esc(headers[metricIndex])} 按 ${esc(headers[labelIndex])} 的分布：</p>${chartDataTable({
        headers: [headers[labelIndex], headers[metricIndex]],
        rows: rows.slice(0, 50).map((row) => [String(row[labelIndex] ?? ""), String(row[metricIndex] ?? "")]),
      })}<div id="chart1"></div>`
    : "<p>没有同时可用的标签列与数值列，跳过出图。</p>";

  return (
    section("csv-1", "数据概览", overview) +
    section("csv-2", "图表", chartBlock) +
    section(
      "csv-3",
      "说明",
      "<p>以上行列统计由后端 parseCsv 确定性解析得到（演示模式不调用模型），图表由前端图表管线渲染。</p>",
    )
  );
}

function composeSummary() {
  return "演示模式会话摘要：较早的对话涵盖工具调用演示与结构化输出。本摘要由本地脚本生成，未调用真实模型。";
}

// ---------------------------------------------------------------------------
// HTML helpers (output goes through the backend sanitizer, so tags stay within
// the allowlist: section / h2 / h3 / p / ul / ol / li / table / div).
// ---------------------------------------------------------------------------

function section(id, title, body) {
  return `<section class="section" id="${esc(id)}"><h2>${esc(title)}</h2>${body}</section>`;
}

function columnTable(columns) {
  const rows = columns
    .slice(0, 12)
    .map(
      (col) =>
        `<tr><td>${esc(col.name)}</td><td>${col.numeric ? "数值" : "文本"}</td><td>${Number(col.filled) || 0}</td><td>${
          col.missing ? esc(String(col.missing)) : "0"
        }</td><td>${col.avg != null ? esc(String(col.avg)) : "-"}</td></tr>`,
    )
    .join("");
  return `<table><thead><tr><th>列</th><th>类型</th><th>有值</th><th>缺失</th><th>均值</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function chartDataTable(embed) {
  const headers = (embed?.headers || []).map((head) => `<th>${esc(head)}</th>`).join("");
  const rows = (embed?.rows || [])
    .map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<table class="chart-data"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}

function trendInsight(chart) {
  const key = chart.labelKey;
  const metric = chart.seriesKeys?.[0];
  const points = (chart.data || [])
    .map((row) => ({ label: String(row[key] ?? ""), value: Number(row[metric]) }))
    .filter((point) => Number.isFinite(point.value));
  if (points.length < 2) return "<p>数据点不足，无法给出趋势判断。</p>";
  const first = points[0];
  const last = points[points.length - 1];
  const peak = points.reduce((best, point) => (point.value > best.value ? point : best), points[0]);
  const change = first.value === 0 ? null : Math.round(((last.value - first.value) / first.value) * 1000) / 10;
  return (
    `<ul><li>区间：${esc(first.label)} → ${esc(last.label)}，共 ${points.length} 个点。</li>` +
    `<li>首尾变化：${esc(String(first.value))} → ${esc(String(last.value))}${change == null ? "" : `（${change > 0 ? "+" : ""}${change}%）`}。</li>` +
    `<li>峰值：${esc(peak.label)}（${esc(String(peak.value))}）。</li></ul>`
  );
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Message / tool-result plumbing.
// ---------------------------------------------------------------------------

function collectToolResults(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((item) => item?.role === "tool")
    .map((item) => ({
      name: String(item.name || ""),
      raw: String(item.content ?? ""),
      data: parseJson(item.content),
    }));
}

function lastResult(priors, name) {
  for (let index = priors.length - 1; index >= 0; index -= 1) {
    if (priors[index].name === name) return priors[index];
  }
  return null;
}

function lastData(priors, name) {
  return lastResult(priors, name)?.data || null;
}

function firstData(priors, name) {
  return priors.find((item) => item.name === name)?.data || null;
}

function parseJson(text) {
  try {
    return JSON.parse(String(text ?? ""));
  } catch {
    return null;
  }
}

function respond({ content = "", toolCalls = [], model, messages = [] }) {
  const message = toolCalls.length
    ? { role: "assistant", content: content || "", tool_calls: toolCalls }
    : { role: "assistant", content };
  const inputChars = messages.reduce((sum, item) => sum + String(item?.content ?? "").length, 0);
  return {
    content,
    toolCalls,
    message,
    model,
    usage: {
      input_tokens: Math.ceil(inputChars / 4),
      output_tokens: Math.ceil(content.length / 4),
      total_tokens: Math.ceil((inputChars + content.length) / 4),
      demo: true,
    },
    id: null,
    finishReason: toolCalls.length ? "tool_calls" : "stop",
  };
}

function inferMode(messages) {
  return (Array.isArray(messages) ? messages : []).some((item) => item?.role === "tool" || item?.tool_calls)
    ? "agent"
    : "chat";
}

// ---------------------------------------------------------------------------
// Input parsing.
// ---------------------------------------------------------------------------

export function extractExpression(input) {
  const matches = String(input || "").match(/[0-9][0-9.\s()+\-*/%^]*[0-9)]/g) || [];
  const candidate = matches
    .map((item) => item.trim())
    .filter((item) => /[+\-*/%^]/.test(item))
    .sort((a, b) => b.length - a.length)[0];
  return candidate || "";
}

function extractMemo(input) {
  const text = String(input || "").trim();
  const match = text.match(/(?:记住|记一下|别忘了|remember)[：:，,\s]*(.+)$/i);
  const memo = (match ? match[1] : text).trim();
  return memo.slice(0, 200) || "用户偏好（演示）";
}

// Pick the search term for file_search. Chinese has no spaces, so candidates
// are latin words plus 2–4 character CJK n-grams from the question; the winner
// is the longest candidate that actually occurs in the uploaded file. That
// keeps the demo's first tool call meaningful for arbitrary files and
// questions instead of searching for a whole phrase that never matches.
export function extractKeyword(input, file) {
  const question = String(input || "").slice(0, 200);
  const haystack = String(file?.content || "").slice(0, 20000);
  const stop = new Set([
    "这个", "那个", "一下", "帮我", "怎么", "什么", "哪些", "内容", "文件", "文档",
    "总结", "分析", "看看", "里面", "关于", "如何", "the", "and", "for", "this", "that",
  ]);

  const candidates = new Set(question.match(/[A-Za-z][A-Za-z0-9_.+-]{1,23}/g) || []);
  for (const run of question.match(/[\u4e00-\u9fa5]{2,}/g) || []) {
    for (let size = 4; size >= 2; size -= 1) {
      for (let index = 0; index + size <= run.length; index += 1) {
        candidates.add(run.slice(index, index + size));
        if (candidates.size > 200) break;
      }
    }
  }

  let best = "";
  let bestCount = 0;
  for (const candidate of candidates) {
    if (candidate.length < 2 || stop.has(candidate.toLowerCase())) continue;
    const count = haystack.split(candidate).length - 1;
    if (!count) continue;
    if (candidate.length > best.length || (candidate.length === best.length && count > bestCount)) {
      best = candidate;
      bestCount = count;
    }
  }
  if (best) return best;

  const firstLine = String(file?.content || "").split(/\r?\n/).find((line) => line.trim());
  return (firstLine || "the").trim().slice(0, 12);
}

function hasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

// ---------------------------------------------------------------------------
// Pacing. The demo streams token-ish chunks so the "吐字式" UI behaves exactly
// as it does against the real API.
// ---------------------------------------------------------------------------

async function streamText(content, onDelta, intervalMs) {
  const chunkSize = 24;
  for (let index = 0; index < content.length; index += chunkSize) {
    onDelta(content.slice(index, index + chunkSize));
    if (intervalMs > 0) await delay(intervalMs);
  }
}

function delay(ms) {
  if (!(ms > 0)) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
