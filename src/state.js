const UI_STORAGE_KEY = "qwen-agent-lab-ui-state-v13";
const LEGACY_STORAGE_KEY = "qwen-agent-lab-ui-state-v12";

// Sidebar rail bounds — kept in sync with main.js drag clamp and CSS --left-width.
const LEFT_WIDTH_MIN = 72;
const LEFT_WIDTH_MAX = 200;

export const defaultState = {
  mode: "chat",
  webSearch: false,
  projectName: "Qwen Agent Lab",
  currentModel: "qwen3.7-max",
  apiStatus: "未连接",
  leftWidth: 150,
  rightWidth: 260,
  inputText: "",
  uploadedFile: null,
  filePreviewVisible: false,
  generatedResult: "",
  messages: [],
  conversations: [],
  currentConversationId: null,
  conversationDrawerOpen: false,
  conversationSearch: "",
  profilePanelOpen: false,
  profile: null,
  storageKind: "uninitialized",
  visibleMessageLimit: 60,
  models: [],
  callLog: [],
  modelProbeResult: null,
  // Runtime-only: the welcome layer is shown when opening /app and can be
  // dismissed without affecting conversations or persisted UI preferences.
  welcomeVisible: true,
  // Export mode (V2.1): runtime-only, never persisted. selectedExportIds tracks
  // which message cards the user has ticked for HTML/PDF export.
  exportModeActive: false,
  selectedExportIds: new Set(),
};

export function loadState(storage = globalThis.localStorage) {
  const current = readJson(storage, UI_STORAGE_KEY) || {};
  const legacy = readJson(storage, LEGACY_STORAGE_KEY) || {};
  const saved = { ...legacy, ...current };
  return {
    ...structuredClone(defaultState),
    mode: saved.mode || defaultState.mode,
    webSearch: typeof saved.webSearch === "boolean" ? saved.webSearch : defaultState.webSearch,
    projectName: saved.projectName || defaultState.projectName,
    currentModel: saved.currentModel || defaultState.currentModel,
    // Width prefs are read only from the current key so the slimmer rail
    // default takes effect once (legacy oversized widths are not inherited).
    leftWidth: clampLeftWidth(Number(current.leftWidth) || defaultState.leftWidth),
    rightWidth: Number(current.rightWidth) || defaultState.rightWidth,
    currentConversationId: saved.currentConversationId || null,
  };
}

export function clampLeftWidth(value) {
  return Math.min(Math.max(Number(value) || LEFT_WIDTH_MIN, LEFT_WIDTH_MIN), LEFT_WIDTH_MAX);
}

export function saveState(state, storage = globalThis.localStorage) {
  const compact = {
    mode: state.mode,
    webSearch: state.webSearch,
    projectName: state.projectName,
    currentModel: state.currentModel,
    leftWidth: state.leftWidth,
    rightWidth: state.rightWidth,
    currentConversationId: state.currentConversationId,
  };
  storage?.setItem?.(UI_STORAGE_KEY, JSON.stringify(compact));
}

export function resetState(storage = globalThis.localStorage) {
  storage?.removeItem?.(UI_STORAGE_KEY);
  return structuredClone(defaultState);
}

function readJson(storage, key) {
  try {
    const raw = storage?.getItem?.(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
