# Qwen Agent Lab · ReAct Agent 控制流解析

> 源文件：`server/agentExecutor.js`（async generator）
> 关键参数：`maxIterations = 5`、`maxToolSteps = 8`
> 内置工具：`calculator` · `file_reader` · `web_search`
> 事件：`tool_start` · `tool_result` · `tool_error` · `final`（经 NDJSON 实时下发到前端「工具链时光轴」）

---

## 1. 控制流程图（Flowchart）

```mermaid
flowchart TD
    START(["▶ runAgent · step=0 · toolSteps=[] · limitHit=false"]) --> D0{"iteration &lt; 5 ?"}

    D0 -- "否 · 迭代用尽" --> PREP
    D0 -- "是" --> CALL["Reason · callModel(working, tools)<br/>→ response { toolCalls, message }"]

    CALL --> D1{"toolCalls &gt; 0 ?"}
    D1 -- "否 · 模型给出答案" --> FNAT(["■ FINAL · truncated = false"])
    D1 -- "是" --> ECHO["回填 assistant 消息(携带 tool_calls)"]

    ECHO --> D2{"step ≥ 8 ?<br/>(maxToolSteps)"}
    D2 -- "是" --> LIM["limitHit = true<br/>push ERROR(未执行) · break"]
    LIM --> PREP
    D2 -- "否" --> STEP["Act · step++ · emit tool_start<br/>tool = getTool(name)"]

    STEP --> D3{"tool 存在 ?"}
    D3 -- "否" --> UNK["emit tool_error: 未知工具<br/>push ERROR"]
    D3 -- "是" --> D4{"tool.run(args, ctx) 成功 ?"}

    D4 -- "是" --> OK["completed · emit tool_result<br/>push(result) · durationMs"]
    D4 -- "否" --> ERR["status=error · emit tool_error<br/>push ERROR · 可恢复"]

    OK  -. "↻ Observe · 回填结果，下一轮" .-> D0
    ERR -. "↻ 回填错误，模型重试" .-> D0
    UNK -. "↻ 回填，继续" .-> D0

    PREP["reason = limitHit ? tool_step_limit : iteration_limit<br/>push「停止调用工具」· callModel(tools = null)"] --> FF(["■ FINAL · truncated = true"])
```

---

## 2. 状态机视图（State Diagram）

```mermaid
stateDiagram-v2
    [*] --> Reason
    Reason: 模型思考 callModel(tools)
    Dispatch: 派发工具调用
    Acting: 执行工具 run(args,ctx)
    Forced: 强制收束 callModel(tools=null)

    Reason --> Done : 无 tool_calls (truncated=false)
    Reason --> Forced : iteration ≥ 5 (iteration_limit)
    Reason --> Dispatch : 有 tool_calls

    Dispatch --> Forced : step ≥ 8 (tool_step_limit · break)
    Dispatch --> Acting : 步数未超限

    Acting --> Reason : 回填结果(成功/错误/未知) ↻
    Forced --> Done : truncated=true
    Done --> [*]
```

---

## 3. 请求时序（Agent 模式 · Sequence）

```mermaid
sequenceDiagram
    participant FE as 前端(时光轴)
    participant API as Express /chat/stream
    participant AG as agentExecutor
    participant T as tools.js
    participant Q as Qwen DashScope

    FE->>API: POST mode=agent (NDJSON)
    API->>AG: runAgent({messages, tools})
    loop 每轮 (≤5)
        AG->>Q: callModel(working, tools)
        Q-->>AG: response { toolCalls }
        alt 有 tool_calls
            loop 每个工具 (累计 ≤8)
                AG-->>FE: tool_start
                AG->>T: tool.run(args, ctx)
                T-->>AG: result / throw
                AG-->>FE: tool_result / tool_error
                Note over AG: 结果作为 role:"tool" 回填 working
            end
        else 无 tool_calls
            AG-->>FE: final (truncated=false)
        end
    end
    Note over AG,Q: 超限 → callModel(tools=null)
    AG-->>FE: final (truncated=true)
```

---

## 4. 三种终止条件

| 路径 | 触发条件 | `truncated` | `truncatedReason` |
|------|----------|-------------|-------------------|
| 自然结束 | 模型本轮不再请求工具 | `false` | `null` |
| 迭代上限 | 主循环跑满 `maxIterations` (5) 仍未收束 | `true` | `iteration_limit` |
| 步骤上限 | 累计工具执行 ≥ `maxToolSteps` (8) | `true` | `tool_step_limit` |

## 5. 统一 tool-step 契约

流事件、最终响应、前端 state、IndexedDB 四处共用同一形状：

```js
{ step, tool, status: "running" | "completed" | "error",
  args, result, error, durationMs }
```

## 6. 设计要点

- **协议回填**：先 `push` 带 `tool_calls` 的 assistant 消息，再按序追加每个 `role:"tool"` 结果，符合 OpenAI 函数调用协议。
- **错误不崩溃**：未知工具与执行抛错都转成 `ERROR:` 文本回填，模型可据此换策略恢复，而非中断整条链。
- **双重限流**：`iteration`（轮）与 `toolSteps`（总步数）各自封顶；任一超限即追加「停止调用工具」指令并以 `tools=null` 强制产出最终答案，杜绝死循环。
- **可测试性**：`callModel` 由调用方注入，executor 与传输层 / 模型厂商解耦，单测可用 Mock 驱动（见 `tests/agentExecutor.test.js`）。
