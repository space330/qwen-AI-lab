import test from "node:test";
import assert from "node:assert/strict";
import { loadState, saveState } from "../src/state.js";

test("localStorage only keeps lightweight UI preferences", () => {
  const values = new Map();
  const storage = {
    getItem(key) {
      return values.get(key) || null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };

  saveState(
    {
      mode: "agent",
      projectName: "Qwen Agent Lab",
      currentModel: "qwen3.7-max",
      leftWidth: 160,
      rightWidth: 240,
      currentConversationId: "c1",
      messages: [{ content: "must not be saved here" }],
      uploadedFile: { content: "must not be saved here" },
      profile: { displayName: "must not be saved here" },
    },
    storage,
  );

  const saved = JSON.parse(values.get("qwen-agent-lab-ui-state-v13"));
  assert.equal(saved.currentConversationId, "c1");
  assert.equal("messages" in saved, false);
  assert.equal("uploadedFile" in saved, false);
  assert.equal("profile" in saved, false);
  assert.equal(loadState(storage).mode, "agent");
});
