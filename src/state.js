const STORAGE_KEY = "qwen-agent-lab-ui-state-v6";

const initialMessages = [
  {
    id: createId(),
    role: "user",
    title: "用户输入",
    time: "10:24:15",
    content:
      "请分析一份文本或 CSV 文件，并用结构化方式输出摘要、关键发现、结论和下一步建议。",
  },
  {
    id: createId(),
    role: "assistant",
    title: "AI 输出",
    time: "10:24:39",
    content:
      "当前为前端界面预览版本。后续接入 Qwen 后端后，这里会展示真实模型回复，并保持统一、可复制、可编辑的结构化格式。",
  },
];

export const defaultState = {
  mode: "chat",
  projectName: "Qwen Agent Lab",
  currentModel: "Qwen",
  apiStatus: "未连接",
  leftWidth: 178,
  rightWidth: 260,
  inputText: "",
  uploadedFile: null,
  filePreviewVisible: false,
  generatedResult: "",
  messages: initialMessages,
  toolSteps: [
    { id: "read", label: "文件读取器", status: "waiting", time: "--:--" },
    { id: "analyze", label: "内容分析", status: "waiting", time: "--:--" },
    { id: "format", label: "结果格式化", status: "waiting", time: "--:--" },
  ],
};

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    return { ...structuredClone(defaultState), ...JSON.parse(raw) };
  } catch {
    return structuredClone(defaultState);
  }
}

export function saveState(state) {
  const compact = {
    mode: state.mode,
    projectName: state.projectName,
    currentModel: state.currentModel,
    apiStatus: state.apiStatus,
    leftWidth: state.leftWidth,
    rightWidth: state.rightWidth,
    uploadedFile: state.uploadedFile,
    filePreviewVisible: state.filePreviewVisible,
    generatedResult: state.generatedResult,
    messages: state.messages.slice(-30),
    toolSteps: state.toolSteps,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
}

export function resetState() {
  localStorage.removeItem(STORAGE_KEY);
  return structuredClone(defaultState);
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
