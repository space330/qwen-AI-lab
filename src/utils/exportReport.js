// ============================================================================
// Standalone themed report packaging (V2.1 export).
//
// Pure functions (no DOM) so the output can be unit-tested. `buildStandalone
// Document` wraps already-rendered card HTML into a fully self-contained HTML
// file carrying its own "Lysandra" dark glassmorphism theme — including the
// answer-HTML and chart (SVG/CSS) styles — so the exported file renders the
// same dark glowing glass cards offline, with no external assets.
// ============================================================================

export const REPORT_BRAND = "Lysandra";

export function buildReportTitle(now = new Date()) {
  const stamp = now
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
  return `Qwen Agent Lab 导出 · ${stamp}`;
}

export function buildStandaloneDocument({ title, cards = "", generatedAt = new Date() } = {}) {
  const safeTitle = escapeHtml(title || buildReportTitle(generatedAt));
  const stamp = escapeHtml(
    generatedAt.toLocaleString("zh-CN", { hour12: false }),
  );
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${safeTitle}</title>
<style>
${EXPORT_STYLES}
</style>
</head>
<body>
<main class="export-report">
<header class="export-report-head">
<span class="export-brand">${REPORT_BRAND}</span>
<h1>${safeTitle}</h1>
<p class="export-meta">由 Qwen Agent Lab 导出 · ${stamp}</p>
</header>
<section class="export-cards">
${cards}
</section>
<footer class="export-report-foot">本报告为离线快照，样式已内嵌，可独立查看或打印为 PDF。</footer>
</main>
</body>
</html>`;
}

// Self-contained dark glassmorphism theme + answer/chart styles. Mirrors the
// Lysandra series palette so exported charts keep their colors offline.
export const EXPORT_STYLES = `
:root {
  --bg-0: #100a14; --bg-1: #1a1320; --ink-0: #f4ecff; --ink-1: #c8bcd8; --ink-2: #9a8fae;
  --accent: #e89b3c; --accent-2: #b06bd0;
  --glass: rgba(38, 28, 48, 0.55); --glass-edge: rgba(255,255,255,0.10);
  --glass-glow: 0 0 0 1px rgba(255,255,255,0.05), 0 18px 48px rgba(0,0,0,0.45), 0 0 40px rgba(176,107,208,0.10);
  --series-0:#e27a10; --series-1:#f0b33e; --series-2:#7c9f54; --series-3:#4e8d9f; --series-4:#a46bb0;
  --line: rgba(200,188,216,0.22);
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 32px 18px; min-height: 100%;
  font-family: "Microsoft YaHei UI", "Segoe UI", Arial, sans-serif; color: var(--ink-0);
  background:
    radial-gradient(circle at 12% 8%, rgba(176,107,208,0.20), transparent 38%),
    radial-gradient(circle at 88% 92%, rgba(232,155,60,0.16), transparent 40%),
    linear-gradient(160deg, var(--bg-1), var(--bg-0));
  background-attachment: fixed;
}
.export-report { max-width: 920px; margin: 0 auto; }
.export-report-head { margin-bottom: 26px; }
.export-brand {
  display: inline-block; font-weight: 900; letter-spacing: 0.5px; font-size: 15px;
  color: var(--accent); text-shadow: 0 0 14px rgba(232,155,60,0.45);
}
.export-report-head h1 { margin: 8px 0 4px; font-size: 24px; color: var(--ink-0); }
.export-meta { margin: 0; color: var(--ink-2); font-size: 13px; }
.export-card {
  margin: 18px 0; padding: 20px 22px; border-radius: 20px;
  background: var(--glass); border: 1px solid var(--glass-edge);
  box-shadow: var(--glass-glow); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  break-inside: avoid;
}
.export-card.user { border-left: 3px solid rgba(232,155,60,0.5); }
.export-card.assistant { border-left: 3px solid rgba(176,107,208,0.5); }
.export-card > header { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.export-card > header strong { color: var(--accent); font-weight: 800; }
.export-card > header span { color: var(--ink-2); font-size: 12px; }
.export-content { line-height: 1.75; color: var(--ink-0); white-space: pre-wrap; }
.export-content .section, .export-content section { margin: 0 0 16px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
.export-content section:last-child { border-bottom: 0; }
.export-content h2, .export-content h3 { margin: 0 0 8px; color: #f3c98a; }
.export-content p { margin: 0 0 8px; }
.export-content ul, .export-content ol { margin: 0 0 8px 22px; }
.export-content table { width: 100%; margin: 10px 0; border-collapse: collapse; font-size: 14px; }
.export-content th, .export-content td { padding: 8px 10px; border: 1px solid var(--line); text-align: left; }
.export-content th { background: rgba(176,107,208,0.18); color: #f0e3ff; }
/* charts */
.html-chart { margin: 14px 0; }
.chart-empty { display: grid; place-items: center; min-height: 80px; color: var(--ink-2); }
.chart-svg { width: 100%; height: auto; min-height: 200px; }
.chart-grid { stroke: rgba(200,188,216,0.14); stroke-width: 1; }
.chart-axis-line { stroke: rgba(200,188,216,0.4); stroke-width: 1.4; }
.chart-label { fill: var(--ink-2); font-size: 12px; }
.series-stroke-0,.series-stroke-1,.series-stroke-2,.series-stroke-3,.series-stroke-4 { fill: none; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
.series-stroke-0{stroke:var(--series-0)}.series-stroke-1{stroke:var(--series-1)}.series-stroke-2{stroke:var(--series-2)}.series-stroke-3{stroke:var(--series-3)}.series-stroke-4{stroke:var(--series-4)}
.series-fill-0{fill:var(--series-0)}.series-fill-1{fill:var(--series-1)}.series-fill-2{fill:var(--series-2)}.series-fill-3{fill:var(--series-3)}.series-fill-4{fill:var(--series-4)}
.chart-legend { display: flex; flex-wrap: wrap; gap: 8px 14px; margin-top: 8px; color: var(--ink-1); font-size: 13px; }
.chart-legend span { display: inline-flex; align-items: center; gap: 6px; }
.chart-legend i { width: 10px; height: 10px; border-radius: 999px; }
.legend-color-0{background:var(--series-0)}.legend-color-1{background:var(--series-1)}.legend-color-2{background:var(--series-2)}.legend-color-3{background:var(--series-3)}.legend-color-4{background:var(--series-4)}
.bar-chart { display: grid; gap: 12px; }
.bar-group { display: grid; grid-template-columns: 100px minmax(0,1fr); gap: 12px; align-items: start; }
.bar-group > strong { color: #f3c98a; font-size: 13px; }
.bar-series { display: grid; grid-template-columns: 64px minmax(0,1fr) 56px; align-items: center; gap: 9px; }
.bar-series em { color: var(--ink-2); font-style: normal; font-size: 12px; }
.bar-series b { color: var(--ink-0); font-size: 13px; text-align: right; }
.bar-track { height: 16px; border-radius: 999px; overflow: hidden; background: rgba(200,188,216,0.14); }
.bar-track i { display: block; height: 100%; }
.series-bg-0{background:linear-gradient(90deg,#e27a10,#f0b33e)}.series-bg-1{background:linear-gradient(90deg,#6e9444,#a9c36c)}.series-bg-2{background:linear-gradient(90deg,#387e94,#76b6c8)}.series-bg-3{background:linear-gradient(90deg,#89519a,#c08dcc)}.series-bg-4{background:linear-gradient(90deg,#c54843,#ee8f81)}
.pie-chart { display: grid; grid-template-columns: 150px minmax(0,1fr); gap: 18px; align-items: center; }
.pie-visual { width: 140px; aspect-ratio: 1; border-radius: 50%; border: 8px solid rgba(255,255,255,0.08); }
.pie-legend { display: grid; gap: 8px; }
.pie-legend div { display: grid; grid-template-columns: 14px minmax(0,1fr) 56px; align-items: center; gap: 8px; }
.pie-legend i { width: 12px; height: 12px; border-radius: 3px; }
.scatter-stage { position: relative; height: 220px; border-left: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.scatter-stage i { position: absolute; width: 11px; height: 11px; border-radius: 50%; background: var(--series-0); border: 2px solid rgba(255,255,255,0.7); transform: translate(-50%,-50%); }
.scatter-labels { display: flex; justify-content: space-between; margin-top: 8px; color: var(--ink-2); font-size: 12px; }
.table-chart table { width: 100%; border-collapse: collapse; }
.tool-steps { margin: 0 0 12px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: rgba(0,0,0,0.2); }
.tool-steps-head { color: var(--ink-1); font-weight: 700; font-size: 13px; margin-bottom: 6px; }
.tool-step { list-style: none; margin: 6px 0; color: var(--ink-1); font-size: 13px; }
.export-report-foot { margin-top: 26px; color: var(--ink-2); font-size: 12px; text-align: center; }
@media print {
  body { background: #fff; color: #1a1320; }
  .export-card { break-inside: avoid; background: #fff; box-shadow: none; border: 1px solid #ddd; }
  .export-content, .export-card > header strong, .export-report-head h1 { color: #1a1320; }
}
`;

export function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
