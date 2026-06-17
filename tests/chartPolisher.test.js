import test from "node:test";
import assert from "node:assert/strict";
import {
  renderChart,
  renderLineChart,
  renderBarChart,
  renderPieChart,
  renderScatterChart,
  renderDataTable,
} from "../src/components/chartPolisher.js";

const spec = (chartType, data) => ({ chartType, containerId: "chart1", data });

// Extreme / adversarial datasets that must never crash a renderer.
const NON_NUMERIC = [{ 名称: "甲", 值: "abc" }, { 名称: "乙", 值: "-" }];
const NEGATIVE = [{ 月: "1月", 值: -50 }, { 月: "2月", 值: 30 }, { 月: "3月", 值: -10 }];
const SINGLE = [{ 月: "1月", 值: 42 }];
const ZEROES = [{ 类别: "A", 占比: 0 }, { 类别: "B", 占比: 50 }, { 类别: "C", 占比: 0 }];
const HUGE = [{ x: 1e12, y: -1e12 }, { x: -9e9, y: 8e15 }, { x: 0, y: 0 }];
const MIXED = [{ 标签: "a", 值: 5 }, { 标签: "b", 值: Number.NaN }, { 标签: "c", 值: Infinity }, { 标签: "d", 值: 7 }];

test("renderChart never throws on extreme / malformed specs", () => {
  const cases = [
    null,
    undefined,
    {},
    spec("line", null),
    spec("line", "not-an-array"),
    spec("line", []),
    spec("bar", NON_NUMERIC),
    spec("pie", ZEROES),
    spec("scatter", HUGE),
    spec("line", MIXED),
    spec("unknown-type", NEGATIVE),
    spec("line", SINGLE),
  ];
  for (const c of cases) {
    assert.doesNotThrow(() => {
      const out = renderChart(c);
      assert.equal(typeof out, "string");
      assert.ok(out.length > 0);
    }, `threw for ${JSON.stringify(c)}`);
  }
});

test("empty / non-array data falls back to an empty-state card", () => {
  assert.match(renderChart(spec("line", [])), /chart-empty/);
  assert.match(renderChart(spec("bar", "x")), /chart-empty/);
  assert.match(renderChart({}), /chart-empty/);
});

test("unknown chart type returns an empty-state card", () => {
  assert.match(renderChart(spec("bubble", NEGATIVE)), /chart-empty/);
});

test("line chart: renders negatives and falls back to a table for a single point", () => {
  const negative = renderLineChart(NEGATIVE);
  assert.match(negative, /line-chart/);
  assert.match(negative, /<polyline/);
  // single point cannot form a line -> table fallback
  assert.match(renderLineChart(SINGLE), /table-chart/);
  // non-numeric -> table fallback
  assert.match(renderLineChart(NON_NUMERIC), /table-chart/);
});

test("bar chart: clamps every bar width into [0, 100] (zero + overflow safe)", () => {
  const out = renderBarChart([
    { 标签: "零", 值: 0 },
    { 标签: "负", 值: -9999 },
    { 标签: "正", 值: 12345 },
    { 标签: "小", 值: 3 },
  ]);
  const widths = [...out.matchAll(/width:\s*([\d.]+)%/g)].map((m) => Number(m[1]));
  assert.ok(widths.length > 0);
  for (const w of widths) {
    assert.ok(w >= 0 && w <= 100, `bar width ${w}% out of range`);
  }
});

test("pie chart: filters non-positive slices and falls back when all zero", () => {
  const out = renderPieChart(ZEROES);
  assert.match(out, /pie-chart/);
  // only the single positive slice (B) should appear in the legend
  const legendItems = [...out.matchAll(/<div><i/g)].length;
  assert.equal(legendItems, 1);
  // all-zero -> table fallback (avoids a degenerate conic-gradient)
  assert.match(renderPieChart([{ k: "x", v: 0 }, { k: "y", v: 0 }]), /table-chart/);
});

test("scatter chart: clamps extreme coordinates inside the [2, 98]% viewport", () => {
  const out = renderScatterChart(HUGE);
  const lefts = [...out.matchAll(/left:\s*([\d.]+)%/g)].map((m) => Number(m[1]));
  const tops = [...out.matchAll(/top:\s*([\d.]+)%/g)].map((m) => Number(m[1]));
  assert.ok(lefts.length > 0 && tops.length > 0);
  for (const v of [...lefts, ...tops]) {
    assert.ok(v >= 2 && v <= 98, `coordinate ${v}% escaped the viewport`);
  }
});

test("data table renders headers and rows, empty-state when no rows", () => {
  const out = renderDataTable(NEGATIVE);
  assert.match(out, /<table>/);
  assert.match(out, /1月/);
  assert.match(renderDataTable([]), /chart-empty/);
});
