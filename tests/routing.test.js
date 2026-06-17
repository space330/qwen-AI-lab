import test from "node:test";
import assert from "node:assert/strict";
import { consolePath, viewForPath } from "../src/utils/routing.js";

test("root path opens the home view", () => {
  assert.equal(viewForPath("/"), "home");
  assert.equal(viewForPath(""), "home");
});

test("app paths open the console view", () => {
  assert.equal(viewForPath("/app"), "console");
  assert.equal(viewForPath("/app/"), "console");
  assert.equal(viewForPath("/app/conversations/c1"), "console");
});

test("unknown browser paths fall back to the console", () => {
  assert.equal(viewForPath("/anything-else"), "console");
});

test("consolePath returns the canonical in-app console URL", () => {
  assert.equal(consolePath(), "/app");
});
