import { parseCsv } from "./utils/fileParser.js";

const modeLabels = {
  chat: "对话模式",
  agent: "Agent模式",
  document: "文档总结",
  csv: "CSV分析",
  settings: "设置",
};

export function buildLocalResult({ mode, text, file }) {
  const now = new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  if (mode === "csv" || file?.type === "csv") {
    return {
      time: now,
      content: buildCsvResult(file),
      toolSteps: [
        { id: "read", label: "CSV 文件读取", status: "done", time: now },
        { id: "analyze", label: "字段与统计分析", status: "done", time: now },
        { id: "format", label: "结构化输出", status: "done", time: now },
      ],
    };
  }

  if (mode === "document" || file?.type === "txt" || file?.type === "md") {
    return {
      time: now,
      content: buildDocumentResult(text || file?.content || ""),
      toolSteps: [
        { id: "read", label: "文本读取", status: "done", time: now },
        { id: "analyze", label: "主题与要点提取", status: "done", time: now },
        { id: "format", label: "总结格式化", status: "done", time: now },
      ],
    };
  }

  if (mode === "agent") {
    return {
      time: now,
      content: buildAgentResult(text),
      toolSteps: [
        { id: "read", label: "任务理解", status: "done", time: now },
        { id: "analyze", label: "执行计划生成", status: "done", time: now },
        { id: "format", label: "结果汇总", status: "done", time: now },
      ],
    };
  }

  return {
    time: now,
    content: buildChatResult(text, modeLabels[mode]),
    toolSteps: [
      { id: "read", label: "输入接收", status: "done", time: now },
      { id: "analyze", label: "本地预览响应", status: "done", time: now },
      { id: "format", label: "回答格式化", status: "done", time: now },
    ],
  };
}

function buildChatResult(text, modeLabel) {
  const topic = text?.trim() || "当前任务";
  return `## ${modeLabel}回复

### 摘要
已收到你的输入：${topic}

### 结构化回答
1. 当前前端已保留统一输出容器。
2. 后续接入 Qwen 后端后，模型回复会替换此处的本地预览内容。
3. 输出区域支持复制、编辑、保存，并会同步到右侧生成结果预览。

### 下一步
接入后端接口后，前端将通过安全 API 调用 Qwen，API Key 不会暴露给浏览器。`;
}

function buildAgentResult(text) {
  const task = text?.trim() || "未输入具体任务";
  return `## Agent 模式结果

### 任务理解
${task}

### 执行计划
1. 识别用户目标和输入类型。
2. 判断是否需要读取文件或分析 CSV。
3. 调用对应工具并记录工具状态。
4. 将结果整理为可复制、可保存、可继续编辑的结构化内容。

### 当前限制
V1 前端阶段仅展示 Agent 工作流状态，不执行危险或复杂自动化操作。`;
}

function buildDocumentResult(content) {
  const clean = content.trim();
  const preview = clean.slice(0, 220) || "暂无文本内容";
  const paragraphs = clean ? clean.split(/\n\s*\n/).filter(Boolean).length : 0;
  const words = clean.replace(/\s/g, "").length;

  return `## 文档结构化总结

### 基本信息
- 段落数量：${paragraphs}
- 字符数量：${words}

### 核心摘要
${preview}${clean.length > 220 ? "..." : ""}

### 关键要点
1. 文档内容已被读取并纳入预览。
2. V1 将优先输出摘要、要点、结论、行动项。
3. 接入 Qwen 后会生成更完整的语义总结。

### 建议
继续补充后端模型接口，并为 txt/md 总结设置固定输出模板。`;
}

function buildCsvResult(file) {
  if (!file?.content) {
    return `## CSV 基础分析

### 错误提示
请先上传 csv 文件后再进行分析。`;
  }

  const parsed = parseCsv(file.content);
  const numericFields = parsed.summary.filter((item) => item.numericCount > 0);
  const missingFields = parsed.summary.filter((item) => item.emptyCount > 0);

  const statLines = parsed.summary
    .slice(0, 6)
    .map((item) => {
      if (!item.numericCount) {
        return `- ${item.header}：非数值字段，有效值 ${item.count} 个，空值 ${item.emptyCount} 个`;
      }
      return `- ${item.header}：最小 ${formatNumber(item.min)}，最大 ${formatNumber(
        item.max,
      )}，平均 ${formatNumber(item.avg)}，空值 ${item.emptyCount} 个`;
    })
    .join("\n");

  return `## CSV 基础分析

### 数据概览
- 文件名称：${file.name}
- 字段数量：${parsed.headers.length}
- 数据行数：${parsed.rows.length}
- 数值字段：${numericFields.length}
- 存在空值字段：${missingFields.length}

### 字段统计
${statLines || "- 暂无可统计字段"}

### 初步结论
1. 当前 CSV 已完成基础结构解析。
2. 数值列可用于后续趋势、均值、极值和异常值分析。
3. 存在空值的字段需要在正式分析前确认处理策略。`;
}

function formatNumber(value) {
  if (value === null || value === undefined) return "-";
  return Number(value).toFixed(2).replace(/\.00$/, "");
}
