import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const projectRoot = path.resolve(__dirname, "..");

loadEnvFile(path.join(projectRoot, ".env"));

export const config = {
  port: parseIntEnv("PORT", 5173),
  qwenApiKey: process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || "",
  qwenModel: process.env.QWEN_MODEL || "qwen3.7-max",
  qwenBaseUrl:
    process.env.QWEN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
  qwenTimeoutMs: parseIntEnv("QWEN_TIMEOUT_MS", 60000),
  qwenSlowModelTimeoutMs: parseIntEnv("QWEN_SLOW_MODEL_TIMEOUT_MS", 240000),
  // Output length. The base budget covers short chat answers; report-style
  // tasks (summaries, comparisons, data analysis) get a larger budget so the
  // model can finish every planned section instead of being truncated.
  qwenMaxTokens: parseIntEnv("QWEN_MAX_TOKENS", 2000),
  qwenReportMaxTokens: parseIntEnv("QWEN_REPORT_MAX_TOKENS", 3200),
  qwenSummaryMaxTokens: parseIntEnv("QWEN_SUMMARY_MAX_TOKENS", 700),
  // Sampling. Lower temperature / top_p make the structured HTML output more
  // stable and reproducible across runs.
  qwenTemperature: parseFloatEnv("QWEN_TEMPERATURE", 0.25),
  qwenTopP: parseFloatEnv("QWEN_TOP_P", 0.8),
  // Stability. Transient upstream failures (429 / 5xx / network blips) are
  // retried with exponential backoff before surfacing an error.
  qwenMaxRetries: parseIntEnv("QWEN_MAX_RETRIES", 2),
  qwenRetryBaseDelayMs: parseIntEnv("QWEN_RETRY_BASE_DELAY_MS", 800),
  qwenFileCharLimit: parseIntEnv("QWEN_FILE_CHAR_LIMIT", 6000),
  // Agent (V2.0). Cap on consecutive tool-call iterations to prevent the model
  // from looping forever; after the cap the executor forces a final summary.
  agentMaxIterations: parseIntEnv("AGENT_MAX_ITERATIONS", 5),
  // Hard cap on the *total* number of tool executions across all iterations
  // (a single model turn may request several tools at once), bounding cost and
  // latency. Once reached the executor forces a final answer.
  agentMaxToolSteps: parseIntEnv("AGENT_MAX_TOOL_STEPS", 8),
  // How long a `requiresConfirmation` tool waits for the user's allow/deny in
  // the interactive (streaming) agent before auto-cancelling that tool.
  agentConfirmTimeoutMs: parseIntEnv("AGENT_CONFIRM_TIMEOUT_MS", 120000),
  // web_search tool provider: "qwen" (reuse the DashScope key via Qwen's
  // built-in web search — no extra credential), "bocha" (博查 real search), or
  // "mock" (force the deterministic placeholder).
  webSearchProvider: (process.env.WEB_SEARCH_PROVIDER || "qwen").toLowerCase(),
  // Model used for the "qwen" search provider. qwen-plus is fast/cheap and
  // supports enable_search, so search doesn't burn the agent's reasoning model.
  qwenSearchModel: process.env.QWEN_SEARCH_MODEL || "qwen-plus",
  // Bocha (国内直连) is read via .env on the backend only and never exposed to
  // the browser. When the key is absent the tool falls back to a marked mock.
  bochaApiKey: process.env.BOCHA_API_KEY || "",
  bochaBaseUrl: process.env.BOCHA_BASE_URL || "https://api.bochaai.com/v1",
  bochaTimeoutMs: parseIntEnv("BOCHA_TIMEOUT_MS", 15000),
};

function parseIntEnv(key, fallback) {
  const value = parseInt(process.env[key] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function parseFloatEnv(key, fallback) {
  const value = parseFloat(process.env[key] ?? "");
  return Number.isFinite(value) ? value : fallback;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalIndex = line.indexOf("=");
    if (equalIndex === -1) continue;

    const key = line.slice(0, equalIndex).trim();
    const rawValue = line.slice(equalIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
