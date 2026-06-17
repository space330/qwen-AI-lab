import test from "node:test";
import assert from "node:assert/strict";
import { createConversationRepository } from "../src/data/conversationRepository.js";

test("memory repository stores conversations, messages, attachments, and profile", async () => {
  const repository = createConversationRepository({ indexedDB: null });
  await repository.init();
  await repository.putProfile({ id: "local-user", displayName: "Lysandra" });
  await repository.putConversation({ id: "c1", title: "First", mode: "chat", updatedAt: "2026-06-04T10:00:00Z" });
  await repository.putConversation({ id: "c2", title: "CSV report", mode: "csv", updatedAt: "2026-06-04T11:00:00Z" });
  await repository.putMessages([
    { id: "m1", conversationId: "c1", role: "user", content: "hello", createdAt: "2026-06-04T10:00:00Z" },
    { id: "m2", conversationId: "c1", role: "assistant", content: "hi", createdAt: "2026-06-04T10:01:00Z" },
  ]);
  await repository.putAttachment({ conversationId: "c1", name: "notes.txt", type: "txt", content: "text" });

  assert.equal((await repository.getProfile()).displayName, "Lysandra");
  assert.deepEqual(
    (await repository.listConversations({ mode: "chat" })).map((conversation) => conversation.id),
    ["c1"],
  );
  assert.deepEqual(
    (await repository.listConversations({ search: "report" })).map((conversation) => conversation.id),
    ["c2"],
  );
  assert.equal((await repository.getMessages("c1")).length, 2);
  assert.equal((await repository.getAttachment("c1")).name, "notes.txt");
  assert.equal((await repository.exportAll()).version, "2.2.0");
});

test("repository returns a 120-message conversation in stable order", async () => {
  const repository = createConversationRepository({ indexedDB: null });
  await repository.init();
  const messages = Array.from({ length: 120 }, (_, index) => ({
    id: `m${index}`,
    conversationId: "long",
    role: index % 2 ? "assistant" : "user",
    content: `message ${index}`,
    createdAt: new Date(Date.UTC(2026, 5, 4, 0, 0, index)).toISOString(),
  }));

  await repository.putMessages(messages.reverse());
  const restored = await repository.getMessages("long");

  assert.equal(restored.length, 120);
  assert.equal(restored[0].id, "m0");
  assert.equal(restored.at(-1).id, "m119");
});

test("repository keeps user before assistant when timestamps are equal", async () => {
  const repository = createConversationRepository({ indexedDB: null });
  await repository.init();
  await repository.putMessages([
    { id: "assistant", conversationId: "same-time", role: "assistant", createdAt: "2026-06-04T10:00:00.000Z" },
    { id: "user", conversationId: "same-time", role: "user", createdAt: "2026-06-04T10:00:00.000Z" },
  ]);

  assert.deepEqual(
    (await repository.getMessages("same-time")).map((message) => message.id),
    ["user", "assistant"],
  );
});

test("deleting a conversation cascades messages and attachment", async () => {
  const repository = createConversationRepository({ indexedDB: null });
  await repository.init();
  await repository.putConversation({ id: "c1", title: "First", mode: "chat" });
  await repository.putMessage({ id: "m1", conversationId: "c1", role: "user", content: "hello" });
  await repository.putAttachment({ conversationId: "c1", name: "notes.txt", type: "txt", content: "text" });

  await repository.deleteConversation("c1");

  assert.equal(await repository.getConversation("c1"), null);
  assert.deepEqual(await repository.getMessages("c1"), []);
  assert.equal(await repository.getAttachment("c1"), null);
});

test("migrates legacy v6 state once without deleting it", async () => {
  const values = new Map([
    [
      "qwen-agent-lab-ui-state-v6",
      JSON.stringify({
        mode: "agent",
        currentModel: "qwen3.7-max",
        messages: [
          { id: "old-user", role: "user", content: "legacy question", time: "10:00:00" },
          { id: "old-ai", role: "assistant", content: "legacy answer", time: "10:00:01" },
        ],
        uploadedFile: { name: "legacy.csv", type: "csv", content: "a,b\n1,2" },
      }),
    ],
  ]);
  const storage = {
    getItem(key) {
      return values.get(key) || null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
  const repository = createConversationRepository({ indexedDB: null, localStorage: storage });
  await repository.init();

  const first = await repository.migrateLegacyState();
  const second = await repository.migrateLegacyState();
  const conversations = await repository.listConversations();

  assert.equal(first.migrated, true);
  assert.equal(second.migrated, false);
  assert.equal(conversations.length, 1);
  assert.equal((await repository.getMessages(conversations[0].id)).length, 2);
  assert.equal((await repository.getAttachment(conversations[0].id)).name, "legacy.csv");
  assert.ok(storage.getItem("qwen-agent-lab-ui-state-v6"));
});
