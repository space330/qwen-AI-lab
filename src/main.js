import { loadState, saveState, clampLeftWidth } from "./state.js";
import { renderApp, streamingPlainText } from "./components/render.js";
import { buildStandaloneDocument, buildReportTitle, escapeHtml as escapeReportHtml } from "./utils/exportReport.js";
import { renderLanding } from "./components/landing.js";
import { initLandingInteractive } from "./components/landingInteractive.js";
import { initLandingMotion } from "./components/landingMotion.js";
import { createConversationRepository } from "./data/conversationRepository.js";
import {
  buildConversationContext,
  buildLocalTitle,
  createConversation,
  createProfile,
  messagesForSummary,
  shouldSummarizeConversation,
} from "./utils/conversation.js";
import { readUploadFile } from "./utils/fileParser.js";
import { collectExportableIds, isExportableMessage } from "./utils/rangeExport.js";
import {
  getClipboardFiles,
  getClipboardText,
  getShortcutAction,
  mergeInputText,
  shouldHandleGlobalPaste,
} from "./utils/inputActions.js";
import { consolePath, viewForPath } from "./utils/routing.js";

const repository = createConversationRepository();
const app = document.querySelector("#app");
let state = loadState();
let activeConversation = null;
let statusTimer = null;
let lastMessageTimestamp = 0;
// requestId of the in-flight agent stream, so a tool-confirmation click can
// address the right paused tool on the server.
let activeAgentRequestId = null;
// Disconnect handle for the landing IntersectionObservers; cleared before every re-render.
let landingMotionCleanup = null;
let landingInteractiveCleanup = null;
state.currentView = viewForPath(window.location.pathname);

bootstrap();

async function bootstrap() {
  state.rightWidth = Math.min(state.rightWidth, getMaxRightWidth());
  state.models = [];
  state.callLog = [];
  state.modelProbeResult = null;
  state.apiStatus = "未连接";
  state.storageKind = await repository.init();

  const migration = await repository.migrateLegacyState();
  state.profile = (await repository.getProfile()) || createProfile({
    model: state.currentModel,
    mode: state.mode,
  });
  await repository.putProfile(state.profile);

  state.currentConversationId = migration.conversationId || state.currentConversationId;
  await refreshConversationList();
  const selected = state.conversations.find((item) => item.id === state.currentConversationId);
  await loadConversation(selected?.id || (await ensureConversationForMode(state.mode)).id);

  render();
  await syncBackendStatus();
  statusTimer = setInterval(syncBackendStatus, 30000);
}

window.addEventListener("resize", handleWindowResize);
window.addEventListener("paste", handlePaste);
window.addEventListener("keydown", handleKeyboardShortcut);
window.addEventListener("popstate", handleRouteChange);
window.addEventListener("beforeunload", () => clearInterval(statusTimer));

function render() {
  if (landingMotionCleanup) {
    landingMotionCleanup();
    landingMotionCleanup = null;
  }
  if (landingInteractiveCleanup) {
    landingInteractiveCleanup();
    landingInteractiveCleanup = null;
  }
  document.body.classList.toggle("landing-active", state.currentView === "home");
  app.innerHTML = state.currentView === "home" ? renderLanding(state) : renderApp(state);
  if (state.currentView === "home") bindLandingEvents();
  else bindEvents();
}

function commit(patch = {}, { shouldRender = true } = {}) {
  state = { ...state, ...patch };
  saveState(state);
  if (shouldRender) render();
}

function bindEvents() {
  app.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => handleModeChange(button.dataset.mode));
  });
  app.querySelectorAll("[data-show-welcome]").forEach((button) => {
    button.addEventListener("click", showIntegratedWelcome);
  });
  app.querySelectorAll("[data-enter-workspace]").forEach((button) => {
    button.addEventListener("click", enterWorkspaceFromWelcome);
  });

  app.querySelector("[data-main-input]")?.addEventListener("input", (event) => {
    state.inputText = event.target.value.slice(0, 4000);
    saveState(state);
    const count = app.querySelector(".char-count");
    if (count) count.textContent = `${state.inputText.length} / 4000`;
  });

  app.querySelector("[data-send]")?.addEventListener("click", handleSend);
  app.querySelector("[data-web-search]")?.addEventListener("click", toggleWebSearch);
  app.querySelector("[data-file-input]")?.addEventListener("change", handleFileUpload);

  app.querySelectorAll("[data-setting]").forEach((input) => {
    input.addEventListener("change", (event) => handleGlobalSetting(event.target.dataset.setting, event.target.value));
  });

  app.querySelector("[data-probe-model]")?.addEventListener("click", handleModelProbe);
  app.querySelector("[data-refresh-log]")?.addEventListener("click", syncCallLog);
  app.querySelector("[data-clear-log]")?.addEventListener("click", async () => {
    await fetch("/api/logs", { method: "DELETE" });
    await syncCallLog();
  });

  app.querySelectorAll("[data-message-id]").forEach((node) => {
    node.addEventListener("input", async () => {
      const message = state.messages.find((item) => item.id === node.dataset.messageId);
      if (!message) return;
      message.content = node.innerText.trim();
      message.plainText = node.innerText.trim();
      if (message.role === "assistant") state.generatedResult = message.content;
      await repository.putMessage(message);
    });
  });

  app.querySelectorAll("[data-copy-output]").forEach((button) => button.addEventListener("click", copyOutput));
  app.querySelectorAll("[data-save-output]").forEach((button) => button.addEventListener("click", saveOutput));
  app.querySelector("[data-clear-history]")?.addEventListener("click", clearCurrentHistory);

  // Export mode (V2.1)
  app.querySelector("[data-export-mode]")?.addEventListener("click", toggleExportMode);
  app.querySelectorAll("[data-export-toggle]").forEach((cb) =>
    cb.addEventListener("change", () => toggleExportId(cb.dataset.exportToggle)),
  );
  app.querySelector("[data-export-select-all]")?.addEventListener("click", selectAllExport);
  app.querySelector("[data-export-html]")?.addEventListener("click", exportSelectedHtml);
  app.querySelector("[data-export-print]")?.addEventListener("click", printSelected);
  app.querySelector("[data-export-cancel]")?.addEventListener("click", cancelExport);
  app.querySelector("[data-collapse-left]")?.addEventListener("click", () => {
    commit({ leftWidth: state.leftWidth > 88 ? 72 : 150 });
  });

  // Human-in-the-loop tool confirmation (allow/deny in the tool-step timeline).
  app.querySelectorAll("[data-confirm-approve]").forEach((button) =>
    button.addEventListener("click", () => respondToolConfirm(button.dataset.confirmApprove, "approve")),
  );
  app.querySelectorAll("[data-confirm-deny]").forEach((button) =>
    button.addEventListener("click", () => respondToolConfirm(button.dataset.confirmDeny, "deny")),
  );

  bindConversationEvents();
  bindProfileEvents();
  bindResizeHandles();
}

// Deliver the user's allow/deny for a paused tool. The open agent stream resumes
// server-side as soon as the decision lands; its follow-up events (tool_start /
// tool_result or tool_denied) reconcile the step's final state.
async function respondToolConfirm(step, decision) {
  const requestId = activeAgentRequestId;
  const numericStep = Number(step);
  if (!requestId || !Number.isInteger(numericStep)) return;

  // Optimistically swap the awaiting step to "confirming" so the buttons clear
  // immediately and can't be double-submitted.
  for (let i = state.messages.length - 1; i >= 0; i -= 1) {
    const steps = state.messages[i].toolSteps || [];
    if (steps.some((item) => item.step === numericStep && item.status === "awaiting")) {
      const toolSteps = steps.map((item) =>
        item.step === numericStep && item.status === "awaiting" ? { ...item, status: "confirming" } : item,
      );
      state.messages[i] = { ...state.messages[i], toolSteps };
      render();
      break;
    }
  }

  try {
    await fetch("/api/qwen/agent/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, step: numericStep, decision }),
    });
  } catch {
    // Network error: the server-side confirmation timeout will cancel the tool;
    // the stream's tool_denied event will then reconcile the step.
  }
}

function bindLandingEvents() {
  app.querySelectorAll("[data-enter-console]").forEach((link) => {
    link.addEventListener("click", openConsoleFromLanding);
  });
  landingMotionCleanup = initLandingMotion(app);
  landingInteractiveCleanup = initLandingInteractive(app);
}

function openConsoleFromLanding(event) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const landing = app.querySelector(".landing-page");
  const transition = event.currentTarget?.dataset?.transition || "zoom-fluid";
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (prefersReducedMotion) {
    navigateToConsole();
    return;
  }
  if (landing) landing.dataset.transition = transition;
  landing?.classList.add("is-launching");
  window.setTimeout(navigateToConsole, 280);
}

function navigateToConsole() {
  if (window.location.pathname !== consolePath()) {
    window.history.pushState({}, "", consolePath());
  }
  state.currentView = "console";
  state.welcomeVisible = false;
  render();
  requestAnimationFrame(() => focusMainInput(false));
}

function handleRouteChange() {
  state.currentView = viewForPath(window.location.pathname);
  state.welcomeVisible = state.currentView === "console";
  render();
}

function showIntegratedWelcome() {
  commit({ welcomeVisible: true });
}

function enterWorkspaceFromWelcome() {
  const layer = app.querySelector(".app-welcome-layer");
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (prefersReducedMotion) {
    commit({ welcomeVisible: false });
    requestAnimationFrame(() => focusMainInput(false));
    return;
  }
  layer?.classList.add("is-leaving");
  window.setTimeout(() => {
    commit({ welcomeVisible: false });
    requestAnimationFrame(() => focusMainInput(false));
  }, 220);
}

function bindConversationEvents() {
  app.querySelector("[data-conversation-toggle]")?.addEventListener("click", () => {
    commit({ conversationDrawerOpen: !state.conversationDrawerOpen, profilePanelOpen: false });
  });
  app.querySelector("[data-new-conversation]")?.addEventListener("click", createNewConversation);
  app.querySelector("[data-conversation-search]")?.addEventListener("input", (event) => {
    state.conversationSearch = event.target.value;
    render();
    requestAnimationFrame(() => {
      const input = app.querySelector("[data-conversation-search]");
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    });
  });
  app.querySelectorAll("[data-conversation-open]").forEach((button) => {
    button.addEventListener("click", () => loadConversation(button.dataset.conversationOpen));
  });
  app.querySelectorAll("[data-conversation-rename]").forEach((button) => {
    button.addEventListener("click", () => renameConversation(button.dataset.conversationRename));
  });
  app.querySelectorAll("[data-conversation-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteConversation(button.dataset.conversationDelete));
  });
  app.querySelector("[data-load-earlier]")?.addEventListener("click", () => {
    commit({ visibleMessageLimit: state.visibleMessageLimit + 40 });
  });
}

function bindProfileEvents() {
  app.querySelectorAll("[data-profile-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      commit({ profilePanelOpen: !state.profilePanelOpen, conversationDrawerOpen: false });
    });
  });
  app.querySelector("[data-overlay-close]")?.addEventListener("click", () => {
    commit({ profilePanelOpen: false, conversationDrawerOpen: false });
  });
  app.querySelectorAll("[data-profile-field]").forEach((input) => {
    input.addEventListener("change", async (event) => {
      const field = event.target.dataset.profileField;
      state.profile = { ...state.profile, [field]: event.target.value, updatedAt: new Date().toISOString() };
      await repository.putProfile(state.profile);
      render();
    });
  });
  app.querySelectorAll("[data-avatar-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.profile = { ...state.profile, avatarId: button.dataset.avatarId, updatedAt: new Date().toISOString() };
      await repository.putProfile(state.profile);
      render();
    });
  });
  app.querySelector("[data-export-data]")?.addEventListener("click", exportLocalData);
  app.querySelector("[data-clear-data]")?.addEventListener("click", clearAllLocalData);
}

async function handleModeChange(mode) {
  if (!mode) return;
  if (mode === "settings") {
    commit({ mode, conversationDrawerOpen: false });
    await syncCallLog();
    return;
  }
  const conversation = await ensureConversationForMode(mode);
  await loadConversation(conversation.id);
}

function toggleWebSearch() {
  commit({ webSearch: !state.webSearch });
}

async function ensureConversationForMode(mode) {
  const conversations = await repository.listConversations({ mode });
  if (conversations.length) return conversations[0];
  const conversation = createConversation({ mode, model: state.profile?.defaultModel || state.currentModel });
  await repository.putConversation(conversation);
  await refreshConversationList();
  return conversation;
}

async function createNewConversation() {
  const mode = state.mode === "settings" ? state.profile?.defaultMode || "chat" : state.mode;
  const conversation = createConversation({ mode, model: state.currentModel });
  await repository.putConversation(conversation);
  await refreshConversationList();
  await loadConversation(conversation.id);
}

async function loadConversation(id) {
  const conversation = await repository.getConversation(id);
  if (!conversation) return;
  activeConversation = conversation;
  state.currentConversationId = conversation.id;
  state.mode = conversation.mode;
  state.currentModel = conversation.model || state.profile?.defaultModel || state.currentModel;
  state.messages = await repository.getMessages(conversation.id);
  state.uploadedFile = await repository.getAttachment(conversation.id);
  state.generatedResult = lastAssistantMessage()?.content || "";
  state.filePreviewVisible = false;
  state.visibleMessageLimit = 60;
  state.conversationDrawerOpen = false;
  saveState(state);
  await refreshConversationList();
  render();
}

async function refreshConversationList() {
  state.conversations = await repository.listConversations();
}

async function touchActiveConversation(patch = {}) {
  if (!activeConversation) return;
  activeConversation = { ...activeConversation, ...patch, updatedAt: new Date().toISOString() };
  await repository.putConversation(activeConversation);
  await refreshConversationList();
}

async function renameConversation(id) {
  const conversation = await repository.getConversation(id);
  if (!conversation) return;
  const title = window.prompt("重命名会话", conversation.title)?.trim();
  if (!title) return;
  await repository.putConversation({ ...conversation, title: title.slice(0, 48), updatedAt: new Date().toISOString() });
  if (activeConversation?.id === id) activeConversation = { ...activeConversation, title: title.slice(0, 48) };
  await refreshConversationList();
  render();
}

async function deleteConversation(id) {
  const conversation = await repository.getConversation(id);
  if (!conversation || !window.confirm(`删除会话“${conversation.title}”？此操作无法撤销。`)) return;
  await repository.deleteConversation(id);
  await refreshConversationList();
  if (activeConversation?.id !== id) {
    render();
    return;
  }
  const next = state.conversations.find((item) => item.mode === conversation.mode) || (await ensureConversationForMode(conversation.mode));
  await loadConversation(next.id);
}

async function clearCurrentHistory() {
  if (!activeConversation || !window.confirm("清空当前会话历史？附件将保留。")) return;
  await repository.clearMessages(activeConversation.id);
  await touchActiveConversation({ summary: "", summarizedThroughMessageId: null });
  state.messages = [];
  state.generatedResult = "";
  render();
}

async function handleGlobalSetting(setting, value) {
  if (setting === "currentModel") {
    state.currentModel = value;
    await touchActiveConversation({ model: value });
  } else {
    state[setting] = value;
  }
  saveState(state);
  render();
}

async function handleFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    await acceptIncomingFile(file, "upload");
    event.target.value = "";
  } catch (error) {
    await showError(error.message);
  }
}

async function handlePaste(event) {
  if (state.currentView === "home") return;
  const files = getClipboardFiles(event.clipboardData);
  if (files.length) {
    event.preventDefault();
    try {
      await acceptIncomingFile(files[0], "paste");
    } catch (error) {
      await showError(error.message);
    }
    return;
  }
  if (event.clipboardData?.files?.length) {
    event.preventDefault();
    await showError("仅支持粘贴 txt / md / csv 文件。");
    return;
  }
  if (!shouldHandleGlobalPaste(event.target)) return;
  const text = getClipboardText(event.clipboardData);
  if (!text.trim()) return;
  event.preventDefault();
  commit({ inputText: mergeInputText(state.inputText, text) });
  requestAnimationFrame(() => focusMainInput(true));
}

function handleKeyboardShortcut(event) {
  if (state.currentView === "home") return;
  const action = getShortcutAction(event);
  if (!action) return;
  if (action === "send") {
    event.preventDefault();
    handleSend();
  } else if (action === "focus-input") {
    event.preventDefault();
    focusMainInput(true);
  } else if (action === "open-file") {
    event.preventDefault();
    app.querySelector("[data-file-input]")?.click();
  } else if (action === "copy-output") {
    event.preventDefault();
    copyOutput();
  } else if (action === "escape") {
    if (state.exportModeActive) {
      cancelExport();
    } else if (state.profilePanelOpen || state.conversationDrawerOpen) {
      commit({ profilePanelOpen: false, conversationDrawerOpen: false });
    } else if (document.activeElement?.matches?.("[data-main-input]")) {
      document.activeElement.blur();
    } else if (state.rightWidth > 20) {
      commit({ rightWidth: 0 });
    }
  }
}

async function acceptIncomingFile(file, source) {
  const uploadedFile = await readUploadFile(file);
  const actionText = source === "paste" ? "粘贴" : "上传";
  const uploadMessage = toStoredMessage({
    role: "assistant",
    type: "file-notice",
    title: `文件已${actionText}`,
    content: `已接收文件：${uploadedFile.name}\n可直接提问，我会结合该文件内容作答。`,
    includeInContext: false,
  });
  await repository.putAttachment({ conversationId: activeConversation.id, ...uploadedFile });
  await repository.putMessage(uploadMessage);
  state.uploadedFile = uploadedFile;
  state.filePreviewVisible = false;
  state.messages = [...state.messages, uploadMessage];
  if (activeConversation.title === "新对话") await touchActiveConversation({ title: buildLocalTitle("", uploadedFile.name) });
  else await touchActiveConversation();
  render();
}

async function handleSend() {
  const text = state.inputText.trim();
  if (!text && !state.uploadedFile) {
    await showError("请输入问题，或先上传 txt / md / csv 文件。");
    return;
  }

  const context = buildConversationContext({
    summary: activeConversation?.summary,
    messages: state.messages,
    maxTurns: 8,
  });
  const userMessage = toStoredMessage({
    role: "user",
    title: "用户输入",
    content: text || `分析文件：${state.uploadedFile.name}`,
  });
  const assistantMessage = toStoredMessage({
    role: "assistant",
    title: "AI 输出 · 生成中",
    content: "### Loading\n正在连接后端服务...",
    status: "loading",
    includeInContext: false,
  });

  state.inputText = "";
  state.generatedResult = assistantMessage.content;
  state.messages = [...state.messages, userMessage, assistantMessage];
  await repository.putMessages([userMessage, assistantMessage]);
  const titlePatch = activeConversation.title === "新对话"
    ? { title: buildLocalTitle(text, state.uploadedFile?.name) }
    : {};
  await touchActiveConversation(titlePatch);
  render();

  try {
    await streamBackendResponse({
      assistantId: assistantMessage.id,
      mode: state.mode,
      input: text,
      file: shouldAttachFileToRequest(text, state.mode, state.uploadedFile) ? state.uploadedFile : null,
      model: state.currentModel,
      context,
      webSearch: state.webSearch,
    });
    void maybeUpdateConversationSummary();
  } catch (error) {
    await showError(error.message || "请求失败，请稍后重试。", assistantMessage.id);
  }
}

async function streamBackendResponse({ assistantId, mode, input, file, model, context, webSearch }) {
  const response = await fetch("/api/qwen/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, input, file, model, context, webSearch }),
  });
  if (!response.ok || !response.body) {
    const errorPayload = await safeReadJson(response);
    throw new Error(errorPayload?.error?.message || "后端接口不可用，请确认 Express 服务已启动。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      await handleStreamEvent(assistantId, JSON.parse(line));
    }
  }
  if (buffer.trim()) await handleStreamEvent(assistantId, JSON.parse(buffer));
}

async function handleStreamEvent(assistantId, event) {
  if (event.requestId) activeAgentRequestId = event.requestId;
  if (event.event === "status") {
    await updateAssistantMessage(assistantId, "AI 输出 · 生成中", `### Loading\n${event.message || "正在处理..."}`, {
      status: "loading",
      includeInContext: false,
    });
  } else if (event.event === "delta") {
    applyStreamDelta(assistantId, event.text || "");
  } else if (
    event.event === "tool_start" ||
    event.event === "tool_result" ||
    event.event === "tool_error" ||
    event.event === "tool_confirm" ||
    event.event === "tool_denied"
  ) {
    await applyToolEvent(assistantId, event);
  } else if (event.event === "result") {
    const data = event.response?.data;
    const extra = {
      chartSpec: data?.chartSpec || null,
      status: "completed",
      includeInContext: true,
      streamRaw: null,
    };
    // The final response carries the authoritative, complete toolSteps contract
    // (status / result / error / durationMs); prefer it over the live-built one.
    if (Array.isArray(data?.toolSteps) && data.toolSteps.length) {
      extra.toolSteps = data.toolSteps;
    }
    await updateAssistantMessage(assistantId, "AI 输出", formatStructuredResponse(data), extra);
  } else if (event.event === "error") {
    throw new Error(event.error?.message || "千问接口调用失败。");
  }
}

// "吐字式" streaming: each delta appends to the assistant message's raw buffer.
// The model emits HTML, so during streaming we show de-tagged plain text (a clean
// typewriter feel); the final `result` event swaps in the fully rendered HTML.
// DOM is updated in place per token to avoid a full re-render on every chunk.
function applyStreamDelta(assistantId, text) {
  const index = state.messages.findIndex((message) => message.id === assistantId);
  if (index === -1) return;
  const message = state.messages[index];
  const streamRaw = (message.streamRaw || "") + text;
  state.messages[index] = {
    ...message,
    streamRaw,
    content: streamRaw,
    status: "streaming",
    title: "AI 输出 · 生成中",
  };

  const row = app.querySelector(`[data-message-row="${escapeSelector(assistantId)}"]`);
  if (!row) {
    render();
    return;
  }
  const titleNode = row.querySelector("[data-message-title]");
  if (titleNode) titleNode.textContent = "AI 输出 · 生成中";
  const contentNode = row.querySelector(".message-content");
  if (contentNode) {
    contentNode.classList.remove("html-output");
    contentNode.removeAttribute("contenteditable");
    contentNode.classList.add("streaming");
    contentNode.textContent = streamingPlainText(streamRaw);
    // Re-append the blinking caret (textContent above cleared it).
    const caret = document.createElement("span");
    caret.className = "stream-caret";
    contentNode.appendChild(caret);
  }
  const list = app.querySelector(".message-list");
  if (list) list.scrollTop = list.scrollHeight;
}

// Agent tool-loop events accumulate into the assistant message's `toolSteps`
// array (the unified contract: step / tool / status / args / result / error /
// durationMs), which render.js draws as a tool-chain timeline. The whole message
// object is persisted to IndexedDB, so steps survive reloads without a schema
// change. Legacy messages may still carry the old `steps` field — read both.
async function applyToolEvent(assistantId, event) {
  const index = state.messages.findIndex((message) => message.id === assistantId);
  if (index === -1) return;
  const message = state.messages[index];
  const toolSteps = Array.isArray(message.toolSteps)
    ? [...message.toolSteps]
    : Array.isArray(message.steps)
      ? [...message.steps]
      : [];

  const stepIndex = toolSteps.findIndex((item) => item.step === event.step);

  if (event.event === "tool_confirm") {
    // A requiresConfirmation tool is paused awaiting the user's allow/deny.
    toolSteps.push({
      step: event.step,
      tool: event.tool || "tool",
      category: event.category || null,
      status: "awaiting",
      args: event.args || null,
      result: null,
      error: null,
      durationMs: null,
    });
  } else if (event.event === "tool_start") {
    // After approval the step already exists as `awaiting`/`confirming` —
    // upgrade it in place rather than pushing a duplicate.
    const base = {
      step: event.step,
      tool: event.tool || "tool",
      category: event.category || (stepIndex !== -1 ? toolSteps[stepIndex].category : null),
      status: "running",
      args: event.args || (stepIndex !== -1 ? toolSteps[stepIndex].args : null),
      result: null,
      error: null,
      durationMs: null,
    };
    if (stepIndex !== -1) toolSteps[stepIndex] = { ...toolSteps[stepIndex], ...base };
    else toolSteps.push(base);
  } else if (event.event === "tool_denied") {
    if (stepIndex !== -1) {
      toolSteps[stepIndex] = {
        ...toolSteps[stepIndex],
        status: "denied",
        error: String(event.error || "用户拒绝执行该工具。"),
        durationMs: 0,
      };
    }
  } else if (stepIndex !== -1) {
    // tool_result / tool_error
    toolSteps[stepIndex] = {
      ...toolSteps[stepIndex],
      status: event.event === "tool_error" ? "error" : "completed",
      result: event.event === "tool_result" ? String(event.result ?? "") : toolSteps[stepIndex].result,
      error: event.event === "tool_error" ? String(event.error ?? "") : toolSteps[stepIndex].error,
      durationMs: event.durationMs ?? toolSteps[stepIndex].durationMs,
    };
  }

  const title = event.event === "tool_confirm" ? "AI 输出 · 待确认" : "AI 输出 · 执行工具中";
  const updated = { ...message, toolSteps, title, time: currentTime() };
  state.messages[index] = updated;
  await repository.putMessage(updated);
  render();
}

async function updateAssistantMessage(assistantId, title, content, extra = {}) {
  const index = state.messages.findIndex((message) => message.id === assistantId);
  if (index === -1) return;
  const updated = {
    ...state.messages[index],
    ...extra,
    title,
    content,
    plainText: toPlainText(content),
    time: currentTime(),
  };
  state.messages[index] = updated;
  state.generatedResult = content;
  await repository.putMessage(updated);
  if (updated.status === "loading") {
    const row = app.querySelector(`[data-message-row="${escapeSelector(assistantId)}"]`);
    if (row) {
      const titleNode = row.querySelector("[data-message-title]");
      const timeNode = row.querySelector("[data-message-time]");
      const contentNode = row.querySelector(".message-content");
      if (titleNode) titleNode.textContent = title;
      if (timeNode) timeNode.textContent = updated.time;
      if (contentNode) contentNode.textContent = content.replace(/^### Loading\s*/i, "");
      return;
    }
  }
  render();
}

async function maybeUpdateConversationSummary() {
  if (!activeConversation || !shouldSummarizeConversation({
    messages: state.messages,
    summarizedThroughMessageId: activeConversation.summarizedThroughMessageId,
  })) return;

  const batch = messagesForSummary({
    messages: state.messages,
    summarizedThroughMessageId: activeConversation.summarizedThroughMessageId,
    keepTurns: 8,
  });
  if (!batch.messages.length || !batch.throughMessageId) return;
  try {
    const response = await fetch("/api/qwen/conversation-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: activeConversation.model,
        previousSummary: activeConversation.summary,
        messages: batch.messages.map(({ role, plainText, content }) => ({ role, content: plainText || content })),
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) return;
    await touchActiveConversation({
      summary: payload.data.summary,
      summarizedThroughMessageId: batch.throughMessageId,
    });
  } catch {
    // Summary is best-effort and must never block the active conversation.
  }
}

function toStoredMessage({
  role,
  type = "message",
  title,
  content,
  chartSpec = null,
  status = "completed",
  includeInContext = true,
  action = null,
  steps = [],
}) {
  return {
    id: createId(),
    conversationId: activeConversation.id,
    role,
    type,
    title,
    content,
    plainText: toPlainText(content),
    chartSpec,
    status,
    includeInContext,
    action,
    steps,
    time: currentTime(),
    createdAt: nextMessageTimestamp(),
  };
}

async function exportLocalData() {
  const data = await repository.exportAll();
  downloadBlob(JSON.stringify(data, null, 2), `qwen-agent-lab-data-${Date.now()}.json`, "application/json");
}

async function clearAllLocalData() {
  if (!window.confirm("清除全部本地会话和个人档案？此操作无法撤销。")) return;
  await repository.clearAll();
  state.profile = createProfile();
  await repository.putProfile(state.profile);
  state.conversations = [];
  state.currentConversationId = null;
  activeConversation = null;
  const conversation = await ensureConversationForMode(state.profile.defaultMode);
  await loadConversation(conversation.id);
}

function focusMainInput(moveCursorToEnd = false) {
  const input = app.querySelector("[data-main-input]");
  if (!input) return;
  input.focus();
  if (moveCursorToEnd) {
    input.selectionStart = input.value.length;
    input.selectionEnd = input.value.length;
  }
}

function formatStructuredResponse(data) {
  if (!data) return "千问返回为空。";
  if (data.html || data.content?.trim().startsWith("<section")) return data.html || data.content;
  if (!Array.isArray(data.sections) || !data.sections.length) return data.content || "千问返回为空。";
  return data.sections
    .map((section) => {
      if (section.html) return section.html;
      const dataText = section.data ? `\n数据：${JSON.stringify(section.data, null, 2)}` : "";
      return `## ${section.title}\n${section.text || ""}${dataText}`;
    })
    .join("\n\n");
}

function bindResizeHandles() {
  app.querySelectorAll("[data-resize]").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const target = handle.dataset.resize;
      handle.setPointerCapture(event.pointerId);
      const onMove = (moveEvent) => {
        if (target === "left") {
          state.leftWidth = clampLeftWidth(moveEvent.clientX);
          document.documentElement.style.setProperty("--left-width", `${state.leftWidth}px`);
        } else {
          state.rightWidth = clamp(window.innerWidth - moveEvent.clientX, 0, getMaxRightWidth());
          document.documentElement.style.setProperty("--right-width", `${state.rightWidth}px`);
        }
        saveState(state);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        render();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  });
}

async function copyOutput() {
  const text = state.generatedResult || lastAssistantMessage()?.content || "";
  if (!text) return showError("暂无可复制的输出内容。");
  navigator.clipboard.writeText(text).catch(() => showError("复制失败，请检查浏览器权限。"));
}

async function saveOutput() {
  const text = state.generatedResult || lastAssistantMessage()?.content || "";
  if (!text) return showError("暂无可导出的输出内容。");
  downloadBlob(text, `qwen-agent-result-${Date.now()}.html`, "text/html;charset=utf-8");
}

// ---- Export mode (V2.1) ----
function toggleExportMode() {
  commit({ exportModeActive: !state.exportModeActive, selectedExportIds: new Set() });
}

function cancelExport() {
  commit({ exportModeActive: false, selectedExportIds: new Set() });
}

function toggleExportId(id) {
  const next = new Set(state.selectedExportIds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  commit({ selectedExportIds: next });
}

function selectAllExport() {
  const visible = state.messages.slice(-Math.max(1, state.visibleMessageLimit || 60));
  const exportableIds = collectExportableIds(visible);
  const allSelected = exportableIds.length > 0 && exportableIds.every((id) => state.selectedExportIds.has(id));
  commit({ selectedExportIds: allSelected ? new Set() : new Set(exportableIds) });
}

function orderedSelectedMessages() {
  // Guard the export filter with the same predicate as the checkboxes, so a
  // stale id (e.g. a card that changed status after selection) can never leak
  // a non-content row into the report.
  return state.messages.filter((message) => state.selectedExportIds.has(message.id) && isExportableMessage(message));
}

// Grab the message's live rendered DOM (so charts/SVG and final HTML are captured
// exactly as shown) and wrap it as an export card.
function buildExportCardHtml(message) {
  const row = app.querySelector(`[data-message-row="${escapeSelector(message.id)}"]`);
  const contentNode = row?.querySelector(".message-content");
  const toolStepsNode = row?.querySelector(".tool-steps");
  const contentHtml = contentNode ? contentNode.innerHTML : escapeReportHtml(message.content || "");
  const toolStepsHtml = toolStepsNode ? toolStepsNode.outerHTML : "";
  const roleClass = message.role === "assistant" ? "assistant" : "user";
  return `<article class="export-card ${roleClass}"><header><strong>${escapeReportHtml(
    message.title || "",
  )}</strong><span>${escapeReportHtml(message.time || "")}</span></header>${toolStepsHtml}<div class="export-content">${contentHtml}</div></article>`;
}

function exportSelectedHtml() {
  const selected = orderedSelectedMessages();
  if (!selected.length) {
    showError("请先勾选要导出的消息。");
    return;
  }
  const cards = selected.map(buildExportCardHtml).join("\n");
  const doc = buildStandaloneDocument({ title: buildReportTitle(), cards });
  downloadBlob(doc, `qwen-agent-report-${Date.now()}.html`, "text/html;charset=utf-8");
}

function printSelected() {
  if (!state.selectedExportIds.size) {
    showError("请先勾选要打印的消息。");
    return;
  }
  // @media print in styles.css renders only the .export-selected cards.
  window.print();
}

function downloadBlob(text, name, type) {
  const blob = new Blob([text], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function lastAssistantMessage() {
  return [...state.messages].reverse().find((message) => message.role === "assistant" && message.status === "completed");
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function showError(message, assistantId = null) {
  const content = `## 错误提示\n\n${message}`;
  if (assistantId) {
    await updateAssistantMessage(assistantId, "AI 输出 · 错误", content, {
      status: "error",
      includeInContext: false,
    });
    return;
  }
  const errorMessage = toStoredMessage({
    role: "assistant",
    type: "error",
    title: "AI 输出 · 错误",
    content,
    status: "error",
    includeInContext: false,
  });
  state.generatedResult = content;
  state.messages = [...state.messages, errorMessage];
  await repository.putMessage(errorMessage);
  render();
}

async function syncBackendStatus() {
  try {
    const response = await fetch("/api/health");
    const payload = await response.json();
    state.apiStatus = response.ok && payload.success ? "正常" : "错误";
  } catch {
    state.apiStatus = "未连接";
  }
  try {
    const response = await fetch("/api/models");
    const payload = await response.json();
    if (payload.success && Array.isArray(payload.data?.models)) {
      state.models = payload.data.models;
      const ids = state.models.map((model) => model.id);
      if (state.currentModel && !ids.includes(state.currentModel)) {
        state.currentModel = payload.data.default || state.models[0]?.id || state.currentModel;
      }
    }
  } catch {
    // Keep the last known model list.
  }
  saveState(state);
  render();
}

async function syncCallLog() {
  try {
    const response = await fetch("/api/logs");
    const payload = await response.json();
    if (payload.success) {
      state.callLog = payload.data;
      render();
    }
  } catch {
    // Logs are diagnostic only.
  }
}

async function handleModelProbe() {
  const model = state.currentModel;
  commit({ modelProbeResult: { status: "loading", model } });
  try {
    const response = await fetch("/api/models/probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    const payload = await response.json();
    if (response.ok && payload.success) {
      commit({ modelProbeResult: { status: "ok", model, durationMs: payload.durationMs } });
    } else {
      commit({ modelProbeResult: { status: "error", model, message: payload.error?.message || "试用失败" } });
    }
  } catch {
    commit({ modelProbeResult: { status: "error", model, message: "网络请求失败，请检查后端服务。" } });
  }
}

function handleWindowResize() {
  const maxRightWidth = getMaxRightWidth();
  if (state.rightWidth <= maxRightWidth) return;
  state.rightWidth = maxRightWidth;
  saveState(state);
  render();
}

function shouldAttachFileToRequest(input, mode, file) {
  if (!file) return false;
  const text = input.trim().toLowerCase();
  if (!text || mode === "document" || mode === "csv") return true;
  const fileWords = [
    "文件", "文档", "上传", "这个", "内容", "总结", "摘要", "分析", "csv", "表格", "数据",
    "file", "document", "upload", "this", "it", "summarize", "summary", "analyze", "analyse", "table", "data",
  ];
  return fileWords.some((word) => text.includes(word));
}

function toPlainText(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function currentTime() {
  return new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getMaxRightWidth() {
  return Math.floor(window.innerWidth * 0.2);
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nextMessageTimestamp() {
  lastMessageTimestamp = Math.max(Date.now(), lastMessageTimestamp + 1);
  return new Date(lastMessageTimestamp).toISOString();
}

function escapeSelector(value) {
  return globalThis.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, "\\$&");
}
