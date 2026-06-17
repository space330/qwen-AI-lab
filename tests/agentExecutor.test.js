import test from "node:test";
import assert from "node:assert/strict";
import { runAgent } from "../server/agentExecutor.js";

function toolCall(name, args, id = "call-1") {
  return { id, function: { name, arguments: JSON.stringify(args) } };
}

async function collect(generator) {
  const events = [];
  for await (const event of generator) events.push(event);
  return events;
}

test("runs one tool call then yields the final answer", async () => {
  let turn = 0;
  const callModel = async ({ tools }) => {
    turn += 1;
    if (turn === 1) {
      assert.ok(Array.isArray(tools), "first turn should be offered tools");
      const calls = [toolCall("calculator", { expression: "2 + 3" })];
      return { toolCalls: calls, message: { role: "assistant", content: null, tool_calls: calls }, content: "", finishReason: "tool_calls", model: "test" };
    }
    return { toolCalls: [], content: "<section><h2>结果</h2><p>等于 5</p></section>", finishReason: "stop", model: "test", usage: null };
  };

  const events = await collect(runAgent({ messages: [], model: "test", ctx: {}, callModel, tools: [], maxIterations: 5 }));

  const start = events.find((e) => e.type === "tool_start");
  const result = events.find((e) => e.type === "tool_result");
  const final = events.find((e) => e.type === "final");

  assert.equal(start.tool, "calculator");
  assert.equal(start.step, 1);
  assert.equal(JSON.parse(result.result).result, 5);
  assert.equal(final.content, "<section><h2>结果</h2><p>等于 5</p></section>");
  assert.equal(final.truncated, false);
  assert.equal(turn, 2);
});

test("truncates with a forced final answer when max iterations is reached", async () => {
  let toolTurns = 0;
  const callModel = async ({ tools }) => {
    if (tools === null) {
      // Forced final call after the cap.
      return { toolCalls: [], content: "<section><p>已达上限的总结</p></section>", finishReason: "stop", model: "test" };
    }
    toolTurns += 1;
    const calls = [toolCall("calculator", { expression: "1 + 1" }, `call-${toolTurns}`)];
    return { toolCalls: calls, message: { role: "assistant", content: null, tool_calls: calls }, content: "", finishReason: "tool_calls", model: "test" };
  };

  const events = await collect(runAgent({ messages: [], model: "test", ctx: {}, callModel, tools: [], maxIterations: 2 }));

  const toolResults = events.filter((e) => e.type === "tool_result");
  const final = events.find((e) => e.type === "final");

  assert.equal(toolResults.length, 2, "should execute exactly maxIterations tool rounds");
  assert.equal(final.truncated, true);
  assert.match(final.content, /已达上限的总结/);
});

test("emits tool_error when a tool throws and still finishes", async () => {
  let turn = 0;
  const callModel = async () => {
    turn += 1;
    if (turn === 1) {
      const calls = [toolCall("calculator", { expression: "1 / 0" })];
      return { toolCalls: calls, message: { role: "assistant", content: null, tool_calls: calls }, content: "", finishReason: "tool_calls", model: "test" };
    }
    return { toolCalls: [], content: "<section><p>已恢复</p></section>", finishReason: "stop", model: "test" };
  };

  const events = await collect(runAgent({ messages: [], model: "test", ctx: {}, callModel, tools: [], maxIterations: 5 }));

  const toolError = events.find((e) => e.type === "tool_error");
  const final = events.find((e) => e.type === "final");

  assert.equal(toolError.tool, "calculator");
  assert.match(toolError.error, /除数为零/);
  assert.match(final.content, /已恢复/);
});

test("unknown tool yields a tool_error rather than crashing", async () => {
  let turn = 0;
  const callModel = async () => {
    turn += 1;
    if (turn === 1) {
      const calls = [toolCall("does_not_exist", {})];
      return { toolCalls: calls, message: { role: "assistant", content: null, tool_calls: calls }, content: "", finishReason: "tool_calls", model: "test" };
    }
    return { toolCalls: [], content: "<section><p>ok</p></section>", finishReason: "stop", model: "test" };
  };

  const events = await collect(runAgent({ messages: [], model: "test", ctx: {}, callModel, tools: [], maxIterations: 5 }));
  const toolError = events.find((e) => e.type === "tool_error");
  assert.match(toolError.error, /未知工具/);
});

test("final event carries the complete unified toolSteps contract", async () => {
  let turn = 0;
  const callModel = async () => {
    turn += 1;
    if (turn === 1) {
      const calls = [toolCall("calculator", { expression: "6 * 7" })];
      return { toolCalls: calls, message: { role: "assistant", content: null, tool_calls: calls }, content: "", finishReason: "tool_calls", model: "test" };
    }
    return { toolCalls: [], content: "<section><p>42</p></section>", finishReason: "stop", model: "test" };
  };

  const events = await collect(runAgent({ messages: [], model: "test", ctx: {}, callModel, tools: [], maxIterations: 5 }));
  const final = events.find((e) => e.type === "final");

  assert.equal(final.stepCount, 1);
  assert.equal(final.toolSteps.length, 1);
  const [s] = final.toolSteps;
  assert.deepEqual(Object.keys(s).sort(), ["args", "category", "durationMs", "error", "result", "status", "step", "tool"]);
  assert.equal(s.step, 1);
  assert.equal(s.tool, "calculator");
  assert.equal(s.category, "analysis");
  assert.equal(s.status, "completed");
  assert.equal(s.error, null);
  assert.equal(JSON.parse(s.result).result, 42);
  assert.equal(typeof s.durationMs, "number");
});

test("executes multiple tool calls returned in a single model turn", async () => {
  let turn = 0;
  const callModel = async () => {
    turn += 1;
    if (turn === 1) {
      const calls = [
        toolCall("calculator", { expression: "2 + 2" }, "call-a"),
        toolCall("calculator", { expression: "10 - 3" }, "call-b"),
      ];
      return { toolCalls: calls, message: { role: "assistant", content: null, tool_calls: calls }, content: "", finishReason: "tool_calls", model: "test" };
    }
    return { toolCalls: [], content: "<section><p>done</p></section>", finishReason: "stop", model: "test" };
  };

  const events = await collect(runAgent({ messages: [], model: "test", ctx: {}, callModel, tools: [], maxIterations: 5 }));
  const results = events.filter((e) => e.type === "tool_result");
  const final = events.find((e) => e.type === "final");

  assert.equal(results.length, 2);
  assert.deepEqual(results.map((r) => r.step), [1, 2]);
  assert.equal(final.toolSteps.length, 2);
  assert.equal(final.truncated, false);
});

// --- requiresConfirmation human-in-the-loop gate ---------------------------

// Inject a fake registry so the gate can be tested without adding a product
// tool. `memo_write` is flagged requiresConfirmation.
function confirmableRegistry() {
  let ran = 0;
  const getToolImpl = (name) =>
    name === "memo_write"
      ? {
          name: "memo_write",
          requiresConfirmation: true,
          run: async (args) => {
            ran += 1;
            return JSON.stringify({ saved: args?.text ?? "" });
          },
        }
      : null;
  return { getToolImpl, ranCount: () => ran };
}

function memoThenFinal() {
  let turn = 0;
  const seen = [];
  const callModel = async ({ messages }) => {
    turn += 1;
    seen.push(messages);
    if (turn === 1) {
      const calls = [toolCall("memo_write", { text: "记住：默认中文" })];
      return { toolCalls: calls, message: { role: "assistant", content: null, tool_calls: calls }, content: "", finishReason: "tool_calls", model: "test" };
    }
    return { toolCalls: [], content: "<section><p>ok</p></section>", finishReason: "stop", model: "test" };
  };
  return { callModel, seen };
}

test("requiresConfirmation: approval gates the tool, emitting confirm → start → result", async () => {
  const { getToolImpl, ranCount } = confirmableRegistry();
  const { callModel } = memoThenFinal();
  const confirmTool = async () => ({ approved: true });

  const events = await collect(
    runAgent({ messages: [], model: "test", callModel, tools: [], getToolImpl, confirmTool, maxIterations: 5 }),
  );

  const types = events.filter((e) => e.step === 1).map((e) => e.type);
  assert.deepEqual(types, ["tool_confirm", "tool_start", "tool_result"], "confirm must precede execution");
  assert.equal(ranCount(), 1, "approved tool runs exactly once");
  const final = events.find((e) => e.type === "final");
  assert.equal(final.toolSteps[0].status, "completed");
});

test("requiresConfirmation: denial skips execution and feeds the refusal back", async () => {
  const { getToolImpl, ranCount } = confirmableRegistry();
  const { callModel, seen } = memoThenFinal();
  const confirmTool = async () => ({ approved: false, reason: "denied" });

  const events = await collect(
    runAgent({ messages: [], model: "test", callModel, tools: [], getToolImpl, confirmTool, maxIterations: 5 }),
  );

  assert.ok(events.some((e) => e.type === "tool_confirm"), "confirm is announced");
  assert.ok(events.some((e) => e.type === "tool_denied"), "denial is emitted");
  assert.ok(!events.some((e) => e.type === "tool_start"), "denied tool never starts");
  assert.equal(ranCount(), 0, "denied tool does not run");

  const final = events.find((e) => e.type === "final");
  assert.equal(final.toolSteps[0].status, "denied");

  // The model's second turn must see a tool message carrying the refusal so it
  // can adapt instead of silently stalling.
  const toolMsg = seen[1].find((m) => m.role === "tool" && m.name === "memo_write");
  assert.match(toolMsg.content, /DENIED/);
});

test("requiresConfirmation: defaults to auto-approve when no confirmTool is wired", async () => {
  const { getToolImpl, ranCount } = confirmableRegistry();
  const { callModel } = memoThenFinal();

  const events = await collect(
    runAgent({ messages: [], model: "test", callModel, tools: [], getToolImpl, maxIterations: 5 }),
  );

  assert.equal(ranCount(), 1, "without a confirm hook, behavior is unchanged (runs)");
  assert.ok(events.some((e) => e.type === "tool_result"));
});

test("caps total tool steps via maxToolSteps and forces a final answer", async () => {
  const callModel = async ({ tools }) => {
    if (tools === null) {
      return { toolCalls: [], content: "<section><p>已在步骤上限内总结</p></section>", finishReason: "stop", model: "test" };
    }
    // One model turn requests three tools, but the cap is 2.
    const calls = [
      toolCall("calculator", { expression: "1 + 1" }, "c1"),
      toolCall("calculator", { expression: "2 + 2" }, "c2"),
      toolCall("calculator", { expression: "3 + 3" }, "c3"),
    ];
    return { toolCalls: calls, message: { role: "assistant", content: null, tool_calls: calls }, content: "", finishReason: "tool_calls", model: "test" };
  };

  const events = await collect(
    runAgent({ messages: [], model: "test", ctx: {}, callModel, tools: [], maxIterations: 5, maxToolSteps: 2 }),
  );
  const results = events.filter((e) => e.type === "tool_result");
  const final = events.find((e) => e.type === "final");

  assert.equal(results.length, 2, "must not execute more than maxToolSteps tools");
  assert.equal(final.toolSteps.length, 2);
  assert.equal(final.truncated, true);
  assert.equal(final.truncatedReason, "tool_step_limit");
  assert.match(final.content, /步骤上限/);
});
