const DEFAULT_TITLE = "新对话";
const DEFAULT_PROFILE_ID = "local-user";
const DEFAULT_AVATAR_ID = "amber";

export function createConversation({
  id = createId("conv"),
  title = DEFAULT_TITLE,
  mode = "chat",
  model = "qwen3.7-max",
  now = new Date().toISOString(),
} = {}) {
  return {
    id,
    title,
    mode,
    model,
    summary: "",
    summarizedThroughMessageId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createProfile({
  model = "qwen3.7-max",
  mode = "chat",
  now = new Date().toISOString(),
} = {}) {
  return {
    id: DEFAULT_PROFILE_ID,
    displayName: "本地用户",
    avatarId: DEFAULT_AVATAR_ID,
    defaultModel: model,
    defaultMode: mode,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildLocalTitle(input = "", attachmentName = "") {
  const source = String(input || "").trim() || String(attachmentName || "").trim() || DEFAULT_TITLE;
  return source.replace(/\s+/g, " ").slice(0, 28);
}

export function buildConversationContext({ summary = "", messages = [], maxTurns = 8 } = {}) {
  const pairs = toCompleteTurns(messages);
  return {
    summary: String(summary || "").trim(),
    messages: pairs
      .slice(-Math.max(1, maxTurns))
      .flat()
      .map(({ role, content, plainText }) => ({
        role,
        content: String(plainText || content || "").trim(),
      }))
      .filter((message) => message.content),
  };
}

export function shouldSummarizeConversation({
  messages = [],
  summarizedThroughMessageId = null,
  turnThreshold = 12,
  characterThreshold = 32000,
} = {}) {
  const unsummarized = afterMessage(messages, summarizedThroughMessageId).filter(
    (message) => message?.includeInContext !== false && ["user", "assistant"].includes(message?.role),
  );
  const completeTurns = toCompleteTurns(unsummarized).length;
  const characters = unsummarized.reduce(
    (total, message) => total + String(message.plainText || message.content || "").length,
    0,
  );
  return completeTurns >= turnThreshold || characters > characterThreshold;
}

export function messagesForSummary({ messages = [], summarizedThroughMessageId = null, keepTurns = 8 } = {}) {
  const unsummarized = afterMessage(messages, summarizedThroughMessageId);
  const pairs = toCompleteTurns(unsummarized);
  const summarizePairs = pairs.slice(0, Math.max(0, pairs.length - keepTurns));
  return {
    messages: summarizePairs.flat(),
    throughMessageId: summarizePairs.at(-1)?.at(-1)?.id || null,
  };
}

function toCompleteTurns(messages) {
  const eligible = messages.filter(
    (message) =>
      message?.includeInContext !== false &&
      ["user", "assistant"].includes(message?.role) &&
      String(message.plainText || message.content || "").trim(),
  );
  const pairs = [];
  for (let index = 0; index < eligible.length - 1; index += 1) {
    if (eligible[index].role !== "user" || eligible[index + 1].role !== "assistant") continue;
    pairs.push([eligible[index], eligible[index + 1]]);
    index += 1;
  }
  return pairs;
}

function afterMessage(messages, messageId) {
  if (!messageId) return messages;
  const index = messages.findIndex((message) => message.id === messageId);
  return index === -1 ? messages : messages.slice(index + 1);
}

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
