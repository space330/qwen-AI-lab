import { AppError } from "./errors.js";

const MAX_TURNS = 8;
const MAX_SUMMARY_CHARS = 8000;
const MAX_MESSAGE_CHARS = 12000;
const MAX_CONTEXT_CHARS = 50000;

export function normalizeConversationContext(rawContext) {
  if (!rawContext || typeof rawContext !== "object") {
    return { summary: "", messages: [] };
  }

  const summary = String(rawContext.summary || "").trim().slice(0, MAX_SUMMARY_CHARS);
  const rawMessages = Array.isArray(rawContext.messages) ? rawContext.messages : [];
  const eligible = rawMessages
    .filter((message) => ["user", "assistant"].includes(message?.role))
    .map((message) => ({
      role: message.role,
      content: String(message.content || "").trim().slice(0, MAX_MESSAGE_CHARS),
    }))
    .filter((message) => message.content);

  const turns = [];
  for (let index = 0; index < eligible.length - 1; index += 1) {
    if (eligible[index].role !== "user" || eligible[index + 1].role !== "assistant") continue;
    turns.push([eligible[index], eligible[index + 1]]);
    index += 1;
  }

  const messages = turns.slice(-MAX_TURNS).flat();
  const totalCharacters = summary.length + messages.reduce((total, message) => total + message.content.length, 0);
  if (totalCharacters > MAX_CONTEXT_CHARS) {
    throw new AppError("CONTEXT_TOO_LARGE", "对话上下文过长，请新建会话或稍后重试。", 400, {
      maxCharacters: MAX_CONTEXT_CHARS,
    });
  }

  return { summary, messages };
}

export function normalizeSummaryPayload(body) {
  const previousSummary = String(body?.previousSummary || body?.summary || "").trim().slice(0, MAX_SUMMARY_CHARS);
  const messages = Array.isArray(body?.messages)
    ? body.messages
        .filter((message) => ["user", "assistant"].includes(message?.role))
        .map((message) => ({
          role: message.role,
          content: String(message.content || "").trim().slice(0, MAX_MESSAGE_CHARS),
        }))
        .filter((message) => message.content)
    : [];

  if (!messages.length) {
    throw new AppError("SUMMARY_MESSAGES_REQUIRED", "没有可用于更新摘要的历史消息。", 400);
  }

  const totalCharacters =
    previousSummary.length + messages.reduce((total, message) => total + message.content.length, 0);
  if (totalCharacters > MAX_CONTEXT_CHARS) {
    throw new AppError("CONTEXT_TOO_LARGE", "用于摘要的会话上下文过长。", 400, {
      maxCharacters: MAX_CONTEXT_CHARS,
    });
  }

  return { previousSummary, messages };
}
