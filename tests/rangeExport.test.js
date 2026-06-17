import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStandaloneDocument,
  buildReportTitle,
  EXPORT_STYLES,
  REPORT_BRAND,
} from "../src/utils/exportReport.js";
import { isExportableMessage, collectExportableIds } from "../src/utils/rangeExport.js";

const SAMPLE_CARDS = `<article class="export-card assistant"><header><strong>AI 输出</strong><span>10:00</span></header><div class="export-content"><section><h2>结论</h2><p>示例内容</p></section></div></article>`;

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}
// Count opening tags with a real boundary so e.g. "<head" doesn't match "<header".
function countOpen(doc, tag) {
  return (doc.match(new RegExp(`<${tag}(\\s|>)`, "g")) || []).length;
}
function countClose(doc, tag) {
  return (doc.match(new RegExp(`</${tag}>`, "g")) || []).length;
}

test("standalone document is structurally sound HTML", () => {
  const doc = buildStandaloneDocument({ title: "测试报告", cards: SAMPLE_CARDS });

  assert.ok(doc.startsWith("<!DOCTYPE html>"), "must start with a doctype");
  // each structural tag appears exactly once (open + close)
  for (const tag of ["html", "head", "title", "style", "body", "main"]) {
    assert.equal(countOpen(doc, tag), 1, `expected one <${tag}>`);
    assert.equal(countClose(doc, tag), 1, `expected one </${tag}>`);
  }
  assert.match(doc, /<meta charset="UTF-8"/i);
  assert.match(doc, /<meta name="viewport"/i);
  assert.ok(doc.trimEnd().endsWith("</html>"), "must end with </html>");
});

test("document embeds the provided cards and a title", () => {
  const doc = buildStandaloneDocument({ title: "我的报告", cards: SAMPLE_CARDS });
  assert.ok(doc.includes(SAMPLE_CARDS), "card HTML must be embedded verbatim");
  assert.match(doc, /<title>我的报告<\/title>/);
});

test("title is HTML-escaped to keep the head well-formed", () => {
  const doc = buildStandaloneDocument({ title: '<x> & "y"', cards: "" });
  assert.match(doc, /&lt;x&gt; &amp; &quot;y&quot;/);
  // the raw, unescaped angle bracket must not leak into the title
  assert.equal(count(doc, "<title>"), 1);
  assert.ok(!doc.includes("<title><x>"));
});

test("theme is self-contained and consistent (dark glassmorphism + chart palette)", () => {
  const doc = buildStandaloneDocument({ title: buildReportTitle(), cards: SAMPLE_CARDS });
  // brand + dark theme markers
  assert.ok(doc.includes(REPORT_BRAND), "brand wordmark present");
  assert.match(doc, /--bg-0:\s*#100a14/, "dark base background token present");
  assert.match(doc, /backdrop-filter:\s*blur/, "glassmorphism blur present");
  // chart styles travel with the document so exported charts keep their colors
  for (const cls of ["series-stroke-0", "series-bg-0", "pie-visual", "scatter-stage", "chart-legend"]) {
    assert.ok(EXPORT_STYLES.includes(cls), `EXPORT_STYLES must cover .${cls}`);
    assert.ok(doc.includes(cls), `document style must cover .${cls}`);
  }
  // no external assets (fully offline)
  assert.ok(!/<link\b/i.test(doc), "no external stylesheet links");
  assert.ok(!/<script\b/i.test(doc), "no external scripts");
});

test("empty card set still yields a valid document", () => {
  const doc = buildStandaloneDocument({ cards: "" });
  assert.ok(doc.startsWith("<!DOCTYPE html>"));
  assert.ok(doc.trimEnd().endsWith("</html>"));
  assert.match(doc, /<title>.*<\/title>/);
});

test("isExportableMessage accepts completed user and assistant content", () => {
  assert.equal(isExportableMessage({ id: "u1", role: "user", status: "completed" }), true);
  assert.equal(isExportableMessage({ id: "a1", role: "assistant", status: "completed" }), true);
  // Legacy rows persisted without a status are treated as completed content.
  assert.equal(isExportableMessage({ id: "a2", role: "assistant" }), true);
});

test("isExportableMessage rejects transient and non-content cards", () => {
  assert.equal(isExportableMessage(null), false);
  assert.equal(isExportableMessage({ id: "l", role: "assistant", status: "loading" }), false);
  assert.equal(isExportableMessage({ id: "s", role: "assistant", status: "streaming" }), false);
  assert.equal(isExportableMessage({ id: "e", role: "assistant", type: "error", status: "error" }), false);
  assert.equal(isExportableMessage({ id: "f", role: "assistant", type: "file-notice", status: "completed" }), false);
  assert.equal(isExportableMessage({ id: "x", role: "system", status: "completed" }), false);
});

test("collectExportableIds keeps order and drops non-content rows", () => {
  const messages = [
    { id: "u1", role: "user", status: "completed" },
    { id: "load", role: "assistant", status: "loading" },
    { id: "a1", role: "assistant", status: "completed" },
    { id: "file", role: "assistant", type: "file-notice", status: "completed" },
    { id: "err", role: "assistant", type: "error", status: "error" },
    { id: "a2", role: "assistant", status: "completed" },
  ];
  assert.deepEqual(collectExportableIds(messages), ["u1", "a1", "a2"]);
  assert.deepEqual(collectExportableIds([]), []);
});
