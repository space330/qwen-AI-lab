# Workspace Governance Checklist · 2026-06-15

本清单用于收束 Qwen Agent Lab 当前工作区状态，避免“本地可运行但仓库不完整”。

## 强制同步规则

任何工程改动、功能交付、验收结果、版本号变更、仓库治理变更或重要架构调整，必须在收尾前同步到 Obsidian 对应项目节点。未完成 Obsidian 同步时，该工程任务不得标记为完成。

默认同步节点：

- `C:\Users\lenovo\Documents\Obsidian Vault\Qwen Agent Lab.md`
- `C:\Users\lenovo\Documents\Obsidian Vault\QWEN AI AGENT LAB 总体架构.md`
- `C:\Users\lenovo\Documents\Obsidian Vault\源码工作区清点.md`
- 大版本、验收、问题清单、收束任务应新增独立 Obsidian 节点，并回链到项目总览。

## 当前验证快照

- 应用版本：`2.2.0`
- 自动化测试：`npm.cmd test`，100/100 通过
- 依赖审计：`npm.cmd audit --omit=dev`，0 漏洞
- 格式检查：`git diff --check` 无格式错误，仅有 Git LF/CRLF 换行提示

## 已处理

- `package.json` / `package-lock.json` 已统一到 `2.2.0`。
- README 当前版本已统一到 `2.2.0`。
- IndexedDB 本地数据导出版本已统一到 `2.2.0`。
- `CHANGELOG.md` 已将 V2.2 从 Unreleased 转为 `2.2.0`。
- 2026-06-16 已修复外部审计 A 组安全项：`web_fetch` 重定向 SSRF、IPv6-mapped IPv4 SSRF 绕过、`file_search` 高风险正则 ReDoS。
- 2026-06-17 已完成官网/控制台融合：`/app` 新增集成欢迎层，独立 `/` 官网首页保留。
- `.gitignore` 已补充：
  - `server/data/`
  - `renders/`
  - `tmp/`
  - `qwen-agent-lab-intro/renders/`
  - `qwen-agent-lab-intro/audio/`
  - `qwen-agent-lab-intro/.hyperframes/`
  - `qwen-agent-lab-intro/*.wav`

## 建议纳入 Git 的核心源码

这些文件是当前应用运行与测试所必需，建议纳入版本库：

- `server/agentExecutor.js`
- `server/callLog.js`
- `server/context.js`
- `server/memoryStore.js`
- `server/models.js`
- `server/tools.js`
- `src/.env.example`
- `src/components/chartPolisher.js`
- `src/components/landing.js`
- `src/data/conversationRepository.js`
- `src/utils/conversation.js`
- `src/utils/exportReport.js`
- `src/utils/rangeExport.js`
- `src/utils/routing.js`
- `tests/agentExecutor.test.js`
- `tests/chartPolisher.test.js`
- `tests/context.test.js`
- `tests/conversation.test.js`
- `tests/fileParser.test.js`
- `tests/landing.test.js`
- `tests/rangeExport.test.js`
- `tests/repository.test.js`
- `tests/routing.test.js`
- `tests/state.test.js`
- `tests/tools.test.js`
- `tests/toolsV22.test.js`

## 建议纳入 Git 的项目文档

- `CHANGELOG.md`
- `CLAUDE.md`
- `docs/v1.2-acceptance.md`
- `docs/v2.0-acceptance.md`
- `docs/v2.0-issues.md`
- `docs/v2.0-v2.1-delivery-acceptance-report.md`
- `docs/v2.1-acceptance.md`
- `docs/v2.2-acceptance.md`
- `docs/v2.2-direction.md`
- `docs/releases/v1.2.0.md`
- `docs/releases/v2.0.0.md`
- `docs/superpowers/archive/README.md`
- `docs/workspace-governance-2026-06-15.md`

## 需人工决策

这些文件不影响主应用运行，需要决定是纳入、迁移到 archive，还是放到独立仓库：

- `qwen-agent-lab-intro/` 中除 `renders/`、`audio/`、`.hyperframes/` 以外的宣传片源码与字体。
- `Agent-ReAct-解析.md`
- `Agent-ReAct-状态机.mermaid`
- `Agent-ReAct-状态机.html`
- `架构信息图.html`
- `宣传片分镜脚本-HeyGen.md`
- `user_account_testdata.csv`

## 已删除或替代项

- `.env.example`：根目录旧示例已删除，当前使用 `src/.env.example`。
- `src/mockAgent.js`：旧 mock agent 已删除，Agent 逻辑由后端真实工具循环接管。
- `docs/superpowers/plans/2026-05-12-html-answer-output.md`：已归档到 `docs/superpowers/archive/plans/`。

## 建议提交顺序

1. 提交 P0 收束：版本统一、`.gitignore`、核心源码与测试入库、治理文档。
2. 单独提交宣传片/素材决策：纳入独立目录、归档或独立仓库。
3. 再开始 P1 重构：拆分 `server/tools.js`。
# 2026-06-17 最新同步 · Liquid Glass 视觉系统

- 已完成官网首页、`/app` 集成欢迎层与控制台核心区域的 Liquid Glass token 化升级。
- 新增计划文档：`docs/superpowers/plans/2026-06-17-liquid-glass-token-system.md`。
- 新增测试：`tests/liquidGlass.test.js`，约束关键玻璃层必须引用共享 tokens。
- 最新验证：`npm.cmd test` 为 102/102 通过。
- 本次为视觉系统和性能收敛改动，不修改 API、Qwen 调用、会话、文件解析或 Agent 工具逻辑。
