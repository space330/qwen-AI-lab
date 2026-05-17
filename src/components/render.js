import { icons } from "./icons.js";

export const modes = [
  { id: "chat", label: "对话模式", icon: "chat" },
  { id: "agent", label: "Agent模式", icon: "agent" },
  { id: "document", label: "文档总结", icon: "document" },
  { id: "csv", label: "CSV分析", icon: "csv" },
  { id: "settings", label: "设置", icon: "settings" },
];

export function renderApp(state) {
  document.documentElement.style.setProperty("--left-width", `${state.leftWidth}px`);
  const rightWidth = Math.min(state.rightWidth, getMaxRightWidth());
  document.documentElement.style.setProperty("--right-width", `${rightWidth}px`);

  return `
    <div class="app-shell ${state.leftWidth <= 88 ? "left-collapsed" : ""} ${
      rightWidth <= 20 ? "right-collapsed" : ""
    }">
      ${renderTopbar(state)}
      ${renderSidebar(state)}
      <main class="workspace">${renderWorkspace(state)}</main>
      ${renderPreview(state)}
      ${renderInputDock(state)}
      <div class="resize-handle resize-left" data-resize="left"></div>
      <div class="resize-handle resize-right" data-resize="right"></div>
    </div>
  `;
}

function getMaxRightWidth() {
  return Math.floor(window.innerWidth * 0.2);
}

function renderTopbar(state) {
  return `
    <header class="topbar">
      <div class="brand-mark"><span class="word-logo">Lysandra</span></div>
      <div class="top-cell">
        <span class="meta-label">当前模型</span>
        <strong>${escapeHtml(state.currentModel)}</strong>
      </div>
      <div class="top-cell">
        <span class="meta-label">API 状态</span>
        <strong class="status ${state.apiStatus === "正常" ? "ok" : "idle"}"><i></i>${escapeHtml(
          state.apiStatus,
        )}</strong>
      </div>
      <button class="top-cell settings-button" data-mode="settings">
        <span class="meta-label">设置</span>
        <strong>${icons.settings} 全局设置</strong>
      </button>
      <div class="product-title">Qwen Agent Lab</div>
      <button class="avatar-button" title="用户入口"><span></span></button>
    </header>
  `;
}

function renderSidebar(state) {
  return `
    <aside class="sidebar">
      <div class="side-head">
        <span>模式</span>
        <button class="icon-button" data-collapse-left title="收起左栏">${icons.menu}</button>
      </div>
      <nav class="mode-list">
        ${modes
          .map(
            (mode) => `
              <button class="mode-button ${state.mode === mode.id ? "active" : ""}" data-mode="${mode.id}">
                ${icons[mode.icon]}
                <span>${mode.label}</span>
              </button>
            `,
          )
          .join("")}
      </nav>
      <div class="wood-etching"></div>
    </aside>
  `;
}

function renderWorkspace(state) {
  if (state.mode === "settings") return renderSettings(state);

  return `
    <section class="panel ai-output-panel">
      <div class="panel-head">
        <div class="panel-title">${icons.agent}<span>AI 输出区域</span><em>${getModeTitle(state.mode)}</em></div>
        <div class="panel-actions">
          <button class="icon-button" data-clear-history title="清空历史">${icons.file}</button>
          <button class="icon-button" data-copy-output title="复制输出">${icons.copy}</button>
          <button class="icon-button" data-save-output title="保存输出">${icons.save}</button>
        </div>
      </div>
      <div class="message-list">
        ${state.messages.map(renderMessage).join("")}
      </div>
    </section>
  `;
}

function renderSettings(state) {
  return `
    <section class="panel settings-panel">
      <div class="panel-head">
        <div class="panel-title">${icons.settings}<span>设置</span></div>
      </div>
      <div class="settings-grid">
        <label>
          <span>项目名称</span>
          <input data-setting="projectName" value="${escapeAttr(state.projectName)}" />
        </label>
        <label>
          <span>当前模型</span>
          <input data-setting="currentModel" value="${escapeAttr(state.currentModel)}" />
        </label>
        <label>
          <span>API 状态</span>
          <select data-setting="apiStatus">
            ${["未连接", "正常", "错误"].map((item) => `<option ${state.apiStatus === item ? "selected" : ""}>${item}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="settings-note">
        API Key 不会出现在前端设置中。后续接入后端时，密钥只放在后端环境变量。
      </div>
    </section>
  `;
}

function renderMessage(message) {
  const isAssistant = message.role === "assistant";
  const isHtml = isAssistant && looksLikeHtml(message.content);
  return `
    <article class="message-row ${message.role}">
      <div class="message-avatar">${isAssistant ? icons.agent : icons.chat}</div>
      <div class="message-card">
        <div class="message-meta">
          <strong>${escapeHtml(message.title)}</strong>
          <span>${escapeHtml(message.time)}</span>
        </div>
        <div class="message-content ${isAssistant ? "editable-output" : ""} ${isHtml ? "html-output" : ""}" ${
          isAssistant && !isHtml ? `contenteditable="true" data-message-id="${message.id}"` : ""
        }>${isHtml ? renderAnswerHtml(message.content, message.chartSpec) : formatContent(message.content)}</div>
        ${message.action === "preview-file" ? renderMessageActions() : ""}
      </div>
    </article>
  `;
}

function renderMessageActions() {
  return `
    <div class="message-actions">
      <button type="button" data-preview-file>${icons.file}<span>预览文件</span></button>
    </div>
  `;
}

function renderPreview(state) {
  return `
    <aside class="previewbar">
      <div class="preview-head">
        <span>文件预览区</span>
        <div class="preview-tools">
          <button class="icon-button" data-save-output title="导出">${icons.save}</button>
          <button class="icon-button" data-collapse-right title="收起右栏">${icons.panel}</button>
        </div>
      </div>
      <section class="preview-section clean-preview">
        <pre class="raw-preview">${escapeHtml(
          state.filePreviewVisible ? state.uploadedFile?.content?.slice(0, 1600) || "" : "",
        )}</pre>
        <div class="result-preview" contenteditable="true" data-generated-editor>${formatContent(
          state.generatedResult || "",
        )}</div>
      </section>
    </aside>
  `;
}

function renderInputDock(state) {
  return `
    <footer class="input-dock">
      <div class="input-tabs">
        <button class="active">${icons.chat}<span>文本输入</span></button>
        <label>${icons.upload}<span>文件上传</span><input type="file" data-file-input accept=".txt,.md,.csv" hidden /></label>
        <select data-mode-select>
          ${modes
            .filter((mode) => mode.id !== "settings")
            .map((mode) => `<option value="${mode.id}" ${state.mode === mode.id ? "selected" : ""}>${mode.label}</option>`)
            .join("")}
        </select>
      </div>
      <div class="input-row">
        <textarea data-main-input placeholder="输入你的问题或指令，支持上传 txt / md / csv 文件">${escapeHtml(
          state.inputText,
        )}</textarea>
        <span class="char-count">${state.inputText.length} / 4000</span>
        <button class="send-button" data-send>${icons.send}<span>发送</span></button>
      </div>
    </footer>
  `;
}

function renderEmpty(text) {
  return `<div class="empty-block">${text}</div>`;
}

function getModeTitle(mode) {
  return modes.find((item) => item.id === mode)?.label || "对话";
}

function formatContent(content) {
  return escapeHtml(content)
    .replace(/^## (.*)$/gm, "<h3>$1</h3>")
    .replace(/^### (.*)$/gm, "<h4>$1</h4>")
    .replace(/^- (.*)$/gm, "<p class=\"list-line\">$1</p>")
    .replace(/^(\d+)\. (.*)$/gm, "<p class=\"list-line numbered\">$1. $2</p>")
    .replace(/\n/g, "<br />");
}

function looksLikeHtml(content = "") {
  return /<section\b|<div\b|<table\b|<h2\b|<h3\b/i.test(String(content));
}

function sanitizeAnswerHtml(html = "") {
  const template = document.createElement("template");
  template.innerHTML = String(html);
  const allowedTags = new Set([
    "SECTION",
    "DIV",
    "H2",
    "H3",
    "P",
    "UL",
    "OL",
    "LI",
    "TABLE",
    "THEAD",
    "TBODY",
    "TR",
    "TH",
    "TD",
  ]);
  const allowedAttrs = new Set(["id", "class"]);

  const walk = (node) => {
    [...node.children].forEach((child) => {
      if (!allowedTags.has(child.tagName)) {
        child.replaceWith(document.createTextNode(child.textContent || ""));
        return;
      }

      [...child.attributes].forEach((attr) => {
        if (!allowedAttrs.has(attr.name.toLowerCase())) child.removeAttribute(attr.name);
      });

      walk(child);
    });
  };

  walk(template.content);
  return template.innerHTML;
}

function renderAnswerHtml(html = "", chartSpec = null) {
  const template = document.createElement("template");
  template.innerHTML = sanitizeAnswerHtml(html);

  if (chartSpec?.containerId) {
    const chartNode = queryById(template.content, chartSpec.containerId);
    if (chartNode) {
      const chartScope = chartNode.closest("section") || template.content;
      chartScope.querySelectorAll("table.chart-data").forEach((table) => table.remove());
      chartNode.outerHTML = renderChart(chartSpec);
    }
  }

  return template.innerHTML;
}

function queryById(root, id) {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(String(id || ""))) return null;
  const escaped = globalThis.CSS?.escape ? CSS.escape(id) : id.replace(/([ #;?%&,.+*~':"!^$[\]()=>|/@])/g, "\\$1");
  return root.querySelector(`#${escaped}`);
}

function renderChart(chartSpec) {
  const type = chartSpec.chartType || "none";
  const data = normalizeChartData(chartSpec.data);
  if (!data.length) {
    return `<div class="html-chart chart-empty"><p>暂无可渲染的图表数据</p></div>`;
  }

  if (type === "line") return renderLineChart(data);
  if (type === "bar") return renderBarChart(data);
  if (type === "pie") return renderPieChart(data);
  if (type === "scatter") return renderScatterChart(data);
  if (type === "table") return renderDataTable(data);
  return `<div class="html-chart chart-empty"><p>当前回答不需要图表</p></div>`;
}

function normalizeChartData(data) {
  if (Array.isArray(data)) return data.filter((item) => item && typeof item === "object");
  return [];
}

function renderLineChart(data) {
  const keys = Object.keys(data[0] || {});
  const labelKey = keys[0];
  const seriesKeys = getNumericSeriesKeys(data, labelKey);
  const values = seriesKeys.flatMap((key) => data.map((row) => Number(row[key])).filter(Number.isFinite));
  if (!seriesKeys.length || !values.length) return renderDataTable(data);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const width = 720;
  const height = 260;
  const pad = { left: 58, right: 24, top: 24, bottom: 44 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const xFor = (index) => pad.left + (data.length === 1 ? chartWidth / 2 : (index / (data.length - 1)) * chartWidth);
  const yFor = (value) => pad.top + chartHeight - ((value - min) / range) * chartHeight;
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((step) => {
      const y = pad.top + chartHeight * step;
      return `<line class="chart-grid" x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width - pad.right}" y2="${y.toFixed(1)}"></line>`;
    })
    .join("");
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

  return `<div class="html-chart line-chart"><svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img">${grid}<line class="chart-axis-line" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}"></line><line class="chart-axis-line" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}"></line>${paths}${labels}</svg><div class="chart-legend">${legend}</div></div>`;
}

function renderBarChart(data) {
  const keys = Object.keys(data[0] || {});
  const labelKey = keys[0];
  const seriesKeys = getNumericSeriesKeys(data, labelKey);
  const values = seriesKeys.flatMap((key) => data.map((row) => Number(row[key])).filter(Number.isFinite));
  if (!seriesKeys.length || !values.length) return renderDataTable(data);

  const max = Math.max(...values, 1);
  const bars = data
    .map((row) => {
      const series = seriesKeys
        .map((key, index) => {
          const value = Number(row[key]);
          const width = Number.isFinite(value) ? (value / max) * 100 : 0;
          return `<div class="bar-series"><em>${escapeHtml(key)}</em><div class="bar-track"><i class="series-bg-${index % 5}" style="width:${width.toFixed(1)}%"></i></div><b>${formatNumber(value)}</b></div>`;
        })
        .join("");
      return `<div class="bar-group"><strong>${escapeHtml(row[labelKey])}</strong><div>${series}</div></div>`;
    })
    .join("");
  return `<div class="html-chart bar-chart">${bars}</div>`;
}

function renderPieChart(data) {
  const keys = Object.keys(data[0] || {});
  const labelKey = keys[0];
  const valueKey = keys.find((key) => key !== labelKey && data.some((row) => Number.isFinite(Number(row[key]))));
  const total = data.reduce((sum, row) => sum + Math.max(Number(row[valueKey]) || 0, 0), 0) || 1;
  let acc = 0;
  const colors = ["#e27a10", "#f0b33e", "#7c9f54", "#4e8d9f", "#a46bb0"];
  const stops = data
    .map((row, index) => {
      const value = Math.max(Number(row[valueKey]) || 0, 0);
      const start = (acc / total) * 100;
      acc += value;
      const end = (acc / total) * 100;
      return `${colors[index % colors.length]} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    })
    .join(", ");
  const legend = data
    .map((row, index) => {
      const pct = (((Number(row[valueKey]) || 0) / total) * 100).toFixed(1);
      return `<div><i style="background:${colors[index % colors.length]}"></i><span>${escapeHtml(row[labelKey])}</span><b>${pct}%</b></div>`;
    })
    .join("");
  return `<div class="html-chart pie-chart"><div class="pie-visual" style="background:conic-gradient(${stops})"></div><div class="pie-legend">${legend}</div></div>`;
}

function renderScatterChart(data) {
  const keys = Object.keys(data[0] || {});
  const labelKey = keys[0];
  const numericKeys = keys.filter((key) => data.some((row) => Number.isFinite(Number(row[key]))));
  if (!numericKeys.length) return renderDataTable(data);

  const xKey = numericKeys[0];
  const yKey = numericKeys[1] || numericKeys[0];
  const xValues = data.map((row) => Number(row[xKey])).filter(Number.isFinite);
  const yValues = data.map((row) => Number(row[yKey])).filter(Number.isFinite);
  const xMin = Math.min(...xValues);
  const xRange = Math.max(Math.max(...xValues) - xMin, 1);
  const yMin = Math.min(...yValues);
  const yRange = Math.max(Math.max(...yValues) - yMin, 1);
  const points = data
    .map((row) => {
      const x = ((Number(row[xKey]) - xMin) / xRange) * 88 + 6;
      const y = 94 - (((Number(row[yKey]) - yMin) / yRange) * 88 + 6);
      return `<i title="${escapeAttr(row[labelKey] || "")}: ${escapeAttr(xKey)} ${formatNumber(row[xKey])}, ${escapeAttr(yKey)} ${formatNumber(row[yKey])}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%"></i>`;
    })
    .join("");
  return `<div class="html-chart scatter-chart"><div class="scatter-stage">${points}</div><div class="scatter-labels"><span>${escapeHtml(xKey)}</span><span>${escapeHtml(yKey)}</span></div></div>`;
}

function renderDataTable(data) {
  const keys = Object.keys(data[0] || {});
  const head = keys.map((key) => `<th>${escapeHtml(key)}</th>`).join("");
  const rows = data
    .map((row) => `<tr>${keys.map((key) => `<td>${escapeHtml(formatCell(row[key]))}</td>`).join("")}</tr>`)
    .join("");
  return `<div class="html-chart table-chart"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function getNumericSeriesKeys(data, labelKey) {
  return Object.keys(data[0] || {}).filter((key) => key !== labelKey && data.some((row) => Number.isFinite(Number(row[key]))));
}

function formatCell(value) {
  return typeof value === "number" ? formatNumber(value) : value ?? "";
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "");
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

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
