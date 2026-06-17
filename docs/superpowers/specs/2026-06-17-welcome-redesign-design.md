# 欢迎页重设计 · 设计文档

- **日期**：2026-06-17
- **范围**：重做线上 SPA 首页（欢迎/landing），引入非线性流体动画与 Apple 式滚动分镜转场，
  视觉参考 apple.com.cn 与 anthropic.com。
- **状态**：已通过头脑风暴评审，待转实现计划（writing-plans）。

## 1. 目标与非目标

**目标**
- 用一套现代、温暖、留白充足的欢迎页替换当前线上首页。
- Hero 背后有"灵动流动"的非线性流体动画（CSS 多光斑）。
- 各内容板块（分镜）随滚动进入视口时，带滑动 + 轻微 3D 倾斜/旋转优雅入场。
- 保留并轻度增强进入控制台 `/app` 的启动转场。
- 全程可访问（`prefers-reduced-motion` 降级）、无水平溢出、无新增第三方依赖。

**非目标**
- 不改控制台（`renderApp`）的任何视觉或逻辑。
- 不引入构建步骤、框架或 WebGL（真 metaball 融合列为未来可选增强，不在本期）。
- 不做整屏吸附（snap）滚动；采用"进入视口即播放"的滚动编排模型。

## 2. 设计决策（头脑风暴结论）

| 维度 | 决策 |
|---|---|
| 范围 | 重做线上 SPA 首页（`renderLanding` + `.landing-*` 样式）；`landing.html` 退役为参考稿。 |
| 品牌方向 | 混合方案：Apple 留白/大字号/滚动叙事 + 暖米色 + Qwen 橙。 |
| 流体动画 | 灵动流动：CSS 多光斑 + 位移/旋转/缩放脉动。WebGL metaball 为未来可选增强，默认不上。 |
| 转场模型 | 滚动编排（Apple 式）：板块进入视口时滑动 + 轻微 3D 倾斜旋转入场。 |
| 内容结构 | 精简为 5 个更大的全宽分镜（见 §5）。 |
| 实现路线 | 路线 1：纯 CSS + IntersectionObserver，零依赖、可单测。 |

## 3. 架构与代码落点

所有新样式与 token **作用域收在 `.landing-page` 内**，控制台主题完全不受影响。

| 文件 | 改动 |
|---|---|
| `src/components/landing.js` | `renderLanding(state)` 输出新的 5 分镜结构；每个板块挂 `data-reveal="up\|left\|right"`；新增 `.landing-fluid` 流体层容器（`aria-hidden="true"`）。只产出标记，不含动画逻辑。 |
| `src/components/landingMotion.js`（新建） | 导出 `initLandingMotion(root)`：建 IntersectionObserver 切 `.in-view`，控制 Hero 流体 `animation-play-state`，返回 `cleanup()`。核心判定抽为 DOM-free 纯函数便于单测。 |
| `src/main.js` | `bindLandingEvents()` 调 `initLandingMotion(app)`；用模块级句柄在每次 `render()` 重建前 `cleanup()` 旧 observer。保留 `openConsoleFromLanding`。 |
| `src/styles.css` | 重写 `.landing-*` 段：新 token、流体光斑层、分镜入场过渡、启动转场增强、响应式。保留 `body.landing-active`、`html { overflow-x: clip }`。 |
| `landing.html` | 移到 `docs/design-references/landing.html`，不再服务，保留为参考。 |

**渲染契约**：`render()` 每次整体替换 `app.innerHTML`。因此进入 home 视图时 `initLandingMotion`
必须重新建立 observer，离开/重渲染前必须 `cleanup()` 断开，避免悬挂引用。

## 4. 视觉系统（仅 landing 作用域 token）

- 画布：象牙白 `#faf6ef` / `#f4eee2`
- 墨色：`#241307` / `#2a170d`
- 橙：`#e0760a` / `#ee8b17`；主按钮渐变 `#e06d07 → #f2a327`；琥珀光 `#ffc878` / `#ffb24d`
- 弱化色：`#9a7352` / `#b06a14`
- 字体：标题用系统无衬线（`-apple-system, "Segoe UI", …`）配 `clamp()` 大字号；字标 "Lysandra"。
- 圆角/玻璃：沿用现有 `--radius*` 与玻璃质感，但置于象牙画布而非木纹底上。

## 5. 五个分镜与入场编排

| # | 分镜 | 内容 | `data-reveal` | 入场动作 |
|---|---|---|---|---|
| 1 | Hero | kicker + 大标题「Qwen <橙>Agent</橙> Lab」+ 标语 + 双 CTA（进入控制台 / 查看工作流）+ 状态条（当前模型·API 状态·本地运行）。背后 `.landing-fluid` 灵动流体。 | —（载入即播 `rise`） | 载入即播放上滑淡入。 |
| 2 | 能力总览 | 4 卡：对话 / Agent / 文档总结 / CSV 分析。 | `up` | 卡片上滑 + 轻微 `rotateX`，错峰 stagger。 |
| 3 | 结构化输出展示 | 左文案 + 右 mock 回答卡（摘要 / 关键发现 / 下一步）。 | 左 `left` / 右 `right` | 左从左滑入，右卡从右滑入 + 轻微 `rotateY`。 |
| 4 | 工作流 | 3 步：了解能力 → 进入控制台 → 继续工作。 | `up` | 逐步滑入，stagger。 |
| 5 | CTA | 玻璃大面板「把分析交给 Lysandra」+ 进入控制台。 | `up` | 整体放大 + 上滑入场。 |

页脚保留字标 + 版权 + 链接。

**入场机制**：`[data-reveal]` 初态 `opacity:0; transform: translateY(40px) rotateX(8deg)`
（按 `up/left/right` 给方向变体），`.in-view` 复位为 identity，过渡约 `.7s cubic-bezier(.2,.7,.2,1)`；
父容器加 `perspective: 1200px` 撑起 3D 倾斜。stagger 用 `transition-delay` 或 `--i` 变量实现。

## 6. 流体动画模块（CSS）

- `.landing-fluid`：`position:absolute; inset:0; overflow:hidden; z-index:0; aria-hidden`，
  置于 Hero（及 CTA 一处弱实例）内容之下。
- 3 个 `.fluid-blob`：模糊径向渐变（橙/琥珀），`filter: blur(34px)`，`mix-blend-mode: multiply`，
  `will-change: transform`；`flowA/flowB/flowC` 关键帧做 translate + scale + rotate，时长 8–11s，
  `ease-in-out infinite`。
- `.landing-wash`：中心向外的白色径向渐变叠层，保证标题在流体上始终可读。
- 性能：流体仅出现在 Hero（+ CTA 一处）；Hero 滚出视口时由 observer 把 blob
  `animation-play-state` 置 `paused`，省电。

## 7. 启动转场（进入控制台）

- 保留 `.landing-page.is-launching`：内容上移 8px + 淡出。
- 增强：流体光斑向中心聚拢并提亮，随后跳转 `/app`。
- 复用 `src/main.js` `openConsoleFromLanding` 现有 ~280ms 钩子与 reduced-motion 即时降级。

## 8. 无障碍与响应式

- `prefers-reduced-motion: reduce`：blob `animation:none` 固定为悦目静态位；所有 `[data-reveal]`
  直接呈现（无位移/无过渡）；启动转场即时。`initLandingMotion` 检测到该偏好时跳过 observer，
  直接给全部板块加 `.in-view`。
- 响应式：保留 1100px 桌面地板与 `@media (max-width:1099px)` 处理；`html { overflow-x: clip }`
  防溢出。能力卡 4→2→1；分镜 3 的左右分栏在窄屏堆叠；Hero 字号 `clamp()`；流体随视口缩放。
- 焦点：CTA 为真实 `<a>`，提供 `:focus-visible` 描边；状态条用 `<dl>` 语义。

## 9. 测试

- **`tests/landing.test.js`（扩展）**：断言 `renderLanding(state)` 输出含 5 个分镜、`data-reveal`
  属性齐备；两处 CTA 均带 `data-enter-console`；状态条反映 `state.currentModel` / `state.apiStatus`；
  HTML 转义正确。
- **`tests/landingMotion.test.js`（新建）**：测 DOM-free 纯函数 —— `revealOnIntersect(entries,{addClass})`
  对 `isIntersecting` 项调用 `addClass`、对其余不调用；reduced-motion 分支直接全量揭示；`cleanup()`
  调 `disconnect()`。用注入的假 entries / 假 observer，避免引入 jsdom。
- **浏览器预览校验**（按 CLAUDE.md 约定）：以文本检查为主证 —— `documentElement.scrollWidth`
  对比 `innerWidth` 验无横向溢出；`preview_inspect` 验计算样式；reduced-motion 下验静态；
  截图仅作视觉佐证（首屏后稍候再截，超时则重试一次）。

## 10. Obsidian 同步（CLAUDE.md 非协商项）

实现完成后，须把本次重设计同步到 Obsidian 仓库：
- `Qwen Agent Lab.md`、`QWEN AI AGENT LAB 总体架构.md`、`源码工作区清点.md`
- 新增一篇专门的"欢迎页重设计"记录（决策、验收结果、版本）。
未同步前不得宣称项目工作完成。

## 11. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 多 blob + blur 在低端机掉帧 | 流体限定 Hero（+CTA 一处）；滚出视口暂停；`will-change` 仅用于 blob。 |
| `render()` 重建导致 observer 悬挂 | 模块级 `cleanup()` 在重渲染前 `disconnect()`。 |
| 3D 倾斜在窄屏放大溢出 | 倾斜角度小（≤8°）+ `overflow-x: clip` + 响应式降级。 |
| 视觉与控制台主题串色 | 所有 token 收在 `.landing-page` 作用域。 |
