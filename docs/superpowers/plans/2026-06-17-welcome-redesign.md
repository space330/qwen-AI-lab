# 欢迎页重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the live SPA welcome page with a warm-ivory, Apple-style design featuring a CSS fluid (multi-blob) hero animation and scroll-choreographed section reveals, scoped entirely to `.landing-page`.

**Architecture:** `renderLanding()` emits the new 5-scene markup (Hero + 4 reveal scenes) with `data-reveal` hooks and a `.landing-fluid` layer. A new dependency-free `landingMotion.js` wires an `IntersectionObserver` that toggles `.in-view` (CSS handles the slide+rotate transitions) and pauses the hero fluid when off-screen. `main.js` initializes/cleans up the observer around each `render()`. All visuals live in a rewritten `.landing-*` block in `styles.css`; the console theme is untouched.

**Tech Stack:** Vanilla ES modules (no build), `IntersectionObserver`, pure CSS keyframes/transitions, `node:test` (DOM-free).

**Spec:** `docs/superpowers/specs/2026-06-17-welcome-redesign-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/components/landingMotion.js` (create) | Scroll-reveal + hero-fluid-pause orchestration; DOM-free pure helpers. |
| `src/components/landing.js` (modify) | `renderLanding(state)` → new 5-scene markup with `data-reveal` + `.landing-fluid`. |
| `src/main.js` (modify) | Import + init `landingMotion`; cleanup before each re-render. |
| `src/styles.css` (modify) | Replace landing CSS block (lines 142–530) with redesigned tokens/fluid/reveals/responsive. |
| `tests/landingMotion.test.js` (create) | Unit tests for pure helpers + init branches. |
| `tests/landing.test.js` (modify) | Assert the redesigned markup/reveal hooks. |
| `docs/design-references/landing.html` (move) | Retired standalone design, kept for reference. |

---

## Task 1: Retire the standalone landing.html to references

**Files:**
- Move: `landing.html` → `docs/design-references/landing.html`

- [ ] **Step 1: Move the file**

```bash
mkdir -p "docs/design-references"
git mv landing.html "docs/design-references/landing.html" 2>/dev/null || mv landing.html "docs/design-references/landing.html"
```

- [ ] **Step 2: Verify it is gone from repo root and present under docs**

Run: `ls landing.html 2>/dev/null; ls "docs/design-references/landing.html"`
Expected: first lists nothing; second prints the path.

- [ ] **Step 3: Commit**

```bash
git add -A "docs/design-references/landing.html"
git rm --cached landing.html 2>/dev/null || true
git commit -m "chore: retire standalone landing.html to docs/design-references"
```

---

## Task 2: Create landingMotion.js with pure helpers (TDD)

**Files:**
- Create: `tests/landingMotion.test.js`
- Create: `src/components/landingMotion.js`

- [ ] **Step 1: Write the failing test**

Create `tests/landingMotion.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  collectReveals,
  revealOnIntersect,
  prefersReducedMotion,
  initLandingMotion,
} from "../src/components/landingMotion.js";

test("revealOnIntersect reveals and unobserves only intersecting targets", () => {
  const revealed = [];
  const unobserved = [];
  const entries = [
    { isIntersecting: true, target: "a" },
    { isIntersecting: false, target: "b" },
    { isIntersecting: true, target: "c" },
  ];
  revealOnIntersect(entries, {
    reveal: (t) => revealed.push(t),
    unobserve: (t) => unobserved.push(t),
  });
  assert.deepEqual(revealed, ["a", "c"]);
  assert.deepEqual(unobserved, ["a", "c"]);
});

test("collectReveals queries the [data-reveal] selector and returns an array", () => {
  const nodes = [1, 2, 3];
  const root = {
    querySelectorAll: (sel) => {
      assert.equal(sel, "[data-reveal]");
      return nodes;
    },
  };
  assert.deepEqual(collectReveals(root), [1, 2, 3]);
});

test("prefersReducedMotion reads matchMedia", () => {
  const reduceWin = { matchMedia: (q) => ({ matches: q.includes("reduce") }) };
  const normalWin = { matchMedia: () => ({ matches: false }) };
  assert.equal(prefersReducedMotion(reduceWin), true);
  assert.equal(prefersReducedMotion(normalWin), false);
});

test("initLandingMotion reveals all immediately under reduced motion", () => {
  const added = [];
  const node = () => ({ classList: { add: (c) => added.push(c) } });
  const nodes = [node(), node()];
  const root = { querySelectorAll: () => nodes, querySelector: () => null };
  const win = { matchMedia: () => ({ matches: true }) };
  const cleanup = initLandingMotion(root, { win });
  assert.equal(added.filter((c) => c === "in-view").length, 2);
  assert.equal(typeof cleanup, "function");
  cleanup();
});

test("initLandingMotion observes each reveal node when IntersectionObserver exists", () => {
  const observed = [];
  class FakeIO {
    constructor(cb) { this.cb = cb; }
    observe(t) { observed.push(t); }
    unobserve() {}
    disconnect() {}
  }
  const node = () => ({ classList: { add() {} } });
  const nodes = [node(), node(), node()];
  const root = {
    querySelectorAll: (sel) => (sel === "[data-reveal]" ? nodes : []),
    querySelector: () => null,
  };
  const win = { matchMedia: () => ({ matches: false }), IntersectionObserver: FakeIO };
  const cleanup = initLandingMotion(root, { win });
  assert.equal(observed.length, 3);
  cleanup();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/landingMotion.test.js`
Expected: FAIL — cannot find module `../src/components/landingMotion.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/landingMotion.js`:

```js
// Scroll-choreographed reveals for the landing page + hero-fluid pause.
// Pure helpers are DOM-free so they can be unit-tested without jsdom.

export function collectReveals(root) {
  return Array.from(root.querySelectorAll("[data-reveal]"));
}

export function revealOnIntersect(entries, { reveal, unobserve } = {}) {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      reveal?.(entry.target);
      unobserve?.(entry.target);
    }
  }
}

export function prefersReducedMotion(win) {
  return Boolean(win?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

// Wire reveals + fluid pause. Returns a cleanup() that disconnects observers.
export function initLandingMotion(root, { win } = {}) {
  if (!root) return () => {};
  const w = win || (typeof window !== "undefined" ? window : undefined);
  const nodes = collectReveals(root);

  const revealAll = () => nodes.forEach((n) => n.classList.add("in-view"));

  if (!w || prefersReducedMotion(w) || typeof w.IntersectionObserver !== "function") {
    revealAll();
    return () => {};
  }

  const observer = new w.IntersectionObserver(
    (entries) =>
      revealOnIntersect(entries, {
        reveal: (t) => t.classList.add("in-view"),
        unobserve: (t) => observer.unobserve(t),
      }),
    { threshold: 0.18, rootMargin: "0px 0px -10% 0px" },
  );
  nodes.forEach((n) => observer.observe(n));

  // Pause hero fluid blobs when the hero scrolls out of view (battery).
  const hero = root.querySelector?.(".landing-hero");
  const fluid = root.querySelector?.(".landing-fluid");
  let heroObserver = null;
  if (hero && fluid) {
    heroObserver = new w.IntersectionObserver(
      (entries) =>
        entries.forEach((e) => fluid.classList.toggle("is-paused", !e.isIntersecting)),
      { threshold: 0 },
    );
    heroObserver.observe(hero);
  }

  return () => {
    observer.disconnect();
    heroObserver?.disconnect();
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/landingMotion.test.js`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/landingMotion.test.js src/components/landingMotion.js
git commit -m "feat: add landingMotion scroll-reveal module with tests"
```

---

## Task 3: Rewrite renderLanding markup (TDD)

**Files:**
- Modify: `tests/landing.test.js`
- Modify: `src/components/landing.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/landing.test.js` (after the existing tests, before EOF):

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/landing.test.js`
Expected: FAIL — `class="landing-fluid"` not found (old markup).

- [ ] **Step 3: Write the new implementation**

Replace the entire contents of `src/components/landing.js` with:

```js
export function renderLanding(state = {}) {
  const model = escapeHtml(state.currentModel || "Qwen");
  const status = escapeHtml(state.apiStatus || "未连接");
  return `
    <main class="landing-page" aria-label="Qwen Agent Lab 官网首页">
      <nav class="landing-nav">
        <a class="landing-wordmark" href="/" aria-label="Qwen Agent Lab 首页">Lysandra</a>
        <div class="landing-nav-links">
          <a href="#modes">能力</a>
          <a href="#output">输出</a>
          <a href="#workflow">流程</a>
        </div>
        <a href="/app" class="landing-nav-cta" data-enter-console>进入控制台</a>
      </nav>

      <section class="landing-hero">
        <div class="landing-fluid" aria-hidden="true">
          <span class="fluid-blob b1"></span>
          <span class="fluid-blob b2"></span>
          <span class="fluid-blob b3"></span>
        </div>
        <div class="landing-wash" aria-hidden="true"></div>
        <div class="landing-hero-inner">
          <span class="landing-kicker">AI agent lightwork S1.0</span>
          <h1>Qwen <span class="accent">Agent</span> Lab</h1>
          <p>
            面向个人轻办公、文字整理和 CSV 分析的本地控制台。投喂文本、Markdown 或 CSV，
            得到干净、结构化、可复制可编辑的图表级答案。
          </p>
          <div class="landing-hero-actions">
            <a href="/app" class="landing-primary-action" data-enter-console>免费开始使用</a>
            <a href="#workflow" class="landing-secondary-action">查看工作流</a>
          </div>
          <dl class="landing-status-strip">
            <div><dt>当前模型</dt><dd>${model}</dd></div>
            <div><dt>API 状态</dt><dd><i></i>${status}</dd></div>
            <div><dt>运行方式</dt><dd>本地后端保密 API Key</dd></div>
          </dl>
        </div>
      </section>

      <section class="landing-band" id="modes">
        <div class="landing-section-head" data-reveal="up">
          <span>核心能力</span>
          <h2>一个入口覆盖对话、Agent、文档与 CSV</h2>
        </div>
        <div class="landing-card-grid">
          ${renderCard("对话模式", "支持连续追问、结构化 HTML 输出和可复制结果。")}
          ${renderCard("Agent 模式", "区分 chat 与 agent，展示真实 toolSteps 工具调用链。")}
          ${renderCard("文档总结", "上传 txt / md 后生成主题、要点、结论和建议。")}
          ${renderCard("CSV 分析", "确定性解析 CSV，并让图表区包含数据表和 chartSpec.data。")}
        </div>
      </section>

      <section class="landing-band" id="output">
        <div class="landing-output">
          <div data-reveal="left">
            <span>输出规范</span>
            <h2>HTML 模块化回答，前端可以稳定渲染</h2>
            <p>回答以 section、表格、图表占位和结论建议为核心结构，适合复制、保存和继续编辑。</p>
          </div>
          <div class="landing-answer-card" data-reveal="right">
            <h4>摘要</h4>
            <p>已完成「月度销售趋势.csv」基础结构解析 —— 4 个字段、12 行数据、3 个数值列。</p>
            <h4>关键发现</h4>
            <ol>
              <li>三个产品全年均呈稳定上升趋势，产品 A 增速最快。</li>
              <li>无空值字段，可直接进入正式分析。</li>
            </ol>
            <h4>下一步</h4>
            <p>可继续做趋势、均值、极值与异常值分析，或导出图表。</p>
          </div>
        </div>
      </section>

      <section class="landing-band landing-workflow" id="workflow">
        <div class="landing-section-head" data-reveal="up">
          <span>工作流</span>
          <h2>从官网进入控制台，状态不断线</h2>
        </div>
        <ol>
          <li data-reveal="up"><strong>了解能力</strong><p>在首页快速确认模型、API 状态和主要功能边界。</p></li>
          <li data-reveal="up"><strong>进入控制台</strong><p>点击入口触发轻量转场，并在同一个应用内打开 /app。</p></li>
          <li data-reveal="up"><strong>继续工作</strong><p>会话、附件和个人偏好继续由 IndexedDB 与后端接口支撑。</p></li>
        </ol>
      </section>

      <section class="landing-band">
        <div class="landing-cta" data-reveal="up">
          <h2>把分析交给 Lysandra</h2>
          <p>一个干净、温暖的桌面工作台，专为个人自用与轻办公而生。</p>
          <a href="/app" class="landing-primary-action compact" data-enter-console>进入控制台</a>
        </div>
      </section>

      <footer class="landing-footer">
        <span class="landing-wordmark">Lysandra</span>
        <span>Qwen Agent Lab · 基于 Qwen 大模型的数据分析 agent</span>
        <div class="foot-links">
          <a href="#modes">能力</a>
          <a href="#output">输出</a>
          <a href="#workflow">流程</a>
        </div>
      </footer>
    </main>
  `;
}

function renderCard(title, text) {
  return `
    <article class="landing-card" data-reveal="up">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/landing.test.js`
Expected: PASS — existing tests + the new redesigned-scenes test pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing.js tests/landing.test.js
git commit -m "feat: redesign renderLanding into five reveal scenes with fluid hero"
```

---

## Task 4: Wire landingMotion into main.js

**Files:**
- Modify: `src/main.js` (import ~line 4, module state ~line 33, `render()` and `bindLandingEvents()`)

- [ ] **Step 1: Add the import**

In `src/main.js`, find:

```js
import { renderLanding } from "./components/landing.js";
```

Replace with:

```js
import { renderLanding } from "./components/landing.js";
import { initLandingMotion } from "./components/landingMotion.js";
```

- [ ] **Step 2: Add module-level cleanup handle**

In `src/main.js`, find:

```js
let activeAgentRequestId = null;
```

Replace with:

```js
let activeAgentRequestId = null;
// Disconnect handle for the landing IntersectionObservers; cleared before every re-render.
let landingMotionCleanup = null;
```

- [ ] **Step 3: Clean up observers before each re-render**

In `src/main.js`, find:

```js
function render() {
  document.body.classList.toggle("landing-active", state.currentView === "home");
  app.innerHTML = state.currentView === "home" ? renderLanding(state) : renderApp(state);
  if (state.currentView === "home") bindLandingEvents();
  else bindEvents();
}
```

Replace with:

```js
function render() {
  if (landingMotionCleanup) {
    landingMotionCleanup();
    landingMotionCleanup = null;
  }
  document.body.classList.toggle("landing-active", state.currentView === "home");
  app.innerHTML = state.currentView === "home" ? renderLanding(state) : renderApp(state);
  if (state.currentView === "home") bindLandingEvents();
  else bindEvents();
}
```

- [ ] **Step 4: Initialize motion when binding landing events**

In `src/main.js`, find:

```js
function bindLandingEvents() {
  app.querySelectorAll("[data-enter-console]").forEach((link) => {
    link.addEventListener("click", openConsoleFromLanding);
  });
}
```

Replace with:

```js
function bindLandingEvents() {
  app.querySelectorAll("[data-enter-console]").forEach((link) => {
    link.addEventListener("click", openConsoleFromLanding);
  });
  landingMotionCleanup = initLandingMotion(app);
}
```

- [ ] **Step 5: Run the full test suite (no regressions)**

Run: `npm test`
Expected: PASS — all test files pass (main.js is not unit-tested but imports must resolve in landing/landingMotion tests).

- [ ] **Step 6: Commit**

```bash
git add src/main.js
git commit -m "feat: init and clean up landing scroll-motion around render"
```

---

## Task 5: Rewrite the landing CSS block

**Files:**
- Modify: `src/styles.css` (replace lines 142–530)

- [ ] **Step 1: Replace the landing CSS block**

In `src/styles.css`, select **lines 142 through 530 inclusive** — from `body.landing-active {` down to the closing `}` of the `@media (max-width: 860px)` block (the line immediately before the blank line that precedes `@media (prefers-reduced-motion: reduce) {`). Replace that entire range with:

```css
/* ============================================================
   LANDING / WELCOME — redesigned: warm-ivory canvas, CSS fluid
   hero, Apple-style scroll-choreographed section reveals.
   All rules scoped to .landing-page; the console theme is untouched.
   ============================================================ */
body.landing-active {
  min-width: 0;
  overflow: auto;
}

.landing-page {
  --lp-canvas: #faf6ef;
  --lp-canvas-2: #f4eee2;
  --lp-ink: #241307;
  --lp-orange: #e0760a;
  --lp-amber: #ffc878;
  --lp-amber-2: #ffb24d;
  --lp-muted: #9a7352;
  --lp-muted-2: #b06a14;
  --lp-grad: linear-gradient(135deg, #e06d07, #f2a327);
  --lp-ease: cubic-bezier(.2, .7, .2, 1);
  position: relative;
  min-height: 100%;
  color: var(--lp-ink);
  background:
    radial-gradient(60% 50% at 80% 0%, rgba(255, 200, 120, 0.18), transparent 60%),
    radial-gradient(50% 40% at 0% 100%, rgba(224, 118, 10, 0.10), transparent 55%),
    linear-gradient(180deg, var(--lp-canvas), var(--lp-canvas-2));
  font-family: var(--font-ui, -apple-system, "Segoe UI", Arial, sans-serif);
}

.landing-page a { text-decoration: none; color: inherit; }

/* ---- NAV ---- */
.landing-nav {
  position: sticky; top: 0; z-index: 40;
  display: grid; grid-template-columns: auto 1fr auto; align-items: center;
  gap: 24px; padding: 16px clamp(20px, 5vw, 64px);
  background: rgba(250, 246, 239, 0.72);
  backdrop-filter: blur(14px) saturate(1.2);
  -webkit-backdrop-filter: blur(14px) saturate(1.2);
  border-bottom: 1px solid rgba(154, 115, 82, 0.14);
}
.landing-wordmark { font-weight: 900; font-size: 20px; letter-spacing: -0.01em; color: var(--lp-orange); }
.landing-nav-links { display: flex; gap: 28px; justify-self: center; }
.landing-nav-links a { font-size: 14px; font-weight: 600; color: var(--lp-muted); transition: color .16s ease; }
.landing-nav-links a:hover { color: var(--lp-ink); }

/* ---- BUTTONS ---- */
.landing-nav-cta,
.landing-primary-action,
.landing-secondary-action {
  display: inline-flex; align-items: center; gap: 8px;
  height: 44px; padding: 0 22px; border-radius: 999px;
  font-weight: 800; font-size: 15px;
  transition: transform .14s var(--lp-ease), box-shadow .16s ease, background .16s ease;
}
.landing-nav-cta { height: 40px; }
.landing-nav-cta,
.landing-primary-action {
  background: var(--lp-grad); color: #fff;
  box-shadow: 0 6px 18px rgba(224, 118, 10, 0.28);
}
.landing-nav-cta:hover,
.landing-primary-action:hover { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(224, 118, 10, 0.34); }
.landing-secondary-action {
  background: rgba(255, 255, 255, 0.6); color: var(--lp-ink);
  border: 1px solid rgba(154, 115, 82, 0.22);
}
.landing-secondary-action:hover { background: rgba(255, 255, 255, 0.9); transform: translateY(-1px); }
.landing-primary-action.compact { height: 48px; padding: 0 28px; }

/* ---- HERO ---- */
.landing-hero {
  position: relative; overflow: hidden; min-height: 92vh;
  display: grid; place-items: center;
  padding: clamp(80px, 12vh, 140px) clamp(20px, 6vw, 80px) clamp(60px, 10vh, 110px);
  perspective: 1200px;
}
.landing-fluid { position: absolute; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
.fluid-blob {
  position: absolute; border-radius: 50%;
  filter: blur(34px); mix-blend-mode: multiply; will-change: transform; opacity: .85;
}
.fluid-blob.b1 {
  width: 50%; height: 80%; left: 4%; top: 24%;
  background: radial-gradient(circle, var(--lp-amber-2), transparent 70%);
  animation: lpFlowA 9s ease-in-out infinite;
}
.fluid-blob.b2 {
  width: 55%; height: 85%; right: 2%; top: 0%;
  background: radial-gradient(circle, var(--lp-orange), transparent 70%);
  animation: lpFlowB 11s ease-in-out infinite;
}
.fluid-blob.b3 {
  width: 44%; height: 64%; left: 32%; bottom: -12%;
  background: radial-gradient(circle, var(--lp-amber), transparent 70%);
  animation: lpFlowC 8s ease-in-out infinite;
}
.landing-fluid.is-paused .fluid-blob { animation-play-state: paused; }

@keyframes lpFlowA {
  0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
  33% { transform: translate(22%, -14%) scale(1.25) rotate(40deg); }
  66% { transform: translate(-10%, 12%) scale(.92) rotate(-30deg); }
}
@keyframes lpFlowB {
  0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
  33% { transform: translate(-20%, 16%) scale(.9) rotate(-45deg); }
  66% { transform: translate(14%, -12%) scale(1.3) rotate(35deg); }
}
@keyframes lpFlowC {
  0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
  50% { transform: translate(-16%, -20%) scale(1.35) rotate(60deg); }
}

.landing-wash {
  position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background: radial-gradient(60% 60% at 50% 45%, rgba(250, 246, 239, 0.72), transparent 72%);
}

.landing-hero-inner { position: relative; z-index: 2; text-align: center; max-width: 880px; }
.landing-kicker {
  display: inline-block; margin-bottom: 22px; padding: 7px 16px; border-radius: 999px;
  background: rgba(255, 255, 255, 0.6); border: 1px solid rgba(154, 115, 82, 0.2);
  font-size: 12px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--lp-muted-2);
}
.landing-hero h1 {
  margin: 0; font-weight: 800; letter-spacing: -0.03em; line-height: 0.98;
  font-size: clamp(44px, 8vw, 104px); color: var(--lp-ink);
}
.landing-hero h1 .accent { color: var(--lp-orange); }
.landing-hero p {
  margin: 26px auto 0; max-width: 620px;
  font-size: clamp(16px, 2vw, 20px); line-height: 1.7; color: var(--lp-muted);
}
.landing-hero-actions { margin-top: 34px; display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
.landing-status-strip { margin: 44px 0 0; display: flex; gap: 28px; justify-content: center; flex-wrap: wrap; }
.landing-status-strip div { text-align: center; }
.landing-status-strip dt { font-size: 12px; font-weight: 700; letter-spacing: 0.04em; color: var(--lp-muted); }
.landing-status-strip dd {
  margin: 4px 0 0; font-size: 14px; font-weight: 800; color: var(--lp-ink);
  display: inline-flex; align-items: center; gap: 7px;
}
.landing-status-strip i {
  width: 8px; height: 8px; border-radius: 50%; background: #2fa45a;
  box-shadow: 0 0 0 3px rgba(47, 164, 90, 0.16);
}

/* hero entrance — above the fold, CSS only (no observer needed) */
.landing-hero-inner > * { animation: lpRise .8s var(--lp-ease) both; }
.landing-hero-inner > :nth-child(1) { animation-delay: .05s; }
.landing-hero-inner > :nth-child(2) { animation-delay: .16s; }
.landing-hero-inner > :nth-child(3) { animation-delay: .28s; }
.landing-hero-inner > :nth-child(4) { animation-delay: .40s; }
.landing-hero-inner > :nth-child(5) { animation-delay: .52s; }
@keyframes lpRise { from { opacity: 0; transform: translateY(22px); } }

/* ---- SECTIONS ---- */
.landing-band { position: relative; padding: clamp(72px, 12vh, 130px) clamp(20px, 6vw, 80px); perspective: 1200px; }
.landing-section-head { max-width: 680px; margin: 0 auto 52px; text-align: center; }
.landing-section-head span,
.landing-output span {
  font-size: 13px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: var(--lp-muted-2);
}
.landing-section-head h2,
.landing-output h2 {
  margin: 12px 0 0; font-size: clamp(28px, 4vw, 46px); font-weight: 800;
  letter-spacing: -0.02em; color: var(--lp-ink);
}

.landing-card-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; max-width: 1160px; margin: 0 auto; }
.landing-card {
  padding: 28px 24px; border-radius: 22px;
  background: rgba(255, 255, 255, 0.66); border: 1px solid rgba(154, 115, 82, 0.16);
  box-shadow: 0 10px 30px rgba(91, 55, 23, 0.06);
}
.landing-card h3 { margin: 0 0 10px; font-size: 18px; font-weight: 800; color: var(--lp-ink); }
.landing-card p { margin: 0; font-size: 14px; line-height: 1.7; color: var(--lp-muted); }

.landing-output { display: grid; grid-template-columns: 1fr 1.05fr; gap: 44px; align-items: center; max-width: 1100px; margin: 0 auto; }
.landing-output p { font-size: 16px; line-height: 1.75; color: var(--lp-muted); margin: 14px 0 0; }
.landing-answer-card {
  padding: 26px 28px; border-radius: 22px;
  background: rgba(255, 255, 255, 0.78); border: 1px solid rgba(154, 115, 82, 0.18);
  box-shadow: 0 18px 50px rgba(91, 55, 23, 0.12);
}
.landing-answer-card h4 { margin: 16px 0 6px; font-size: 13px; font-weight: 900; color: var(--lp-muted-2); }
.landing-answer-card h4:first-child { margin-top: 0; }
.landing-answer-card p { margin: 0; font-size: 14px; line-height: 1.7; color: var(--lp-ink); }
.landing-answer-card ol { margin: 6px 0 0; padding-left: 20px; }
.landing-answer-card li { font-size: 14px; line-height: 1.8; color: var(--lp-ink); }

.landing-workflow ol {
  list-style: none; margin: 0 auto; padding: 0; max-width: 1000px;
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; counter-reset: step;
}
.landing-workflow li {
  padding: 26px 22px; border-radius: 22px;
  background: rgba(255, 255, 255, 0.6); border: 1px solid rgba(154, 115, 82, 0.16);
}
.landing-workflow li::before {
  counter-increment: step; content: counter(step);
  display: inline-grid; place-items: center; width: 34px; height: 34px; margin-bottom: 14px;
  border-radius: 50%; background: var(--lp-grad); color: #fff; font-weight: 900;
}
.landing-workflow strong { display: block; font-size: 16px; color: var(--lp-ink); margin-bottom: 6px; }
.landing-workflow p { margin: 0; font-size: 14px; line-height: 1.7; color: var(--lp-muted); }

.landing-cta {
  max-width: 980px; margin: 0 auto; text-align: center;
  padding: clamp(48px, 8vh, 72px) clamp(28px, 6vw, 56px); border-radius: 28px;
  background:
    radial-gradient(60% 80% at 50% 0%, rgba(255, 200, 120, 0.22), transparent 60%),
    rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(154, 115, 82, 0.18);
  box-shadow: 0 24px 60px rgba(91, 55, 23, 0.14);
}
.landing-cta h2 { margin: 0 0 14px; font-size: clamp(28px, 4vw, 44px); font-weight: 800; color: var(--lp-ink); }
.landing-cta p { margin: 0 0 28px; font-size: 17px; color: var(--lp-muted); }

.landing-footer {
  padding: 40px clamp(20px, 6vw, 80px) 60px; max-width: 1160px; margin: 0 auto;
  display: flex; gap: 18px; align-items: center; flex-wrap: wrap; color: var(--lp-muted); font-size: 13px;
}
.landing-footer .landing-wordmark { font-size: 18px; }
.landing-footer .foot-links { margin-left: auto; display: flex; gap: 22px; }

/* ---- SCROLL-REVEAL (driven by landingMotion.js) ---- */
.landing-page [data-reveal] {
  opacity: 0; transform: translateY(40px);
  transition: opacity .7s var(--lp-ease), transform .7s var(--lp-ease);
  will-change: opacity, transform;
}
.landing-page [data-reveal="up"] { transform: translateY(40px) rotateX(8deg); }
.landing-page [data-reveal="left"] { transform: translateX(-48px) rotateY(6deg); }
.landing-page [data-reveal="right"] { transform: translateX(48px) rotateY(-6deg); }
.landing-page [data-reveal].in-view { opacity: 1; transform: none; }
.landing-card-grid [data-reveal]:nth-child(2) { transition-delay: .08s; }
.landing-card-grid [data-reveal]:nth-child(3) { transition-delay: .16s; }
.landing-card-grid [data-reveal]:nth-child(4) { transition-delay: .24s; }
.landing-workflow li[data-reveal]:nth-child(2) { transition-delay: .1s; }
.landing-workflow li[data-reveal]:nth-child(3) { transition-delay: .2s; }

/* ---- LAUNCH TRANSITION into console (kept, fluid-enhanced) ---- */
.landing-page.is-launching { pointer-events: none; }
.landing-page.is-launching .landing-nav,
.landing-page.is-launching .landing-band,
.landing-page.is-launching .landing-hero-inner,
.landing-page.is-launching .landing-footer {
  animation: landingLeave .28s var(--lp-ease) both;
}
.landing-page.is-launching .landing-fluid {
  animation: landingFluidConverge .3s var(--lp-ease) both;
}
@keyframes landingLeave { to { opacity: 0; transform: translateY(-10px); } }
@keyframes landingFluidConverge { to { opacity: 1; transform: scale(1.15); filter: brightness(1.15); } }

/* ---- RESPONSIVE ---- */
@media (max-width: 1099px) {
  .landing-card-grid { grid-template-columns: repeat(2, 1fr); }
  .landing-output { grid-template-columns: 1fr; gap: 28px; }
  .landing-workflow ol { grid-template-columns: 1fr; }
}
@media (max-width: 860px) {
  .landing-nav { grid-template-columns: 1fr auto; }
  .landing-nav-links { display: none; }
  .landing-hero { min-height: auto; }
  .landing-card-grid { grid-template-columns: 1fr; }
  .landing-status-strip { gap: 18px; }
}

/* ---- REDUCED MOTION ---- */
@media (prefers-reduced-motion: reduce) {
  .landing-hero-inner > *,
  .fluid-blob { animation: none; }
  .landing-page [data-reveal] { opacity: 1; transform: none; transition: none; }
  .landing-page.is-launching .landing-nav,
  .landing-page.is-launching .landing-band,
  .landing-page.is-launching .landing-hero-inner,
  .landing-page.is-launching .landing-footer,
  .landing-page.is-launching .landing-fluid { animation: none; }
}
```

- [ ] **Step 2: Verify the existing reduced-motion + app-welcome blocks are intact below**

The block that begins `@media (prefers-reduced-motion: reduce) {` referencing `.app-welcome-layer` (and the `@media (max-width: 900px)` `.app-welcome-*` block after it) must remain **unchanged** — those style the console welcome layer, not the landing page.

Run: `grep -n "app-welcome-layer" src/styles.css | head`
Expected: matches still present (the console welcome rules were not touched).

- [ ] **Step 3: Sanity-check CSS brace balance**

Run: `node -e "const c=require('fs').readFileSync('src/styles.css','utf8');const o=(c.match(/{/g)||[]).length,x=(c.match(/}/g)||[]).length;console.log('open',o,'close',x);if(o!==x)process.exit(1)"`
Expected: `open N close N` with equal counts (exit 0).

- [ ] **Step 4: Commit**

```bash
git add src/styles.css
git commit -m "feat: redesign landing styles — fluid hero + scroll-reveal scenes"
```

---

## Task 6: Browser-preview verification

Follow the CLAUDE.md convention: **text-based checks are the primary evidence; screenshots corroborate.**

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server preview**

Use `preview_start` (project runs on port 5173 via `npm start`). Navigate to `/` (the landing).

- [ ] **Step 2: Confirm no console errors**

Use `preview_console_logs`. Expected: no errors (especially none from `landingMotion.js` / `initLandingMotion`).

- [ ] **Step 3: Verify no horizontal overflow at desktop width**

Use `preview_eval`:
```js
({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })
```
Expected: `scrollWidth <= innerWidth` (no horizontal overflow from the 3D tilt or fluid blobs).

- [ ] **Step 4: Verify reveal hooks resolve to visible after scroll**

Use `preview_eval`:
```js
window.scrollTo(0, document.body.scrollHeight);
new Promise(r => setTimeout(() => r(
  [...document.querySelectorAll('[data-reveal]')].map(n => n.classList.contains('in-view'))
), 400));
```
Expected: array of mostly/all `true` — sections gained `.in-view` once scrolled into view.

- [ ] **Step 5: Verify reduced-motion freezes reveals**

Use `preview_resize`/emulation or `preview_eval` to check the computed state under `(prefers-reduced-motion: reduce)`. At minimum, confirm `[data-reveal]` elements are `opacity:1` (not stuck hidden). Use `preview_inspect` on a `.landing-card`.
Expected: `opacity` computes to `1`.

- [ ] **Step 6: Test the launch transition still navigates**

Use `preview_click` on the nav `进入控制台` (`[data-enter-console]`). Expected: after ~280ms the URL becomes `/app` and the console renders (no JS error from the observer cleanup path).

- [ ] **Step 7: Responsive check at 820px (sub-floor band)**

Use `preview_resize` to 820×900, wait ~250ms, then re-run the Step 3 overflow check.
Expected: still `scrollWidth <= innerWidth`; cards collapse to a single column.

- [ ] **Step 8: Screenshot corroboration**

After the renderer warms up (give it a moment post-start; retry once on timeout per CLAUDE.md), `preview_screenshot` the hero and one scrolled scene for visual confirmation of the fluid + reveal.

---

## Task 7: Obsidian vault sync (CLAUDE.md non-negotiable)

**Files (outside repo):**
- `C:\Users\lenovo\Documents\Obsidian Vault\Qwen Agent Lab.md`
- `C:\Users\lenovo\Documents\Obsidian Vault\QWEN AI AGENT LAB 总体架构.md`
- `C:\Users\lenovo\Documents\Obsidian Vault\源码工作区清点.md`
- `C:\Users\lenovo\Documents\Obsidian Vault\欢迎页重设计.md` (new dedicated note)

- [ ] **Step 1: Create the dedicated redesign note**

Write `C:\Users\lenovo\Documents\Obsidian Vault\欢迎页重设计.md` with:

```markdown
# 欢迎页重设计（2026-06-17）

## 范围
重做线上 SPA 首页 renderLanding + .landing-* 样式；landing.html 退役到 docs/design-references。

## 设计
- 品牌：混合方案 —— Apple 留白/大字号 + 暖米色 + Qwen 橙。
- 流体：Hero 内 CSS 三光斑（lpFlowA/B/C），mix-blend-mode multiply，滚出视口暂停。
- 转场：滚动编排，IntersectionObserver 切 .in-view，CSS 做 translateY + rotateX/Y 入场。
- 五分镜：Hero → 能力总览 → 结构化输出展示 → 工作流 → CTA。

## 新增/改动文件
- 新增 src/components/landingMotion.js（+ tests/landingMotion.test.js）
- 改 src/components/landing.js、src/main.js、src/styles.css、tests/landing.test.js

## 验收
- 单测：node --test tests/landingMotion.test.js、tests/landing.test.js 全绿。
- 浏览器：无横向溢出（scrollWidth<=innerWidth）、滚动后 .in-view 生效、reduced-motion 冻结、启动转场跳 /app 正常。

## 无障碍/响应式
- prefers-reduced-motion 冻结光斑与揭示。
- 1100px 桌面地板 + overflow-x clip；卡片 4→2→1。
```

- [ ] **Step 2: Append a dated entry to the three default vault nodes**

To each of `Qwen Agent Lab.md`, `QWEN AI AGENT LAB 总体架构.md`, and `源码工作区清点.md`, append a short dated line linking the work, e.g.:

```markdown
- 2026-06-17 · 欢迎页重设计上线：renderLanding 五分镜 + CSS 流体 Hero + 滚动编排转场（landingMotion.js）。详见 [[欢迎页重设计]]。
```

(For `源码工作区清点.md`, also note the new file `src/components/landingMotion.js` and the retirement of `landing.html` → `docs/design-references/`.)

- [ ] **Step 3: Confirm sync before claiming completion**

Per CLAUDE.md: do not claim the project work complete until these nodes reflect the new state. Verify each file contains the 2026-06-17 entry.

---

## Final verification

- [ ] **Run the full suite**

Run: `npm test`
Expected: all `tests/*.test.js` pass.

- [ ] **Confirm branch state**

Run: `git log --oneline -8`
Expected: commits for spec, retire-landing, landingMotion, renderLanding, main wiring, styles.

---

## Self-Review (completed by plan author)

**1. Spec coverage**
- §3 architecture/code-落点 → Tasks 1–5. ✓
- §4 visual tokens → Task 5 CSS (`--lp-*`). ✓
- §5 five scenes + reveal directions → Task 3 markup + Task 5 reveal CSS. ✓
- §6 fluid module (blobs, blur, multiply, pause) → Task 5 `.fluid-blob` + Task 2 hero-pause observer. ✓
- §7 launch transition → Task 5 `.is-launching` + `landingFluidConverge` (reuses main.js hook). ✓
- §8 a11y/responsive → Task 5 reduced-motion + responsive blocks; Task 2 reduced-motion init branch; Task 6 verification. ✓
- §9 testing → Tasks 2, 3 (unit) + Task 6 (browser). ✓
- §10 Obsidian sync → Task 7. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**3. Type consistency:** `initLandingMotion`, `collectReveals`, `revealOnIntersect`, `prefersReducedMotion`, `landingMotionCleanup`, `.in-view`, `.is-paused`, `data-reveal="up|left|right"`, `.landing-fluid`, `.fluid-blob.b1/b2/b3` are used identically across Tasks 2–5. ✓
