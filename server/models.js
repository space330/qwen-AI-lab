export const MODEL_WHITELIST = [
  { id: "qwen-turbo",            label: "Qwen Turbo",            speed: "最快", note: "适合简单问答，响应最快" },
  { id: "qwen-plus",             label: "Qwen Plus",             speed: "快",   note: "均衡性能" },
  { id: "qwen-max",              label: "Qwen Max",              speed: "中",   note: "更强推理，适合复杂任务" },
  { id: "qwen-long",             label: "Qwen Long",             speed: "中",   note: "超长上下文，适合大文档" },
  { id: "qwen3.6-flash",         label: "Qwen3.6 Flash",         speed: "快",   note: "新一代快速模型" },
  { id: "qwen3.6-max-preview",   label: "Qwen3.6 Max Preview",   speed: "慢",   note: "最强能力，队列较慢" },
  { id: "qwen3.7-max",           label: "Qwen3.7 Max",           speed: "慢",   note: "默认，最新旗舰模型" },
];

export function isModelAllowed(modelId) {
  return MODEL_WHITELIST.some((m) => m.id === String(modelId || "").trim());
}

export function resolveModel(requestedModel, defaultModel) {
  const id = String(requestedModel || "").trim();
  if (!id || id === "Qwen") return defaultModel;
  if (isModelAllowed(id)) return id;
  return null; // caller must handle rejection
}
