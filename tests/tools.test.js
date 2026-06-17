import test from "node:test";
import assert from "node:assert/strict";
import { evaluateExpression, getTool, getToolSchemas } from "../server/tools.js";
import { config } from "../server/config.js";

test("calculator: operator precedence and parentheses", () => {
  assert.equal(evaluateExpression("1 + 2 * 3"), 7);
  assert.equal(evaluateExpression("(1 + 2) * 3"), 9);
  assert.equal(evaluateExpression("10 / 4"), 2.5);
  assert.equal(evaluateExpression("-5 + 3"), -2);
  assert.equal(evaluateExpression("2 ^ 3 ^ 2"), 512); // right associative
  assert.equal(evaluateExpression("10 % 3"), 1);
});

test("calculator: matches the V2.0 verification scenario", () => {
  // 1342 * 9482 + 284.22, then * 2
  assert.equal(evaluateExpression("1342 * 9482 + 284.22"), 12724844 + 284.22);
  assert.equal(evaluateExpression("(1342 * 9482 + 284.22) * 2"), (12724844 + 284.22) * 2);
});

test("calculator: division by zero throws", () => {
  assert.throws(() => evaluateExpression("1 / 0"), /除数为零|MATH/);
  assert.throws(() => evaluateExpression("5 % 0"), /除数为零|MATH/);
});

test("calculator: rejects illegal input", () => {
  assert.throws(() => evaluateExpression("2 + abc"));
  assert.throws(() => evaluateExpression("(1 + 2"));
  assert.throws(() => evaluateExpression(""));
});

test("calculator tool.run returns JSON with the result", async () => {
  const out = JSON.parse(await getTool("calculator").run({ expression: "6 * 7" }));
  assert.equal(out.result, 42);
  assert.equal(out.expression, "6 * 7");
});

test("file_reader: reads a line range from ctx.file", async () => {
  const ctx = { file: { name: "x.txt", type: "txt", content: "l1\nl2\nl3\nl4" } };
  const out = JSON.parse(await getTool("file_reader").run({ start_line: 2, end_line: 3 }, ctx));
  assert.equal(out.totalLines, 4);
  assert.equal(out.startLine, 2);
  assert.equal(out.endLine, 3);
  assert.equal(out.content, "l2\nl3");
});

test("file_reader: returns an error when no file is attached", async () => {
  const out = JSON.parse(await getTool("file_reader").run({}, {}));
  assert.equal(out.error, "no_file");
});

test("web_search: provider=mock returns a deterministic, marked placeholder", async () => {
  // Force the mock provider so the unit test never makes a network call.
  const previous = config.webSearchProvider;
  config.webSearchProvider = "mock";
  try {
    const out = JSON.parse(await getTool("web_search").run({ query: "通义千问 最新版本", count: 3 }));
    assert.equal(out.source, "mock");
    assert.equal(out.mock, true);
    assert.ok(Array.isArray(out.results) && out.results.length >= 1);
  } finally {
    config.webSearchProvider = previous;
  }
});

test("getToolSchemas exposes OpenAI-style function tools", () => {
  const schemas = getToolSchemas();
  const names = schemas.map((schema) => schema.function.name).sort();
  assert.deepEqual(names, [
    "calculator",
    "chart_generator",
    "data_analyzer",
    "file_reader",
    "file_search",
    "memory_search",
    "memory_write",
    "report_builder",
    "web_fetch",
    "web_search",
  ]);
  for (const schema of schemas) {
    assert.equal(schema.type, "function");
    assert.equal(schema.function.parameters.type, "object");
  }
});
