// ============================================================================
// Chart polisher — hardened SVG/CSS chart renderers with a unified fallback.
//
// Pure string builders (no DOM), so they are unit-testable under node:test.
// Every renderer is defensive: malformed specs, empty / non-numeric / negative /
// single-point / zero / extreme datasets must never throw — they degrade to a
// basic data table (or an empty-state card) instead of breaking the UI.
// ============================================================================

const SERIES_COLORS = ["#e27a10", "#f0b33e", "#7c9f54", "#4e8d9f", "#a46bb0"];

// Public entry point used by render.js. Wraps every renderer so a thrown error
// or bad spec falls back to a table and, failing that, an empty-state card.
export function renderChart(chartSpec) {
  try {
    const type = chartSpec?.chartType || "none";
    const data = normalizeChartData(chartSpec?.data);
    if (!data.length) return emptyChart("暂无可渲染的图表数据");

    switch (type) {
      case "line": return safeRender(renderLineChart, data);
      case "bar": return safeRender(renderBarChart, data);
      case "pie": return safeRender(renderPieChart, data);
      case "scatter": return safeRender(renderScatterChart, data);
      case "table": return safeRender(renderDataTable, data);
      default: return emptyChart("当前回答不需要图表");
    }
  } catch {
    // Last-resort guard: never let a chart break the conversation view.
    try {
      const data = normalizeChartData(chartSpec?.data);
      return data.length ? renderDataTable(data) : emptyChart("图表渲染失败");
    } catch {
      return emptyChart("图表渲染失败");
    }
  }
}

// Run a renderer and fall back to a table if it throws or returns nothing.
function safeRender(fn, data) {
  try {
    const out = fn(data);
    return out || renderDataTable(data);
  } catch {
    return renderDataTable(data);
  }
}

export function normalizeChartData(data) {
  if (!Array.isArray(data)) return [];
  return data.filter((item) => item && typeof item === "object");
}

export function emptyChart(message) {
  return `<div class="html-chart chart-empty"><p>${escapeHtml(message || "暂无图表数据")}</p></div>`;
}

export function renderLineChart(data) {
  const keys = Object.keys(data[0] || {});
  const labelKey = keys[0];
  const seriesKeys = getNumericSeriesKeys(data, labelKey);
  const values = seriesKeys.flatMap((key) => data.map((row) => Number(row[key])).filter(Number.isFinite));
  if (!seriesKeys.length || !values.length) return renderDataTable(data);
  // A line needs at least two points; a single point is shown as a table.
  if (data.length < 2) return renderDataTable(data);

  // min/max span both positive and negative values; range guarded against 0.
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1e-9);
  const width = 720;
  const height = 260;
  const pad = { left: 58, right: 24, top: 24, bottom: 44 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const clampY = (y) => Math.min(pad.top + chartHeight, Math.max(pad.top, y));
  const xFor = (index) => pad.left + (index / (data.length - 1)) * chartWidth;
  const yFor = (value) => clampY(pad.top + chartHeight - ((value - min) / range) * chartHeight);

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((step) => {
      const y = pad.top + chartHeight * step;
      return `<line class="chart-grid" x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width - pad.right}" y2="${y.toFixed(1)}"></line>`;
    })
    .join("");
  // When the data crosses zero, draw a baseline at y = 0 for readability.
  const zeroLine = min < 0 && max > 0
    ? `<line class="chart-grid" x1="${pad.left}" y1="${yFor(0).toFixed(1)}" x2="${width - pad.right}" y2="${yFor(0).toFixed(1)}"></line>`
    : "";

  const paths = seriesKeys
    .map((key, seriesIndex) => {
      const points = data
        .map((row, rowIndex) => {
          const value = Number(row[key]);
          return Number.isFinite(value) ? `${xFor(rowIndex).toFixed(1)},${yFor(value).toFixed(1)}` : null;
        })
        .filter(Boolean)
        .join(" ");
      const dots = data
        .map((row, rowIndex) => {
          const value = Number(row[key]);
          if (!Number.isFinite(value)) return "";
          return `<circle class="series-fill-${seriesIndex % 5}" cx="${xFor(rowIndex).toFixed(1)}" cy="${yFor(value).toFixed(1)}" r="4"><title>${escapeHtml(key)} ${escapeHtml(row[labelKey])}: ${formatNumber(value)}</title></circle>`;
        })
        .join("");
      return `<polyline class="series-stroke-${seriesIndex % 5}" points="${points}"></polyline>${dots}`;
    })
    .join("");
  const labels = data
    .map((row, index) => `<text class="chart-label" x="${xFor(index).toFixed(1)}" y="${height - 14}" text-anchor="middle">${escapeHtml(row[labelKey])}</text>`)
    .join("");
  const legend = seriesKeys
    .map((key, index) => `<span><i class="legend-color-${index % 5}"></i>${escapeHtml(key)}</span>`)
    .join("");

  return `<div class="html-chart line-chart"><svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img">${grid}${zeroLine}<line class="chart-axis-line" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}"></line><line class="chart-axis-line" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}"></line>${paths}${labels}</svg><div class="chart-legend">${legend}</div></div>`;
}

export function renderBarChart(data) {
  const keys = Object.keys(data[0] || {});
  const labelKey = keys[0];
  const seriesKeys = getNumericSeriesKeys(data, labelKey);
  const values = seriesKeys.flatMap((key) => data.map((row) => Number(row[key])).filter(Number.isFinite));
  if (!seriesKeys.length || !values.length) return renderDataTable(data);

  // Scale by the largest magnitude so negative bars also fit; guard against 0.
  const max = Math.max(...values.map((value) => Math.abs(value)), 1);
  const bars = data
    .map((row) => {
      const series = seriesKeys
        .map((key, index) => {
          const value = Number(row[key]);
          const raw = Number.isFinite(value) ? (Math.abs(value) / max) * 100 : 0;
          // Clamp into [0, 100] so zero/overflow values never paint outside the track.
          const barWidth = Math.max(0, Math.min(100, raw));
          return `<div class="bar-series"><em>${escapeHtml(key)}</em><div class="bar-track"><i class="series-bg-${index % 5}" style="width:${barWidth.toFixed(1)}%"></i></div><b>${formatNumber(value)}</b></div>`;
        })
        .join("");
      return `<div class="bar-group"><strong>${escapeHtml(row[labelKey])}</strong><div>${series}</div></div>`;
    })
    .join("");
  return `<div class="html-chart bar-chart">${bars}</div>`;
}

export function renderPieChart(data) {
  const keys = Object.keys(data[0] || {});
  const labelKey = keys[0];
  const valueKey = keys.find((key) => key !== labelKey && data.some((row) => Number.isFinite(Number(row[key]))));
  if (!valueKey) return renderDataTable(data);

  // Drop non-positive shares: zero/negative slices create zero-width conic
  // stops that smear the gradient (color bleed). Only positive slices are drawn.
  const slices = data
    .map((row) => ({ label: row[labelKey], value: Math.max(Number(row[valueKey]) || 0, 0) }))
    .filter((slice) => slice.value > 0);
  if (!slices.length) return renderDataTable(data);

  const total = slices.reduce((sum, slice) => sum + slice.value, 0) || 1;
  let acc = 0;
  const stops = slices
    .map((slice, index) => {
      const start = (acc / total) * 100;
      acc += slice.value;
      const end = (acc / total) * 100;
      return `${SERIES_COLORS[index % SERIES_COLORS.length]} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    })
    .join(", ");
  const legend = slices
    .map((slice, index) => {
      const pct = ((slice.value / total) * 100).toFixed(1);
      return `<div><i style="background:${SERIES_COLORS[index % SERIES_COLORS.length]}"></i><span>${escapeHtml(slice.label)}</span><b>${pct}%</b></div>`;
    })
    .join("");
  return `<div class="html-chart pie-chart"><div class="pie-visual" style="background:conic-gradient(${stops})"></div><div class="pie-legend">${legend}</div></div>`;
}

export function renderScatterChart(data) {
  const keys = Object.keys(data[0] || {});
  const labelKey = keys[0];
  const numericKeys = keys.filter((key) => data.some((row) => Number.isFinite(Number(row[key]))));
  if (!numericKeys.length) return renderDataTable(data);

  const xKey = numericKeys[0];
  const yKey = numericKeys[1] || numericKeys[0];
  const rows = data.filter((row) => Number.isFinite(Number(row[xKey])) && Number.isFinite(Number(row[yKey])));
  if (!rows.length) return renderDataTable(data);

  const xValues = rows.map((row) => Number(row[xKey]));
  const yValues = rows.map((row) => Number(row[yKey]));
  const xMin = Math.min(...xValues);
  const xRange = Math.max(Math.max(...xValues) - xMin, 1e-9);
  const yMin = Math.min(...yValues);
  const yRange = Math.max(Math.max(...yValues) - yMin, 1e-9);
  // Clamp to [2, 98]% so extreme values never render outside the SVG/stage box.
  const clamp = (n) => Math.max(2, Math.min(98, n));
  const points = rows
    .map((row) => {
      const x = clamp(((Number(row[xKey]) - xMin) / xRange) * 88 + 6);
      const y = clamp(94 - (((Number(row[yKey]) - yMin) / yRange) * 88 + 6));
      return `<i title="${escapeAttr(row[labelKey] ?? "")}: ${escapeAttr(xKey)} ${formatNumber(row[xKey])}, ${escapeAttr(yKey)} ${formatNumber(row[yKey])}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%"></i>`;
    })
    .join("");
  return `<div class="html-chart scatter-chart"><div class="scatter-stage">${points}</div><div class="scatter-labels"><span>${escapeHtml(xKey)}</span><span>${escapeHtml(yKey)}</span></div></div>`;
}

export function renderDataTable(data) {
  const rows = normalizeChartData(data);
  if (!rows.length) return emptyChart("暂无图表数据");
  const keys = Object.keys(rows[0] || {});
  if (!keys.length) return emptyChart("暂无图表数据");
  const head = keys.map((key) => `<th>${escapeHtml(key)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${keys.map((key) => `<td>${escapeHtml(formatCell(row[key]))}</td>`).join("")}</tr>`)
    .join("");
  return `<div class="html-chart table-chart"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function getNumericSeriesKeys(data, labelKey) {
  return Object.keys(data[0] || {}).filter(
    (key) => key !== labelKey && data.some((row) => Number.isFinite(Number(row[key]))),
  );
}

function formatCell(value) {
  return typeof value === "number" ? formatNumber(value) : value ?? "";
}

export function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "");
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

// Self-contained escapers so this module has no dependency on render.js (which
// imports this module) — keeps it pure and free of circular imports.
export function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value = "") {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
