import { loadState, saveState } from "./state.js";
import { renderApp } from "./components/render.js";
import { readUploadFile } from "./utils/fileParser.js";
import {
  getClipboardFiles,
  getClipboardText,
  getShortcutAction,
  mergeInputText,
  shouldHandleGlobalPaste,
} from "./utils/inputActions.js";

let state = loadState();
state.rightWidth = Math.min(state.rightWidth, getMaxRightWidth());
const app = document.querySelector("#app");

render();
window.addEventListener("resize", handleWindowResize);
window.addEventListener("paste", handlePaste);
window.addEventListener("keydown", handleKeyboardShortcut);

function render() {
  app.innerHTML = renderApp(state);
  bindEvents();
}

function commit(patch = {}) {
  state = { ...state, ...patch };
  saveState(state);
  render();
}

function bindEvents() {
  app.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => commit({ mode: button.dataset.mode }));
  });

  app.querySelector("[data-mode-select]")?.addEventListener("change", (event) => {
    commit({ mode: event.target.value });
  });

  app.querySelector("[data-main-input]")?.addEventListener("input", (event) => {
    state.inputText = event.target.value.slice(0, 4000);
    saveState(state);
    const count = app.querySelector(".char-count");
    if (count) count.textContent = `${state.inputText.length} / 4000`;
  });

  app.querySelector("[data-send]")?.addEventListener("click", handleSend);

  app.querySelector("[data-file-input]")?.addEventListener("change", handleFileUpload);

  app.querySelectorAll("[data-preview-file]").forEach((button) => {
    button.addEventListener("click", () => {
      commit({
        filePreviewVisible: true,
        rightWidth: state.rightWidth > 20 ? state.rightWidth : Math.min(260, getMaxRightWidth()),
      });
    });
  });

  app.querySelectorAll("[data-setting]").forEach((input) => {
    input.addEventListener("change", (event) => {
      commit({ [event.target.dataset.setting]: event.target.value });
    });
  });

  app.querySelectorAll("[data-message-id]").forEach((node) => {
    node.addEventListener("input", () => {
      const message = state.messages.find((item) => item.id === node.dataset.messageId);
      if (!message) return;
      message.content = node.innerText.trim();
      if (message.role === "assistant") state.generatedResult = message.content;
      saveState(state);
    });
  });

  app.querySelectorAll("[data-generated-editor]").forEach((editor) => {
    editor.addEventListener("input", (event) => {
      state.generatedResult = event.currentTarget.innerText.trim();
      saveState(state);
    });
  });

  app.querySelectorAll("[data-copy-output]").forEach((button) => {
    button.addEventListener("click", copyOutput);
  });

  app.querySelectorAll("[data-save-output]").forEach((button) => {
    button.addEventListener("click", saveOutput);
  });

  app.querySelector("[data-clear-history]")?.addEventListener("click", () => {
    commit({ messages: [], generatedResult: "" });
  });

  app.querySelector("[data-collapse-left]")?.addEventListener("click", () => {
    commit({ leftWidth: state.leftWidth > 88 ? 72 : 178 });
  });

  app.querySelector("[data-collapse-right]")?.addEventListener("click", () => {
    commit({ rightWidth: state.rightWidth > 96 ? 0 : Math.min(360, getMaxRightWidth()) });
  });

  bindResizeHandles();
}

async function handleFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    await acceptIncomingFile(file, "upload");
    event.target.value = "";
  } catch (error) {
    showError(error.message);
  }
}

async function handlePaste(event) {
  const files = getClipboardFiles(event.clipboardData);

  if (files.length) {
    event.preventDefault();
    try {
      await acceptIncomingFile(files[0], "paste");
    } catch (error) {
      showError(error.message);
    }
    return;
  }

  if (event.clipboardData?.files?.length) {
    event.preventDefault();
    showError("仅支持粘贴 txt / md / csv 文件。");
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
  const action = getShortcutAction(event);
  if (!action) return;

  if (action === "send") {
    event.preventDefault();
    handleSend();
    return;
  }

  if (action === "focus-input") {
    event.preventDefault();
    focusMainInput(true);
    return;
  }

  if (action === "open-file") {
    event.preventDefault();
    app.querySelector("[data-file-input]")?.click();
    return;
  }

  if (action === "copy-output") {
    event.preventDefault();
    copyOutput();
    return;
  }

  if (action === "escape") {
    if (document.activeElement?.matches?.("[data-main-input]")) {
      document.activeElement.blur();
      return;
    }
    if (state.rightWidth > 20) {
      commit({ rightWidth: 0 });
    }
  }
}

async function acceptIncomingFile(file, source) {
  const uploadedFile = await readUploadFile(file);
  const actionText = source === "paste" ? "粘贴" : "上传";
  const uploadMessage = {
    id: createId(),
    role: "assistant",
    title: `文件已${actionText}`,
    time: currentTime(),
    content: `已接收文件：${uploadedFile.name}\n默认不自动预览。需要查看内容时，请点击下方按钮。`,
    action: "preview-file",
  };

  commit({
    uploadedFile,
    filePreviewVisible: false,
    messages: [...state.messages, uploadMessage].slice(-40),
  });
}

async function handleSend() {
  const text = state.inputText.trim();

  if (!text && !state.uploadedFile) {
    showError("请输入问题，或先上传 txt / md / csv 文件。");
    return;
  }

  const userMessage = {
    id: createId(),
    role: "user",
    title: "用户输入",
    time: currentTime(),
    content: text || `分析文件：${state.uploadedFile.name}`,
  };

  const assistantId = createId();
  const assistantMessage = {
    id: assistantId,
    role: "assistant",
    title: "AI 输出 · 生成中",
    time: currentTime(),
    content: "### Loading\n正在连接后端服务...",
  };

  commit({
    inputText: "",
    generatedResult: assistantMessage.content,
    messages: [...state.messages, userMessage, assistantMessage].slice(-40),
  });

  try {
    await streamBackendResponse({
      assistantId,
      mode: state.mode,
      input: text,
      file: shouldAttachFileToRequest(text, state.mode, state.uploadedFile)
        ? state.uploadedFile
        : null,
      model: state.currentModel,
    });
  } catch (error) {
    showError(error.message || "请求失败，请稍后重试。", assistantId);
  }
}

async function streamBackendResponse({ assistantId, mode, input, file, model }) {
  const response = await fetch("/api/qwen/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mode, input, file, model }),
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
      handleStreamEvent(assistantId, JSON.parse(line));
    }
  }

  if (buffer.trim()) {
    handleStreamEvent(assistantId, JSON.parse(buffer));
  }
}

function handleStreamEvent(assistantId, event) {
  if (event.event === "status") {
    updateAssistantMessage(
      assistantId,
      "AI 输出 · 生成中",
      `### Loading\n${event.message || "正在处理..."}`,
    );
    return;
  }

  if (event.event === "result") {
    const data = event.response?.data;
    const content = formatStructuredResponse(data);
    updateAssistantMessage(assistantId, "AI 输出", content, {
      chartSpec: data?.chartSpec || null,
    });
    return;
  }

  if (event.event === "error") {
    throw new Error(event.error?.message || "千问接口调用失败。");
  }
}

function updateAssistantMessage(assistantId, title, content, extra = {}) {
  state.messages = state.messages.map((message) =>
    message.id === assistantId ? { ...message, ...extra, title, content, time: currentTime() } : message,
  );
  state.generatedResult = content;
  saveState(state);
  render();
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
  if (data.html || data.content?.trim().startsWith("<section")) {
    return data.html || data.content;
  }
  if (!Array.isArray(data.sections) || !data.sections.length) {
    return data.content || "千问返回为空。";
  }

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
          const next = clamp(moveEvent.clientX, 72, 360);
          document.documentElement.style.setProperty("--left-width", `${next}px`);
          state.leftWidth = next;
        } else {
          const next = clamp(window.innerWidth - moveEvent.clientX, 0, getMaxRightWidth());
          document.documentElement.style.setProperty("--right-width", `${next}px`);
          state.rightWidth = next;
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

function copyOutput() {
  const text = state.generatedResult || lastAssistantMessage()?.content || "";
  if (!text) {
    showError("暂无可复制的输出内容。");
    return;
  }
  navigator.clipboard.writeText(text).catch(() => showError("复制失败，请检查浏览器权限。"));
}

function saveOutput() {
  const text = state.generatedResult || lastAssistantMessage()?.content || "";
  if (!text) {
    showError("暂无可导出的输出内容。");
    return;
  }
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `qwen-agent-result-${Date.now()}.md`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function lastAssistantMessage() {
  return [...state.messages].reverse().find((message) => message.role === "assistant");
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function showError(message, assistantId = null) {
  const now = currentTime();
  const content = `## 错误提示\n\n${message}`;

  if (assistantId) {
    updateAssistantMessage(assistantId, "AI 输出 · 错误", content);
    return;
  }

  commit({
    generatedResult: content,
    messages: [
      ...state.messages,
      {
        id: createId(),
        role: "assistant",
        title: "AI 输出 · 错误",
        time: now,
        content,
      },
    ].slice(-40),
  });
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

function shouldAttachFileToRequest(input, mode, file) {
  if (!file) return false;
  const text = input.trim().toLowerCase();
  if (!text) return true;
  if (mode === "document" || mode === "csv") return true;

  const fileWords = [
    "文件",
    "文档",
    "上传",
    "这个",
    "该",
    "它",
    "内容",
    "总结",
    "摘要",
    "分析",
    "csv",
    "表格",
    "数据",
    "file",
    "document",
    "upload",
    "this",
    "it",
    "summarize",
    "summary",
    "analyze",
    "analyse",
    "csv",
    "table",
    "data",
  ];

  return fileWords.some((word) => text.includes(word));
}

function handleWindowResize() {
  const maxRightWidth = getMaxRightWidth();
  if (state.rightWidth <= maxRightWidth) return;
  state.rightWidth = maxRightWidth;
  saveState(state);
  render();
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
