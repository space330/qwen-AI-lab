import { isAllowedFile } from "./fileParser.js";

const INPUT_LIMIT = 4000;

export function getShortcutAction(event) {
  const key = String(event?.key || "").toLowerCase();
  const hasCommandModifier = Boolean(event?.ctrlKey || event?.metaKey);

  if (key === "escape") return "escape";
  if (!hasCommandModifier) return null;
  if (key === "enter") return "send";
  if (key === "k") return "focus-input";
  if (key === "u") return "open-file";
  if (key === "c" && event?.shiftKey) return "copy-output";
  return null;
}

export function getClipboardFiles(clipboardData) {
  return Array.from(clipboardData?.files || []).filter((file) => isAllowedFile(file.name || ""));
}

export function getClipboardText(clipboardData) {
  if (!clipboardData?.types || !Array.from(clipboardData.types).includes("text/plain")) return "";
  return clipboardData.getData("text/plain") || "";
}

export function shouldHandleGlobalPaste(target) {
  if (!target) return true;
  if (target.isContentEditable) return false;
  return !["INPUT", "TEXTAREA", "SELECT"].includes(String(target.tagName || "").toUpperCase());
}

export function mergeInputText(currentText, pastedText, limit = INPUT_LIMIT) {
  const current = String(currentText || "");
  const pasted = String(pastedText || "");
  const separator = current.trim() && pasted.trim() ? "\n" : "";
  return `${current}${separator}${pasted}`.slice(0, limit);
}
