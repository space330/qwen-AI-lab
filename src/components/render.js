import { icons } from "./icons.js";
import { renderChart } from "./chartPolisher.js";
import { isExportableMessage } from "../utils/rangeExport.js";

export const modes = [
  { id: "chat", label: "对话模式", icon: "chat" },
  { id: "agent", label: "Agent模式", icon: "agent" },
  { id: "document", label: "文档总结", icon: "document" },
  { id: "csv", label: "CSV分析", icon: "csv" },
  { id: "settings", label: "设置", icon: "settings" },
];

export function renderApp(state) {
  document.documentElement.style.setProperty("--left-width", `${state.leftWidth}px`);

  return `
    <div class="app-shell ${state.leftWidth <= 88 ? "left-collapsed" : ""} ${state.exportModeActive ? "export-active" : ""} ${
      state.welcomeVisible ? "welcome-active" : ""
    }">
      ${renderTopbar(state)}
      ${renderSidebar(state)}
      <main class="workspace">${renderWorkspace(state)}</main>
      ${renderInputDock(state)}
      ${renderConversationDrawer(state)}
      ${renderProfilePanel(state)}
      ${state.conversationDrawerOpen || state.profilePanelOpen ? '<button class="surface-overlay" data-overlay-close aria-label="关闭浮层"></button>' : ""}
      ${renderExportDock(state)}
      ${state.welcomeVisible ? renderConsoleWelcome(state) : ""}
      <div class="resize-handle resize-left" data-resize="left"></div>
    </div>
  `;
}

// Floating export action bar, shown only while export mode is active.
function renderExportDock(state) {
  if (!state.exportModeActive) return "";
  const count = state.selectedExportIds?.size || 0;
  const visible = state.messages.slice(-Math.max(1, state.visibleMessageLimit || 60));
  // "全选" and the N/M counter only consider exportable content rows, matching
  // which rows actually carry a checkbox.
  const exportable = visible.filter(isExportableMessage);
  const allSelected = exportable.length > 0 && exportable.every((message) => state.selectedExportIds.has(message.id));
  return `
    <div class="export-dock" role="region" aria-label="导出操作栏">
      <div class="export-dock-info">${icons.download}<span>已选 <strong>${count}</strong> / ${exportable.length} 条</span></div>
      <div class="export-dock-actions">
        <button class="export-btn ghost" data-export-select-all ${exportable.length ? "" : "disabled"}>${allSelected ? "取消全选" : "全选"}</button>
        <button class="export-btn" data-export-html ${count ? "" : "disabled"}>HTML 下载</button>
        <button class="export-btn" data-export-print ${count ? "" : "disabled"}>PDF 打印</button>
        <button class="export-btn ghost" data-export-cancel>取消</button>
      </div>
    </div>
  `;
}

function renderTopbar(state) {
  return `
    <header class="topbar">
      <button class="brand-mark brand-welcome-button" data-show-welcome title="打开欢迎界面"><span class="word-logo">Lysandra</span></button>
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
      <button class="avatar-button avatar-${escapeAttr(state.profile?.avatarId || "amber")}" data-profile-toggle title="${escapeAttr(
        state.profile?.displayName || "本地用户",
      )}"><span>${escapeHtml((state.profile?.displayName || "本").slice(0, 1))}</span></button>
    </header>
  `;
}

function renderConsoleWelcome(state) {
  const model = escapeHtml(state.currentModel || "Qwen");
  const status = escapeHtml(state.apiStatus || "未连接");
  return `
    <section class="app-welcome-layer" aria-label="Qwen Agent Lab 欢迎界面">
      <div class="app-welcome-card">
        <div class="welcome-copy">
          <span class="welcome-wordmark">Lysandra</span>
          <h1>Qwen Agent Lab</h1>
          <p>欢迎回来。官网介绍、模型状态和控制台现在在同一个应用里，进入后可以直接继续对话、Agent、文档总结或 CSV 分析。</p>
          <div class="welcome-actions">
            <button class="landing-primary-action" data-enter-workspace>进入控制台</button>
            <a class="landing-secondary-action" href="/">查看完整首页</a>
          </div>
          <dl class="welcome-status-strip">
            <div><dt>当前模型</dt><dd>${model}</dd></div>
            <div><dt>API 状态</dt><dd><i></i>${status}</dd></div>
            <div><dt>本地工作区</dt><dd>会话和偏好继续保留</dd></div>
          </dl>
        </div>
        <div class="welcome-console-preview" aria-hidden="true">
          <div class="preview-top"></div>
          <div class="preview-grid">
            <span></span><span></span><span></span><span></span><span></span><span></span>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderSidebar(state) {
  return `
    <aside class="sidebar">
      <div class="side-head">
        <span>模式</span>
        <div class="side-head-actions">
          <button class="icon-button" data-conversation-toggle title="会话管理">${icons.history}</button>
          <button class="icon-button" data-collapse-left title="收起左栏">${icons.menu}</button>
        </div>
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
  const visibleMessages = state.messages.slice(-Math.max(1, state.visibleMessageLimit || 60));
  const hiddenCount = Math.max(0, state.messages.length - visibleMessages.length);
  const conversation = state.conversations.find((item) => item.id === state.currentConversationId);

  return `
    <section class="panel ai-output-panel">
      <div class="panel-head">
        <div class="panel-title">${icons.agent}<span>${escapeHtml(conversation?.title || "AI 输出区域")}</span><em>${getModeTitle(state.mode)}</em></div>
        <div class="panel-actions">
          <button class="icon-button ${state.exportModeActive ? "active" : ""}" data-export-mode title="导出选择">${icons.download}</button>
          <button class="icon-button" data-clear-history title="清空历史">${icons.file}</button>
          <button class="icon-button" data-copy-output title="复制输出">${icons.copy}</button>
          <button class="icon-button" data-save-output title="保存输出">${icons.save}</button>
        </div>
      </div>
      <div class="message-list">
        ${hiddenCount ? `<button class="load-earlier" data-load-earlier>加载更早消息 · 还有 ${hiddenCount} 条</button>` : ""}
        ${
          visibleMessages.length
            ? visibleMessages
                .map((message) => renderMessage(message, { exportMode: state.exportModeActive, selectedIds: state.selectedExportIds }))
                .join("")
            : renderEmpty("从一个问题开始这段会话")
        }
      </div>
    </section>
  `;
}

function renderConversationDrawer(state) {
  const query = String(state.conversationSearch || "").trim().toLowerCase();
  const conversations = state.conversations.filter(
    (item) => !query || String(item.title || "").toLowerCase().includes(query),
  );
  return `
    <aside class="conversation-drawer ${state.conversationDrawerOpen ? "open" : ""}" aria-hidden="${!state.conversationDrawerOpen}" ${
      state.conversationDrawerOpen ? "" : "inert"
    }>
      <div class="drawer-head">
        <div><span class="drawer-eyebrow">本地会话</span><h2>会话管理</h2></div>
        <button class="icon-button primary-icon" data-new-conversation title="新建会话">${icons.plus}</button>
      </div>
      <label class="conversation-search">
        ${icons.search}
        <input data-conversation-search value="${escapeAttr(state.conversationSearch || "")}" placeholder="搜索标题" />
      </label>
      <div class="conversation-list">
        ${
          conversations.length
            ? conversations.map((item) => renderConversationItem(item, state.currentConversationId)).join("")
            : renderEmpty("没有匹配的会话")
        }
      </div>
    </aside>
  `;
}

function renderConversationItem(conversation, currentId) {
  const updated = conversation.updatedAt
    ? new Date(conversation.updatedAt).toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "";
  return `
    <article class="conversation-item ${conversation.id === currentId ? "active" : ""}">
      <button class="conversation-open" data-conversation-open="${escapeAttr(conversation.id)}">
        <strong>${escapeHtml(conversation.title || "新对话")}</strong>
        <span>${escapeHtml(getModeTitle(conversation.mode))} · ${escapeHtml(updated)}</span>
      </button>
      <div class="conversation-actions">
        <button class="icon-button" data-conversation-rename="${escapeAttr(conversation.id)}" title="重命名">${icons.edit}</button>
        <button class="icon-button danger-icon" data-conversation-delete="${escapeAttr(conversation.id)}" title="删除">${icons.trash}</button>
      </div>
    </article>
  `;
}

function renderProfilePanel(state) {
  const profile = state.profile || {};
  const modelOptions = state.models.length
    ? state.models
        .map(
          (model) =>
            `<option value="${escapeAttr(model.id)}" ${profile.defaultModel === model.id ? "selected" : ""}>${escapeHtml(
              model.label || model.id,
            )}</option>`,
        )
        .join("")
    : `<option value="${escapeAttr(profile.defaultModel || state.currentModel)}">${escapeHtml(
        profile.defaultModel || state.currentModel,
      )}</option>`;
  return `
    <aside class="profile-panel ${state.profilePanelOpen ? "open" : ""}" aria-hidden="${!state.profilePanelOpen}" ${
      state.profilePanelOpen ? "" : "inert"
    }>
      <div class="drawer-head">
        <div><span class="drawer-eyebrow">仅保存在这台设备</span><h2>个人档案</h2></div>
        <button class="icon-button" data-profile-toggle title="关闭">${icons.close}</button>
      </div>
      <div class="profile-identity">
        <div class="profile-avatar avatar-${escapeAttr(profile.avatarId || "amber")}">${escapeHtml(
          (profile.displayName || "本").slice(0, 1),
        )}</div>
        <label><span>昵称</span><input data-profile-field="displayName" value="${escapeAttr(
          profile.displayName || "",
        )}" maxlength="24" /></label>
      </div>
      <div class="profile-section">
        <span class="field-label">内置头像</span>
        <div class="avatar-options">
          ${["amber", "coral", "sage", "blue"]
            .map(
              (id) =>
                `<button class="avatar-swatch avatar-${id} ${
                  profile.avatarId === id ? "active" : ""
                }" data-avatar-id="${id}" title="${id}"></button>`,
            )
            .join("")}
        </div>
      </div>
      <div class="profile-section profile-fields">
        <label><span>默认模型</span><select data-profile-field="defaultModel">${modelOptions}</select></label>
        <label><span>默认模式</span><select data-profile-field="defaultMode">
          ${modes
            .filter((item) => item.id !== "settings")
            .map(
              (mode) =>
                `<option value="${mode.id}" ${profile.defaultMode === mode.id ? "selected" : ""}>${mode.label}</option>`,
            )
            .join("")}
        </select></label>
      </div>
      <div class="storage-note ${state.storageKind === "memory" ? "warning" : ""}">
        ${
          state.storageKind === "memory"
            ? "IndexedDB 不可用：当前为临时内存模式，刷新后数据会丢失。"
            : "会话、附件和偏好使用 IndexedDB 保存在本机。"
        }
      </div>
      <div class="profile-actions">
        <button data-export-data>${icons.download}<span>导出全部数据</span></button>
        <button class="danger-action" data-clear-data>${icons.trash}<span>清除全部本地数据</span></button>
      </div>
    </aside>
  `;
}

function renderSettings(state) {
  const probeResult = state.modelProbeResult;
  const probeHtml = probeResult
    ? probeResult.status === "loading"
      ? `<span class="probe-result loading">正在试用 ${escapeHtml(probeResult.model)}...</span>`
      : probeResult.status === "ok"
        ? `<span class="probe-result ok">✓ 试用成功，响应用时 ${probeResult.durationMs} ms</span>`
        : `<span class="probe-result error">✗ ${escapeHtml(probeResult.message)}</span>`
    : "";

  const modelOptions = state.models.length
    ? state.models
        .map(
          (m) =>
            `<option value="${escapeAttr(m.id)}" ${state.currentModel === m.id ? "selected" : ""}>${escapeHtml(m.label)} · ${escapeHtml(m.speed)} · ${escapeHtml(m.note)}</option>`,
        )
        .join("")
    : `<option value="${escapeAttr(state.currentModel)}" selected>${escapeHtml(state.currentModel)}</option>`;

  const statusClass = state.apiStatus === "正常" ? "ok" : state.apiStatus === "错误" ? "error" : "idle";

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

        <div class="settings-row model-row">
          <label style="flex:1">
            <span>当前模型</span>
            <select data-setting="currentModel">${modelOptions}</select>
          </label>
          <button class="probe-button" data-probe-model title="向所选模型发送一条测试消息以验证可用性">试用</button>
        </div>
        ${probeHtml ? `<div class="settings-probe-feedback">${probeHtml}</div>` : ""}

        <label>
          <span>API 状态</span>
          <span class="api-status-badge ${statusClass}">${escapeHtml(state.apiStatus)}</span>
        </label>
      </div>

      <div class="settings-note">
        API Key 不会出现在前端设置中。密钥只放在后端 .env 环境变量中。<br>
        API 状态每 30 秒自动同步一次。
      </div>

      ${renderCallLog(state.callLog)}
    </section>
  `;
}

function renderCallLog(log) {
  return `
    <div class="call-log-section">
      <div class="call-log-head">
        <span>调用日志</span>
        <div class="call-log-actions">
          <button class="icon-button" data-refresh-log title="刷新日志">↻ 刷新</button>
          <button class="icon-button" data-clear-log title="清空日志">✕ 清空</button>
        </div>
      </div>
      ${
        !log || log.length === 0
          ? `<div class="call-log-empty">暂无调用记录。发送消息后这里会显示每次调用的详情。</div>`
          : `<table class="call-log-table">
              <thead><tr><th>时间</th><th>模型</th><th>模式</th><th>耗时</th><th>Token</th><th>状态</th></tr></thead>
              <tbody>
                ${log
                  .map((entry) => {
                    const time = entry.time ? new Date(entry.time).toLocaleTimeString("zh-CN", { hour12: false }) : "--";
                    const tokens =
                      entry.inputTokens != null
                        ? `${entry.inputTokens}↑ ${entry.outputTokens ?? "?"}↓`
                        : "--";
                    const statusCell =
                      entry.status === "ok"
                        ? `<td class="log-ok">✓ 成功</td>`
                        : `<td class="log-error">✗ ${escapeHtml(entry.errorCode || "错误")}</td>`;
                    return `<tr>
                      <td>${escapeHtml(time)}</td>
                      <td>${escapeHtml(entry.model || "--")}</td>
                      <td>${escapeHtml(entry.mode || "--")}</td>
                      <td>${entry.durationMs != null ? entry.durationMs + " ms" : "--"}</td>
                      <td>${escapeHtml(tokens)}</td>
                      ${statusCell}
                    </tr>`;
                  })
                  .join("")}
              </tbody>
            </table>`
      }
    </div>
  `;
}

function renderMessage(message, options = {}) {
  const isAssistant = message.role === "assistant";
  // While streaming ("吐字式"), content is partial HTML — show de-tagged plain
  // text with a caret; the final result swaps in the fully rendered HTML.
  const isStreaming = isAssistant && message.status === "streaming";
  const isHtml = isAssistant && !isStreaming && looksLikeHtml(message.content);
  const editable = isAssistant && !isHtml && !isStreaming;
  const inner = isStreaming
    ? `${escapeHtml(streamingPlainText(message.content))}<span class="stream-caret"></span>`
    : isHtml
      ? renderAnswerHtml(message.content, message.chartSpec)
      : formatContent(message.content);
  // Only genuine user/assistant content rows are checkable; transient cards
  // (loading / streaming / error / file-notice) render normally with no checkbox.
  const exportable = Boolean(options.exportMode) && isExportableMessage(message);
  const selected = exportable && options.selectedIds?.has?.(message.id);
  return `
    <article class="message-row ${message.role} ${exportable ? "export-mode" : ""} ${selected ? "export-selected" : ""}" data-message-row="${escapeAttr(message.id)}">
      ${exportable ? `<label class="export-check"><input type="checkbox" data-export-toggle="${escapeAttr(message.id)}" ${selected ? "checked" : ""} aria-label="选择此消息导出" /></label>` : ""}
      <div class="message-avatar">${isAssistant ? icons.agent : icons.chat}</div>
      <div class="message-card">
        <div class="message-meta">
          <strong data-message-title>${escapeHtml(message.title)}</strong>
          <span data-message-time>${escapeHtml(message.time)}</span>
        </div>
        ${isAssistant && (message.toolSteps?.length || message.steps?.length) ? renderToolSteps(message.toolSteps || message.steps) : ""}
        <div class="message-content ${isAssistant ? "editable-output" : ""} ${isHtml ? "html-output" : ""} ${isStreaming ? "streaming" : ""}" ${
          editable ? `contenteditable="true" data-message-id="${message.id}"` : ""
        }>${inner}</div>
      </div>
    </article>
  `;
}

// A web_search step is flagged as Mock when its result JSON reports the local
// placeholder source, so users never mistake placeholder data for real results.
function isMockSearchResult(step) {
  if (!step || step.tool !== "web_search" || typeof step.result !== "string") return false;
  try {
    const parsed = JSON.parse(step.result);
    return parsed?.mock === true || parsed?.source === "mock";
  } catch {
    return false;
  }
}

// Agent tool-chain timeline. Rendered from trusted app state (not model output),
// but every dynamic value is still escaped to stay injection-safe.
function renderToolSteps(steps = []) {
  const items = steps
    .map((step) => {
      const { statusClass, statusLabel } = toolStepStatus(step.status);
      const argsText = step.args && typeof step.args === "object" && Object.keys(step.args).length
        ? JSON.stringify(step.args)
        : "";
      const detail = step.status === "error" || step.status === "denied" ? step.error : step.result;
      const duration = step.durationMs != null && step.status !== "denied" ? `${step.durationMs} ms` : "";
      const mockBadge = isMockSearchResult(step) ? `<span class="tool-step-mock" title="未配置真实搜索服务，结果为本地占位">Mock</span>` : "";
      const categoryLabel = TOOL_CATEGORY_LABELS[step.category];
      const categoryChip = categoryLabel ? `<span class="tool-step-cat cat-${step.category}">${categoryLabel}</span>` : "";
      const confirmUi = step.status === "awaiting"
        ? `<div class="tool-confirm">
            <span class="tool-confirm-hint">Agent 想运行该工具，需要你确认后才会执行。</span>
            <div class="tool-confirm-actions">
              <button class="tool-confirm-btn approve" data-confirm-approve="${step.step}">允许</button>
              <button class="tool-confirm-btn deny" data-confirm-deny="${step.step}">拒绝</button>
            </div>
          </div>`
        : "";
      return `
        <li class="tool-step ${statusClass}">
          <div class="tool-step-head">
            <span class="tool-step-dot"></span>
            <strong>${escapeHtml(step.tool || "tool")}</strong>
            ${categoryChip}
            <span class="tool-step-status">${statusLabel}</span>
            ${mockBadge}
            ${duration ? `<span class="tool-step-time">${escapeHtml(duration)}</span>` : ""}
          </div>
          ${argsText ? `<div class="tool-step-args">${escapeHtml(truncate(argsText, 200))}</div>` : ""}
          ${confirmUi}
          ${detail ? `<div class="tool-step-detail">${escapeHtml(truncate(detail, 600))}</div>` : ""}
        </li>`;
    })
    .join("");
  return `
    <div class="tool-steps">
      <div class="tool-steps-head">${icons.agent}<span>工具调用 · ${steps.length} 步</span></div>
      <ol class="tool-step-list">${items}</ol>
    </div>`;
}

const TOOL_CATEGORY_LABELS = {
  local: "本地",
  web: "联网",
  memory: "记忆",
  analysis: "分析",
  output: "产出",
};

function toolStepStatus(status) {
  switch (status) {
    case "error": return { statusClass: "error", statusLabel: "失败" };
    case "completed":
    case "done": return { statusClass: "done", statusLabel: "完成" };
    case "awaiting": return { statusClass: "awaiting", statusLabel: "待确认" };
    case "confirming": return { statusClass: "confirming", statusLabel: "处理中…" };
    case "denied": return { statusClass: "denied", statusLabel: "已拒绝" };
    default: return { statusClass: "running", statusLabel: "执行中" };
  }
}

function truncate(value, max) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

const INPUT_HINTS = {
  chat: { icon: "chat", label: "对话模式", tip: "简洁结构化问答" },
  agent: { icon: "agent", label: "Agent 模式", tip: "可自动调用计算器 / 联网检索 / 读取文件" },
  document: { icon: "document", label: "文档总结", tip: "上传 txt / md 后提问" },
  csv: { icon: "csv", label: "CSV 分析", tip: "上传 csv 后提问" },
};

const INPUT_PLACEHOLDERS = {
  chat: "hello，想做些啥？",
  agent: "hello，想做些啥？",
  document: "hello，想做些啥？",
  csv: "hello，想做些啥？",
};

function renderInputDock(state) {
  const hasFile = Boolean(state.uploadedFile);
  const hint = INPUT_HINTS[state.mode] || INPUT_HINTS.chat;
  const placeholder = INPUT_PLACEHOLDERS[state.mode] || INPUT_PLACEHOLDERS.chat;
  return `
    <footer class="input-dock">
      <div class="input-hint ${state.mode === "agent" ? "agent" : ""}">
        ${icons[hint.icon] || ""}<strong>${escapeHtml(hint.label)}</strong><span>${escapeHtml(hint.tip)}</span>
      </div>
      <div class="input-field">
        <label class="input-upload ${hasFile ? "has-file" : ""}" title="${
          hasFile ? escapeAttr(state.uploadedFile.name) : "上传 txt / md / csv 文件"
        }">
          ${icons.upload}
          <input type="file" data-file-input accept=".txt,.md,.csv" hidden />
        </label>
        <textarea data-main-input placeholder="${escapeAttr(placeholder)}">${escapeHtml(
          state.inputText,
        )}</textarea>
        <span class="char-count">${state.inputText.length} / 4000</span>
        <button
          class="web-search-toggle ${state.webSearch ? "active" : ""}"
          data-web-search
          type="button"
          aria-pressed="${state.webSearch ? "true" : "false"}"
          title="${state.webSearch ? "联网搜索：已开启（本次回答会实时查证）" : "联网搜索：已关闭"}"
        >${icons.globe}<span>web search</span></button>
        <button class="send-button" data-send title="发送">${icons.send}</button>
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

// Render streamed HTML tokens as readable plain text: drop complete tags and a
// trailing half-written tag, decode the few common entities, tidy blank lines.
export function streamingPlainText(raw = "") {
  return String(raw)
    .replace(/<[^>]+>/g, "")
    .replace(/<[^>]*$/, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+/, "");
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
