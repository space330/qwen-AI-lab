export function renderLanding(state = {}) {
  const model = escapeHtml(state.currentModel || "Qwen");
  const status = escapeHtml(state.apiStatus || "未连接");
  return `
    <main class="landing-page" aria-label="Qwen Agent Lab 官网首页">
      <nav class="landing-nav">
        <a class="landing-wordmark" href="/" aria-label="Qwen Agent Lab 首页">Lysandra</a>
        <div class="landing-nav-links">
          <a href="#modes">能力</a>
          <a href="#output">输出</a>
          <a href="#workflow">流程</a>
        </div>
        <a href="/app" class="landing-nav-cta" data-enter-console>进入控制台</a>
      </nav>

      <section class="landing-hero">
        <div class="landing-fluid" aria-hidden="true">
          <span class="fluid-blob b1"></span>
          <span class="fluid-blob b2"></span>
          <span class="fluid-blob b3"></span>
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
            <a href="/app" class="landing-primary-action" data-enter-console>免费开始使用</a>
            <a href="#workflow" class="landing-secondary-action">查看工作流</a>
          </div>
          <dl class="landing-status-strip">
            <div><dt>当前模型</dt><dd>${model}</dd></div>
            <div><dt>API 状态</dt><dd><i></i>${status}</dd></div>
            <div><dt>运行方式</dt><dd>本地后端保密 API Key</dd></div>
          </dl>
        </div>
      </section>

      <section class="landing-band" id="modes">
        <div class="landing-section-head" data-reveal="up">
          <span>核心能力</span>
          <h2>一个入口覆盖对话、Agent、文档与 CSV</h2>
        </div>
        <div class="landing-card-grid">
          ${renderCard("对话模式", "支持连续追问、结构化 HTML 输出和可复制结果。")}
          ${renderCard("Agent 模式", "区分 chat 与 agent，展示真实 toolSteps 工具调用链。")}
          ${renderCard("文档总结", "上传 txt / md 后生成主题、要点、结论和建议。")}
          ${renderCard("CSV 分析", "确定性解析 CSV，并让图表区包含数据表和 chartSpec.data。")}
        </div>
      </section>

      <section class="landing-band" id="output">
        <div class="landing-output">
          <div data-reveal="left">
            <span>输出规范</span>
            <h2>HTML 模块化回答，前端可以稳定渲染</h2>
            <p>回答以 section、表格、图表占位和结论建议为核心结构，适合复制、保存和继续编辑。</p>
          </div>
          <div class="landing-answer-card" data-reveal="right">
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

      <section class="landing-band landing-workflow" id="workflow">
        <div class="landing-section-head" data-reveal="up">
          <span>工作流</span>
          <h2>从官网进入控制台，状态不断线</h2>
        </div>
        <ol>
          <li data-reveal="up"><strong>了解能力</strong><p>在首页快速确认模型、API 状态和主要功能边界。</p></li>
          <li data-reveal="up"><strong>进入控制台</strong><p>点击入口触发轻量转场，并在同一个应用内打开 /app。</p></li>
          <li data-reveal="up"><strong>继续工作</strong><p>会话、附件和个人偏好继续由 IndexedDB 与后端接口支撑。</p></li>
        </ol>
      </section>

      <section class="landing-band">
        <div class="landing-cta" data-reveal="up">
          <h2>把分析交给 Lysandra</h2>
          <p>一个干净、温暖的桌面工作台，专为个人自用与轻办公而生。</p>
          <a href="/app" class="landing-primary-action compact" data-enter-console>进入控制台</a>
        </div>
      </section>

      <footer class="landing-footer">
        <span class="landing-wordmark">Lysandra</span>
        <span>Qwen Agent Lab · 基于 Qwen 大模型的数据分析 agent</span>
        <div class="foot-links">
          <a href="#modes">能力</a>
          <a href="#output">输出</a>
          <a href="#workflow">流程</a>
        </div>
      </footer>
    </main>
  `;
}

function renderCard(title, text) {
  return `
    <article class="landing-card" data-reveal="up">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
