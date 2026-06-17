import express from "express";
import path from "node:path";
import { config, projectRoot } from "./config.js";
import { AppError, normalizeError } from "./errors.js";
import { callQwen } from "./qwenClient.js";
import { buildMessages, buildAgentMessages, buildSummaryMessages, formatSuccess } from "./responseFormatter.js";
import { planAnswer } from "./answerPlanner.js";
import { MODEL_WHITELIST, isModelAllowed, resolveModel } from "./models.js";
import { logCall, getLog, clearLog } from "./callLog.js";
import { normalizeConversationContext, normalizeSummaryPayload } from "./context.js";
import { getToolSchemas } from "./tools.js";
import { runAgent } from "./agentExecutor.js";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use("/src", express.static(path.join(projectRoot, "src")));
app.use("/assets", express.static(path.join(projectRoot, "assets")));

// In-flight human-in-the-loop tool confirmations: key `${requestId}:${step}` →
// a resolver the agent loop is awaiting. Populated by the streaming agent run,
// drained by POST /api/qwen/agent/confirm (or by timeout / disconnect).
const pendingConfirmations = new Map();
const confirmKey = (requestId, step) => `${requestId}:${step}`;

app.get(["/", "/app", "/app/*"], (req, res) => {
  res.sendFile(path.join(projectRoot, "index.html"));
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    service: "qwen-agent-lab",
    api: {
      provider: "qwen",
      configured: Boolean(config.qwenApiKey),
      model: config.qwenModel,
      baseUrl: maskBaseUrl(config.qwenBaseUrl),
    },
    time: new Date().toISOString(),
  });
});

app.get("/api/models", (req, res) => {
  res.json({
    success: true,
    data: {
      models: MODEL_WHITELIST,
      default: config.qwenModel,
    },
  });
});

app.post("/api/models/probe", async (req, res, next) => {
  try {
    const modelId = String(req.body?.model || "").trim();
    if (!modelId) {
      throw new AppError("MODEL_REQUIRED", "请指定要试用的模型 ID。", 400);
    }
    if (!isModelAllowed(modelId)) {
      throw new AppError("MODEL_NOT_ALLOWED", `模型 "${modelId}" 不在白名单中，请从列表中选择。`, 400, {
        model: modelId,
        allowed: MODEL_WHITELIST.map((m) => m.id),
      });
    }
    const start = Date.now();
    await callQwen({
      model: modelId,
      messages: [{ role: "user", content: "Hi" }],
      temperature: 0,
    });
    res.json({ success: true, model: modelId, durationMs: Date.now() - start });
  } catch (error) {
    next(error);
  }
});

app.get("/api/logs", (req, res) => {
  res.json({ success: true, data: getLog() });
});

app.delete("/api/logs", (req, res) => {
  clearLog();
  res.json({ success: true });
});

app.post("/api/qwen/chat", async (req, res, next) => {
  const requestId = createRequestId();
  try {
    const payload = validateChatPayload(req.body);

    // Agent mode runs the full tool-calling loop even on the non-streaming
    // endpoint, so Chat / Agent are truly distinct across all backend routes.
    if (payload.mode === "agent") {
      const finalEvent = await executeAgent({ payload, requestId });
      res.json(formatAgentResponse({ requestId, payload, finalEvent }));
      return;
    }

    const messages = buildMessages(payload);
    const result = await callQwenWithLog({
      messages,
      model: payload.model,
      maxTokens: resolveMaxTokens(payload),
      requestId,
      mode: payload.mode,
      enableSearch: payload.webSearch,
    });

    res.json(
      formatSuccess({
        requestId,
        mode: payload.mode,
        model: result.model,
        content: result.content,
        usage: result.usage,
        finishReason: result.finishReason,
        fileContext: payload.fileContext,
        answerPlan: payload.answerPlan,
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.post("/api/qwen/plan", (req, res, next) => {
  try {
    const payload = validateChatPayload(req.body);
    res.json({
      success: true,
      status: "planned",
      data: {
        mode: payload.mode,
        fileContext: payload.fileContext,
        answerPlan: payload.answerPlan,
      },
      error: null,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/qwen/conversation-summary", async (req, res, next) => {
  const requestId = createRequestId();
  try {
    const payload = normalizeSummaryPayload(req.body);
    const requestedModel = req.body?.model ? String(req.body.model).trim() : "";
    const model = resolveModel(requestedModel, config.qwenModel);
    if (model === null) {
      throw new AppError("MODEL_NOT_ALLOWED", `模型 "${requestedModel}" 不在白名单中。`, 400);
    }
    const result = await callQwenWithLog({
      messages: buildSummaryMessages(payload),
      model,
      maxTokens: config.qwenSummaryMaxTokens,
      requestId,
      mode: "conversation-summary",
    });
    res.json({
      success: true,
      requestId,
      status: "completed",
      data: {
        summary: toPlainText(result.content),
        model: result.model,
        usage: result.usage,
        createdAt: new Date().toISOString(),
      },
      error: null,
    });
  } catch (error) {
    next(error);
  }
});

// Deliver a user's allow/deny for a paused `requiresConfirmation` tool. The
// streaming agent request stays open and resumes as soon as this resolves.
app.post("/api/qwen/agent/confirm", (req, res) => {
  const requestId = String(req.body?.requestId || "").trim();
  const step = Number(req.body?.step);
  const decision = String(req.body?.decision || "").trim();
  if (!requestId || !Number.isInteger(step) || (decision !== "approve" && decision !== "deny")) {
    return res.status(400).json({ success: false, error: { message: "缺少或非法的确认参数（requestId / step / decision）。" } });
  }
  const resolver = pendingConfirmations.get(confirmKey(requestId, step));
  if (!resolver) {
    return res.status(409).json({ success: false, error: { message: "该确认请求不存在或已过期。" } });
  }
  pendingConfirmations.delete(confirmKey(requestId, step));
  resolver({ approved: decision === "approve", reason: decision === "approve" ? "approved" : "denied" });
  res.json({ success: true, data: { requestId, step, decision } });
});

app.post("/api/qwen/chat/stream", async (req, res) => {
  const requestId = createRequestId();
  let heartbeat = null;

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (event, data) => {
    res.write(`${JSON.stringify({ event, requestId, ...data })}\n`);
  };

  try {
    send("status", { status: "validating", message: "正在校验请求..." });
    const payload = validateChatPayload(req.body);

    if (payload.fileContext?.ignored) {
      send("status", {
        status: "file_ignored",
        message: "检测到当前问题与上传文件不相关，已忽略文件并聚焦新问题。",
      });
    }

    if (payload.mode === "agent") {
      await runAgentStream({ payload, requestId, req, send, setHeartbeat: (h) => { heartbeat = h; } });
      return;
    }

    send("status", { status: "queued", message: "请求已进入后端队列..." });
    const messages = buildMessages(payload);

    send("status", { status: "calling_qwen", message: "正在调用千问模型..." });
    // Heartbeat covers the wait before the first token; once tokens start
    // flowing ("吐字式"), we stop it and stream deltas to the client instead.
    heartbeat = setInterval(() => {
      send("status", {
        status: "waiting_qwen",
        message: "千问仍在生成中，复杂模型可能需要更长时间...",
      });
    }, 15000);
    const result = await callQwenWithLog({
      messages,
      model: payload.model,
      maxTokens: resolveMaxTokens(payload),
      requestId,
      mode: payload.mode,
      enableSearch: payload.webSearch,
      onDelta: (text) => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        send("delta", { text });
      },
    });
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }

    send("status", { status: "formatting", message: "正在格式化输出..." });
    send("result", {
      status: "completed",
      response: formatSuccess({
        requestId,
        mode: payload.mode,
        model: result.model,
        content: result.content,
        usage: result.usage,
        finishReason: result.finishReason,
        fileContext: payload.fileContext,
        answerPlan: payload.answerPlan,
      }),
    });
  } catch (error) {
    const normalized = normalizeError(error);
    send("error", {
      status: "failed",
      error: normalized.body.error,
    });
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    res.end();
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(projectRoot, "index.html"));
});

app.use((error, req, res, next) => {
  const normalized = normalizeError(error);
  res.status(normalized.status).json(normalized.body);
});

app.listen(config.port, "127.0.0.1", () => {
  console.log(`Qwen Agent Lab backend listening on http://127.0.0.1:${config.port}`);
  console.log(`Qwen API configured: ${Boolean(config.qwenApiKey)}`);
});

function validateChatPayload(body) {
  const mode = String(body?.mode || "chat");
  const webSearch = body?.webSearch === true;
  const input = String(body?.input || "").trim();
  const uploadedFile = normalizeFile(body?.file);
  const fileDecision = decideFileUse({ mode, input, file: uploadedFile });
  const file = fileDecision.use ? uploadedFile : null;
  const requestedModel = body?.model ? String(body.model).trim() : "";
  const resolved = resolveModel(requestedModel, config.qwenModel);
  if (resolved === null) {
    throw new AppError("MODEL_NOT_ALLOWED", `模型 "${requestedModel}" 不在白名单中，请从设置中选择已支持的模型。`, 400, {
      model: requestedModel,
      allowed: MODEL_WHITELIST.map((m) => m.id),
    });
  }
  const model = resolved;
  const context = normalizeConversationContext(body?.context);

  if (!input && !uploadedFile?.content) {
    throw new AppError("EMPTY_INPUT", "请输入问题，或上传 txt / md / csv 文件。", 400);
  }

  if (input.length > 4000) {
    throw new AppError("INPUT_TOO_LONG", "输入内容不能超过 4000 字。", 400);
  }

  const answerPlan = planAnswer({ mode, input, file });

  return {
    mode,
    webSearch,
    input,
    file,
    model,
    context,
    answerPlan,
    fileContext: uploadedFile
      ? {
          uploaded: true,
          used: fileDecision.use,
          ignored: !fileDecision.use,
          reason: fileDecision.reason,
          name: uploadedFile.name,
          type: uploadedFile.type,
        }
      : {
          uploaded: false,
          used: false,
          ignored: false,
          reason: "no_file",
        },
  };
}

function toPlainText(content) {
  return String(content || "")
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-z]*|```/gi, ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/[*#_`>-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFile(file) {
  if (!file) return null;
  const name = String(file.name || "uploaded-file");
  const type = String(file.type || "").toLowerCase();
  const content = String(file.content || "");
  const allowed = new Set(["txt", "md", "csv"]);

  if (!allowed.has(type)) {
    throw new AppError("UNSUPPORTED_FILE_TYPE", "仅支持 txt、md、csv 文件。", 400, { type });
  }

  if (content.length > 120000) {
    throw new AppError("FILE_TOO_LARGE", "文件内容过大，请先裁剪后再分析。", 413);
  }

  return { name, type, content };
}

function decideFileUse({ mode, input, file }) {
  if (!file?.content) {
    return { use: false, reason: "no_file" };
  }

  const text = String(input || "").trim().toLowerCase();
  if (!text) {
    return { use: true, reason: "file_only_request" };
  }

  if (mode === "document" || mode === "csv") {
    return { use: true, reason: "file_mode" };
  }

  const fileKeywords = [
    "文件",
    "文档",
    "上传",
    "这个",
    "该",
    "它",
    "内容",
    "总结",
    "摘要",
    "分析",
    "csv",
    "表格",
    "数据",
    "file",
    "document",
    "upload",
    "this",
    "it",
    "summarize",
    "summary",
    "analyze",
    "analyse",
    "csv",
    "table",
    "data",
  ];

  if (fileKeywords.some((keyword) => text.includes(keyword))) {
    return { use: true, reason: "file_related_request" };
  }

  return { use: false, reason: "question_unrelated_to_file" };
}

function createRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Report-style tasks (summaries, comparisons, data analysis, decisions,
// step-by-step) produce several sections plus tables, so they get the larger
// budget. Plain chat answers stay on the smaller, faster budget. This keeps
// output from being truncated mid-section without letting short answers ramble.
function resolveMaxTokens(payload) {
  const format = payload?.answerPlan?.response_format;
  const longModes = payload?.mode === "document" || payload?.mode === "csv";
  const needsRoom = longModes || format === "report" || format === "step" || Boolean(payload?.file);
  return needsRoom ? config.qwenReportMaxTokens : config.qwenMaxTokens;
}

async function callQwenWithLog({ messages, model, maxTokens, requestId, mode, tools = null, onDelta = null, enableSearch = false }) {
  const start = Date.now();
  try {
    const result = await callQwen({ messages, model, maxTokens, tools, onDelta, enableSearch });
    logCall({
      requestId,
      model: result.model || model,
      mode,
      durationMs: Date.now() - start,
      status: "ok",
      inputTokens: result.usage?.input_tokens ?? null,
      outputTokens: result.usage?.output_tokens ?? null,
    });
    return result;
  } catch (error) {
    logCall({
      requestId,
      model,
      mode,
      durationMs: Date.now() - start,
      status: "error",
      errorCode: error.code || "UNKNOWN",
    });
    throw error;
  }
}

// Runs the agent loop to completion. `onEvent` receives every non-final step
// event (tool_start / tool_result / tool_error) — the stream route maps them to
// NDJSON, while the non-stream route passes a no-op and just uses the result.
async function executeAgent({ payload, requestId, onEvent = () => {}, confirmTool }) {
  const messages = buildAgentMessages({
    input: payload.input,
    file: payload.file,
    context: payload.context,
  });
  const tools = getToolSchemas();
  const ctx = { file: payload.file };

  const callModel = ({ messages: stepMessages, tools: stepTools }) =>
    callQwenWithLog({
      messages: stepMessages,
      model: payload.model,
      maxTokens: config.qwenReportMaxTokens,
      requestId,
      mode: "agent",
      tools: stepTools,
    });

  let finalEvent = null;
  for await (const event of runAgent({
    messages,
    model: payload.model,
    ctx,
    callModel,
    tools,
    maxIterations: config.agentMaxIterations,
    maxToolSteps: config.agentMaxToolSteps,
    ...(confirmTool ? { confirmTool } : {}),
  })) {
    if (event.type === "final") finalEvent = event;
    else onEvent(event);
  }
  return finalEvent;
}

function formatAgentResponse({ requestId, payload, finalEvent }) {
  // Agent mode has no answerPlanner pass, so chartSpec extraction would see no
  // chart_type. If the agent used chart_generator, lift the validated type from
  // that tool step so the existing chart pipeline renders it.
  let answerPlan = payload.answerPlan;
  const chartStep = (finalEvent?.toolSteps || [])
    .filter((item) => item.tool === "chart_generator" && item.status === "completed")
    .pop();
  if (chartStep) {
    try {
      const type = JSON.parse(chartStep.result)?.chart?.type;
      if (type) answerPlan = { ...(answerPlan || {}), chart_type: type };
    } catch {
      // Malformed tool result: fall through with the original plan.
    }
  }
  return formatSuccess({
    requestId,
    mode: payload.mode,
    model: finalEvent?.model || payload.model,
    content: finalEvent?.content || "",
    usage: finalEvent?.usage || null,
    finishReason: finalEvent?.finishReason || "stop",
    fileContext: payload.fileContext,
    answerPlan,
    toolSteps: finalEvent?.toolSteps || [],
    agentTruncated: finalEvent?.truncated || false,
    agentTruncatedReason: finalEvent?.truncatedReason || null,
  });
}

async function runAgentStream({ payload, requestId, req, send, setHeartbeat }) {
  send("status", { status: "queued", message: "Agent 已进入后端队列..." });
  send("status", { status: "planning", message: "正在分析问题并规划工具..." });
  const heartbeat = setInterval(() => {
    send("status", { status: "waiting_qwen", message: "Agent 仍在思考 / 执行工具中..." });
  }, 15000);
  setHeartbeat(heartbeat);

  // Per-run set of pending confirmation keys so a client disconnect can release
  // any tool that is still waiting on an allow/deny (otherwise the loop hangs).
  const ownedKeys = new Set();
  const confirmTool = ({ step }) =>
    new Promise((resolve) => {
      const key = confirmKey(requestId, step);
      ownedKeys.add(key);
      const timer = setTimeout(() => {
        if (pendingConfirmations.delete(key)) {
          ownedKeys.delete(key);
          resolve({ approved: false, reason: "timeout" });
        }
      }, config.agentConfirmTimeoutMs);
      pendingConfirmations.set(key, (decision) => {
        clearTimeout(timer);
        ownedKeys.delete(key);
        resolve(decision);
      });
    });

  const releaseOwned = (reason) => {
    for (const key of ownedKeys) {
      const resolver = pendingConfirmations.get(key);
      if (resolver) {
        pendingConfirmations.delete(key);
        resolver({ approved: false, reason });
      }
    }
    ownedKeys.clear();
  };
  req?.on?.("close", () => releaseOwned("disconnected"));

  let finalEvent = null;
  try {
    finalEvent = await executeAgent({
      payload,
      requestId,
      confirmTool,
      onEvent: (event) => {
        if (event.type === "tool_start") {
          send("tool_start", { step: event.step, tool: event.tool, args: event.args, category: event.category });
        } else if (event.type === "tool_confirm") {
          send("tool_confirm", { step: event.step, tool: event.tool, args: event.args, category: event.category });
        } else if (event.type === "tool_denied") {
          send("tool_denied", { step: event.step, tool: event.tool, reason: event.reason, error: event.error });
        } else if (event.type === "tool_result") {
          send("tool_result", { step: event.step, tool: event.tool, result: event.result, durationMs: event.durationMs });
        } else if (event.type === "tool_error") {
          send("tool_error", { step: event.step, tool: event.tool, error: event.error, durationMs: event.durationMs });
        }
      },
    });
  } finally {
    clearInterval(heartbeat);
    setHeartbeat(null);
    releaseOwned("disconnected");
  }

  send("status", { status: "formatting", message: "正在格式化输出..." });
  send("result", {
    status: "completed",
    response: formatAgentResponse({ requestId, payload, finalEvent }),
  });
}

function maskBaseUrl(baseUrl) {
  try {
    const url = new URL(baseUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "configured";
  }
}
