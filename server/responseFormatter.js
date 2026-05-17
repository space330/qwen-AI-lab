import { config } from "./config.js";

const allowedTags = new Set([
  "section",
  "div",
  "h2",
  "h3",
  "p",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);

const allowedAttrs = new Set(["id", "class"]);

export function buildMessages({ mode, input, file, answerPlan }) {
  const systemPrompt = [
    "You are Qwen Agent Lab's answer generator.",
    "Return clean HTML only. Do not output Markdown, code fences, JSON, asterisks, or prose outside HTML.",
    "Answer in Chinese unless the user clearly requests another language.",
    "Use the provided plan as the mandatory answer structure.",
    "Keep the answer concise enough for an interactive UI.",
    "Use at most five sections unless the plan requires more.",
    "Use one short paragraph per section by default.",
    "Tables should contain at most 12 body rows unless the user explicitly asks for all rows.",
    "Every enabled module must be wrapped in <section class=\"section\" id=\"kebab-case-id\">.",
    "Section titles must use <h2> or <h3>.",
    "Paragraph text must use <p>.",
    "Lists must use <ul> or <ol> with <li>.",
    "Data tables must use <table>, <thead>, and <tbody>.",
    "Tables must keep a fixed column order, align data by column, and format numbers as integers or two decimals.",
    "Do not add style, script, iframe, image, link, button, input, markdown tables, or inline event attributes.",
    "Use only these tags: section, div, h2, h3, p, ul, ol, li, table, thead, tbody, tr, th, td.",
    "Use only id and class attributes.",
    "If should_use_chart is true, include exactly one chart placeholder <div id=\"chart1\"></div> in the chart section.",
    "When should_use_chart is true, include a small data table in the same chart section immediately before the chart placeholder.",
    "The chart data table must use <table class=\"chart-data\"> with <thead> and <tbody> so the frontend can extract chart data.",
    "For line/bar charts, the first column must be the category or time label, and following columns must be numeric series.",
    "For pie charts, use two columns: category and value.",
    "For scatter charts, use at least x and y numeric columns.",
    "For table charts, use a normal <table class=\"chart-data\"> with the final display data.",
    "AI does not generate chart code. Provide chart explanation in <p>; the frontend renders the chart from the placeholder and section context.",
    "A chart must support the written conclusion and must not replace it.",
    "If should_use_chart is false or chart_type is none, do not include any chart placeholder.",
    "If the uploaded file is unrelated to the user's new question, ignore it and focus on the new question.",
  ].join("\n");

  const fileBlock = file?.content
    ? `\n\n[Uploaded file]\nName: ${file.name || "unknown"}\nType: ${file.type || "unknown"}\nContent:\n${trimFileContent(file.content)}`
    : "";

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [
        `Mode: ${mode || "chat"}`,
        `Plan: ${JSON.stringify(answerPlan || {}, null, 2)}`,
        `User input: ${input || ""}${fileBlock}`,
      ].join("\n"),
    },
  ];
}

function trimFileContent(content) {
  const text = String(content || "");
  if (text.length <= config.qwenFileCharLimit) return text;
  return `${text.slice(0, config.qwenFileCharLimit)}\n\n[File content truncated to ${config.qwenFileCharLimit} characters for response speed.]`;
}

export function formatSuccess({
  requestId,
  mode,
  model,
  content,
  usage,
  finishReason,
  fileContext = null,
  answerPlan = null,
}) {
  const html = sanitizeHtml(stripCodeFence(content || ""));

  return {
    success: true,
    requestId,
    status: "completed",
    data: {
      mode,
      model,
      content: html,
      html,
      rawContent: content,
      taskType: answerPlan?.task_type || null,
      shouldUseChart: answerPlan?.should_use_chart || false,
      chartType: answerPlan?.chart_type || "none",
      responseFormat: answerPlan?.response_format || "html",
      sections: extractHtmlSections(html, answerPlan),
      chartSpec: extractChartPlaceholder(html, answerPlan),
      toolCalls: [],
      usage,
      finishReason,
      fileContext,
      answerPlan,
      exportable: true,
      createdAt: new Date().toISOString(),
    },
    error: null,
  };
}

function stripCodeFence(value) {
  return String(value)
    .replace(/^```html\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function sanitizeHtml(html) {
  let output = String(html || "");

  output = output.replace(/<!--[\s\S]*?-->/g, "");
  output = output.replace(/<(script|style|iframe|object|embed|link|meta|img|button|input|textarea|select)[\s\S]*?<\/\1>/gi, "");
  output = output.replace(/<\/?(script|style|iframe|object|embed|link|meta|img|button|input|textarea|select)[^>]*>/gi, "");

  output = output.replace(/<\/?([a-zA-Z0-9-]+)([^>]*)>/g, (match, rawTag, rawAttrs = "") => {
    const tag = rawTag.toLowerCase();
    const closing = match.startsWith("</");
    if (!allowedTags.has(tag)) return "";
    if (closing) return `</${tag}>`;

    const attrs = [];
    rawAttrs.replace(/\s+([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g, (_attrMatch, name, _raw, v1, v2, v3) => {
      const attrName = name.toLowerCase();
      if (!allowedAttrs.has(attrName)) return "";
      const value = escapeAttr(v1 ?? v2 ?? v3 ?? "");
      if (attrName === "id" && !/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)) return "";
      if (attrName === "class" && !/^[A-Za-z0-9_ -]+$/.test(value)) return "";
      attrs.push(`${attrName}="${value}"`);
      return "";
    });

    return `<${tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}>`;
  });

  return output.trim();
}

function extractHtmlSections(html, answerPlan) {
  const sections = [];
  const sectionPattern = /<section\b([^>]*)>([\s\S]*?)<\/section>/gi;
  let match;

  while ((match = sectionPattern.exec(html))) {
    const attrs = match[1] || "";
    const body = match[2] || "";
    const id = getAttr(attrs, "id");
    const title = getFirstTagText(body, "h2") || getFirstTagText(body, "h3") || id || "section";
    const text = stripTags(body).replace(/\s+/g, " ").trim();
    sections.push({
      id,
      title,
      text,
      html: `<section${attrs}>${body}</section>`,
      data: null,
    });
  }

  if (sections.length) return sections;

  return (answerPlan?.sections || []).map((section) => ({
    id: slugify(section.title),
    title: section.title,
    text: "",
    html: "",
    data: null,
  }));
}

function extractChartPlaceholder(html, answerPlan) {
  const match = html.match(/<div\b[^>]*\bid="(chart[0-9]+)"[^>]*><\/div>/i);
  if (!match) return null;
  const section = extractHtmlSections(html, answerPlan).find((item) => item.html.includes(match[0]));
  const tableData = section ? extractChartDataTable(section.html) : null;
  return {
    containerId: match[1],
    chartType: answerPlan?.chart_type || "none",
    title: section?.title || "图表分析",
    description: section?.text || "",
    data: tableData,
  };
}

function extractChartDataTable(html) {
  const chartTablePattern = /<table\b([^>]*)>([\s\S]*?)<\/table>/gi;
  let match;

  while ((match = chartTablePattern.exec(html))) {
    if (hasClass(match[1] || "", "chart-data")) {
      return extractTableData(match[2] || "");
    }
  }

  return null;
}

function extractFirstTable(html) {
  const tableMatch = html.match(/<table\b[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return null;

  return extractTableData(tableMatch[1]);
}

function extractTableData(tableHtml) {
  const headerRows = [...tableHtml.matchAll(/<thead\b[^>]*>([\s\S]*?)<\/thead>/gi)];
  const bodyRows = [...tableHtml.matchAll(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/gi)];
  const headerHtml = headerRows[0]?.[1] || "";
  const bodyHtml = bodyRows[0]?.[1] || tableHtml;
  const headers = extractCells(headerHtml, "th");
  const rows = [...bodyHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((rowMatch) => extractCells(rowMatch[1], "td"))
    .filter((row) => row.length);

  if (!headers.length || !rows.length) return null;

  return rows.map((row) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = parseCellValue(row[index] ?? "");
    });
    return item;
  });
}

function hasClass(attrs, className) {
  const match = String(attrs || "").match(/\bclass="([^"]*)"/i);
  if (!match) return false;
  return match[1].split(/\s+/).includes(className);
}

function extractCells(html, tagName) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi"))]
    .map((match) => stripTags(match[1]).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function parseCellValue(value) {
  const text = String(value).trim();
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return text;
}

function getAttr(attrs, name) {
  const match = attrs.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match ? match[1] : "";
}

function getFirstTagText(html, tag) {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripTags(match[1]).trim() : "";
}

function stripTags(value) {
  return String(value).replace(/<[^>]+>/g, " ");
}

function slugify(value) {
  return String(value || "section")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
