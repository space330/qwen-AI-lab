import { config } from "./config.js";
import { AppError } from "./errors.js";

export async function callQwen({
  messages,
  model = config.qwenModel,
  temperature = config.qwenTemperature,
  topP = config.qwenTopP,
  maxTokens = config.qwenMaxTokens,
  tools = null,
  toolChoice = null,
  enableSearch = false,
  onDelta = null,
}) {
  ensureConfigured();

  // Streaming ("吐字式") path: a single attempt, no retry — retrying after we
  // have already emitted partial tokens would duplicate output on the client.
  if (typeof onDelta === "function") {
    return await streamQwenOnce({ messages, model, temperature, topP, maxTokens, enableSearch, onDelta });
  }

  const maxAttempts = Math.max(1, config.qwenMaxRetries + 1);
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await callQwenOnce({ messages, model, temperature, topP, maxTokens, tools, toolChoice, enableSearch });
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryable(error)) throw error;
      await delay(backoffMs(attempt));
    }
  }

  throw lastError;
}

// Only transient upstream conditions are worth retrying. Client errors
// (400 / auth / validation) and request-level timeouts are not retried —
// retrying a timeout would just multiply the wait on already-slow models.
function isRetryable(error) {
  if (!(error instanceof AppError)) return false;
  if (error.code === "QWEN_NETWORK_ERROR") return true;
  if (error.code === "QWEN_EMPTY_RESPONSE") return true;
  if (error.code === "QWEN_API_ERROR") {
    const upstream = error.details?.upstreamStatus;
    return upstream === 429 || (typeof upstream === "number" && upstream >= 500);
  }
  return false;
}

function backoffMs(attempt) {
  const base = config.qwenRetryBaseDelayMs * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * config.qwenRetryBaseDelayMs);
  return base + jitter;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callQwenOnce({ messages, model, temperature, topP, maxTokens, tools = null, toolChoice = null, enableSearch = false }) {
  const controller = new AbortController();
  const timeoutMs = getTimeoutMs(model);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const requestBody = {
      model,
      messages,
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
      stream: false,
    };
    // Tool-calling params are only sent when provided, so plain chat / probe /
    // summary calls keep an identical request shape (backward compatible).
    if (Array.isArray(tools) && tools.length) {
      requestBody.tools = tools;
      requestBody.tool_choice = toolChoice || "auto";
    }
    // DashScope built-in web search (used by the "qwen" web_search provider).
    // Only sent when requested, so normal calls keep an identical request shape.
    if (enableSearch) {
      requestBody.enable_search = true;
      requestBody.search_options = { forced_search: true };
    }

    const response = await fetch(`${config.qwenBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.qwenApiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const payload = await safeJson(response);

    if (!response.ok) {
      throw new AppError(
        "QWEN_API_ERROR",
        "千问 API 调用失败。",
        mapStatus(response.status),
        {
          upstreamStatus: response.status,
          upstreamMessage: payload?.error?.message || payload?.message || "unknown",
        },
      );
    }

    const message = payload?.choices?.[0]?.message || null;
    const content = message?.content || "";
    const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    // A tool-call turn legitimately has null/empty content, so only treat the
    // response as empty when there is neither content nor any tool call.
    if (!content && !toolCalls.length) {
      throw new AppError("QWEN_EMPTY_RESPONSE", "千问返回内容为空。", 502, payload);
    }

    return {
      content,
      toolCalls,
      message,
      model: payload.model || model,
      usage: payload.usage || null,
      id: payload.id || null,
      finishReason: payload.choices?.[0]?.finish_reason || null,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new AppError("QWEN_TIMEOUT", "千问 API 请求超时，请稍后重试。", 504, {
        model,
        timeoutMs,
        hint: "当前模型响应较慢。可以缩短输入、减少文件内容，或切换到 qwen-plus / qwen3.6-flash。",
      });
    }
    if (isNetworkTimeout(error)) {
      throw new AppError("QWEN_NETWORK_TIMEOUT", "千问 API 网络等待超时。", 504, {
        model,
        timeoutMs,
        upstreamError: error.code || error.cause?.code || error.message,
        hint: "qwen3.6-max-preview 可能排队或响应较慢。请重试、缩短输入，或切换到 qwen-plus / qwen3.6-flash。",
      });
    }
    if (error instanceof TypeError) {
      throw new AppError("QWEN_NETWORK_ERROR", "千问 API 网络请求失败。", 502, {
        model,
        upstreamError: error.code || error.cause?.code || error.message,
        hint: "请检查网络和 DashScope 服务状态，或稍后重试。",
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Streaming variant: reads the SSE response and calls `onDelta(text)` for each
// content chunk ("吐字式"), accumulating the full content to return the same
// shape as callQwenOnce. Uses an *idle* timeout (reset on every chunk) so long
// answers don't trip the request timeout as long as tokens keep flowing.
async function streamQwenOnce({ messages, model, temperature, topP, maxTokens, enableSearch, onDelta }) {
  const controller = new AbortController();
  const idleMs = getTimeoutMs(model);
  let idleTimer = setTimeout(() => controller.abort(), idleMs);
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(), idleMs);
  };

  try {
    const requestBody = {
      model,
      messages,
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    };
    if (enableSearch) {
      requestBody.enable_search = true;
      requestBody.search_options = { forced_search: true };
    }

    const response = await fetch(`${config.qwenBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.qwenApiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const payload = await safeJson(response);
      throw new AppError("QWEN_API_ERROR", "千问 API 调用失败。", mapStatus(response.status), {
        upstreamStatus: response.status,
        upstreamMessage: payload?.error?.message || payload?.message || "unknown",
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let content = "";
    let finishReason = null;
    let usage = null;
    let modelName = model;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetIdle();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let chunk;
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }
        if (chunk.model) modelName = chunk.model;
        if (chunk.usage) usage = chunk.usage;
        const choice = chunk.choices?.[0];
        const delta = choice?.delta?.content;
        if (delta) {
          content += delta;
          onDelta(delta);
        }
        if (choice?.finish_reason) finishReason = choice.finish_reason;
      }
    }

    if (!content) {
      throw new AppError("QWEN_EMPTY_RESPONSE", "千问返回内容为空。", 502, null);
    }

    return { content, toolCalls: [], message: null, model: modelName, usage, id: null, finishReason };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new AppError("QWEN_TIMEOUT", "千问 API 流式响应超时，请稍后重试。", 504, { model, idleMs });
    }
    if (error instanceof AppError) throw error;
    if (error instanceof TypeError || isNetworkTimeout(error)) {
      throw new AppError("QWEN_NETWORK_ERROR", "千问 API 流式请求失败。", 502, {
        model,
        upstreamError: error.code || error.cause?.code || error.message,
      });
    }
    throw error;
  } finally {
    clearTimeout(idleTimer);
  }
}

function getTimeoutMs(model) {
  const name = String(model || "").toLowerCase();
  const slowModel = name.includes("preview") || name.includes("max") || name.includes("3.6");
  return slowModel
    ? Math.max(config.qwenTimeoutMs, config.qwenSlowModelTimeoutMs)
    : config.qwenTimeoutMs;
}

function isNetworkTimeout(error) {
  const code = error.code || error.cause?.code || "";
  const message = `${error.message || ""} ${error.cause?.message || ""}`.toLowerCase();
  return (
    code.includes("TIMEOUT") ||
    code === "UND_ERR_HEADERS_TIMEOUT" ||
    code === "UND_ERR_BODY_TIMEOUT" ||
    message.includes("timeout") ||
    message.includes("timed out")
  );
}

export function ensureConfigured() {
  if (!config.qwenApiKey) {
    throw new AppError(
      "QWEN_API_KEY_MISSING",
      "后端未配置 QWEN_API_KEY。请在 .env 中配置后重启服务。",
      500,
    );
  }
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function mapStatus(upstreamStatus) {
  if (upstreamStatus === 401 || upstreamStatus === 403) return 502;
  if (upstreamStatus === 429) return 429;
  if (upstreamStatus >= 500) return 502;
  return 400;
}
