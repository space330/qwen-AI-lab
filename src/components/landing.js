import {
  CROSS_VENDOR,
  ENGINEERING_CAPABILITIES,
  ENGINEERING_STATS,
  QWEN_MODELS,
  RUN_CONFIG,
  SOURCES,
} from "./landingData.js";

export function renderLanding(state = {}) {
  const model = escapeHtml(state.currentModel || "Qwen");
  const status = escapeHtml(state.apiStatus || "未连接");
  const selectedModel = QWEN_MODELS.find((item) => item.isDefault) || QWEN_MODELS[0];

  return `
    <main class="landing-page" aria-label="Qwen Agent Lab 官网首页">
      <nav class="landing-nav">
        <a class="landing-wordmark" href="/" aria-label="Qwen Agent Lab 首页">Lysandra</a>
        <div class="landing-nav-links">
          <a href="#capabilities">能力</a>
          <a href="#qwen-showcase">Qwen</a>
          <a href="#qwen-leaderboard">对比</a>
          <a href="#output">输出</a>
          <a href="#workflow">流程</a>
        </div>
        <a href="/app" class="landing-nav-cta" data-enter-console data-transition="slide-up">进入控制台</a>
      </nav>

      <section class="landing-hero" data-landing-scene="hero">
        <div class="landing-fluid" aria-hidden="true" data-parallax="0.04" data-parallax-max="80">
          <span class="fluid-blob b1"></span>
          <span class="fluid-blob b2"></span>
          <span class="fluid-blob b3"></span>
          <span class="fluid-blob b4"></span>
        </div>
        <div class="landing-wash" aria-hidden="true"></div>
        <div class="landing-hero-inner">
          <span class="landing-kicker">AI agent lightwork S1.0</span>
          <h1>Qwen <span class="accent">Agent</span> Lab</h1>
          <p>
            面向个人轻办公、文字整理和 CSV 分析的本地控制台。投喂文本、Markdown 或 CSV，
            得到干净、结构化、可复制可编辑的图表级答案。
          </p>
          <div class="landing-hero-actions">
            <a href="/app" class="landing-primary-action" data-enter-console data-transition="zoom-fluid">免费开始使用</a>
            <a href="#qwen-showcase" class="landing-secondary-action">查看 Qwen 能力</a>
          </div>
        </div>
      </section>

      ${renderStatusScene(model, status)}
      ${renderQwenFlagship()}
      ${renderQwenRuntime()}
      ${renderModelBrowser(selectedModel)}
      ${renderQwenLeaderboard()}
      ${renderQwenSources()}
      ${renderCapabilitiesScene()}
      ${renderEngineeringStatsScene()}

      <section class="landing-band" id="output" data-landing-scene="output">
        <div class="landing-output">
          <div data-reveal="left">
            <span>输出规范</span>
            <h2>HTML 模块化回答，前端可以稳定渲染</h2>
            <p>回答以 section、表格、图表占位和结论建议为核心结构，适合复制、保存和继续编辑。</p>
          </div>
          <div class="landing-answer-card" data-reveal="right" data-tilt="6">
            <h4>摘要</h4>
            <p>已完成「月度销售趋势.csv」基础结构解析 —— 4 个字段、12 行数据、3 个数值列。</p>
            <h4>关键发现</h4>
            <ol>
              <li>三个产品全年均呈稳定上升趋势，产品 A 增速最快。</li>
              <li>无空值字段，可直接进入正式分析。</li>
            </ol>
            <h4>下一步</h4>
            <p>可继续做趋势、均值、极值与异常值分析，或导出图表。</p>
          </div>
        </div>
      </section>

      <section class="landing-band landing-workflow" id="workflow" data-landing-scene="workflow">
        <div class="landing-section-head" data-reveal="rise-soft">
          <span>工作流</span>
          <h2>从官网进入控制台，状态不断线</h2>
        </div>
        <ol class="landing-stagger">
          <li data-reveal="up"><strong>了解能力</strong><p>在首页快速确认模型、API 状态和主要功能边界。</p></li>
          <li data-reveal="up"><strong>进入控制台</strong><p>点击入口触发轻量转场，并在同一个应用内打开 /app。</p></li>
          <li data-reveal="up"><strong>继续工作</strong><p>会话、附件和个人偏好继续由 IndexedDB 与后端接口支撑。</p></li>
        </ol>
      </section>

      <section class="landing-band" id="landing-final-cta" data-landing-scene="cta">
        <div class="landing-cta" data-reveal="scale">
          <h2>把分析交给 Lysandra</h2>
          <p>一个干净、温暖的桌面工作台，专为个人自用与轻办公而生。</p>
          <a href="/app" class="landing-primary-action compact" data-enter-console data-transition="zoom-fluid">进入控制台</a>
        </div>
      </section>

      <footer class="landing-footer">
        <span class="landing-wordmark">Lysandra</span>
        <span>Qwen Agent Lab · 基于 Qwen 大模型的数据分析 agent</span>
        <div class="foot-links">
          <a href="#capabilities">能力</a>
          <a href="#qwen-showcase">Qwen</a>
          <a href="#qwen-leaderboard">对比</a>
          <a href="#workflow">流程</a>
        </div>
      </footer>
    </main>
  `;
}

function renderStatusScene(model, status) {
  return `
    <section class="landing-band landing-status-scene" id="landing-status" data-landing-scene="status">
      <dl class="landing-status-strip" data-reveal="fade">
        <div><dt>当前模型</dt><dd>${model}</dd></div>
        <div><dt>API 状态</dt><dd><i></i>${status}</dd></div>
        <div><dt>运行方式</dt><dd>本地后端保密 API Key</dd></div>
      </dl>
    </section>
  `;
}

function renderQwenFlagship() {
  return `
    <section class="landing-band qwen-showcase" id="qwen-showcase" data-landing-scene="qwen-flagship">
      <div class="landing-section-head" data-reveal="rise-soft">
        <span>Qwen 旗舰能力</span>
        <h2>默认接入 ${escapeHtml(CROSS_VENDOR.flagship.label)}，模型能力和来源同屏展示</h2>
      </div>
      <div class="qwen-showcase-grid single">
        <article class="qwen-flagship-card" data-reveal="flip-soft" data-tilt="7">
          <span class="qwen-card-kicker">旗舰模型</span>
          <h3>${escapeHtml(CROSS_VENDOR.flagship.label)}</h3>
          <p>${escapeHtml(CROSS_VENDOR.disclaimer)}</p>
          <div class="qwen-metric-grid">
            ${CROSS_VENDOR.flagship.metrics.map(renderMetric).join("")}
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderQwenRuntime() {
  return `
    <section class="landing-band qwen-runtime" id="qwen-runtime" data-landing-scene="qwen-runtime">
      <div class="landing-section-head" data-reveal="fade">
        <span>运行配置</span>
        <h2>仓库真实运行镜像，展示默认模型、推理参数和 Agent 上限</h2>
      </div>
      <article class="qwen-run-card qwen-run-card-wide" data-reveal="right" data-parallax="0.08" data-parallax-max="90">
        <span class="qwen-card-kicker">真实运行配置</span>
        <h3>后端保密调用，前端只接收结构化结果</h3>
        <dl>${RUN_CONFIG.map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd></div>`).join("")}</dl>
      </article>
    </section>
  `;
}

function renderModelBrowser(selectedModel) {
  return `
    <section class="landing-band qwen-model-browser" id="qwen-model-browser" data-landing-scene="qwen-model-browser">
      <div class="landing-section-head" data-reveal="scale">
        <span>模型浏览器</span>
        <h2>7 个 Qwen 模型按真实白名单展示，可点选查看定位</h2>
      </div>
      <div class="qwen-browser-shell" data-reveal="up">
        <div class="qwen-model-list" aria-label="Qwen 模型列表">
          ${QWEN_MODELS.map(renderModelButton).join("")}
        </div>
        <article class="qwen-model-detail" data-model-detail>
          ${renderModelDetail(selectedModel)}
        </article>
      </div>
    </section>
  `;
}

function renderQwenLeaderboard() {
  return `
    <section class="landing-band qwen-comparison" id="qwen-leaderboard" data-landing-scene="qwen-leaderboard">
      <div class="landing-section-head" data-reveal="rise-soft">
        <span>跨厂商对比</span>
        <h2>只展示带来源和日期的数据，不跨版本归一化</h2>
      </div>
      <div class="qwen-comparison-grid single">
        <article class="qwen-leaderboard" data-reveal="left">
          <h3>${escapeHtml(CROSS_VENDOR.intelligenceIndex.title)}</h3>
          <p>${escapeHtml(CROSS_VENDOR.intelligenceIndex.note)}</p>
          <ol class="landing-stagger">
            ${CROSS_VENDOR.intelligenceIndex.rows.map((row) => `<li><span>${escapeHtml(row.model)}</span><strong>${escapeHtml(row.score)}</strong></li>`).join("")}
          </ol>
        </article>
      </div>
    </section>
  `;
}

function renderQwenSources() {
  return `
    <section class="landing-band qwen-source-scene" id="qwen-comparison" data-landing-scene="qwen-sources">
      <div class="landing-section-head" data-reveal="fade">
        <span>可信来源</span>
        <h2>所有外部数字都保留 source 与 asOf，避免无出处排名</h2>
      </div>
      <aside class="qwen-sources" data-reveal="right">
        <h3>数据来源</h3>
        <ul class="landing-stagger">
          ${SOURCES.map((source) => `<li data-source-id="${escapeHtml(source.id)}"><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)}</a><span>截至 ${escapeHtml(source.asOf)}</span></li>`).join("")}
        </ul>
      </aside>
    </section>
  `;
}

function renderCapabilitiesScene() {
  return `
    <section class="landing-band" id="capabilities" data-landing-scene="capabilities">
      <div class="landing-section-head" data-reveal="rise-soft">
        <span>工程能力</span>
        <h2>一个入口覆盖对话、Agent、文档、CSV、本地持久化和安全边界</h2>
      </div>
      <div class="landing-card-grid landing-stagger">
        ${ENGINEERING_CAPABILITIES.map((item, index) => renderCard(item.title, item.text, index)).join("")}
      </div>
    </section>
  `;
}

function renderEngineeringStatsScene() {
  return `
    <section class="landing-band qwen-stats-scene" id="engineering-stats" data-landing-scene="engineering-stats">
      <div class="landing-section-head" data-reveal="fade">
        <span>工程统计</span>
        <h2>把真实仓库状态展示给用户，而不是只放营销词</h2>
      </div>
      <div class="qwen-engineering-stats" data-reveal="scale">
        ${ENGINEERING_STATS.map(renderStat).join("")}
      </div>
    </section>
  `;
}

function renderMetric(metric) {
  return `
    <div class="qwen-metric">
      <dt>${escapeHtml(metric.name)}</dt>
      <dd>${escapeHtml(metric.value)}</dd>
      <small>${escapeHtml(metric.source)} · ${escapeHtml(metric.asOf)}</small>
    </div>
  `;
}

function renderModelButton(model) {
  return `
    <button
      class="qwen-model-chip${model.isDefault ? " active" : ""}"
      type="button"
      data-model="${escapeHtml(model.id)}"
      data-model-label="${escapeHtml(model.label)}"
      data-model-speed="${escapeHtml(model.speed)}"
      data-model-note="${escapeHtml(model.note)}"
      data-model-default="${model.isDefault ? "true" : "false"}"
    >
      <span>${escapeHtml(model.label)}</span>
      <em>${escapeHtml(model.speed)}</em>
    </button>
  `;
}

function renderModelDetail(model) {
  if (!model) return "";
  return `
    <h3>${escapeHtml(model.label)}</h3>
    <dl>
      <div><dt>模型 ID</dt><dd>${escapeHtml(model.id)}</dd></div>
      <div><dt>响应速度</dt><dd>${escapeHtml(model.speed)}</dd></div>
      <div><dt>定位说明</dt><dd>${escapeHtml(model.note)}</dd></div>
    </dl>
  `;
}

function renderStat(stat) {
  return `<div><strong data-counter="${escapeHtml(stat.value)}">0</strong><span>${escapeHtml(stat.label)}${escapeHtml(stat.suffix || "")}</span></div>`;
}

function renderCard(title, text, index = 0) {
  const reveal = index % 3 === 0 ? "up" : index % 3 === 1 ? "scale" : "fade";
  return `
    <article class="landing-card" data-reveal="${reveal}" data-tilt="5">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
