import test from "node:test";
import assert from "node:assert/strict";
import { callDemoModel, extractExpression, extractKeyword, pickScenario } from "../server/demoModel.js";
import { runAgent } from "../server/agentExecutor.js";
import { getToolSchemas } from "../server/tools.js";

const CSV = "月份,销量\n2024-01,120\n2024-02,135\n2024-03,150\n";
const fast = { latencyMs: 0, streamIntervalMs: 0 };

function toolMessage(name, payload) {
  return { role: "tool", name, tool_call_id: `${name}-1`, content: typeof payload === "string" ? payload : JSON.stringify(payload) };
}

function firstCall(response) {
  const call = response.toolCalls[0];
  return { name: call.function.name, args: JSON.parse(call.function.arguments) };
}

// Tags the backend sanitizer keeps; anything else would be silently stripped
// from a demo answer, so the demo must only ever emit these.
const allowedTags = new Set(["section", "div", "h2", "h3", "p", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td"]);

function usedTags(html) {
  return [...html.matchAll(/<\/?([a-z0-9]+)/gi)].map((match) => match[1].toLowerCase());
}

test("chat answers echo the question, stay inside the sanitizer allowlist and are labelled as demo output", async () => {
  const result = await callDemoModel({
    ...fast,
    messages: [{ role: "user", content: "hi" }],
    model: "qwen-plus",
    demoContext: { mode: "chat", input: "这个项目能做什么？", file: null },
  });

  assert.equal(result.toolCalls.length, 0);
  assert.equal(result.finishReason, "stop");
  assert.equal(result.model, "qwen-plus");
  assert.match(result.content, /这个项目能做什么？/);
  assert.match(result.content, /演示模式/);
  assert.match(result.content, /未调用真实千问模型/);
  for (const tag of usedTags(result.content)) assert.ok(allowedTags.has(tag), `unexpected tag: ${tag}`);
});

test("user input is HTML-escaped into the answer", async () => {
  const result = await callDemoModel({
    ...fast,
    demoContext: { mode: "chat", input: "<img src=x onerror=alert(1)>", file: null },
  });
  assert.ok(!result.content.includes("<img"));
  assert.match(result.content, /&lt;img/);
});

test("streaming emits deltas that reassemble into the full answer", async () => {
  const chunks = [];
  const result = await callDemoModel({
    ...fast,
    onDelta: (text) => chunks.push(text),
    demoContext: { mode: "chat", input: "你好", file: null },
  });
  assert.ok(chunks.length > 1);
  assert.equal(chunks.join(""), result.content);
});

test("document mode reports the real structure of the uploaded file", async () => {
  const file = { name: "notes.md", type: "md", content: "# 标题一\n\n正文一行\n\n## 标题二\n" };
  const result = await callDemoModel({ ...fast, demoContext: { mode: "document", input: "总结", file } });
  assert.match(result.content, /notes\.md/);
  assert.match(result.content, /标题一/);
  assert.match(result.content, /标题二/);
});

test("csv mode emits a chart-data table plus a chart placeholder", async () => {
  const file = { name: "sales.csv", type: "csv", content: CSV };
  const result = await callDemoModel({ ...fast, demoContext: { mode: "csv", input: "分析", file } });
  assert.match(result.content, /<table class="chart-data">/);
  assert.match(result.content, /<div id="chart1"><\/div>/);
  assert.match(result.content, /2024-03/);
});

test("agent scenario routing is deterministic", () => {
  assert.equal(pickScenario({ input: "记住我喜欢折线图" }).id, "memory");
  assert.equal(pickScenario({ input: "帮我算一下 2 * 3" }).id, "calc");
  assert.equal(pickScenario({ input: "分析趋势", file: { type: "csv", content: CSV } }).id, "csv");
  assert.equal(pickScenario({ input: "讲了什么", file: { type: "md", content: "# hi" } }).id, "file");
  assert.equal(pickScenario({ input: "调研一下 ReAct" }).id, "research");
});

test("agent turn asks for the calculator, then answers with the tool's real result", async () => {
  const demoContext = { mode: "agent", input: "帮我算一下 1342 * 9482 + 284.22", file: null };

  const first = await callDemoModel({ ...fast, tools: getToolSchemas(), messages: [], demoContext });
  assert.equal(first.finishReason, "tool_calls");
  assert.deepEqual(firstCall(first), { name: "calculator", args: { expression: "1342 * 9482 + 284.22" } });
  assert.equal(first.message.tool_calls.length, 1);

  const second = await callDemoModel({
    ...fast,
    tools: getToolSchemas(),
    messages: [first.message, toolMessage("calculator", { expression: "1342 * 9482 + 284.22", result: 12725128.22 })],
    demoContext,
  });
  assert.equal(second.toolCalls.length, 0);
  assert.match(second.content, /12725128\.22/);
});

test("a forced final turn (tools disabled) never asks for another tool", async () => {
  const response = await callDemoModel({
    ...fast,
    tools: null,
    messages: [{ role: "user", content: "x" }],
    demoContext: { mode: "agent", input: "帮我算一下 2 + 2", file: null },
  });
  assert.equal(response.toolCalls.length, 0);
  assert.ok(response.content.length > 0);
});

test("csv agent derives each tool call from the previous tool's real result", async () => {
  const demoContext = { mode: "agent", input: "分析销量趋势并出图", file: { name: "sales.csv", type: "csv", content: CSV } };
  const tools = getToolSchemas();

  const step1 = await callDemoModel({ ...fast, tools, messages: [], demoContext });
  assert.deepEqual(firstCall(step1), { name: "data_analyzer", args: { operation: "profile" } });

  const profile = {
    operation: "profile",
    file: "sales.csv",
    rowCount: 3,
    columns: [
      { name: "月份", numeric: false, filled: 3, missing: 0, avg: null },
      { name: "销量", numeric: true, filled: 3, missing: 0, avg: 135 },
    ],
  };
  const step2 = await callDemoModel({ ...fast, tools, messages: [toolMessage("data_analyzer", profile)], demoContext });
  assert.deepEqual(firstCall(step2), {
    name: "data_analyzer",
    args: { operation: "aggregate", group_by: "月份", metric: "销量", agg: "sum", limit: 20 },
  });

  const aggregate = {
    operation: "aggregate",
    group_by: "月份",
    metric: "销量",
    rows: [
      { 月份: "2024-03", value: 150 },
      { 月份: "2024-01", value: 120 },
      { 月份: "2024-02", value: 135 },
    ],
  };
  const step3 = await callDemoModel({
    ...fast,
    tools,
    messages: [toolMessage("data_analyzer", profile), toolMessage("data_analyzer", aggregate)],
    demoContext,
  });
  const chartCall = firstCall(step3);
  assert.equal(chartCall.name, "chart_generator");
  assert.equal(chartCall.args.intent, "trend");
  // aggregate returns rows sorted by value; the chart needs the label axis back
  // in its natural order.
  assert.deepEqual(
    chartCall.args.data.map((row) => row["月份"]),
    ["2024-01", "2024-02", "2024-03"],
  );
});

test("a denied memory_write is reflected honestly in the final answer", async () => {
  const demoContext = { mode: "agent", input: "记住我以后看数据都要折线图", file: null };
  const tools = getToolSchemas();

  const step1 = await callDemoModel({ ...fast, tools, messages: [], demoContext });
  assert.equal(firstCall(step1).name, "memory_search");

  const step2 = await callDemoModel({
    ...fast,
    tools,
    messages: [toolMessage("memory_search", { matches: [] })],
    demoContext,
  });
  const write = firstCall(step2);
  assert.equal(write.name, "memory_write");
  assert.equal(write.args.content, "我以后看数据都要折线图");

  const denied = await callDemoModel({
    ...fast,
    tools,
    messages: [
      toolMessage("memory_search", { matches: [] }),
      toolMessage("memory_write", "DENIED: 用户拒绝执行该工具。"),
    ],
    demoContext,
  });
  assert.equal(denied.toolCalls.length, 0);
  assert.match(denied.content, /没有写入/);
});

test("drives the real agent loop end to end with real tools and no API key", async () => {
  const demoContext = { mode: "agent", input: "分析销量趋势并出图", file: { name: "sales.csv", type: "csv", content: CSV } };
  const events = [];
  for await (const event of runAgent({
    messages: [{ role: "user", content: demoContext.input }],
    model: "demo",
    ctx: { file: demoContext.file },
    tools: getToolSchemas(),
    callModel: ({ messages, tools }) => callDemoModel({ ...fast, messages, tools, demoContext }),
  })) {
    events.push(event);
  }

  const final = events.find((event) => event.type === "final");
  assert.equal(final.truncated, false);
  assert.deepEqual(
    final.toolSteps.map((step) => `${step.tool}:${step.status}`),
    ["data_analyzer:completed", "data_analyzer:completed", "chart_generator:completed"],
  );
  const chart = JSON.parse(final.toolSteps[2].result).chart;
  assert.equal(chart.type, "line");
  assert.deepEqual(chart.data.map((row) => row["月份"]), ["2024-01", "2024-02", "2024-03"]);
  assert.match(final.content, /<div id="chart1"><\/div>/);
  assert.match(final.content, /演示模式/);
  for (const tag of usedTags(final.content)) assert.ok(allowedTags.has(tag), `unexpected tag: ${tag}`);
});

test("input parsing helpers", () => {
  assert.equal(extractExpression("帮我算一下 1342 * 9482 + 284.22 谢谢"), "1342 * 9482 + 284.22");
  assert.equal(extractExpression("今天天气怎么样"), "");
  assert.equal(extractKeyword("这个文档里 ReAct 状态机是怎么讲的", { content: "# ReAct 状态机\n正文" }), "ReAct");
  assert.equal(extractKeyword("状态机怎么讲", { content: "一段关于状态机的说明" }), "状态机");
});
