import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import { getTool, getToolSchemas, TOOL_CATEGORIES, guardFetchUrl, buildReportHtml } from "../server/tools.js";
import { configureMemoryStore, writeMemory, searchMemory, clearMemory } from "../server/memoryStore.js";
import { runAgent, truncateToolResult } from "../server/agentExecutor.js";

const CSV = [
  "月份,销量,地区",
  "1月,120,华东",
  "2月,200,华北",
  "3月,260,华东",
  "4月,90,华南",
].join("\n");

const ctx = { file: { name: "sales.csv", type: "csv", content: CSV } };

// ---- Phase 0: governance metadata ------------------------------------------

test("every registered tool carries complete governance metadata", () => {
  const names = getToolSchemas().map((schema) => schema.function.name);
  assert.ok(names.length >= 10, `expected the V2.2 registry (10 tools), got ${names.length}`);
  for (const name of names) {
    const tool = getTool(name);
    assert.ok(TOOL_CATEGORIES.includes(tool.category), `${name}: category "${tool.category}" must be one of ${TOOL_CATEGORIES}`);
    assert.equal(typeof tool.dangerous, "boolean", `${name}: dangerous must be boolean`);
    assert.equal(typeof tool.requiresConfirmation, "boolean", `${name}: requiresConfirmation must be boolean`);
    assert.ok(Number.isInteger(tool.timeoutMs) && tool.timeoutMs > 0, `${name}: timeoutMs must be a positive integer`);
    assert.ok(Number.isInteger(tool.maxResultChars) && tool.maxResultChars > 0, `${name}: maxResultChars must be a positive integer`);
    assert.ok(tool.parameters?.type === "object", `${name}: parameters schema present`);
  }
});

test("only memory_write requires confirmation in this batch", () => {
  const gated = getToolSchemas()
    .map((schema) => getTool(schema.function.name))
    .filter((tool) => tool.requiresConfirmation)
    .map((tool) => tool.name);
  assert.deepEqual(gated, ["memory_write"]);
});

// ---- file_search ------------------------------------------------------------

test("file_search finds keyword matches with line numbers", async () => {
  const out = JSON.parse(await getTool("file_search").run({ query: "华东" }, ctx));
  assert.equal(out.matchCount, 2);
  assert.deepEqual(out.matches.map((m) => m.line), [2, 4]);
  assert.match(out.matches[0].preview, /1月/);
});

test("file_search supports regex and reports bad patterns / missing file", async () => {
  const regexOut = JSON.parse(await getTool("file_search").run({ query: "2\\d{2}", regex: true }, ctx));
  assert.equal(regexOut.matchCount, 2, "200 and 260 match");
  const alternationOut = JSON.parse(await getTool("file_search").run({ query: "(华东|华北)+", regex: true }, ctx));
  assert.equal(alternationOut.matchCount, 3, "safe repeated alternation stays supported");
  const bad = JSON.parse(await getTool("file_search").run({ query: "([", regex: true }, ctx));
  assert.equal(bad.error, "bad_regex");
  const noFile = JSON.parse(await getTool("file_search").run({ query: "x" }, {}));
  assert.equal(noFile.error, "no_file");
});

test("file_search rejects high-risk regex patterns before scanning file content", async () => {
  const nested = JSON.parse(await getTool("file_search").run({ query: "(a+)+$", regex: true }, ctx));
  assert.equal(nested.error, "unsafe_regex");
  const ambiguous = JSON.parse(await getTool("file_search").run({ query: "(a|aa)*$", regex: true }, ctx));
  assert.equal(ambiguous.error, "unsafe_regex");
});

// ---- data_analyzer ----------------------------------------------------------

test("data_analyzer profile reports columns and numeric stats", async () => {
  const out = JSON.parse(await getTool("data_analyzer").run({ operation: "profile" }, ctx));
  assert.equal(out.rowCount, 4);
  const sales = out.columns.find((col) => col.name === "销量");
  assert.equal(sales.numeric, true);
  assert.equal(sales.min, 90);
  assert.equal(sales.max, 260);
  assert.equal(sales.avg, 167.5);
});

test("data_analyzer aggregate groups and sorts by value", async () => {
  const out = JSON.parse(
    await getTool("data_analyzer").run({ operation: "aggregate", group_by: "地区", metric: "销量", agg: "sum" }, ctx),
  );
  assert.deepEqual(out.rows[0], { 地区: "华东", value: 380 });
  assert.equal(out.rows.length, 3);

  // Test avg aggregation ignoring non-numeric values
  const testCsv = [
    "地区,金额",
    "北京,100",
    "上海,200",
    "北京,N/A",
    "北京,300",
    "上海,",
  ].join("\n");
  const testCtx = { file: { name: "test.csv", type: "csv", content: testCsv } };
  const avgOut = JSON.parse(
    await getTool("data_analyzer").run({ operation: "aggregate", group_by: "地区", metric: "金额", agg: "avg" }, testCtx),
  );
  const beijing = avgOut.rows.find((row) => row["地区"] === "北京");
  assert.equal(beijing.value, 200); // (100 + 300) / 2 = 200

  const shanghai = avgOut.rows.find((row) => row["地区"] === "上海");
  assert.equal(shanghai.value, 200); // 200 / 1 = 200
});

test("data_analyzer top_n and filter return bounded row objects", async () => {
  const top = JSON.parse(await getTool("data_analyzer").run({ operation: "top_n", metric: "销量", limit: 2 }, ctx));
  assert.deepEqual(top.rows.map((row) => row["月份"]), ["3月", "2月"]);

  const filtered = JSON.parse(
    await getTool("data_analyzer").run(
      { operation: "filter", filter_column: "销量", filter_op: "gte", filter_value: "200" },
      ctx,
    ),
  );
  assert.equal(filtered.matchedCount, 2);

  const badCol = JSON.parse(await getTool("data_analyzer").run({ operation: "top_n", metric: "不存在" }, ctx));
  assert.equal(badCol.error, "bad_column");
});

// ---- chart_generator ---------------------------------------------------------

test("chart_generator maps intent to a validated chart spec with embed data", async () => {
  const data = [
    { 月份: "1月", 销量: 120 },
    { 月份: "2月", 销量: 200 },
  ];
  const out = JSON.parse(await getTool("chart_generator").run({ data, intent: "trend", title: "销量趋势" }, {}));
  assert.equal(out.chart.type, "line");
  assert.equal(out.chart.labelKey, "月份");
  assert.deepEqual(out.chart.seriesKeys, ["销量"]);
  assert.equal(out.embed.containerId, "chart1");
  assert.deepEqual(out.embed.headers, ["月份", "销量"]);
  assert.deepEqual(out.embed.rows[1], ["2月", "200"]);
});

test("chart_generator rejects bad intent, empty and non-numeric data", async () => {
  const tool = getTool("chart_generator");
  assert.equal(JSON.parse(await tool.run({ data: [{ a: 1, b: 2 }], intent: "magic" }, {})).error, "bad_intent");
  assert.equal(JSON.parse(await tool.run({ data: [], intent: "trend" }, {})).error, "no_data");
  assert.equal(JSON.parse(await tool.run({ data: [{ 名称: "a", 备注: "b" }], intent: "comparison" }, {})).error, "no_numeric");
});

// ---- memory store + tools ----------------------------------------------------

test("memory write/search round-trip with scoping and idempotent update", () => {
  const tmp = path.join(os.tmpdir(), `qal-mem-${Date.now()}.json`);
  const previous = configureMemoryStore(tmp);
  try {
    clearMemory();
    const first = writeMemory({ scope: "profile", kind: "preference", content: "默认输出中文 Markdown" });
    writeMemory({ scope: "project", kind: "decision", content: "V2.2 浏览器工具延后" });
    assert.equal(first.updated, false);

    const again = writeMemory({ scope: "profile", kind: "preference", content: "默认输出中文 Markdown" });
    assert.equal(again.updated, true, "identical scope+content updates instead of duplicating");

    const all = searchMemory({ query: "", scope: "all", limit: 10 });
    assert.equal(all.length, 2, "no duplicate entry was created");

    const hit = searchMemory({ query: "中文 输出", scope: "profile" });
    assert.equal(hit.length, 1);
    assert.match(hit[0].content, /中文 Markdown/);

    const miss = searchMemory({ query: "不存在的词" });
    assert.equal(miss.length, 0);
  } finally {
    configureMemoryStore(previous);
    fs.rmSync(tmp, { force: true });
  }
});

test("memory tools run() validate args and persist via the store", async () => {
  const tmp = path.join(os.tmpdir(), `qal-mem-tool-${Date.now()}.json`);
  const previous = configureMemoryStore(tmp);
  try {
    clearMemory();
    const write = JSON.parse(
      await getTool("memory_write").run({ scope: "project", kind: "fact", content: "周报每周五提交" }, {}),
    );
    assert.ok(write.saved.id);
    const search = JSON.parse(await getTool("memory_search").run({ query: "周报" }, {}));
    assert.equal(search.count, 1);
    await assert.rejects(() => getTool("memory_write").run({ scope: "project", kind: "fact", content: "  " }, {}));
  } finally {
    configureMemoryStore(previous);
    fs.rmSync(tmp, { force: true });
  }
});

// ---- web_fetch (offline guards only — no network in tests) -------------------

test("web_fetch URL guard blocks bad schemes and private ranges, allows localhost", () => {
  assert.equal(guardFetchUrl("ftp://example.com").error, "bad_scheme");
  assert.equal(guardFetchUrl("not a url").error, "bad_url");
  assert.equal(guardFetchUrl("http://10.0.0.8/x").error, "blocked_host");
  assert.equal(guardFetchUrl("http://192.168.1.1/admin").error, "blocked_host");
  assert.equal(guardFetchUrl("http://172.20.3.4/").error, "blocked_host");
  assert.equal(guardFetchUrl("http://169.254.169.254/meta").error, "blocked_host");
  assert.equal(guardFetchUrl("http://[::ffff:10.0.0.1]/secret").error, "blocked_host");
  assert.equal(guardFetchUrl("http://[::ffff:192.168.1.1]/secret").error, "blocked_host");
  assert.equal(guardFetchUrl("http://[::ffff:169.254.169.254]/meta").error, "blocked_host");
  assert.equal(guardFetchUrl("http://127.0.0.1:5173/app"), null, "localhost explicitly allowed");
  assert.equal(guardFetchUrl("http://[::1]:5173/app"), null, "IPv6 localhost explicitly allowed");
  assert.equal(guardFetchUrl("https://example.com/page"), null);
});

test("web_fetch validates redirect targets before following them", async () => {
  const server = http.createServer((req, res) => {
    const location = req.url === "/private"
      ? "http://10.0.0.8/secret"
      : "ftp://example.com/secret";
    res.writeHead(302, { Location: location });
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const out = JSON.parse(await getTool("web_fetch").run({ url: `http://127.0.0.1:${port}/redirect` }, {}));
    assert.equal(out.error, "blocked_redirect");
    assert.equal(out.reason, "bad_scheme");
    const privateOut = JSON.parse(await getTool("web_fetch").run({ url: `http://127.0.0.1:${port}/private` }, {}));
    assert.equal(privateOut.error, "blocked_redirect");
    assert.equal(privateOut.reason, "blocked_host");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// ---- report_builder -----------------------------------------------------------

test("report_builder assembles escaped sections with paragraphs and lists", async () => {
  const out = JSON.parse(
    await getTool("report_builder").run(
      {
        title: "周报 <script>alert(1)</script>",
        sections: [
          { heading: "本周进展", body: "完成确认流。\n- 工具 A\n- 工具 B\n收尾测试。" },
        ],
      },
      {},
    ),
  );
  const html = out.final_answer_html;
  assert.ok(!html.includes("<script>"), "script tags must be escaped");
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<ul><li>工具 A<\/li><li>工具 B<\/li><\/ul>/);
  assert.match(html, /<p>完成确认流。<\/p>/);
  assert.match(html, /<section class="section" id="report-1"><h2>本周进展<\/h2>/);
});

test("buildReportHtml escapes heading text too", () => {
  const html = buildReportHtml("T", [{ heading: '<img src=x onerror=1>', body: "x" }]);
  assert.ok(!html.includes("<img"), "raw tags in headings must not survive");
});

// ---- executor governance: timeout + truncation -------------------------------

function singleToolModel(name, args) {
  let turn = 0;
  return async () => {
    turn += 1;
    if (turn === 1) {
      const calls = [{ id: "c1", function: { name, arguments: JSON.stringify(args) } }];
      return { toolCalls: calls, message: { role: "assistant", content: null, tool_calls: calls }, content: "", finishReason: "tool_calls", model: "test" };
    }
    return { toolCalls: [], content: "<section><p>ok</p></section>", finishReason: "stop", model: "test" };
  };
}

async function collect(generator) {
  const events = [];
  for await (const event of generator) events.push(event);
  return events;
}

test("executor aborts a tool that exceeds its timeoutMs", async () => {
  const getToolImpl = () => ({
    name: "slow_tool",
    category: "local",
    timeoutMs: 30,
    run: () => new Promise(() => {}), // never resolves
  });
  const events = await collect(
    runAgent({ messages: [], model: "test", callModel: singleToolModel("slow_tool", {}), tools: [], getToolImpl, maxIterations: 3 }),
  );
  const toolError = events.find((e) => e.type === "tool_error");
  assert.match(toolError.error, /超时/);
  const final = events.find((e) => e.type === "final");
  assert.equal(final.toolSteps[0].status, "error");
});

test("executor truncates oversized tool results before feeding them back", async () => {
  const getToolImpl = () => ({
    name: "big_tool",
    category: "local",
    maxResultChars: 100,
    run: async () => "x".repeat(5000),
  });
  const events = await collect(
    runAgent({ messages: [], model: "test", callModel: singleToolModel("big_tool", {}), tools: [], getToolImpl, maxIterations: 3 }),
  );
  const result = events.find((e) => e.type === "tool_result");
  assert.ok(result.result.length < 150, `result must be capped, got ${result.result.length}`);
  assert.match(result.result, /已截断/);
  assert.equal(truncateToolResult("short", 100), "short", "short results pass through unchanged");
});

test("executor stamps the tool category onto steps and events", async () => {
  const getToolImpl = () => ({ name: "cat_tool", category: "analysis", run: async () => "{}" });
  const events = await collect(
    runAgent({ messages: [], model: "test", callModel: singleToolModel("cat_tool", {}), tools: [], getToolImpl, maxIterations: 3 }),
  );
  assert.equal(events.find((e) => e.type === "tool_start").category, "analysis");
  const final = events.find((e) => e.type === "final");
  assert.equal(final.toolSteps[0].category, "analysis");
});
