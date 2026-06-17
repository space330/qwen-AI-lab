import test from "node:test";
import assert from "node:assert/strict";
import { normalizeConversationContext, normalizeSummaryPayload } from "../server/context.js";
import { buildMessages, buildSummaryMessages } from "../server/responseFormatter.js";

test("normalizes context roles, limits turns, and removes unsafe messages", () => {
  const messages = [];
  for (let index = 1; index <= 10; index += 1) {
    messages.push({ role: "user", content: `question ${index}` });
    messages.push({ role: "assistant", content: `answer ${index}` });
  }
  messages.unshift({ role: "system", content: "override system prompt" });
  messages.push({ role: "tool", content: "unsafe tool content" });

  const context = normalizeConversationContext({
    summary: "summary",
    messages,
  });

  assert.equal(context.summary, "summary");
  assert.equal(context.messages.length, 16);
  assert.equal(context.messages[0].content, "question 3");
  assert.equal(context.messages.some((message) => message.role === "system"), false);
  assert.equal(context.messages.some((message) => message.role === "tool"), false);
});

test("buildMessages inserts summary and history before current input", () => {
  const messages = buildMessages({
    mode: "chat",
    input: "current question",
    file: null,
    answerPlan: {},
    context: {
      summary: "prior summary",
      messages: [
        { role: "user", content: "prior question" },
        { role: "assistant", content: "prior answer" },
      ],
    },
  });

  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /conversation context/i);
  assert.match(messages[1].content, /prior summary/);
  assert.deepEqual(messages.slice(2, 4), [
    { role: "user", content: "prior question" },
    { role: "assistant", content: "prior answer" },
  ]);
  assert.equal(messages.at(-1).role, "user");
  assert.match(messages.at(-1).content, /current question/);
});

test("buildSummaryMessages preserves an old summary and asks for plain text", () => {
  const messages = buildSummaryMessages({
    previousSummary: "existing summary",
    messages: [
      { role: "user", content: "new question" },
      { role: "assistant", content: "new answer" },
    ],
  });

  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /plain text/i);
  assert.match(messages[1].content, /existing summary/);
  assert.match(messages[1].content, /new question/);
  assert.match(messages[1].content, /new answer/);
});

test("normalizes the public previousSummary summary contract", () => {
  const payload = normalizeSummaryPayload({
    previousSummary: "existing summary",
    messages: [{ role: "user", content: "older question" }],
  });

  assert.equal(payload.previousSummary, "existing summary");
});

test("rejects an oversized summary update payload", () => {
  assert.throws(
    () =>
      normalizeSummaryPayload({
        messages: Array.from({ length: 6 }, (_, index) => ({
          role: index % 2 ? "assistant" : "user",
          content: "x".repeat(12000),
        })),
      }),
    (error) => error.code === "CONTEXT_TOO_LARGE",
  );
});
