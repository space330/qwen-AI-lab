import test from "node:test";
import assert from "node:assert/strict";
import { buildMessages, formatSuccess } from "../server/responseFormatter.js";

const chartPlan = {
  task_type: "data_analysis",
  should_use_chart: true,
  chart_type: "line",
  response_format: "html",
  sections: [{ title: "图表分析", text: "", data: null }],
};

test("buildMessages requires chart section to include a chart-data table", () => {
  const messages = buildMessages({
    mode: "csv",
    input: "分析趋势",
    file: null,
    answerPlan: chartPlan,
  });

  const systemPrompt = messages[0].content;
  assert.match(systemPrompt, /<div id="chart1"><\/div>/);
  assert.match(systemPrompt, /<table class="chart-data">/);
  assert.match(systemPrompt, /same chart section immediately before the chart placeholder/);
});

test("formatSuccess extracts chartSpec.data from table.chart-data in the chart section", () => {
  const response = formatSuccess({
    requestId: "test-request",
    mode: "csv",
    model: "qwen3.6-max-preview",
    answerPlan: chartPlan,
    content: `
      <section class="section" id="chart-analysis">
        <h2>图表分析</h2>
        <p>折线图显示月度销量变化。</p>
        <table>
          <thead><tr><th>说明</th><th>值</th></tr></thead>
          <tbody><tr><td>样本数</td><td>999</td></tr></tbody>
        </table>
        <table class="chart-data">
          <thead><tr><th>Month</th><th>Sales</th><th>Revenue</th></tr></thead>
          <tbody>
            <tr><td>2024-01</td><td>120</td><td>2400.50</td></tr>
            <tr><td>2024-02</td><td>130</td><td>2600</td></tr>
          </tbody>
        </table>
        <div id="chart1"></div>
      </section>
    `,
  });

  assert.deepEqual(response.data.chartSpec, {
    containerId: "chart1",
    chartType: "line",
    title: "图表分析",
    description: "图表分析 折线图显示月度销量变化。 说明 值 样本数 999 Month Sales Revenue 2024-01 120 2400.50 2024-02 130 2600",
    data: [
      { Month: "2024-01", Sales: 120, Revenue: 2400.5 },
      { Month: "2024-02", Sales: 130, Revenue: 2600 },
    ],
  });
});
