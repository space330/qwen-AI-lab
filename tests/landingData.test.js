import test from "node:test";
import assert from "node:assert/strict";
import { MODEL_WHITELIST } from "../server/models.js";
import {
  QWEN_MODELS,
  RUN_CONFIG,
  ENGINEERING_STATS,
  CROSS_VENDOR,
  SOURCES,
} from "../src/components/landingData.js";

test("QWEN_MODELS mirrors the real server MODEL_WHITELIST (no drift)", () => {
  assert.equal(QWEN_MODELS.length, MODEL_WHITELIST.length);
  MODEL_WHITELIST.forEach((real, i) => {
    const shown = QWEN_MODELS[i];
    assert.equal(shown.id, real.id, `id mismatch at ${i}`);
    assert.equal(shown.label, real.label, `label mismatch for ${real.id}`);
    assert.equal(shown.speed, real.speed, `speed mismatch for ${real.id}`);
    assert.equal(shown.note, real.note, `note mismatch for ${real.id}`);
  });
});

test("exactly one default model, and it is the real flagship qwen3.7-max", () => {
  const defaults = QWEN_MODELS.filter((m) => m.isDefault);
  assert.equal(defaults.length, 1);
  assert.equal(defaults[0].id, "qwen3.7-max");
});

test("ENGINEERING_STATS reflect real repo facts", () => {
  const byKey = Object.fromEntries(ENGINEERING_STATS.map((s) => [s.key, s.value]));
  assert.equal(byKey.tools, 10);
  assert.equal(byKey.toolCategories, 5);
  assert.equal(byKey.chartTypes, 5);
  assert.equal(byKey.models, MODEL_WHITELIST.length);
  assert.equal(byKey.extraDeps, 0);
  // Every counter value is a finite number (count-up depends on it).
  ENGINEERING_STATS.forEach((s) => assert.ok(Number.isFinite(s.value), `${s.key} not numeric`));
});

test("RUN_CONFIG advertises the real default model", () => {
  const def = RUN_CONFIG.find((r) => r.label === "默认模型");
  assert.ok(def && def.value === "qwen3.7-max");
});

test("every cross-vendor number carries a source that exists in SOURCES + an asOf date", () => {
  const sourceIds = new Set(SOURCES.map((s) => s.id));
  assert.ok(sourceIds.size >= 1);
  SOURCES.forEach((s) => {
    assert.ok(s.url && /^https:\/\//.test(s.url), `source ${s.id} needs an https url`);
    assert.ok(s.asOf, `source ${s.id} needs asOf`);
  });

  // flagship headline metrics
  assert.ok(CROSS_VENDOR.flagship.metrics.length > 0);
  CROSS_VENDOR.flagship.metrics.forEach((m) => {
    assert.ok(m.value, `metric ${m.name} missing value`);
    assert.ok(sourceIds.has(m.source), `metric ${m.name} has unknown source ${m.source}`);
    assert.ok(m.asOf, `metric ${m.name} missing asOf`);
  });

  // external leaderboard block (single, dated, sourced)
  const idx = CROSS_VENDOR.intelligenceIndex;
  assert.ok(sourceIds.has(idx.source), "intelligenceIndex source unknown");
  assert.ok(idx.asOf, "intelligenceIndex missing asOf");
  assert.ok(idx.rows.length > 0);
  idx.rows.forEach((r) => assert.ok(r.model && Number.isFinite(r.score), `bad leaderboard row ${r.model}`));

  // a visible disclaimer must exist
  assert.ok(CROSS_VENDOR.disclaimer && CROSS_VENDOR.disclaimer.length > 10);
});
