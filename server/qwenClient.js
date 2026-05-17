import { config } from "./config.js";
import { AppError } from "./errors.js";

export async function callQwen({ messages, model = config.qwenModel, temperature = 0.3 }) {
  ensureConfigured();
  return callQwenOnce({ messages, model, temperature });
}

async function callQwenOnce({ messages, model, temperature }) {
  const controller = new AbortController();
  const timeoutMs = getTimeoutMs(model);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${config.qwenBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.qwenApiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: config.qwenMaxTokens,
        stream: false,
      }),
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

    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      throw new AppError("QWEN_EMPTY_RESPONSE", "千问返回内容为空。", 502, payload);
    }

    return {
      content,
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
