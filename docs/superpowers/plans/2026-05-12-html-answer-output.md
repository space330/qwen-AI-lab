# HTML Answer Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Qwen Agent Lab generate clean, frontend-renderable HTML answers instead of Markdown or JSON-section text.

**Architecture:** Keep `answerPlanner.js` as the task/chart planner. Change `responseFormatter.js` so Qwen is instructed to return HTML only, sanitize the returned HTML on the backend, and expose section/chart metadata. Update the frontend renderer to safely render allowed HTML in AI messages.

**Tech Stack:** Express, browser ES modules, plain JavaScript, Qwen OpenAI-compatible API.

---

### Task 1: Backend HTML Output Contract

**Files:**
- Modify: `server/responseFormatter.js`

- [ ] Replace the JSON-only prompt with an HTML-only prompt.
- [ ] Require `<section class="section" id="...">`, headings, paragraphs, lists, tables, and `<div id="chartX"></div>` placeholders.
- [ ] Add backend HTML sanitization for allowed tags and safe attributes only.
- [ ] Extract section metadata and chart placeholders from sanitized HTML.

### Task 2: Frontend Safe HTML Rendering

**Files:**
- Modify: `src/components/render.js`
- Modify: `src/main.js`

- [ ] Add a safe HTML renderer for assistant messages.
- [ ] Allow only section/div/h2/h3/p/ul/ol/li/table/thead/tbody/tr/th/td.
- [ ] Preserve editable text behavior for non-HTML messages.
- [ ] Use backend `data.content` directly when it is HTML.

### Task 3: Verification

**Commands:**
- `node --check server/responseFormatter.js`
- `node --check server/index.js`
- Restart Express on port 5173.
- Call `/api/qwen/chat` with a data-analysis request and confirm returned content contains `<section`.
- Call `/api/qwen/chat` with a general QA request and confirm no Markdown fences or stars are returned.
