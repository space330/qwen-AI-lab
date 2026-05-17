# Qwen Agent Lab

基于 Qwen 打造的一款简易 AI agent，面向个人自用、轻办公和文字工作场景。

## 当前能力

- 控制台式界面：顶部栏、左侧模式栏、中间 AI 输出区、右侧文件预览区、底部固定输入区。
- 支持普通对话、Agent 模式、文档总结、CSV 分析和设置页切换。
- 支持输入文本、上传或粘贴 `txt / md / csv` 文件。
- 支持文件预览按钮，不会在上传后默认展示文件内容。
- 支持 HTML 结构化回答、图表占位、图表数据表抽取和前端图表渲染。
- 支持快捷键输入：发送、聚焦输入框、打开文件选择、复制输出、收起预览栏。
- API Key 仅由 Express 后端读取，不暴露给前端。

## 后端配置

复制 `.env.example` 为 `.env`，并填入后端密钥：

```powershell
Copy-Item .env.example .env
```

`.env` 示例：

```env
PORT=5173
QWEN_API_KEY=你的千问 DashScope API Key
QWEN_MODEL=qwen3.6-max-preview
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_TIMEOUT_MS=120000
QWEN_SLOW_MODEL_TIMEOUT_MS=240000
QWEN_MAX_TOKENS=1200
QWEN_FILE_CHAR_LIMIT=6000
```

## 运行方式

```powershell
cd "D:\Qwen Agent Lab"
npm install
npm start
```

打开：

```text
http://127.0.0.1:5173/
```

## API

- `GET /api/health`：检查服务和 Qwen 配置状态。
- `POST /api/qwen/plan`：生成回答规划。
- `POST /api/qwen/chat`：返回结构化 JSON。
- `POST /api/qwen/chat/stream`：NDJSON 流式状态返回，用于 loading 和错误预警。

## 测试

```powershell
node --test tests/inputActions.test.js tests/responseFormatter.test.js
```
