import test from "node:test";
import assert from "node:assert/strict";
import { renderLanding } from "../src/components/landing.js";
import { renderApp } from "../src/components/render.js";

test("landing view exposes an in-app console entry", () => {
  const html = renderLanding({
    currentModel: "qwen3.7-max",
    apiStatus: "正常",
  });

  assert.match(html, /class="landing-page/);
  assert.match(html, /data-enter-console/);
  assert.match(html, /href="\/app"/);
  assert.match(html, /Qwen Agent Lab/);
});

test("console view can render the integrated welcome layer", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    documentElement: {
      style: {
        setProperty() {},
      },
    },
  };
  const html = renderApp({
    leftWidth: 150,
    exportModeActive: false,
    welcomeVisible: true,
    currentModel: "qwen3.7-max",
    apiStatus: "正常",
    mode: "chat",
    inputText: "",
    uploadedFile: null,
    filePreviewVisible: false,
    profile: null,
    profilePanelOpen: false,
    conversationDrawerOpen: false,
    conversationSearch: "",
    storageKind: "indexeddb",
    models: [],
    callLog: [],
    modelProbeResult: null,
    messages: [],
    conversations: [],
    selectedExportIds: new Set(),
    visibleMessageLimit: 60,
  });
  globalThis.document = previousDocument;

  assert.match(html, /class="app-shell[^"]*welcome-active/);
  assert.match(html, /class="app-welcome-layer/);
  assert.match(html, /data-enter-workspace/);
  assert.match(html, /data-show-welcome/);
});

test("landing renders the five redesigned scenes with reveal hooks", () => {
  const html = renderLanding({ currentModel: "qwen3-max", apiStatus: "正常" });

  // fluid hero layer
  assert.match(html, /class="landing-fluid"/);
  assert.match(html, /fluid-blob b1/);
  assert.match(html, /fluid-blob b2/);
  assert.match(html, /fluid-blob b3/);

  // scroll-reveal hooks (all three directions used)
  assert.match(html, /data-reveal="up"/);
  assert.match(html, /data-reveal="left"/);
  assert.match(html, /data-reveal="right"/);

  // new scenes
  assert.match(html, /class="landing-answer-card"/);
  assert.match(html, /class="landing-cta"/);
  assert.match(html, /class="landing-footer"/);

  // status strip reflects state
  assert.match(html, /qwen3-max/);
  assert.match(html, /正常/);

  // nav cta + hero primary + cta compact all enter the console
  const ctas = html.match(/data-enter-console/g) || [];
  assert.ok(ctas.length >= 3, `expected >=3 console CTAs, got ${ctas.length}`);
});
