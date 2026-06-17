import { getTool } from "./tools.js";

// ============================================================================
// ReAct-style agent control loop.
//
// `runAgent` is an async generator that drives the tool-calling conversation
// and yields step events the route layer maps to NDJSON. It is transport- and
// provider-agnostic: the caller injects `callModel` (which wraps qwenClient +
// logging) so this module stays easy to unit test with a mock.
//
// Unified tool-step contract (shared by stream events, final response, frontend
// state and IndexedDB):
//   { step, tool, status: "running" | "completed" | "error",
//     args, result, error, durationMs }
//
// Event shapes yielded:
//   { type: "tool_start",   step, tool, args }
//   { type: "tool_confirm", step, tool, args }   ← requiresConfirmation gate
//   { type: "tool_denied",  step, tool, reason, error }
//   { type: "tool_result",  step, tool, result, durationMs }
//   { type: "tool_error",   step, tool, error, durationMs }
//   { type: "final",        content, usage, finishReason, model,
//                           toolSteps, stepCount, truncated, truncatedReason }
//
// Human-in-the-loop: a tool whose metadata has `requiresConfirmation: true` is
// not executed until `confirmTool({ step, tool, args })` resolves to
// `{ approved: true }`. The loop yields `tool_confirm` (so the UI can show an
// allow/deny prompt) and then awaits the decision. A denial is fed back to the
// model as a tool result so it can adapt instead of silently stalling. Callers
// that don't wire confirmation get the default (auto-approve) — i.e. existing
// read-only tools behave exactly as before.
//
// `callModel({ messages, tools })` must resolve to:
//   { content, toolCalls, message, model, usage, finishReason }
// matching the shape returned by qwenClient.callQwen.
// ============================================================================

export async function* runAgent({
  messages,
  model,
  ctx = {},
  callModel,
  tools = null,
  maxIterations = 5,
  maxToolSteps = 8,
  confirmTool = async () => ({ approved: true }),
  getToolImpl = getTool,
}) {
  const working = [...messages];
  const toolSteps = [];
  let step = 0;
  let limitHit = false;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const response = await callModel({ messages: working, tools });
    const toolCalls = Array.isArray(response.toolCalls) ? response.toolCalls : [];

    // Model produced a final answer (no tool calls) — we're done.
    if (!toolCalls.length) {
      yield finalEvent(response, model, toolSteps, false, null);
      return;
    }

    // Per OpenAI protocol, echo the assistant message carrying the tool_calls
    // back into context before appending each tool result.
    working.push(response.message || { role: "assistant", content: response.content || "", tool_calls: toolCalls });

    for (const call of toolCalls) {
      const toolName = call?.function?.name || "unknown";
      const args = parseToolArgs(call?.function?.arguments);

      // Total tool-step cap (distinct from the iteration cap): a single model
      // turn can request many tools, so we count *executed* steps. Calls beyond
      // the cap still get a tool message (protocol requires one per tool_call)
      // but are not executed, then we force a final answer.
      if (step >= maxToolSteps) {
        limitHit = true;
        working.push(toolResultMessage(call, toolName, "ERROR: 已达到工具调用总步骤上限，未执行该工具。"));
        continue;
      }

      step += 1;
      const tool = getToolImpl(toolName);
      const category = tool?.category || null;

      // Confirmation gate: a tool flagged `requiresConfirmation` pauses here and
      // waits for an explicit allow/deny before doing anything. On deny (or a
      // timeout / disconnect surfaced as a non-approval), record a "denied" step
      // and feed the refusal back to the model rather than executing.
      if (tool && tool.requiresConfirmation) {
        yield { type: "tool_confirm", step, tool: toolName, args, category };
        let decision;
        try {
          decision = await confirmTool({ step, tool: toolName, args });
        } catch {
          decision = { approved: false, reason: "error" };
        }
        if (!decision?.approved) {
          const reason = decision?.reason || "denied";
          const errorText =
            reason === "timeout"
              ? "用户未在时限内确认，已自动取消该工具。"
              : reason === "disconnected"
                ? "会话已断开，已取消该工具。"
                : "用户拒绝执行该工具。";
          toolSteps.push({ step, tool: toolName, category, status: "denied", args, result: null, error: errorText, durationMs: 0 });
          yield { type: "tool_denied", step, tool: toolName, reason, error: errorText };
          working.push(
            toolResultMessage(call, toolName, `DENIED: ${errorText} 请勿重试该工具，改用其他方式或据此向用户说明。`),
          );
          continue;
        }
      }

      yield { type: "tool_start", step, tool: toolName, args, category };

      const start = Date.now();
      if (!tool) {
        const durationMs = Date.now() - start;
        const errorText = `未知工具：${toolName}`;
        toolSteps.push({ step, tool: toolName, category, status: "error", args, result: null, error: errorText, durationMs });
        yield { type: "tool_error", step, tool: toolName, error: errorText, durationMs };
        working.push(toolResultMessage(call, toolName, `ERROR: ${errorText}`));
        continue;
      }

      try {
        const raw = await withTimeout(
          Promise.resolve(tool.run(args, ctx)),
          tool.timeoutMs || DEFAULT_TOOL_TIMEOUT_MS,
          toolName,
        );
        const result = truncateToolResult(raw, tool.maxResultChars || DEFAULT_MAX_RESULT_CHARS);
        const durationMs = Date.now() - start;
        toolSteps.push({ step, tool: toolName, category, status: "completed", args, result, error: null, durationMs });
        yield { type: "tool_result", step, tool: toolName, result, durationMs };
        working.push(toolResultMessage(call, toolName, result));
      } catch (error) {
        const durationMs = Date.now() - start;
        const errorText = error?.message || "工具执行失败。";
        toolSteps.push({ step, tool: toolName, category, status: "error", args, result: null, error: errorText, durationMs });
        yield { type: "tool_error", step, tool: toolName, error: errorText, durationMs };
        // Feed the error back so the model can recover or change strategy.
        working.push(toolResultMessage(call, toolName, `ERROR: ${errorText}`));
      }
    }

    if (limitHit) break;
  }

  // Cap reached (iterations or total tool steps) — force one final answer with
  // tools disabled so the model summarizes instead of requesting more tools.
  const reason = limitHit ? "tool_step_limit" : "iteration_limit";
  working.push({
    role: "user",
    content:
      "已达到工具调用上限。请不要再调用任何工具，直接根据目前已获得的信息，用纯 HTML 给出最终答案。",
  });
  const finalResponse = await callModel({ messages: working, tools: null });
  yield finalEvent(finalResponse, model, toolSteps, true, reason);
}

// Governance defaults (V2.2): every tool run is bounded in time and its result
// is size-capped before being fed back into model context, so one runaway tool
// can neither hang the loop nor blow the context window.
const DEFAULT_TOOL_TIMEOUT_MS = 20000;
const DEFAULT_MAX_RESULT_CHARS = 6000;

function withTimeout(promise, ms, toolName) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`工具 ${toolName} 执行超时（${ms}ms），已中止。`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function truncateToolResult(raw, maxChars) {
  const text = String(raw ?? "");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…[工具结果过长，已截断]`;
}

function finalEvent(response, fallbackModel, toolSteps, truncated, truncatedReason) {
  return {
    type: "final",
    content: response?.content || "",
    usage: response?.usage || null,
    finishReason: response?.finishReason || "stop",
    model: response?.model || fallbackModel,
    toolSteps,
    stepCount: toolSteps.length,
    truncated,
    truncatedReason,
  };
}

function parseToolArgs(raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { _raw: raw };
  }
}

function toolResultMessage(call, toolName, content) {
  return {
    role: "tool",
    tool_call_id: call?.id || `${toolName}-${Date.now()}`,
    name: toolName,
    content: String(content ?? ""),
  };
}
