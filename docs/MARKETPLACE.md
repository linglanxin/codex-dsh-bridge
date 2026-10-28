# DSH 插件发布与安装

此项目是社区维护的非官方桥接，不隶属于 OpenAI 或 DeepSeek。

DSH 官方目前没有统一的插件上传中心。官方推荐为仓库添加 `dsh-plugin` topic；内置市场可读取符合官方格式的自定义索引。本项目提供公开仓库、预发布安装包和一个仅含此插件的索引，不代表官方审核或背书。

- 官方发现方式：https://github.com/deepseek-ai/deepseek-harness#community-and-support
- 官方索引规范：https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-10-02-plugin-market-index-format.md
- 市场索引：https://raw.githubusercontent.com/linglanxin/codex-dsh-bridge/main/market-index.json
- 预发布下载：https://github.com/linglanxin/codex-dsh-bridge/releases/tag/v0.2.1-rc3-windows.6

## 兼容范围

本次市场版本明确限定 **DSH Desktop 0.2.1-rc.3 / Cordis 4.0.5 / Schemastery 3.18.5，Windows，Node.js 22.19+**。其他版本不要强行跳过兼容性检查。历史实机验证使用 windows.3 / windows.4；windows.6 完成自动检查和独立安装验证，不宣称做过新的真实模型联调。

## 已修复的 Windows CI 超时

windows.5 的两项 MCP 集成检查曾在 GitHub runner 超时。根因是 Get-Acl 在 MCP SDK 精简后的子进程环境中阻塞，并非已证实的 Node 版本不兼容。windows.6 改用 .NET 直接读取 DACL 和原始 SID，权限检查命令设有 10 秒上限，继续拒绝其他账户可读的状态文件。

本机 Node.js 24.19.0 和 GitHub Windows / Node.js 24.22.1 的 37 项检查均已通过：[云端记录](https://github.com/linglanxin/codex-dsh-bridge/actions/runs/40658467500)。新电脑上的真实 DSH 连接仍需运行 doctor 确认；本次没有新增真实模型联调。

## 从市场索引安装

在支持自定义索引的 DSH 市场“索引源”中添加上面的 `market-index.json` URL，再选择此插件的 `next` 版本。索引使用确切 Git 提交，仓库包含构建产物，安装无需运行构建脚本。

如果 DSH 当前没有索引源设置，可直接下载该 Release 的 `.tgz`，在桌面版插件页用“添加插件”选择本地文件。也可使用 Desktop 自带的命令安装：

```text
dsh plugin --profile desktop add <下载的 .tgz 的完整路径>
```

保存正在进行的工作，按 DSH 提示重新加载或重启应用，再启用“桌面端 MCP 桥接（非官方）”。不需要更改模型账号或复制模型密钥。

## 配置 MCP 客户端

市场安装的是 DSH 侧插件。MCP 客户端还需要桥接命令，可从同一份 Release 安装：

```text
npm install --global https://github.com/linglanxin/codex-dsh-bridge/releases/download/v0.2.1-rc3-windows.6/dsh-desktop-mcp-bridge-0.2.1-rc3-windows.6.tgz --ignore-scripts
dsh-desktop-mcp setup
```

默认配置是当前用户主目录下的 `.dsh-mcp-state/config.json`；任务成果放在 `.dsh-mcp-work`。这些是各自电脑的目录，不使用作者的盘符。若需要自定义目录，给 `setup` 同时传入 `--state-dir` 和 `--workspace-root`，并在 DSH 插件配置 `configFile` 中填写生成的完整配置文件路径；MCP 命令也使用相同的 `--config`。

MCP 客户端启动命令设为 `dsh-desktop-mcp`，参数为 `stdio`。另开终端运行 `dsh-desktop-mcp doctor` 验证与已运行 Desktop 的连接。

如需按工作区收纳，在私有配置 JSON 中添加 `"workspaceTitle": "codex自动"`，保留 `allowedTools: []`，重新加载插件。新任务会话进入该工作区，文件继续放在各任务子目录。

## 权限与边界

默认只允许桥接任务目录内的五个监督和文件工具。命令执行、外部检索和独立验收由主管客户端承担。没有实现读取任意历史会话、后台自动唤醒关闭的聊天、跨版本自动恢复或操作系统级隔离。

不要公开 `.dsh-mcp-state`、认证文件、模型配置或任务材料。下载包中的 `SHA256SUMS.txt` 可用于核对文件。
