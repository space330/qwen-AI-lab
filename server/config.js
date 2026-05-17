import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const projectRoot = path.resolve(__dirname, "..");

loadEnvFile(path.join(projectRoot, ".env"));

export const config = {
  port: parseInt(process.env.PORT || "5173", 10),
  qwenApiKey: process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || "",
  qwenModel: process.env.QWEN_MODEL || "qwen-plus",
  qwenBaseUrl:
    process.env.QWEN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
  qwenTimeoutMs: parseInt(process.env.QWEN_TIMEOUT_MS || "60000", 10),
  qwenSlowModelTimeoutMs: parseInt(process.env.QWEN_SLOW_MODEL_TIMEOUT_MS || "240000", 10),
  qwenMaxTokens: parseInt(process.env.QWEN_MAX_TOKENS || "1800", 10),
  qwenFileCharLimit: parseInt(process.env.QWEN_FILE_CHAR_LIMIT || "6000", 10),
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalIndex = line.indexOf("=");
    if (equalIndex === -1) continue;

    const key = line.slice(0, equalIndex).trim();
    const rawValue = line.slice(equalIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
