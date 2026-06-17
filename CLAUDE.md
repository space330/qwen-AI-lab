# Qwen Agent Lab

Express server (`server/index.js`) serving a vanilla-JS SPA from `src/`. The console
UI lives at `/app`; `/` is the landing page. Dev/start: `npm start` → port **5173**
(`PORT` in `.env`). Tests: `npm test` (node:test, `tests/*.test.js`).

## Non-negotiable Obsidian sync rule

Any engineering change, feature delivery, acceptance result, version update, repository
governance change, or meaningful architecture decision must be synced to the Obsidian
vault before the work is considered complete.

Default vault targets:

- `C:\Users\lenovo\Documents\Obsidian Vault\Qwen Agent Lab.md`
- `C:\Users\lenovo\Documents\Obsidian Vault\QWEN AI AGENT LAB 总体架构.md`
- `C:\Users\lenovo\Documents\Obsidian Vault\源码工作区清点.md`
- Add a dedicated version, acceptance, issue, or closure note when the change is large
  enough to need its own record.

Do not claim completion for project work until the relevant Obsidian nodes reflect the
current engineering state.

## Browser-preview verification convention

When verifying UI changes with the `preview_*` tools, the **text-based checks are the
primary evidence** and screenshots are visual corroboration — not the other way around:

- For layout/overflow/size/color, measure with `preview_eval` (`documentElement.scrollWidth`
  vs `innerWidth`) or `preview_inspect` (computed styles). These are exact; screenshots are not.
- `preview_screenshot` is for visual corroboration only.

Screenshots occasionally **time out (~30s) right after `preview_start`** when the renderer
is still warming up and a burst of `resize`/`eval` calls is fired immediately after. This is
a transient timing issue — **not** a CSS or `backdrop-filter` problem. To keep screenshots
reliable:

1. Give the renderer a moment after `preview_start` before the first screenshot; don't chain
   it immediately behind a `resize` + multiple `eval` burst.
2. After a `preview_resize`, wait ~200–300ms before screenshotting.
3. On a screenshot timeout, **retry once** — it almost always succeeds. Do not silently
   downgrade to "screenshots unavailable"; fall back to text-based proof only if a retry
   also fails.

## Responsive layout notes

- `body { min-width: 1100px }` is the desktop floor. The `@media (max-width: 1099px)` block in
  `src/styles.css` drops it and switches `.app-shell` to a single column with a horizontal
  mode rail. The breakpoint is deliberately tied to the 1100px floor (not a phone width), so
  the whole sub-floor band — including tablets like 820px — avoids horizontal overflow. If you
  change the floor, change the breakpoint to match.
- `.conversation-drawer` / `.profile-panel` are `position: fixed` and parked off the right
  edge via `transform`. `html { overflow-x: clip }` keeps them from inflating
  `documentElement.scrollWidth`; don't remove it.
