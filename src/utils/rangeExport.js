// ============================================================================
// Range-export selection logic (V2.1 "任意范围多选导出").
//
// Pure, DOM-less helpers that decide which messages may take part in a
// multi-select export. Centralising the rule keeps the checkbox renderer, the
// "全选" action, and the final export filter in agreement, and makes the policy
// unit-testable.
// ============================================================================

// A message is exportable only when it is genuine user / assistant *content* —
// not a transient system card. Loading + streaming placeholders, error cards,
// and "文件已上传" notices are excluded, so a report never captures a spinner,
// an error toast, or a file receipt. Legacy messages persisted without a
// `status` field are treated as completed content (back-compat).
export function isExportableMessage(message) {
  if (!message) return false;
  if (message.role !== "user" && message.role !== "assistant") return false;
  if (message.status && message.status !== "completed") return false;
  if (message.type === "error" || message.type === "file-notice") return false;
  return true;
}

// The ids eligible for "全选" within a given (already windowed) message list.
export function collectExportableIds(messages = []) {
  return messages.filter(isExportableMessage).map((message) => message.id);
}
