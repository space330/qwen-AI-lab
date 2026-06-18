import test from "node:test";
import assert from "node:assert/strict";
import { QWEN_MODELS } from "../src/components/landingData.js";
import { selectModelView } from "../src/components/landingInteractive.js";

test("selectModelView returns the requested model and source list", () => {
  const result = selectModelView(QWEN_MODELS, "qwen3.7-max");
  assert.equal(result.selected.id, "qwen3.7-max");
  assert.equal(result.index, QWEN_MODELS.findIndex((model) => model.id === "qwen3.7-max"));
  assert.equal(result.isFallback, false);
  assert.equal(result.models.length, QWEN_MODELS.length);
});

test("selectModelView falls back to the default model for unknown ids", () => {
  const result = selectModelView(QWEN_MODELS, "missing-model");
  assert.equal(result.selected.id, "qwen3.7-max");
  assert.equal(result.isFallback, true);
});

test("selectModelView tolerates an empty model list", () => {
  const result = selectModelView([], "qwen3.7-max");
  assert.equal(result.selected, null);
  assert.equal(result.index, -1);
  assert.equal(result.isFallback, true);
  assert.deepEqual(result.models, []);
});
