import express from "express";
import path from "node:path";
import { config, projectRoot } from "./config.js";
import { AppError, normalizeError } from "./errors.js";
import { callQwen } from "./qwenClient.js";
import { buildMessages, formatSuccess } from "./responseFormatter.js";
import { planAnswer } from "./answerPlanner.js";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use("/src", express.static(path.join(projectRoot, "src")));
app.use("/assets", express.static(path.join(projectRoot, "assets")));

app.get("/", (req, res) => {
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

app.post("/api/qwen/chat", async (req, res, next) => {
  try {
    const requestId = createRequestId();
    const payload = validateChatPayload(req.body);
    const messages = buildMessages(payload);
    const result = await callQwen({ messages, model: payload.model || config.qwenModel });

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

    send("status", { status: "queued", message: "请求已进入后端队列..." });
    const messages = buildMessages(payload);

    send("status", { status: "calling_qwen", message: "正在调用千问模型..." });
    heartbeat = setInterval(() => {
      send("status", {
        status: "waiting_qwen",
        message: "千问仍在生成中，复杂模型可能需要更长时间...",
      });
    }, 15000);
    const result = await callQwen({ messages, model: payload.model || config.qwenModel });
    clearInterval(heartbeat);
    heartbeat = null;

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
  const input = String(body?.input || "").trim();
  const uploadedFile = normalizeFile(body?.file);
  const fileDecision = decideFileUse({ mode, input, file: uploadedFile });
  const file = fileDecision.use ? uploadedFile : null;
  const requestedModel = body?.model ? String(body.model).trim() : "";
  const model = requestedModel && requestedModel !== "Qwen" ? requestedModel : config.qwenModel;

  if (!input && !uploadedFile?.content) {
    throw new AppError("EMPTY_INPUT", "请输入问题，或上传 txt / md / csv 文件。", 400);
  }

  if (input.length > 4000) {
    throw new AppError("INPUT_TOO_LONG", "输入内容不能超过 4000 字。", 400);
  }

  const answerPlan = planAnswer({ mode, input, file });

  return {
    mode,
    input,
    file,
    model,
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

function maskBaseUrl(baseUrl) {
  try {
    const url = new URL(baseUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "configured";
  }
}
