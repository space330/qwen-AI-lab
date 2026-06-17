const taskTypes = {
  generalQa: "general_qa",
  documentSummary: "document_summary",
  comparison: "comparison",
  stepByStep: "step_by_step",
  dataAnalysis: "data_analysis",
  decisionSupport: "decision_support",
};

const chartTypes = {
  line: "line",
  bar: "bar",
  pie: "pie",
  scatter: "scatter",
  table: "table",
  none: "none",
};

export function planAnswer({ mode = "chat", input = "", file = null }) {
  const text = `${mode} ${input} ${file?.name || ""} ${file?.type || ""}`.toLowerCase();
  const taskType = detectTaskType({ text, mode, file });
  // Chat mode is tightened (V2.0): plain conversational answers never carry
  // charts. Charts remain available for document / csv / agent modes.
  const chartType = mode === "chat" ? chartTypes.none : detectChartType({ text, taskType, file });
  const shouldUseChart = chartType !== chartTypes.none;
  const responseFormat = detectResponseFormat(taskType);

  return {
    task_type: taskType,
    should_use_chart: shouldUseChart,
    chart_type: chartType,
    response_format: responseFormat,
    sections: buildSections(taskType, shouldUseChart).map((title) => ({
      title,
      text: "",
      data: null,
    })),
  };
}

function detectTaskType({ text, mode, file }) {
  if (mode === "csv" || file?.type === "csv") return taskTypes.dataAnalysis;

  if (hasAny(text, ["步骤", "流程", "操作", "怎么做", "如何", "教程", "step", "process", "workflow", "how to"])) {
    return taskTypes.stepByStep;
  }

  if (hasAny(text, ["决策", "选择", "优先级", "风险", "方案", "建议采用", "取舍", "decision", "risk", "priority", "recommend"])) {
    return taskTypes.decisionSupport;
  }

  if (hasAny(text, ["比较", "对比", "差异", "优缺点", "优劣", "vs", "versus", "compare", "comparison"])) {
    return taskTypes.comparison;
  }

  if (mode === "document" || file?.type === "txt" || file?.type === "md") {
    return taskTypes.documentSummary;
  }

  if (hasAny(text, ["csv", "表格", "数据", "字段", "均值", "趋势", "相关性", "统计", "data", "table", "trend", "correlation", "dataset"])) {
    return taskTypes.dataAnalysis;
  }

  if (hasAny(text, ["总结", "摘要", "归纳", "提炼", "summary", "summarize", "document"])) {
    return taskTypes.documentSummary;
  }

  return taskTypes.generalQa;
}

function detectChartType({ text, taskType, file }) {
  const structuredData = file?.type === "csv" || hasAny(text, ["csv", "表格", "数据", "dataset", "table"]);
  const chartRelevant =
    structuredData ||
    hasAny(text, [
      "趋势",
      "变化",
      "对比",
      "比较",
      "占比",
      "比例",
      "排名",
      "结构化数据",
      "可视化",
      "图表",
      "散点",
      "相关",
      "相关性",
      "trend",
      "compare",
      "share",
      "rank",
      "chart",
      "visual",
      "scatter",
      "correlation",
    ]);

  if (!chartRelevant) return chartTypes.none;
  if (hasAny(text, ["趋势", "变化", "走势", "时间序列", "line", "trend", "time series"])) return chartTypes.line;
  if (hasAny(text, ["占比", "比例", "份额", "构成", "pie", "share", "percentage"])) return chartTypes.pie;
  if (hasAny(text, ["散点", "相关性", "scatter", "correlation"])) return chartTypes.scatter;
  if (hasAny(text, ["排名", "排行", "类别对比", "柱状", "bar", "rank", "category"])) return chartTypes.bar;
  if (taskType === taskTypes.comparison || taskType === taskTypes.decisionSupport) return chartTypes.table;
  if (structuredData) return chartTypes.table;
  return chartTypes.none;
}

function detectResponseFormat(taskType) {
  if (taskType === taskTypes.stepByStep) return "step";
  if (
    taskType === taskTypes.documentSummary ||
    taskType === taskTypes.comparison ||
    taskType === taskTypes.dataAnalysis ||
    taskType === taskTypes.decisionSupport
  ) {
    return "report";
  }
  return "structured";
}

function buildSections(taskType, shouldUseChart) {
  const sections = {
    [taskTypes.generalQa]: ["核心回答", "原理说明", "补充说明"],
    [taskTypes.documentSummary]: ["核心主题", "主要内容", "关键观点", "结论", "建议"],
    [taskTypes.comparison]: ["对比对象", "核心差异", "优缺点", "适用场景", "结论建议"],
    [taskTypes.stepByStep]: ["目标", "步骤", "注意事项", "建议"],
    [taskTypes.dataAnalysis]: ["数据概览", "关键趋势", "结论", "建议"],
    [taskTypes.decisionSupport]: ["决策目标", "方案对比", "风险分析", "优先级建议", "最终建议"],
  }[taskType] || ["核心回答", "结论"];

  if (!shouldUseChart) return sections;

  if (taskType === taskTypes.dataAnalysis) {
    return ["数据概览", "关键趋势", "图表分析", "结论", "建议"];
  }

  if (taskType === taskTypes.comparison) {
    return ["对比对象", "核心差异", "图表分析", "优缺点", "适用场景", "结论建议"];
  }

  if (taskType === taskTypes.decisionSupport) {
    return ["决策目标", "方案对比", "图表分析", "风险分析", "优先级建议", "最终建议"];
  }

  return sections;
}

function hasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}
