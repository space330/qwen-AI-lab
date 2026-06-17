import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stylesPath = path.join(__dirname, "..", "src", "styles.css");
const styles = fs.readFileSync(stylesPath, "utf8");

function selectorBlocks(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...styles.matchAll(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, "g"))];
  assert.ok(matches.length, `Missing CSS selector ${selector}`);
  return matches.map((match) => match[1]);
}

function assertAnyBlockMatches(selector, pattern) {
  const blocks = selectorBlocks(selector);
  assert.ok(
    blocks.some((block) => pattern.test(block)),
    `Expected ${selector} to include ${pattern}`,
  );
}

test("liquid glass surfaces use shared visual tokens", () => {
  [
    "--glass-bg-shell",
    "--glass-bg-rail",
    "--glass-bg-panel",
    "--glass-bg-card",
    "--glass-bg-control",
    "--glass-bg-float",
    "--glass-bg-overlay",
    "--glass-border",
    "--glass-border-strong",
    "--glass-shadow-panel",
    "--glass-shadow-float",
    "--glass-blur-page",
    "--glass-blur-panel",
    "--glass-blur-overlay",
  ].forEach((token) => assert.match(styles, new RegExp(`${token}:`)));
});

test("primary glass layers reference tokens instead of local blur recipes", () => {
  assertAnyBlockMatches(".app-shell", /var\(--glass-bg-shell\)/);
  assertAnyBlockMatches(".topbar", /var\(--glass-bg-rail\)/);
  assertAnyBlockMatches(".sidebar", /var\(--glass-bg-rail\)/);
  assertAnyBlockMatches(".panel", /var\(--glass-bg-panel\)/);
  assertAnyBlockMatches(".message-card", /var\(--glass-bg-card\)/);
  assertAnyBlockMatches(".input-field", /var\(--glass-bg-control\)/);
  assertAnyBlockMatches(".app-welcome-layer", /var\(--glass-bg-overlay\)/);
  assertAnyBlockMatches(".conversation-drawer,\n.profile-panel", /var\(--glass-bg-float\)/);
  assertAnyBlockMatches(".export-dock", /var\(--glass-bg-float\)/);
});
