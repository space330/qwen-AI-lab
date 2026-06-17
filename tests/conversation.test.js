import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConversationContext,
  buildLocalTitle,
  createConversation,
  createProfile,
  messagesForSummary,
  shouldSummarizeConversation,
} from "../src/utils/conversation.js";

test("creates conversations bound to a mode and model", () => {
  const conversation = createConversation({
    id: "conv-1",
    mode: "agent",
    model: "qwen3.7-max",
    now: "2026-06-04T10:00:00.000Z",
  });

  assert.equal(conversation.id, "conv-1");
  assert.equal(conversation.title, "新对话");
  assert.equal(conversation.mode, "agent");
  assert.equal(conversation.model, "qwen3.7-max");
  assert.equal(conversation.summary, "");
});

test("creates a local profile with stable defaults", () => {
  const profile = createProfile({
    model: "qwen3.7-max",
    mode: "chat",
    now: "2026-06-04T10:00:00.000Z",
  });

  assert.deepEqual(profile, {
    id: "local-user",
    displayName: "本地用户",
    avatarId: "amber",
    defaultModel: "qwen3.7-max",
    defaultMode: "chat",
    createdAt: "2026-06-04T10:00:00.000Z",
    updatedAt: "2026-06-04T10:00:00.000Z",
  });
});

test("builds deterministic titles from first input or attachment", () => {
  assert.equal(buildLocalTitle("  请分析新能源汽车市场的主要趋势和风险  "), "请分析新能源汽车市场的主要趋势和风险");
  assert.equal(buildLocalTitle("", "monthly-sales.csv"), "monthly-sales.csv");
  assert.equal(buildLocalTitle(""), "新对话");
  assert.equal(buildLocalTitle("a".repeat(60)).length, 28);
});

test("context includes only recent complete user-assistant turns", () => {
  const messages = [];
  for (let index = 1; index <= 10; index += 1) {
    messages.push({ id: `u${index}`, role: "user", content: `question ${index}`, includeInContext: true });
    messages.push({ id: `a${index}`, role: "assistant", content: `answer ${index}`, includeInContext: true });
  }
  messages.splice(4, 0, { id: "loading", role: "assistant", content: "Loading", includeInContext: false });

  const context = buildConversationContext({
    summary: "old summary",
    messages,
    maxTurns: 8,
  });

  assert.equal(context.summary, "old summary");
  assert.equal(context.messages.length, 16);
  assert.equal(context.messages[0].content, "question 3");
  assert.equal(context.messages.at(-1).content, "answer 10");
  assert.equal(context.messages.some((message) => message.content === "Loading"), false);
});

test("summary trigger uses complete turns or unsummarized character count", () => {
  const elevenTurns = Array.from({ length: 22 }, (_, index) => ({
    id: `m${index}`,
    role: index % 2 === 0 ? "user" : "assistant",
    plainText: "short",
    includeInContext: true,
  }));
  const twelveTurns = [
    ...elevenTurns,
    { id: "u12", role: "user", plainText: "question", includeInContext: true },
    { id: "a12", role: "assistant", plainText: "answer", includeInContext: true },
  ];

  assert.equal(shouldSummarizeConversation({ messages: elevenTurns }), false);
  assert.equal(shouldSummarizeConversation({ messages: twelveTurns }), true);
  assert.equal(
    shouldSummarizeConversation({
      messages: [{ id: "large", role: "user", plainText: "x".repeat(32001), includeInContext: true }],
    }),
    true,
  );
});

test("summary batches older turns and preserves the most recent eight", () => {
  const messages = Array.from({ length: 24 }, (_, index) => ({
    id: `m${index + 1}`,
    role: index % 2 === 0 ? "user" : "assistant",
    plainText: `message ${index + 1}`,
    includeInContext: true,
  }));

  const batch = messagesForSummary({ messages, keepTurns: 8 });

  assert.equal(batch.messages.length, 8);
  assert.equal(batch.throughMessageId, "m8");
});
