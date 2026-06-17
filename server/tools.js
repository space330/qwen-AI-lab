import { config } from "./config.js";
import { AppError } from "./errors.js";
import { callQwen } from "./qwenClient.js";
import { parseCsv } from "../src/utils/fileParser.js";
import { searchMemory, writeMemory, memoryScopes, memoryKinds } from "./memoryStore.js";

// ============================================================================
// Tool registry for the V2.0 agent loop.
//
// Each tool exposes an OpenAI-style JSON Schema (so it can be advertised to
// Qwen via the `tools` param) plus a `run(args, ctx)` implementation. All first
// generation tools are read-only (no write/delete), so they execute silently.
// `ctx` carries per-request data such as the uploaded file for file_reader.
//
// Governance fields (read by the agent loop, not advertised to the model):
//   category             — "local" | "web" | "memory" | "analysis" | "output";
//                          shown in the frontend tool timeline.
//   dangerous            — side-effectful / irreversible class (informational).
//   requiresConfirmation — pause the agent and require an explicit user
//                          allow/deny before this tool runs (memory_write).
//   timeoutMs            — per-tool execution timeout enforced by the loop.
//   maxResultChars       — result size cap before feeding back into context.
// ============================================================================

export const TOOL_CATEGORIES = ["local", "web", "memory", "analysis", "output"];

const TOOLS = {
  calculator: {
    name: "calculator",
    description:
      "对一个数学表达式求值。支持 + - * / % ^ 与括号、小数。用于精确数值计算，避免大模型心算出错。",
    category: "analysis",
    dangerous: false,
    requiresConfirmation: false,
    timeoutMs: 5000,
    maxResultChars: 2000,
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "要计算的数学表达式，例如 \"1342 * 9482 + 284.22\"",
        },
      },
      required: ["expression"],
    },
    async run(args) {
      const expression = String(args?.expression || "").trim();
      if (!expression) throw new AppError("TOOL_BAD_ARGS", "calculator 需要 expression 参数。", 400);
      const value = evaluateExpression(expression);
      return JSON.stringify({ expression, result: value });
    },
  },

  file_reader: {
    name: "file_reader",
    description:
      "读取当前会话已上传文件的内容片段。可按行范围读取（如 CSV 的某几行），避免一次性塞入整个大文件。",
    category: "local",
    dangerous: false,
    requiresConfirmation: false,
    timeoutMs: 5000,
    maxResultChars: 6000,
    parameters: {
      type: "object",
      properties: {
        start_line: { type: "integer", description: "起始行号（从 1 开始，含）。默认 1。", minimum: 1 },
        end_line: { type: "integer", description: "结束行号（含）。默认读到文件末尾或行数上限。", minimum: 1 },
        max_chars: { type: "integer", description: "返回内容的最大字符数，默认 4000。", minimum: 1 },
      },
    },
    async run(args, ctx) {
      const file = ctx?.file;
      if (!file?.content) {
        return JSON.stringify({ error: "no_file", message: "当前会话没有可读取的已上传文件。" });
      }
      const lines = String(file.content).split(/\r?\n/);
      const total = lines.length;
      const start = Math.max(1, Number(args?.start_line) || 1);
      const end = Math.min(total, Number(args?.end_line) || total);
      const maxChars = Math.max(1, Number(args?.max_chars) || 4000);
      if (start > total) {
        return JSON.stringify({ error: "out_of_range", message: `文件共 ${total} 行，起始行 ${start} 超出范围。`, totalLines: total });
      }
      let slice = lines.slice(start - 1, Math.max(start, end)).join("\n");
      let truncated = false;
      if (slice.length > maxChars) {
        slice = slice.slice(0, maxChars);
        truncated = true;
      }
      return JSON.stringify({
        name: file.name || "uploaded-file",
        type: file.type || "unknown",
        totalLines: total,
        startLine: start,
        endLine: Math.min(total, Math.max(start, end)),
        truncated,
        content: slice,
      });
    },
  },

  web_search: {
    name: "web_search",
    description: "联网检索实时信息。用于回答涉及最新事件、版本、外部知识的问题。",
    category: "web",
    dangerous: false,
    requiresConfirmation: false,
    timeoutMs: 30000,
    maxResultChars: 6000,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "检索关键词或问题。" },
        count: { type: "integer", description: "返回结果条数，默认 5，最多 10。", minimum: 1, maximum: 10 },
      },
      required: ["query"],
    },
    async run(args) {
      const query = String(args?.query || "").trim();
      if (!query) throw new AppError("TOOL_BAD_ARGS", "web_search 需要 query 参数。", 400);
      const count = Math.min(10, Math.max(1, Number(args?.count) || 5));
      const provider = config.webSearchProvider;

      // Forced mock (offline / explicitly configured).
      if (provider === "mock") {
        return JSON.stringify(mockSearch(query, count));
      }

      // Bocha real search (requires a separate key; mock-marked when absent).
      if (provider === "bocha") {
        if (!config.bochaApiKey) return JSON.stringify(mockSearch(query, count));
        try {
          return JSON.stringify(await bochaSearch(query, count));
        } catch (error) {
          return JSON.stringify(searchError(query, error));
        }
      }

      // Default: reuse the DashScope key via Qwen's built-in web search — no
      // extra credential needed. Real failures surface (no silent mock) so the
      // agent can keep answering from what it already has.
      try {
        return JSON.stringify(await qwenSearch(query, count));
      } catch (error) {
        return JSON.stringify(searchError(query, error));
      }
    },
  },

  // ==== V2.2 tools ==========================================================

  file_search: {
    name: "file_search",
    description:
      "在当前会话已上传的文件中搜索关键词或正则，返回匹配行号与预览。适合先定位，再用 file_reader 精读相关区段。",
    category: "local",
    dangerous: false,
    requiresConfirmation: false,
    timeoutMs: 5000,
    maxResultChars: 5000,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "要搜索的关键词或正则表达式。" },
        regex: { type: "boolean", description: "true 时把 query 当作正则表达式。默认 false。" },
        case_sensitive: { type: "boolean", description: "是否大小写敏感。默认 false。" },
        max_matches: { type: "integer", description: "最多返回的匹配数，默认 20，上限 50。", minimum: 1, maximum: 50 },
      },
      required: ["query"],
    },
    async run(args, ctx) {
      const file = ctx?.file;
      if (!file?.content) {
        return JSON.stringify({ error: "no_file", message: "当前会话没有可搜索的已上传文件。" });
      }
      const query = String(args?.query || "");
      if (!query) throw new AppError("TOOL_BAD_ARGS", "file_search 需要 query 参数。", 400);
      const maxMatches = Math.min(50, Math.max(1, Number(args?.max_matches) || 20));
      const flags = args?.case_sensitive ? "" : "i";

      let matcher;
      if (args?.regex) {
        const unsafe = validateSearchRegex(query);
        if (unsafe) {
          return JSON.stringify({ error: unsafe.error, message: unsafe.message });
        }
        try {
          matcher = new RegExp(query, flags);
        } catch {
          return JSON.stringify({ error: "bad_regex", message: `非法正则表达式：${query}` });
        }
      } else {
        matcher = new RegExp(escapeRegExp(query), flags);
      }

      const lines = String(file.content).split(/\r?\n/);
      const matches = [];
      let truncated = false;
      for (let i = 0; i < lines.length; i += 1) {
        if (!matcher.test(lines[i])) continue;
        if (matches.length >= maxMatches) {
          truncated = true;
          break;
        }
        matches.push({ line: i + 1, preview: lines[i].slice(0, 160) });
      }
      return JSON.stringify({
        query,
        file: file.name || "uploaded-file",
        totalLines: lines.length,
        matchCount: matches.length,
        truncated,
        matches,
      });
    },
  },

  data_analyzer: {
    name: "data_analyzer",
    description:
      "对当前会话上传的 CSV 做确定性的数据分析：列画像（profile）、分组聚合（aggregate）、Top-N（top_n）、条件过滤（filter）。统计请用本工具，不要心算。",
    category: "analysis",
    dangerous: false,
    requiresConfirmation: false,
    timeoutMs: 10000,
    maxResultChars: 6000,
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["profile", "aggregate", "top_n", "filter"],
          description: "profile=列画像；aggregate=按列分组聚合；top_n=按某数值列取前 N 行；filter=条件过滤行。",
        },
        group_by: { type: "string", description: "aggregate 时的分组列名。" },
        metric: { type: "string", description: "aggregate / top_n 时的数值列名。" },
        agg: { type: "string", enum: ["sum", "avg", "min", "max", "count"], description: "aggregate 的聚合方式，默认 sum。" },
        filter_column: { type: "string", description: "filter 时的列名。" },
        filter_op: { type: "string", enum: ["eq", "ne", "gt", "gte", "lt", "lte", "contains"], description: "filter 的比较方式。" },
        filter_value: { type: "string", description: "filter 的比较值。" },
        limit: { type: "integer", description: "返回行数上限，默认 10，上限 20。", minimum: 1, maximum: 20 },
      },
      required: ["operation"],
    },
    async run(args, ctx) {
      const file = ctx?.file;
      if (!file?.content) {
        return JSON.stringify({ error: "no_file", message: "当前会话没有可分析的已上传文件。" });
      }
      const { headers, rows, summary } = parseCsv(String(file.content));
      if (!headers.length) {
        return JSON.stringify({ error: "not_tabular", message: "上传文件不是可解析的 CSV 表格。" });
      }
      const limit = Math.min(20, Math.max(1, Number(args?.limit) || 10));
      const operation = String(args?.operation || "profile");

      if (operation === "profile") {
        return JSON.stringify({
          operation,
          file: file.name || "uploaded-file",
          rowCount: rows.length,
          columns: summary.map((col) => ({
            name: col.header,
            filled: col.count,
            missing: col.emptyCount,
            numeric: col.numericCount > 0,
            min: col.min,
            max: col.max,
            avg: col.avg != null ? Math.round(col.avg * 100) / 100 : null,
          })),
        });
      }

      const colIndex = (name) => headers.indexOf(String(name || "").trim());

      if (operation === "aggregate") {
        const groupIdx = colIndex(args?.group_by);
        const metricIdx = colIndex(args?.metric);
        if (groupIdx === -1 || metricIdx === -1) {
          return JSON.stringify({ error: "bad_column", message: `列不存在。可用列：${headers.join("、")}` });
        }
        const agg = ["sum", "avg", "min", "max", "count"].includes(args?.agg) ? args.agg : "sum";
        const groups = new Map();
        for (const row of rows) {
          const key = row[groupIdx] ?? "";
          const rawVal = row[metricIdx];
          const hasVal = rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== "";
          const value = hasVal ? Number(rawVal) : NaN;
          if (!groups.has(key)) groups.set(key, { count: 0, numericCount: 0, sum: 0, min: Infinity, max: -Infinity });
          const g = groups.get(key);
          g.count += 1;
          if (Number.isFinite(value)) {
            g.numericCount += 1;
            g.sum += value;
            g.min = Math.min(g.min, value);
            g.max = Math.max(g.max, value);
          }
        }
        const out = [...groups.entries()]
          .map(([key, g]) => ({
            [args.group_by]: key,
            value: agg === "count" ? g.count
              : agg === "avg" ? (g.numericCount ? Math.round((g.sum / g.numericCount) * 100) / 100 : null)
              : agg === "min" ? (g.min === Infinity ? null : g.min)
              : agg === "max" ? (g.max === -Infinity ? null : g.max)
              : Math.round(g.sum * 100) / 100,
          }))
          .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))
          .slice(0, limit);
        return JSON.stringify({ operation, group_by: args.group_by, metric: args.metric, agg, rows: out });
      }

      if (operation === "top_n") {
        const metricIdx = colIndex(args?.metric);
        if (metricIdx === -1) {
          return JSON.stringify({ error: "bad_column", message: `列不存在。可用列：${headers.join("、")}` });
        }
        const out = rows
          .map((row) => {
            const rawVal = row[metricIdx];
            const hasVal = rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== "";
            const value = hasVal ? Number(rawVal) : NaN;
            return { row, value };
          })
          .filter(({ value }) => Number.isFinite(value))
          .sort((a, b) => b.value - a.value)
          .slice(0, limit)
          .map(({ row }) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""])));
        return JSON.stringify({ operation, metric: args.metric, rowCount: out.length, rows: out });
      }

      if (operation === "filter") {
        const filterIdx = colIndex(args?.filter_column);
        if (filterIdx === -1) {
          return JSON.stringify({ error: "bad_column", message: `列不存在。可用列：${headers.join("、")}` });
        }
        const op = String(args?.filter_op || "eq");
        const target = String(args?.filter_value ?? "");
        const targetNum = Number(target);
        const keep = (cell) => {
          const text = String(cell ?? "");
          const hasNum = cell !== undefined && cell !== null && text.trim() !== "" && Number.isFinite(Number(text));
          const num = hasNum ? Number(text) : NaN;
          switch (op) {
            case "eq": return text === target;
            case "ne": return text !== target;
            case "contains": return text.toLowerCase().includes(target.toLowerCase());
            case "gt": return Number.isFinite(num) && Number.isFinite(targetNum) && num > targetNum;
            case "gte": return Number.isFinite(num) && Number.isFinite(targetNum) && num >= targetNum;
            case "lt": return Number.isFinite(num) && Number.isFinite(targetNum) && num < targetNum;
            case "lte": return Number.isFinite(num) && Number.isFinite(targetNum) && num <= targetNum;
            default: return false;
          }
        };
        const matched = rows.filter((row) => keep(row[filterIdx]));
        const out = matched.slice(0, limit).map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""])));
        return JSON.stringify({ operation, matchedCount: matched.length, returned: out.length, rows: out });
      }

      return JSON.stringify({ error: "bad_operation", message: `不支持的操作：${operation}` });
    },
  },

  chart_generator: {
    name: "chart_generator",
    description:
      "把分析好的数据生成校验过的图表规格。传入数据行与意图（trend/comparison/composition/relationship/table），返回推荐图表类型与最终答案中嵌入图表的方法。仅在数据已经分析/归一化后调用。",
    category: "output",
    dangerous: false,
    requiresConfirmation: false,
    timeoutMs: 5000,
    maxResultChars: 6000,
    parameters: {
      type: "object",
      properties: {
        data: {
          type: "array",
          description: "图表数据行，形如 [{\"月份\":\"1月\",\"销量\":120}, ...]。首个键为标签列，其余数值键为系列。",
          items: { type: "object" },
        },
        intent: {
          type: "string",
          enum: ["trend", "comparison", "composition", "relationship", "table"],
          description: "可视化意图：trend=趋势(line)、comparison=对比(bar)、composition=构成(pie)、relationship=关系(scatter)、table=表格。",
        },
        title: { type: "string", description: "图表标题。" },
      },
      required: ["data", "intent"],
    },
    async run(args) {
      const intentMap = { trend: "line", comparison: "bar", composition: "pie", relationship: "scatter", table: "table" };
      const type = intentMap[String(args?.intent || "")] || null;
      if (!type) {
        return JSON.stringify({ error: "bad_intent", message: "intent 必须是 trend/comparison/composition/relationship/table 之一。" });
      }
      const raw = Array.isArray(args?.data) ? args.data.filter((row) => row && typeof row === "object") : [];
      if (!raw.length) {
        return JSON.stringify({ error: "no_data", message: "data 为空，请先用 data_analyzer 产出数据行。" });
      }
      const data = raw.slice(0, 50);
      const keys = Object.keys(data[0] || {});
      if (keys.length < 2) {
        return JSON.stringify({ error: "bad_shape", message: "每行至少需要一个标签键和一个数值键。" });
      }
      const labelKey = keys[0];
      const numericKeys = keys.slice(1).filter((key) => data.some((row) => Number.isFinite(Number(row[key]))));
      if (!numericKeys.length) {
        return JSON.stringify({ error: "no_numeric", message: "没有可用的数值列。" });
      }
      const warnings = [];
      if (type === "line" && data.length < 2) warnings.push("折线图至少需要 2 个数据点，前端将自动降级为表格。");
      if (type === "pie" && numericKeys.length > 1) warnings.push("饼图只使用第一个数值列。");

      const headers = [labelKey, ...numericKeys];
      const tableRows = data.map((row) => headers.map((key) => String(row[key] ?? "")));
      return JSON.stringify({
        chart: { type, title: String(args?.title || "图表分析"), labelKey, seriesKeys: numericKeys, data },
        warnings,
        embed: {
          instructions:
            "在最终 HTML 中加入一个图表 section：包含 <h3> 标题、一段 <p> 说明、一个 <table class=\"chart-data\">（thead 为下方 headers，tbody 为 rows），以及紧随其后的 <div id=\"chart1\"></div> 占位。前端会用该表格数据渲染图表。",
          containerId: "chart1",
          headers,
          rows: tableRows,
        },
      });
    },
  },

  memory_search: {
    name: "memory_search",
    description:
      "搜索本地长期记忆（用户偏好、项目事实、过往决定）。回答前如怀疑用户有相关偏好或既定约定，先查记忆。",
    category: "memory",
    dangerous: false,
    requiresConfirmation: false,
    timeoutMs: 5000,
    maxResultChars: 4000,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "检索关键词；留空则返回最近的记忆。" },
        scope: { type: "string", enum: ["profile", "project", "all"], description: "记忆范围，默认 all。" },
        limit: { type: "integer", description: "返回条数，默认 5，上限 20。", minimum: 1, maximum: 20 },
      },
    },
    async run(args) {
      const matches = searchMemory({
        query: String(args?.query || ""),
        scope: String(args?.scope || "all"),
        limit: Number(args?.limit) || 5,
      });
      return JSON.stringify({ query: String(args?.query || ""), count: matches.length, matches });
    },
  },

  memory_write: {
    name: "memory_write",
    description:
      "把一条重要信息写入本地长期记忆（持久化）。仅当用户明确要求记住某事时调用；执行前会请用户确认。",
    category: "memory",
    dangerous: true,
    requiresConfirmation: true,
    timeoutMs: 5000,
    maxResultChars: 2000,
    parameters: {
      type: "object",
      properties: {
        scope: { type: "string", enum: memoryScopes(), description: "profile=关于用户本人；project=关于当前项目。" },
        kind: { type: "string", enum: memoryKinds(), description: "preference=偏好；fact=事实；decision=决定；task_note=待办备注。" },
        content: { type: "string", description: "要记住的内容（一句话，≤500 字）。" },
      },
      required: ["scope", "kind", "content"],
    },
    async run(args) {
      const saved = writeMemory({
        scope: String(args?.scope || "project"),
        kind: String(args?.kind || "fact"),
        content: String(args?.content || ""),
        source: "user_explicit",
      });
      return JSON.stringify({ saved });
    },
  },

  web_fetch: {
    name: "web_fetch",
    description:
      "抓取指定 URL 的网页内容并提取可读文本/标题/链接。用 web_search 找到来源后，用本工具读取具体页面全文。",
    category: "web",
    dangerous: false,
    requiresConfirmation: false,
    timeoutMs: 15000,
    maxResultChars: 8000,
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "要抓取的完整 URL（http/https）。" },
        mode: { type: "string", enum: ["text", "metadata", "links"], description: "text=正文文本（默认）；metadata=标题与描述；links=页面链接列表。" },
        max_chars: { type: "integer", description: "返回正文的最大字符数，默认 4000，上限 12000。", minimum: 100, maximum: 12000 },
      },
      required: ["url"],
    },
    async run(args) {
      const rawUrl = String(args?.url || "").trim();
      const guard = guardFetchUrl(rawUrl);
      if (guard) return JSON.stringify(guard);

      const mode = ["text", "metadata", "links"].includes(args?.mode) ? args.mode : "text";
      const maxChars = Math.min(12000, Math.max(100, Number(args?.max_chars) || 4000));

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      let response;
      let finalUrl = rawUrl;
      try {
        const fetched = await fetchWithGuardedRedirects(rawUrl, controller.signal);
        if (fetched.blocked) return JSON.stringify(fetched.blocked);
        response = fetched.response;
        finalUrl = fetched.finalUrl;
      } catch (error) {
        return JSON.stringify({ url: rawUrl, error: "fetch_failed", message: error?.message || "请求失败。" });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        return JSON.stringify({ url: finalUrl, error: "http_error", status: response.status });
      }
      const contentType = String(response.headers.get("content-type") || "");
      if (!/text\/html|text\/plain|application\/xhtml/.test(contentType)) {
        return JSON.stringify({ url: finalUrl, error: "unsupported_content_type", contentType });
      }

      const html = (await response.text()).slice(0, 800000);
      const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim()).slice(0, 200);

      if (mode === "metadata") {
        const description = decodeEntities(
          html.match(/<meta\s[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] || "",
        ).slice(0, 500);
        return JSON.stringify({ url: finalUrl, mode, title, description });
      }

      if (mode === "links") {
        const links = [];
        const seen = new Set();
        for (const match of html.matchAll(/<a\s[^>]*href=["'](https?:\/\/[^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
          const href = match[1];
          if (seen.has(href)) continue;
          seen.add(href);
          links.push({ url: href, text: decodeEntities(stripTags(match[2])).trim().slice(0, 80) });
          if (links.length >= 30) break;
        }
        return JSON.stringify({ url: finalUrl, mode, title, count: links.length, links });
      }

      const text = htmlToReadableText(html);
      const truncated = text.length > maxChars;
      return JSON.stringify({
        url: finalUrl,
        mode,
        title,
        truncated,
        content: truncated ? text.slice(0, maxChars) : text,
      });
    },
  },

  report_builder: {
    name: "report_builder",
    description:
      "把分析结论组装成结构化、安全的最终报告 HTML。当用户要求“报告/周报/总结文档”这类成品交付物时，最后一步调用；把返回的 final_answer_html 原样作为最终答案输出。",
    category: "output",
    dangerous: false,
    requiresConfirmation: false,
    timeoutMs: 5000,
    maxResultChars: 12000,
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "报告标题。" },
        sections: {
          type: "array",
          description: "报告章节列表，按顺序渲染。",
          items: {
            type: "object",
            properties: {
              heading: { type: "string", description: "章节标题。" },
              body: { type: "string", description: "章节正文（纯文本，换行分段；以 \"- \" 开头的连续行渲染为列表）。" },
            },
            required: ["heading", "body"],
          },
        },
      },
      required: ["title", "sections"],
    },
    async run(args) {
      const title = String(args?.title || "").trim().slice(0, 120);
      const sections = Array.isArray(args?.sections) ? args.sections.slice(0, 8) : [];
      if (!title || !sections.length) {
        return JSON.stringify({ error: "bad_args", message: "report_builder 需要 title 与至少一个 section。" });
      }
      const html = buildReportHtml(title, sections);
      return JSON.stringify({ title, sectionCount: sections.length, final_answer_html: html });
    },
  },
};

export function getTool(name) {
  return TOOLS[name] || null;
}

export function getToolSchemas() {
  return Object.values(TOOLS).map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

// ---------------------------------------------------------------------------
// calculator — deterministic expression evaluator (no eval / Function).
// Recursive-descent parser over a tokenized stream. Grammar (lowest→highest):
//   expr  := term (('+'|'-') term)*
//   term  := power (('*'|'/'|'%') power)*
//   power := unary ('^' power)?      (right associative)
//   unary := ('+'|'-') unary | primary
//   primary := number | '(' expr ')'
// ---------------------------------------------------------------------------
export function evaluateExpression(input) {
  const tokens = tokenize(input);
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpr() {
    let value = parseTerm();
    while (peek() && (peek().value === "+" || peek().value === "-")) {
      const op = next().value;
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  function parseTerm() {
    let value = parsePower();
    while (peek() && (peek().value === "*" || peek().value === "/" || peek().value === "%")) {
      const op = next().value;
      const rhs = parsePower();
      if ((op === "/" || op === "%") && rhs === 0) {
        throw new AppError("TOOL_MATH_ERROR", "数学错误：除数为零。", 400, { input });
      }
      value = op === "*" ? value * rhs : op === "/" ? value / rhs : value % rhs;
    }
    return value;
  }

  function parsePower() {
    const base = parseUnary();
    if (peek() && peek().value === "^") {
      next();
      const exponent = parsePower(); // right associative
      return Math.pow(base, exponent);
    }
    return base;
  }

  function parseUnary() {
    const token = peek();
    if (token && (token.value === "+" || token.value === "-")) {
      next();
      const operand = parseUnary();
      return token.value === "-" ? -operand : operand;
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const token = next();
    if (!token) throw new AppError("TOOL_MATH_ERROR", "表达式不完整。", 400, { input });
    if (token.type === "number") return token.value;
    if (token.value === "(") {
      const value = parseExpr();
      const closing = next();
      if (!closing || closing.value !== ")") {
        throw new AppError("TOOL_MATH_ERROR", "括号不匹配。", 400, { input });
      }
      return value;
    }
    throw new AppError("TOOL_MATH_ERROR", `表达式中存在非法符号：${token.value}`, 400, { input });
  }

  const result = parseExpr();
  if (pos !== tokens.length) {
    throw new AppError("TOOL_MATH_ERROR", "表达式格式错误。", 400, { input });
  }
  if (!Number.isFinite(result)) {
    throw new AppError("TOOL_MATH_ERROR", "计算结果无效（可能溢出或非数值）。", 400, { input });
  }
  return result;
}

function tokenize(input) {
  const text = String(input || "");
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let num = "";
      while (i < text.length && /[0-9.]/.test(text[i])) {
        num += text[i];
        i += 1;
      }
      const value = Number(num);
      if (!Number.isFinite(value)) {
        throw new AppError("TOOL_MATH_ERROR", `非法数字：${num}`, 400, { input });
      }
      tokens.push({ type: "number", value });
      continue;
    }
    if ("+-*/%^()".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i += 1;
      continue;
    }
    throw new AppError("TOOL_MATH_ERROR", `表达式中存在非法符号：${ch}`, 400, { input });
  }
  if (!tokens.length) {
    throw new AppError("TOOL_MATH_ERROR", "表达式为空。", 400, { input });
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// web_search backends
// ---------------------------------------------------------------------------
async function bochaSearch(query, count) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.bochaTimeoutMs);
  try {
    const response = await fetch(`${config.bochaBaseUrl}/web-search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.bochaApiKey}`,
      },
      body: JSON.stringify({ query, count, summary: true }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Bocha API ${response.status}`);
    }
    const payload = await response.json();
    // Bocha 返回结构以官方文档为准；这里做容错抽取常见字段。
    const pages =
      payload?.data?.webPages?.value ||
      payload?.data?.webPages ||
      payload?.webPages?.value ||
      [];
    const results = (Array.isArray(pages) ? pages : []).slice(0, count).map((page) => ({
      title: page.name || page.title || "",
      url: page.url || page.link || "",
      snippet: page.snippet || page.summary || page.description || "",
    }));
    return { query, source: "bocha", count: results.length, results };
  } finally {
    clearTimeout(timeout);
  }
}

// Real web search using Qwen's built-in search (DashScope enable_search). Reuses
// the existing QWEN_API_KEY — no extra credential. Returns the model's
// web-grounded answer as the tool result the agent reads.
async function qwenSearch(query, count) {
  const result = await callQwen({
    model: config.qwenSearchModel,
    enableSearch: true,
    temperature: 0,
    maxTokens: 900,
    messages: [
      {
        role: "system",
        content:
          "你是联网检索助手。请使用实时联网搜索，针对用户的查询返回最新、准确的关键事实，简洁分条列出，并尽量给出信息来源或时间。只返回检索结论，不要寒暄或追问。",
      },
      { role: "user", content: query },
    ],
  });
  return {
    query,
    source: "qwen-search",
    model: result.model,
    count,
    answer: String(result.content || "").trim(),
  };
}

function searchError(query, error) {
  // A real service was attempted but failed: surface the real reason (no silent
  // mock) so the agent can continue from existing information.
  return {
    query,
    source: "error",
    count: 0,
    results: [],
    error: error?.message || "web_search 请求失败。",
  };
}

function mockSearch(query, count) {
  const results = Array.from({ length: Math.min(count, 3) }, (_, index) => ({
    title: `[Mock] 关于「${query}」的检索结果 ${index + 1}`,
    url: `https://example.com/search?q=${encodeURIComponent(query)}&n=${index + 1}`,
    snippet: `这是未配置 BOCHA_API_KEY 时的占位检索结果（${index + 1}）。配置真实 key 后将返回博查实时结果。`,
  }));
  return { query, source: "mock", count: results.length, results, mock: true };
}

// ---------------------------------------------------------------------------
// V2.2 tool helpers
// ---------------------------------------------------------------------------

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateSearchRegex(query) {
  const pattern = String(query || "");
  if (pattern.length > 120) {
    return { error: "unsafe_regex", message: "正则表达式过长，已拒绝以避免搜索卡顿。" };
  }

  const nestedQuantifier = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)\s*[+*{?]/;
  const backreference = /\\[1-9]/;
  if (nestedQuantifier.test(pattern) || hasAmbiguousRepeatedAlternation(pattern) || backreference.test(pattern)) {
    return { error: "unsafe_regex", message: "该正则表达式可能导致灾难性回溯，已拒绝。" };
  }

  return null;
}

function hasAmbiguousRepeatedAlternation(pattern) {
  const repeatedGroup = /\(((?:[^()\\]|\\.)*\|(?:[^()\\]|\\.)*)\)\s*(?:[+*]|\{\d*,?\d*\})/g;
  for (const match of pattern.matchAll(repeatedGroup)) {
    const alternatives = splitRegexAlternatives(match[1]).filter(Boolean);
    for (let i = 0; i < alternatives.length; i += 1) {
      for (let j = i + 1; j < alternatives.length; j += 1) {
        if (alternatives[i].startsWith(alternatives[j]) || alternatives[j].startsWith(alternatives[i])) {
          return true;
        }
      }
    }
  }
  return false;
}

function splitRegexAlternatives(group) {
  const parts = [];
  let current = "";
  let escaping = false;
  for (const char of String(group || "")) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaping = true;
      continue;
    }
    if (char === "|") {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

const WEB_FETCH_HEADERS = {
  "User-Agent": "QwenAgentLab/2.2 (+local-first agent)",
  Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
};
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_WEB_FETCH_REDIRECTS = 5;

async function fetchWithGuardedRedirects(rawUrl, signal) {
  let currentUrl = rawUrl;
  for (let redirectCount = 0; redirectCount <= MAX_WEB_FETCH_REDIRECTS; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      signal,
      redirect: "manual",
      headers: WEB_FETCH_HEADERS,
    });
    if (!REDIRECT_STATUSES.has(response.status)) {
      return { response, finalUrl: currentUrl };
    }

    const location = response.headers.get("location");
    if (!location) return { response, finalUrl: currentUrl };

    let nextUrl;
    try {
      nextUrl = new URL(location, currentUrl).toString();
    } catch {
      return {
        blocked: {
          url: currentUrl,
          redirectUrl: location,
          error: "blocked_redirect",
          message: "重定向目标 URL 无法解析，已阻止。",
        },
      };
    }

    const guard = guardFetchUrl(nextUrl);
    if (guard) {
      return {
        blocked: {
          url: currentUrl,
          redirectUrl: nextUrl,
          error: "blocked_redirect",
          message: guard.message || "重定向目标不安全，已阻止。",
          reason: guard.error,
        },
      };
    }

    currentUrl = nextUrl;
  }

  return {
    blocked: {
      url: currentUrl,
      error: "too_many_redirects",
      message: `重定向次数超过 ${MAX_WEB_FETCH_REDIRECTS} 次，已阻止。`,
    },
  };
}

// SSRF guard for web_fetch: http/https only, and block private / link-local /
// metadata ranges. localhost & 127.0.0.1 stay allowed by design so the agent
// can read local web apps (the lab itself is local-first).
export function guardFetchUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { url: rawUrl, error: "bad_url", message: "URL 无法解析。" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { url: rawUrl, error: "bad_scheme", message: "仅支持 http/https。" };
  }
  const host = normalizeHost(url.hostname);
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return null;
  const mappedIpv4 = ipv4FromMappedIpv6(host);
  if (mappedIpv4 && isBlockedIpv4(mappedIpv4)) {
    return { url: rawUrl, error: "blocked_host", message: "目标地址位于内网/保留网段，已阻止。" };
  }
  if (isBlockedIpv6(host) || isBlockedIpv4(host)) {
    return { url: rawUrl, error: "blocked_host", message: "目标地址位于内网/保留网段，已阻止。" };
  }
  return null;
}

function normalizeHost(hostname) {
  return String(hostname || "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
}

function isBlockedIpv4(host) {
  const privatePatterns = [
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./, // link-local / cloud metadata
    /^0\./,
  ];
  return privatePatterns.some((pattern) => pattern.test(host));
}

function ipv4FromMappedIpv6(host) {
  if (!host.startsWith("::ffff:")) return null;
  const tail = host.slice("::ffff:".length);
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(tail)) return tail;
  const parts = tail.split(":");
  if (parts.length !== 2 || !parts.every((part) => /^[0-9a-f]{1,4}$/i.test(part))) return "0.0.0.0";
  const high = Number.parseInt(parts[0], 16);
  const low = Number.parseInt(parts[1], 16);
  return `${(high >> 8) & 255}.${high & 255}.${(low >> 8) & 255}.${low & 255}`;
}

function isBlockedIpv6(host) {
  if (!host.includes(":")) return false;
  if (host === "::1") return false;
  return (
    host.startsWith("fc")
    || host.startsWith("fd")
    || /^fe[89ab]/.test(host)
    || host === "::"
  );
}

function stripTags(html) {
  return String(html || "").replace(/<[^>]+>/g, " ");
}

function decodeEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'");
}

export function htmlToReadableText(html) {
  let text = String(html || "");
  // Drop non-content blocks entirely, then convert structure to line breaks.
  text = text.replace(/<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1>/gi, " ");
  text = text.replace(/<\/(p|div|section|article|li|tr|h[1-6]|br)>/gi, "\n");
  text = text.replace(/<br\s*\/?\s*>/gi, "\n");
  text = stripTags(text);
  text = decodeEntities(text);
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

// Deterministic, escaped report assembly: the model supplies plain-text blocks,
// the tool emits only whitelisted tags (section/h2/p/ul/li) with all user text
// HTML-escaped — no script can survive into the final answer.
export function buildReportHtml(title, sections) {
  const esc = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const sectionHtml = sections
    .map((section, index) => {
      const heading = esc(String(section?.heading || `章节 ${index + 1}`).slice(0, 80));
      const lines = String(section?.body || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const blocks = [];
      let listBuffer = [];
      const flushList = () => {
        if (listBuffer.length) {
          blocks.push(`<ul>${listBuffer.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`);
          listBuffer = [];
        }
      };
      for (const line of lines) {
        if (line.startsWith("- ")) listBuffer.push(line.slice(2));
        else {
          flushList();
          blocks.push(`<p>${esc(line)}</p>`);
        }
      }
      flushList();
      return `<section class="section" id="report-${index + 1}"><h2>${heading}</h2>${blocks.join("")}</section>`;
    })
    .join("");

  return `<section class="section" id="report-title"><h2>${esc(title)}</h2></section>${sectionHtml}`;
}
