import test from "node:test";
import assert from "node:assert/strict";
import {
  getShortcutAction,
  getClipboardFiles,
  getClipboardText,
  shouldHandleGlobalPaste,
  mergeInputText,
} from "../src/utils/inputActions.js";

test("maps supported command shortcuts to app actions", () => {
  assert.equal(getShortcutAction({ key: "Enter", ctrlKey: true }), "send");
  assert.equal(getShortcutAction({ key: "k", metaKey: true }), "focus-input");
  assert.equal(getShortcutAction({ key: "u", ctrlKey: true }), "open-file");
  assert.equal(getShortcutAction({ key: "C", ctrlKey: true, shiftKey: true }), "copy-output");
  assert.equal(getShortcutAction({ key: "Escape" }), "escape");
});

test("ignores unsupported shortcuts and plain typing", () => {
  assert.equal(getShortcutAction({ key: "Enter" }), null);
  assert.equal(getShortcutAction({ key: "x", ctrlKey: true }), null);
  assert.equal(getShortcutAction({ key: "c", ctrlKey: true }), null);
});

test("extracts only supported clipboard files", () => {
  const files = getClipboardFiles({
    files: [
      { name: "notes.md" },
      { name: "sales.csv" },
      { name: "photo.png" },
      { name: "draft.txt" },
    ],
  });

  assert.deepEqual(
    files.map((file) => file.name),
    ["notes.md", "sales.csv", "draft.txt"],
  );
});

test("reads text/plain from clipboard items", () => {
  const text = getClipboardText({
    types: ["text/html", "text/plain"],
    getData(type) {
      return type === "text/plain" ? " pasted text " : "<b>ignored</b>";
    },
  });

  assert.equal(text, " pasted text ");
});

test("does not hijack normal textarea paste", () => {
  assert.equal(shouldHandleGlobalPaste({ tagName: "TEXTAREA" }), false);
  assert.equal(shouldHandleGlobalPaste({ isContentEditable: true }), false);
  assert.equal(shouldHandleGlobalPaste({ tagName: "DIV" }), true);
});

test("merges pasted text without exceeding the input limit", () => {
  assert.equal(mergeInputText("hello", "world", 20), "hello\nworld");
  assert.equal(mergeInputText("12345", "67890", 8), "12345\n67");
});
