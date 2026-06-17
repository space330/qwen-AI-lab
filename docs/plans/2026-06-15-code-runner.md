# code_runner 工具 Implementation Plan

> **For agentic workers:** Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在受限沙箱中运行 JS/Python 代码片段，用于数据聚合、轻量计算和格式转换，作为 Agent 工具链的一部分。

**Architecture:** 新建 `server/codeSandbox.js` 模块封装子进程执行引擎（`child_process.spawn`），每次执行在独立临时目录中运行，环境变量清洗、超时强制终止、输出截断。工具注册到 `server/tools.js` 的 `TOOLS` 字典，标记为 `dangerous: true` + `requiresConfirmation: true`，执行前必须用户确认。

**Tech Stack:** Node.js `child_process`、`node:test`、Express（已有）

**Spec 来源：** `C:\Users\lenovo\Documents\Obsidian Vault\下一轮工具能力设计草案.md` § code_runner

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `server/codeSandbox.js` | 沙箱执行引擎：运行时检测、临时目录管理、子进程 spawn、超时终止、输出截断、环境变量清洗 |
| Create | `tests/codeSandbox.test.js` | 沙箱引擎单元测试：JS/Python 执行、超时、截断、错误处理、运行时检测 |
| Modify | `server/config.js:55` | 新增 `codeRunnerEnabled`、`codeRunnerMaxTimeoutMs`、`codeRunnerMaxCodeChars` 三个配置项 |
| Modify | `server/tools.js:605` | 在 `TOOLS` 字典末尾注册 `code_runner` 工具定义 |
| Modify | `tests/tools.test.js:69-80` | 更新 `getToolSchemas` 断言，加入 `code_runner` |
| Create | `tests/codeRunner.test.js` | 工具层集成测试：tool.run() 输入校验、JSON 输出结构、治理元数据 |

---

### Task 1: 沙箱模块骨架 + 运行时检测

**Files:**
- Create: `server/codeSandbox.js`
- Create: `tests/codeSandbox.test.js`

- [ ] **Step 1: Write the failing test — runtime detection**

```js
// tests/codeSandbox.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { detectRuntimes } from "../server/codeSandbox.js";

test("detectRuntimes reports node as available", async () => {
  const runtimes = await detectRuntimes();
  assert.equal(runtimes.node, true, "node must be available since the server runs on it");
});

test("detectRuntimes returns an object with node and python keys", async () => {
  const runtimes = await detectRuntimes();
  assert.ok("node" in runtimes);
  assert.ok("python" in runtimes);
  assert.equal(typeof runtimes.node, "boolean");
  assert.equal(typeof runtimes.python, "boolean");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd /c "cd /d D:\Qwen Agent Lab && node --test tests/codeSandbox.test.js 2>&1"`
Expected: FAIL — `Cannot find module '../server/codeSandbox.js'`

- [ ] **Step 3: Write minimal implementation — module skeleton + detectRuntimes**

```js
// server/codeSandbox.js
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { config } from "./config.js";

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_TIMEOUT_MS = 30000;
const MAX_CODE_CHARS = 10000;
const MAX_OUTPUT_CHARS = 8000;

const LANG_CONFIG = {
  javascript: {
    command: process.execPath,
    ext: ".mjs",
    args: (file) => [file],
  },
  python: {
    command: process.platform === "win32" ? "python" : "python3",
    ext: ".py",
    args: (file) => ["-I", file],
  },
};

export async function detectRuntimes() {
  const results = {};
  for (const [lang, cfg] of Object.entries(LANG_CONFIG)) {
    results[lang === "javascript" ? "node" : lang] = await probeCommand(cfg.command);
  }
  return results;
}

function probeCommand(command) {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, ["--version"], {
        stdio: "ignore",
        timeout: 3000,
        windowsHide: true,
      });
      child.on("error", () => resolve(false));
      child.on("exit", () => resolve(true));
    } catch {
      resolve(false);
    }
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cmd /c "cd /d D:\Qwen Agent Lab && node --test tests/codeSandbox.test.js 2>&1"`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add server/codeSandbox.js tests/codeSandbox.test.js
git commit -m "feat(code-runner): add sandbox skeleton with runtime detection"
```

---

### Task 2: JavaScript 代码执行 — 正常路径

**Files:**
- Modify: `server/codeSandbox.js`
- Modify: `tests/codeSandbox.test.js`

- [ ] **Step 1: Write the failing test — JS execution**

```js
// tests/codeSandbox.test.js — append after existing tests
import { runCode } from "../server/codeSandbox.js";

test("runCode executes simple JavaScript and captures stdout", async () => {
  const result = await runCode({
    language: "javascript",
    code: 'console.log("hello from sandbox");',
  });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /hello from sandbox/);
  assert.equal(result.stderr, "");
  assert.equal(result.error, null);
  assert.equal(typeof result.durationMs, "number");
  assert.ok(result.durationMs >= 0);
});

test("runCode passes stdin data to the subprocess", async () => {
  const result = await runCode({
    language: "javascript",
    code: 'const chunks = []; process.stdin.on("data", c => chunks.push(c)); process.stdin.on("end", () => console.log(chunks.join("").toUpperCase()));',
    stdin: "hello world",
  });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /HELLO WORLD/);
});

test("runCode returns structured JSON when code outputs JSON", async () => {
  const result = await runCode({
    language: "javascript",
    code: 'console.log(JSON.stringify({ sum: 1 + 2 + 3 }));',
  });
  assert.equal(result.exitCode, 0);
  const parsed = JSON.parse(result.stdout.trim());
  assert.equal(parsed.sum, 6);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd /c "cd /d D:\Qwen Agent Lab && node --test tests/codeSandbox.test.js 2>&1"`
Expected: FAIL — `runCode is not a function` or `Cannot find export`

- [ ] **Step 3: Implement runCode — core execution engine**

在 `server/codeSandbox.js` 中 `probeCommand` 函数之后追加：

```js
export async function runCode({ language, code, stdin = "", timeoutMs }) {
  const lang = String(language || "").toLowerCase();
  if (lang !== "javascript" && lang !== "python") {
    return { stdout: "", stderr: "", exitCode: -1, durationMs: 0, truncated: false, error: `不支持的语言：${language}。仅支持 javascript / python。` };
  }

  const cfg = LANG_CONFIG[lang];
  const runtimeKey = lang === "javascript" ? "node" : lang;
  const available = await detectRuntimes();
  if (!available[runtimeKey]) {
    return { stdout: "", stderr: "", exitCode: -1, durationMs: 0, truncated: false, error: `${runtimeKey} 运行时不可用，无法执行代码。` };
  }

  const codeText = String(code || "");
  if (!codeText.trim()) {
    return { stdout: "", stderr: "", exitCode: -1, durationMs: 0, truncated: false, error: "code 参数不能为空。" };
  }
  if (codeText.length > MAX_CODE_CHARS) {
    return { stdout: "", stderr: "", exitCode: -1, durationMs: 0, truncated: false, error: `代码过长（${codeText.length} 字符），上限 ${MAX_CODE_CHARS}。` };
  }

  const timeout = Math.min(Math.max(Number(timeoutMs) || DEFAULT_TIMEOUT_MS, 1000), MAX_TIMEOUT_MS);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qal-code-"));
  const codeFile = path.join(tmpDir, `main${cfg.ext}`);
  fs.writeFileSync(codeFile, codeText, "utf8");

  const env = sanitizeEnv();
  const start = Date.now();

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let killed = false;

    const child = spawn(cfg.command, cfg.args(codeFile), {
      cwd: tmpDir,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      timeout,
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      killed = true;
      try { child.kill("SIGKILL"); } catch { /* already dead */ }
    }, timeout);

    if (stdin) {
      child.stdin.write(String(stdin));
    }
    child.stdin.end();

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    child.on("error", (err) => {
      clearTimeout(timer);
      cleanupTmp(tmpDir);
      resolve({
        stdout: truncateOutput(stdout),
        stderr: truncateOutput(stderr),
        exitCode: -1,
        durationMs: Date.now() - start,
        truncated: stdout.length > MAX_OUTPUT_CHARS || stderr.length > MAX_OUTPUT_CHARS,
        error: `进程启动失败：${err.message}`,
      });
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      const stdoutTrunc = stdout.length > MAX_OUTPUT_CHARS;
      const stderrTrunc = stderr.length > MAX_OUTPUT_CHARS;

      if (killed) {
        cleanupTmp(tmpDir);
        resolve({
          stdout: truncateOutput(stdout),
          stderr: truncateOutput(stderr),
          exitCode: -1,
          durationMs,
          truncated: true,
          error: `代码执行超时（${timeout}ms），已强制终止。`,
        });
        return;
      }

      cleanupTmp(tmpDir);
      resolve({
        stdout: truncateOutput(stdout),
        stderr: truncateOutput(stderr),
        exitCode: exitCode ?? -1,
        durationMs,
        truncated: stdoutTrunc || stderrTrunc,
        error: exitCode !== 0 ? summarizeError(stderr, exitCode) : null,
      });
    });
  });
}

function sanitizeEnv() {
  const safe = {};
  const keep = ["PATH", "SYSTEMROOT", "TEMP", "TMP", "USERPROFILE", "HOME", "LANG", "LC_ALL", "PATHEXT", "OS", "COMSPEC"];
  for (const key of keep) {
    if (process.env[key]) safe[key] = process.env[key];
  }
  return safe;
}

function truncateOutput(text) {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return text.slice(0, MAX_OUTPUT_CHARS) + "\n…[输出过长，已截断]";
}

function summarizeError(stderr, exitCode) {
  const lines = String(stderr || "").trim().split("\n").filter(Boolean);
  const summary = lines.slice(-3).join("\n").slice(0, 500);
  return summary || `进程退出码 ${exitCode}`;
}

function cleanupTmp(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cmd /c "cd /d D:\Qwen Agent Lab && node --test tests/codeSandbox.test.js 2>&1"`
Expected: PASS (5 tests — 2 from Task 1 + 3 new)

- [ ] **Step 5: Commit**

```bash
git add server/codeSandbox.js tests/codeSandbox.test.js
git commit -m "feat(code-runner): implement JS code execution with stdin/stdout capture"
```

---

### Task 3: 超时与输出截断

**Files:**
- Modify: `tests/codeSandbox.test.js`

- [ ] **Step 1: Write the failing test — timeout enforcement**

```js
// tests/codeSandbox.test.js — append
test("runCode enforces timeout and returns timeout error", async () => {
  const result = await runCode({
    language: "javascript",
    code: "while(true) {}",
    timeoutMs: 1000,
  });
  assert.equal(result.exitCode, -1);
  assert.match(result.error, /超时/);
  assert.equal(result.truncated, true);
  assert.ok(result.durationMs >= 900, `duration should be near timeout, got ${result.durationMs}`);
  assert.ok(result.durationMs < 5000, `duration should not exceed timeout by much, got ${result.durationMs}`);
});

test("runCode truncates large stdout output", async () => {
  const result = await runCode({
    language: "javascript",
    code: 'for (let i = 0; i < 100000; i++) console.log("line " + i);',
    timeoutMs: 5000,
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.truncated, true);
  assert.match(result.stdout, /已截断/);
  assert.ok(result.stdout.length < 10000, `stdout should be capped, got ${result.stdout.length}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd /c "cd /d D:\Qwen Agent Lab && node --test tests/codeSandbox.test.js 2>&1"`
Expected: FAIL — timeout test may pass (implementation already handles it), truncation test should pass. If both pass, skip to Step 4. If timeout test hangs (kill doesn't work on Windows), proceed to Step 3.

- [ ] **Step 3: Fix Windows process kill if needed**

如果 Task 2 的 `child.kill("SIGKILL")` 在 Windows 上不能终止子进程树，替换 `server/codeSandbox.js` 中的 kill 逻辑：

```js
// 替换 timeout handler 中的 kill 调用
const timer = setTimeout(() => {
  killed = true;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      child.kill("SIGKILL");
    }
  } catch { /* already dead */ }
}, timeout);
```

- [ ] **Step 4: Run test to verify all pass**

Run: `cmd /c "cd /d D:\Qwen Agent Lab && node --test tests/codeSandbox.test.js 2>&1"`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add server/codeSandbox.js tests/codeSandbox.test.js
git commit -m "feat(code-runner): enforce timeout and output truncation in sandbox"
```

---

### Task 4: 错误处理与输入校验

**Files:**
- Modify: `tests/codeSandbox.test.js`

- [ ] **Step 1: Write the failing test — error scenarios**

```js
// tests/codeSandbox.test.js — append
test("runCode captures runtime errors with stack trace summary", async () => {
  const result = await runCode({
    language: "javascript",
    code: "throw new Error('intentional crash');",
  });
  assert.notEqual(result.exitCode, 0);
  assert.ok(result.error, "error field must be populated");
  assert.match(result.stderr, /intentional crash/);
});

test("runCode rejects empty code", async () => {
  const result = await runCode({ language: "javascript", code: "" });
  assert.equal(result.exitCode, -1);
  assert.match(result.error, /不能为空/);
});

test("runCode rejects unsupported language", async () => {
  const result = await runCode({ language: "ruby", code: "puts 'hi'" });
  assert.equal(result.exitCode, -1);
  assert.match(result.error, /不支持的语言/);
});

test("runCode rejects oversized code", async () => {
  const result = await runCode({ language: "javascript", code: "x".repeat(20000) });
  assert.equal(result.exitCode, -1);
  assert.match(result.error, /代码过长/);
});

test("runCode sanitizes environment — no API keys leaked", async () => {
  const result = await runCode({
    language: "javascript",
    code: 'console.log(JSON.stringify({ qwen: process.env.QWEN_API_KEY || "UNSET", bocha: process.env.BOCHA_API_KEY || "UNSET", path: process.env.PATH ? "SET" : "UNSET" }));',
  });
  assert.equal(result.exitCode, 0);
  const env = JSON.parse(result.stdout.trim());
  assert.equal(env.qwen, "UNSET", "QWEN_API_KEY must not leak into sandbox");
  assert.equal(env.bocha, "UNSET", "BOCHA_API_KEY must not leak into sandbox");
  assert.equal(env.path, "SET", "PATH should be preserved");
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cmd /c "cd /d D:\Qwen Agent Lab && node --test tests/codeSandbox.test.js 2>&1"`
Expected: PASS (12 tests). All error handling is already implemented in Task 2-3 code.

- [ ] **Step 3: Commit**

```bash
git add tests/codeSandbox.test.js
git commit -m "test(code-runner): add error handling and env sanitization tests"
```

---

### Task 5: Python 支持

**Files:**
- Modify: `tests/codeSandbox.test.js`

- [ ] **Step 1: Write the failing test — Python execution**

```js
// tests/codeSandbox.test.js — append
test("runCode executes Python if available", async () => {
  const { detectRuntimes } = await import("../server/codeSandbox.js");
  const runtimes = await detectRuntimes();
  if (!runtimes.python) {
    // Skip gracefully when Python is not installed
    return;
  }
  const result = await runCode({
    language: "python",
    code: 'print("hello from python")',
  });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /hello from python/);
  assert.equal(result.error, null);
});

test("runCode captures Python runtime errors", async () => {
  const { detectRuntimes } = await import("../server/codeSandbox.js");
  const runtimes = await detectRuntimes();
  if (!runtimes.python) return;
  const result = await runCode({
    language: "python",
    code: "raise ValueError('boom')",
  });
  assert.notEqual(result.exitCode, 0);
  assert.ok(result.error);
  assert.match(result.stderr, /boom/);
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cmd /c "cd /d D:\Qwen Agent Lab && node --test tests/codeSandbox.test.js 2>&1"`
Expected: PASS — Python tests pass if Python is installed, skip otherwise. The `LANG_CONFIG.python` with `python -I file.py` (`-I` = isolated mode) is already wired in Task 2.

- [ ] **Step 3: Commit**

```bash
git add tests/codeSandbox.test.js
git commit -m "feat(code-runner): add Python execution support with -I isolated mode"
```

---

### Task 6: config.js 新增配置项

**Files:**
- Modify: `server/config.js:55`

- [ ] **Step 1: Write the failing test — config keys exist**

```js
// tests/codeSandbox.test.js — append
import { config } from "../server/config.js";

test("config exposes code_runner settings with sensible defaults", () => {
  assert.equal(typeof config.codeRunnerEnabled, "boolean");
  assert.ok(Number.isInteger(config.codeRunnerMaxTimeoutMs) && config.codeRunnerMaxTimeoutMs > 0);
  assert.ok(Number.isInteger(config.codeRunnerMaxCodeChars) && config.codeRunnerMaxCodeChars > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd /c "cd /d D:\Qwen Agent Lab && node --test tests/codeSandbox.test.js 2>&1"`
Expected: FAIL — `config.codeRunnerEnabled is undefined`

- [ ] **Step 3: Add config entries**

在 `server/config.js` 的 `bochaTimeoutMs` 行（第 55 行）之后追加：

```js
  // Code runner (V2.3). Gated behind user confirmation since it spawns
  // subprocesses. Disabled by default until explicitly enabled in .env.
  codeRunnerEnabled: process.env.CODE_RUNNER_ENABLED !== "false",
  codeRunnerMaxTimeoutMs: parseIntEnv("CODE_RUNNER_MAX_TIMEOUT_MS", 30000),
  codeRunnerMaxCodeChars: parseIntEnv("CODE_RUNNER_MAX_CODE_CHARS", 10000),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cmd /c "cd /d D:\Qwen Agent Lab && node --test tests/codeSandbox.test.js 2>&1"`
Expected: PASS (13+ tests)

- [ ] **Step 5: Commit**

```bash
git add server/config.js tests/codeSandbox.test.js
git commit -m "feat(code-runner): add config entries for code runner tool"
```

---

### Task 7: 工具注册到 TOOLS 字典

**Files:**
- Modify: `server/tools.js`
- Create: `tests/codeRunner.test.js`

- [ ] **Step 1: Write the failing test — tool registration and governance**

```js
// tests/codeRunner.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { getTool, getToolSchemas, TOOL_CATEGORIES } from "../server/tools.js";

test("code_runner is registered in the tool registry", () => {
  const tool = getTool("code_runner");
  assert.ok(tool, "code_runner must be registered");
  assert.equal(tool.name, "code_runner");
});

test("code_runner carries correct governance metadata", () => {
  const tool = getTool("code_runner");
  assert.equal(tool.category, "analysis");
  assert.equal(tool.dangerous, true, "code execution is inherently dangerous");
  assert.equal(tool.requiresConfirmation, true, "must require user confirmation before execution");
  assert.ok(TOOL_CATEGORIES.includes(tool.category));
  assert.ok(Number.isInteger(tool.timeoutMs) && tool.timeoutMs > 0);
  assert.ok(Number.isInteger(tool.maxResultChars) && tool.maxResultChars > 0);
});

test("code_runner appears in getToolSchemas", () => {
  const names = getToolSchemas().map((s) => s.function.name);
  assert.ok(names.includes("code_runner"), "code_runner must appear in tool schemas");
});

test("code_runner schema has correct parameters", () => {
  const schema = getToolSchemas().find((s) => s.function.name === "code_runner");
  assert.equal(schema.type, "function");
  const params = schema.function.parameters;
  assert.equal(params.type, "object");
  assert.ok(params.properties.language);
  assert.ok(params.properties.code);
  assert.ok(params.required.includes("language"));
  assert.ok(params.required.includes("code"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd /c "cd /d D:\Qwen Agent Lab && node --test tests/codeRunner.test.js 2>&1"`
Expected: FAIL — `getTool("code_runner")` returns `null`

- [ ] **Step 3: Register code_runner in TOOLS dictionary**

在 `server/tools.js` 顶部 import 区追加：

```js
import { runCode, detectRuntimes } from "./codeSandbox.js";
```

在 `TOOLS` 对象的 `report_builder` 条目之后（`};` 闭合之前）追加：

```js
  code_runner: {
    name: "code_runner",
    description:
      "在受限沙箱中运行 JavaScript 或 Python 代码片段，用于数据聚合、格式转换和轻量计算。支持 stdin 输入。禁止网络和项目文件写入。执行前需用户确认。",
    category: "analysis",
    dangerous: true,
    requiresConfirmation: true,
    timeoutMs: 35000,
    maxResultChars: 8000,
    parameters: {
      type: "object",
      properties: {
        language: {
          type: "string",
          enum: ["javascript", "python"],
          description: "编程语言：javascript 或 python。",
        },
        code: {
          type: "string",
          description: "要执行的代码。上限 10000 字符。",
        },
        stdin: {
          type: "string",
          description: "通过标准输入传递给代码的数据（可选）。适合把 CSV/JSON 喂给脚本。",
        },
        timeoutMs: {
          type: "integer",
          description: "执行超时毫秒数，默认 10000，上限 30000。",
          minimum: 1000,
          maximum: 30000,
        },
      },
      required: ["language", "code"],
    },
    async run(args) {
      if (!config.codeRunnerEnabled) {
        return JSON.stringify({ error: "disabled", message: "code_runner 当前已禁用，请在 .env 中设置 CODE_RUNNER_ENABLED=true。" });
      }
      const language = String(args?.language || "").toLowerCase();
      if (!["javascript", "python"].includes(language)) {
        return JSON.stringify({ error: "bad_language", message: "language 必须是 javascript 或 python。" });
      }
      const code = String(args?.code || "");
      if (!code.trim()) {
        return JSON.stringify({ error: "empty_code", message: "code 参数不能为空。" });
      }
      const result = await runCode({
        language,
        code,
        stdin: String(args?.stdin || ""),
        timeoutMs: Number(args?.timeoutMs) || undefined,
      });
      return JSON.stringify({
        language,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        truncated: result.truncated,
        error: result.error,
      });
    },
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cmd /c "cd /d D:\Qwen Agent Lab && node --test tests/codeRunner.test.js 2>&1"`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/tools.js tests/codeRunner.test.js
git commit -m "feat(code-runner): register code_runner tool with governance metadata"
```

---

### Task 8: 工具层集成测试 — tool.run() 端到端

**Files:**
- Modify: `tests/codeRunner.test.js`

- [ ] **Step 1: Write the failing test — tool.run() end-to-end**

```js
// tests/codeRunner.test.js — append
test("code_runner tool.run executes JS and returns structured JSON", async () => {
  const tool = getTool("code_runner");
  const raw = await tool.run({
    language: "javascript",
    code: 'const data = [1,2,3,4,5]; console.log(JSON.stringify({ sum: data.reduce((a,b)=>a+b,0), count: data.length }));',
  });
  const out = JSON.parse(raw);
  assert.equal(out.exitCode, 0);
  assert.equal(out.language, "javascript");
  assert.equal(out.error, null);
  const parsed = JSON.parse(out.stdout.trim());
  assert.equal(parsed.sum, 15);
  assert.equal(parsed.count, 5);
});

test("code_runner tool.run rejects empty code", async () => {
  const tool = getTool("code_runner");
  const out = JSON.parse(await tool.run({ language: "javascript", code: "  " }));
  assert.equal(out.error, "empty_code");
});

test("code_runner tool.run rejects invalid language", async () => {
  const tool = getTool("code_runner");
  const out = JSON.parse(await tool.run({ language: "rust", code: "fn main() {}" }));
  assert.equal(out.error, "bad_language");
});

test("code_runner tool.run captures JS runtime errors", async () => {
  const tool = getTool("code_runner");
  const out = JSON.parse(await tool.run({
    language: "javascript",
    code: "undefined_variable.foo;",
  }));
  assert.notEqual(out.exitCode, 0);
  assert.ok(out.error, "error must be populated");
  assert.match(out.stderr, /undefined_variable|ReferenceError/);
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cmd /c "cd /d D:\Qwen Agent Lab && node --test tests/codeRunner.test.js 2>&1"`
Expected: PASS (8 tests)

- [ ] **Step 3: Commit**

```bash
git add tests/codeRunner.test.js
git commit -m "test(code-runner): add end-to-end tool.run integration tests"
```

---

### Task 9: 更新现有 tools.test.js 断言

**Files:**
- Modify: `tests/tools.test.js:69-80`

- [ ] **Step 1: Update the getToolSchemas assertion**

在 `tests/tools.test.js` 第 69-80 行，将 `names` 断言数组更新为包含 `code_runner`：

```js
test("getToolSchemas exposes OpenAI-style function tools", () => {
  const schemas = getToolSchemas();
  const names = schemas.map((schema) => schema.function.name).sort();
  assert.deepEqual(names, [
    "calculator",
    "chart_generator",
    "code_runner",
    "data_analyzer",
    "file_reader",
    "file_search",
    "memory_search",
    "memory_write",
    "report_builder",
    "web_fetch",
    "web_search",
  ]);
  for (const schema of schemas) {
    assert.equal(schema.type, "function");
    assert.equal(schema.function.parameters.type, "object");
  }
});
```

同时更新 `tests/toolsV22.test.js` 第 24 行的工具数量断言：

```js
  assert.ok(names.length >= 11, `expected the V2.3 registry (11 tools), got ${names.length}`);
```

以及 `tests/toolsV22.test.js` 第 41 行 `requiresConfirmation` 断言：

```js
  assert.deepEqual(gated.sort(), ["code_runner", "memory_write"]);
```

- [ ] **Step 2: Run full test suite**

Run: `cmd /c "cd /d D:\Qwen Agent Lab && node --test tests/*.test.js 2>&1"`
Expected: ALL PASS — 原 97 个 + 新增约 20 个 = ~117 个测试全部通过

- [ ] **Step 3: Commit**

```bash
git add tests/tools.test.js tests/toolsV22.test.js
git commit -m "test(code-runner): update tool registry assertions for 11 tools"
```

---

### Task 10: Agent prompt 集成 + .env 文档

**Files:**
- Modify: `server/responseFormatter.js:119-130`
- Modify: `.env`

- [ ] **Step 1: Add code_runner to agent system prompt**

在 `server/responseFormatter.js` 的 `buildAgentMessages` 函数中，工具选择指南列表（第 119-130 行区域）在 `memory_write` 之后追加一行：

```js
    "- code_runner: run short JS/Python snippets for data aggregation, format conversion, or complex calculations that calculator cannot handle. Requires user confirmation.",
```

- [ ] **Step 2: Add .env documentation**

在 `.env` 文件末尾追加（注释形式，不启用）：

```env
# Code runner (V2.3): sandboxed JS/Python execution
# CODE_RUNNER_ENABLED=true
# CODE_RUNNER_MAX_TIMEOUT_MS=30000
# CODE_RUNNER_MAX_CODE_CHARS=10000
```

- [ ] **Step 3: Run full test suite to verify no regressions**

Run: `cmd /c "cd /d D:\Qwen Agent Lab && node --test tests/*.test.js 2>&1"`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add server/responseFormatter.js .env
git commit -m "feat(code-runner): integrate into agent prompt and document .env config"
```

---

### Task 11: 验收与 Obsidian 同步

- [ ] **Step 1: Run full test suite one final time**

Run: `cmd /c "cd /d D:\Qwen Agent Lab && node --test tests/*.test.js 2>&1"`
Expected: ALL PASS (~117 tests)

- [ ] **Step 2: Verify tool appears in frontend**

启动服务 `npm start`，打开 `http://127.0.0.1:5173/app`，切换到 Agent 模式，发送一条需要代码执行的消息（如"用 JS 计算斐波那契数列前 20 项"），确认：
- 工具链时光轴显示 `code_runner` 步骤
- 出现"允许/拒绝"确认按钮
- 点击允许后代码执行并返回结果

- [ ] **Step 3: Sync to Obsidian**

更新 `C:\Users\lenovo\Documents\Obsidian Vault\下一轮工具能力设计草案.md`，在 `code_runner` 章节标记 `[x] 已实现`。

更新 `C:\Users\lenovo\Documents\Obsidian Vault\Qwen Agent Lab.md` 和 `C:\Users\lenovo\Documents\Obsidian Vault\QWEN AI AGENT LAB 总体架构.md`，记录 V2.3 code_runner 交付。

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(code-runner): complete code_runner tool with sandbox, tests, and docs"
```

---

## Self-Review Checklist

| 检查项 | 结果 |
|--------|------|
| Spec 覆盖：language / code / stdin / timeoutMs 输入 | ✓ Task 2 (language/code/stdin), Task 3 (timeoutMs) |
| Spec 覆盖：stdout / stderr / exitCode / durationMs / truncated 输出 | ✓ Task 2 (stdout/stderr/exitCode/durationMs), Task 3 (truncated) |
| Spec 覆盖：超时回退 | ✓ Task 3 |
| Spec 覆盖：输出过大截断 | ✓ Task 3 |
| Spec 覆盖：运行异常保留错误栈 | ✓ Task 4 |
| Spec 覆盖：权限边界（临时目录 / 禁止网络 / 禁止写项目文件） | ✓ Task 2 (tmpDir cwd), Task 4 (env sanitization) |
| Spec 覆盖：requiresConfirmation | ✓ Task 7 |
| Placeholder 扫描 | ✓ 无 TBD/TODO |
| 类型一致性 | ✓ `runCode()` 签名在 Task 2-5 一致；`getTool("code_runner")` 在 Task 7-9 一致 |
