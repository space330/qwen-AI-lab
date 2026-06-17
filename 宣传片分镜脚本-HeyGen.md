# Qwen Agent Lab · 45s 宣传片分镜脚本（HeyGen 版）

> 形式：数字人主持 + UI 画面穿插 ｜ 旁白：中文 ｜ 字幕：英文 ｜ 受众：普通用户 / 产品向
> 视觉风格（沿用产品配色）：深棕底 `#2a170d` ＋ 琥珀橙主色 `#d87408 / #f2a327` ＋ 米色高光 `#ffdca5`

---

## 一、HeyGen 全局设置（先在 HeyGen 里配好这些）

| 项目 | 建议 |
|------|------|
| 画幅 | 16:9 横版（官网 / B站 / YouTube）；如发抖音/视频号另出 9:16 |
| 时长 | ~45 秒 |
| 数字人 | 选一位亲和、专业的中文播报 Avatar（商务休闲风，半身）。开场/结尾大画面出镜，中间缩为右下角小窗 |
| 语音 | HeyGen 中文语音，语速「适中偏快」，让 ~110 字旁白卡进 45s |
| 字幕 | 开启 Captions，英文，底部居中，描边保证深色背景上可读 |
| 背景 | 深棕→琥珀的科技感渐变；可加细微粒子/网格动效 |
| 配乐 | 轻快、现代的电子/科技 BGM，音量压低不盖旁白 |
| 转场 | 统一用「快速滑动 + 轻微缩放」，干净利落 |

> ⚠️ 关键提醒：HeyGen 不会自动录你的软件界面。**UI 画面需要你自己先录屏 / 截图**，再作为素材（B-roll / 画中画 / 全屏插入）拖进 HeyGen 时间轴。下方每个镜头都标了「需准备的画面素材」。

---

## 二、分镜表（7 个镜头，约 45 秒）

| # | 时间 | 画面 | 数字人 | 中文旁白 | English Subtitle |
|---|------|------|--------|----------|------------------|
| 1 | 0–5s | 全屏 Logo + 标题动效 | 大画面居中出镜 | 「认识一下 Qwen Agent Lab——一个跑在你本地的 AI 智能体。」 | Meet Qwen Agent Lab — an AI agent that runs locally. |
| 2 | 5–11s | 主界面录屏：顶栏 / 左侧模式栏 / 输出区 / 底部输入 | 缩为右下小窗 | 「控制台式界面，对话、Agent、文档总结、CSV 分析，一栏切换。」 | One clean console: chat, agent, docs, and CSV analysis. |
| 3 | 11–19s | Agent 模式录屏，重点放大「工具链时光轴」逐步出现 | 右下小窗 | 「这是真·Agent：它会自己思考、自己调用工具，每一步都实时显示在时光轴上。」 | A real agent — it reasons, calls tools, and shows every step live. |
| 4 | 19–28s | 三个工具特写：计算器算式、联网搜索结果、读取上传文件 | 右下小窗 | 「内置计算器精确算数、联网搜索查实时信息、还能读你上传的文件——开箱即用。」 | Built-in calculator, live web search, and file reading — ready to go. |
| 5 | 28–36s | CSV 分析 → 前端渲染的图表 / 数据表动效 | 右下小窗 | 「丢给它一个表格，它帮你总结、抽取数据、直接生成图表。」 | Drop in a spreadsheet — get summaries, tables, and charts. |
| 6 | 36–41s | 会话列表 + 设置页（本地存储 / 数据导出）特写 | 右下小窗 | 「所有数据存在本地，密钥不出后端，隐私你说了算。」 | Your data stays local. Your keys stay private. |
| 7 | 41–45s | 回到全屏 Logo + 一句 Slogan + 网址/CTA | 大画面出镜收尾 | 「Qwen Agent Lab，本地优先的智能体。现在就试试。」 | Qwen Agent Lab — local-first AI. Try it now. |

---

## 三、逐镜 HeyGen 提示词 / 操作脚本

下面每个镜头给出：① 喂给 HeyGen 的 **Script（旁白原文）**　② **Avatar / 场景设置提示词**　③ 你要准备的 **画面素材**。

### 镜头 1 ｜ 0–5s ｜ 开场钩子
- **Script（粘进 HeyGen 台词框）**：认识一下 Qwen Agent Lab——一个跑在你本地的 AI 智能体。
- **Avatar 设置**：数字人居中、半身、面向镜头，微笑、自信开场；手势自然。背景=深棕琥珀渐变。
- **场景提示词（背景/字幕图层）**：`Centered logo reveal "Qwen Agent Lab", warm amber-on-dark tech gradient, subtle particle motion, bold title fades in`
- **需准备的画面素材**：产品 Logo（透明 PNG）；如无，用大标题文字动效代替。

### 镜头 2 ｜ 5–11s ｜ 界面总览
- **Script**：控制台式界面，对话、Agent、文档总结、CSV 分析，一栏切换。
- **Avatar 设置**：缩到右下角小窗（画中画），讲解语气；主画面让位给 UI。
- **场景提示词**：`Full-screen app screen recording as background, avatar as small bottom-right circle, highlight the left mode switcher with a soft amber glow`
- **需准备的画面素材**：主界面录屏——鼠标依次点过左侧「对话 / Agent / 文档总结 / CSV 分析」四个模式（5–6 秒）。

### 镜头 3 ｜ 11–19s ｜ 核心亮点：Agent + 工具链时光轴
- **Script**：这是真·Agent：它会自己思考、自己调用工具，每一步都实时显示在时光轴上。
- **Avatar 设置**：右下小窗，语气加重、略前倾，强调「真·Agent」。
- **场景提示词**：`Screen recording of agent mode, zoom-in on the streaming "tool timeline" as steps appear one by one, amber highlight ring on each new step`
- **需准备的画面素材**：Agent 模式录屏——输入一个需要多步的问题（例：「读 CSV 第二列再求和」），录下时光轴上 `tool_start → tool_result` 逐步出现的过程。这是全片最关键的 8 秒，务必录清楚。

### 镜头 4 ｜ 19–28s ｜ 内置工具三连
- **Script**：内置计算器精确算数、联网搜索查实时信息、还能读你上传的文件——开箱即用。
- **Avatar 设置**：右下小窗，节奏轻快，配合三段画面像「数三样」。
- **场景提示词**：`Three quick UI close-ups in sequence: 1) calculator result, 2) live web-search results card, 3) reading an uploaded file; fast amber swipe transition between each`
- **需准备的画面素材**：三段短录屏/截图——①「(15+27)*3 = 126」计算器结果；②一条联网搜索的实时结果；③上传一个 txt/csv 后被读取的画面。每段约 2.5–3 秒。

### 镜头 5 ｜ 28–36s ｜ 文档 / CSV / 图表
- **Script**：丢给它一个表格，它帮你总结、抽取数据、直接生成图表。
- **Avatar 设置**：右下小窗，演示感语气。
- **场景提示词**：`Screen recording: drag a CSV in, then a chart/data-table renders in the output area, gentle reveal animation on the chart`
- **需准备的画面素材**：CSV 分析录屏——上传表格 → 输出区出现总结文字 + 渲染出的图表/数据表（可用项目里的 `chart_test_workbook.xlsx` 或 `月度销售趋势.csv` 做演示）。

### 镜头 6 ｜ 36–41s ｜ 隐私 / 本地存储
- **Script**：所有数据存在本地，密钥不出后端，隐私你说了算。
- **Avatar 设置**：右下小窗，语气真诚可信。
- **场景提示词**：`Close-up of session list + settings page (data export / clear), a small lock icon glows amber, reassuring tone`
- **需准备的画面素材**：会话列表（新建/切换/重命名）+ 设置页（数据导出/清除）截图或短录屏。

### 镜头 7 ｜ 41–45s ｜ 收尾 CTA
- **Script**：Qwen Agent Lab，本地优先的智能体。现在就试试。
- **Avatar 设置**：回到大画面居中出镜，微笑收尾，可加一个邀请手势。
- **场景提示词**：`Return to centered logo, slogan line "Local-first AI agent" below, optional URL / call-to-action, warm amber glow, music swells then cuts clean`
- **需准备的画面素材**：Logo + Slogan 收尾卡；如有官网/下载地址放在这里。

---

## 四、旁白全文（一次性粘版，可整体导入 HeyGen 再分段）

> 认识一下 Qwen Agent Lab——一个跑在你本地的 AI 智能体。
> 控制台式界面，对话、Agent、文档总结、CSV 分析，一栏切换。
> 这是真·Agent：它会自己思考、自己调用工具，每一步都实时显示在时光轴上。
> 内置计算器精确算数、联网搜索查实时信息、还能读你上传的文件——开箱即用。
> 丢给它一个表格，它帮你总结、抽取数据、直接生成图表。
> 所有数据存在本地，密钥不出后端，隐私你说了算。
> Qwen Agent Lab，本地优先的智能体。现在就试试。

（中文约 110 字，适中偏快语速 ≈ 42–45 秒）

---

## 五、制作流程小贴士

1. **先录屏，后合成**：按上面「需准备的画面素材」把每段 UI 录好（建议 1080p、隐藏私密信息）。
2. **HeyGen 里建 7 个 scene**：每个 scene 粘对应 Script + 设置 Avatar 位置（大画面 / 右下小窗）。
3. **上传 UI 素材**：作为背景或画中画拖进对应 scene，避免遮住数字人和字幕。
4. **对齐时长**：先生成语音，按实际秒数微调每段 UI 素材长度，确保总长 ~45s。
5. **开字幕 + 配乐**：英文 Captions + 低音量 BGM，导出前通看一遍口型与字幕同步。
6. **可选 9:16 版**：把数字人放下半屏、UI 放上半屏，重排同一套 Script 即可。
