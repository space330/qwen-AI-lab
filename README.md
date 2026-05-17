# Qwen Agent Lab

AI agent lightwork S1.0 的前端界面原型。

## 当前内容

- 控制台式顶部栏、左侧模式栏、中间工作区、右侧预览栏、底部固定输入区
- 暖木黄色 UI 风格
- 左侧模式栏和右侧预览栏支持折叠与拖拽调整宽度
- 支持普通对话、Agent 模式、文档总结、CSV 分析、设置页切换
- 支持上传 txt、md、csv 文件
- 支持原始文件预览、生成结果预览、复制、导出
- 使用 localStorage 保存基础设置、历史消息、上传预览和生成结果

## 后端配置

复制 `.env.example` 为 `.env`，并填入后端密钥：

```powershell
Copy-Item .env.example .env
```

`.env` 示例：

```env
PORT=5173
QWEN_API_KEY=你的千问 DashScope API Key
QWEN_MODEL=qwen-plus
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_TIMEOUT_MS=60000
```

API Key 只由 Express 后端读取，前端不会接触或保存密钥。

## 运行方式

后端使用 Express：

```powershell
cd "D:\Qwen Agent Lab"
npm install
npm start
```

然后打开：

```text
http://127.0.0.1:5173/
```

## API

- `GET /api/health`：检查服务和 Qwen 配置状态。
- `POST /api/qwen/chat`：普通 JSON 结构化返回。
- `POST /api/qwen/chat/stream`：NDJSON 流式状态返回，用于 loading 和错误预警。

## 说明

当前前端已接入 `/api/qwen/chat/stream`。如果后端未启动或 `.env` 未配置 API Key，AI 输出区域会显示明确错误提示。
