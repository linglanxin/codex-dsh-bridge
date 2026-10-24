# macOS 独立 MCP 配置

[English](STANDALONE-MCP.md) · [返回首页](../README.zh-CN.md) · [推荐插件安装](CODEX-PLUGIN.zh-CN.md)

只需要 MCP 服务、正在开发桥接，或 Codex 客户端不支持便携插件格式时，使用此路径。**独立 MCP 与 Codex 插件二选一**，避免重复注册工具。两种方式都需要相同的桌面适配器和权限配置。

无需源码仓库的安装方式见 [npm 指南](NPM.zh-CN.md)。

## 构建并准备桌面适配器

需要 macOS、官方 DSH Desktop **0.2.0-rc.2 / Cordis 4.0.4** 或 **0.2.1-rc.1 / 0.2.1-rc.2（Cordis 4.0.5）**、Node **>=22.19.0**、npm；使用 worktree 还需要 Git。其他 DSH 版本或核心包混装会被拒绝。测试覆盖范围及限制见[验证记录](VALIDATION.md)。

在源码仓库中执行：

```sh
npm ci
npm run check
npm pack
```

`dist/cli.js` 是独立 MCP 入口；`npm pack` 在仓库根目录生成 `dsh-desktop-mcp-bridge-0.2.1-rc2.tgz`。需要保留构建后的源码目录及其运行依赖，供 Codex 启动服务。自动化模型测试均使用无需 API Key 的脚本化提供方。

## 配置并连接

将所有示例路径替换成实际绝对路径。下方安装命令假定应用位于 `/Applications`；若应用安装在其他位置，请使用该应用自带的实际命令路径。

### 1. 生成私有配置

选择两个**不存在**、父目录已经存在的绝对路径，替换示例里的用户名。使用真实规范路径，避免 `/var`→`/private/var` 等软链接别名。完整 socket 路径最多 100 个 UTF-8 字节。

```sh
node /absolute/path/to/bridge/dist/cli.js init \
  --state-dir /Users/you/.dsh-mcp-state \
  --workspace-root /Users/you/.dsh-mcp-work
```

配置与 token 权限为 0600；状态目录与任务根目录权限为 0700。初始化拒绝复用已有目录，也不会悄悄替换现有凭据。

### 2. 审查权限

编辑生成的 `config.json`。默认 `allowedTools: []` 表示允许模型对话，但**拒绝全部模型工具调用**。仅在核对工具真实权限后逐项填写工具名。

- `allowedPresets`：允许的已安装 Preset，默认 `standard`。
- `repositories`：允许创建 worktree 的 Git 顶层目录，必须是规范绝对路径。
- `workspaceRoot`：必须在所有源仓库之外。
- `maxSessions` / `maxTasks`：并发会话与保留任务的上限。
- `maxPromptBytes` / `maxOutputBytes`：输入、文本结果的字节限制。
- `taskTimeoutMs`：任务截止时间，超时请求协作取消。

配置在插件加载时读取；改动后需要重新加载插件/重启 Desktop。v0.2.1-rc2 拒绝 `run_code` 及已知委派、插件管理、调度、工作流、目标自治类工具；优先使用原生工具 Preset。**工具名白名单和独立工作目录不是操作系统沙箱。** 一旦允许 shell/通用文件工具，它们可能访问目录之外的文件。仓库 worktree 创建也可能执行该可信仓库的 Git checkout hook。

### 3. 配置 Desktop 插件

默认初始化路径会被桌面适配器自动发现。若使用自定义路径，在 Desktop 的 Plugins 设置里把插件的 `configFile` 设为生成的完整路径；或者在 Desktop 会继承的登录 shell 环境中设置：

```sh
export DSH_DESKTOP_BRIDGE_CONFIG=/Users/you/.dsh-mcp-state/config.json
```

macOS Desktop 在应用启动时读取登录 shell 环境，因此之后需完全退出再打开。也可在 Desktop Profile 的 `cordis.patch.yml` 中增加：

```yaml
- id: desktop-mcp-bridge
  config:
    configFile: /Users/you/.dsh-mcp-state/config.json
```

官方 patch 对匹配行的整个 config 做替换。若默认配置不存在且未提供明确路径，插件保持关闭并输出本地诊断。

### 4. 安装到官方 Desktop

通过官方 Desktop 的 **Plugins** 页面安装本地归档/包路径。也可以先打开 Desktop 初始化一次 Profile，再**完全退出**，使用 **Desktop 自带的 `dsh` 命令**：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add /absolute/path/to/dsh-desktop-mcp-bridge-0.2.1-rc2.tgz
```

重新打开 Desktop 并确认插件真实激活。不要用 npm 单独安装的 CLI 修改 Desktop Profile，也不要通过 CLI 启动该 Profile；不要用版本豁免绕过兼容性检查。官方插件管理器决定激活/重启状态。

### 5. 验证连接

```sh
node /absolute/path/to/bridge/dist/cli.js doctor \
  --config /Users/you/.dsh-mcp-state/config.json
```

应返回 `runtime: "existing-desktop"`、协议号与适配版本。此操作不调用模型，不能证明模型凭据有效。

### 6. 配置 Codex Desktop / CLI

在 Codex 用户 `config.toml` 中添加，路径均换成真实绝对路径：

```toml
[mcp_servers.dsh_desktop]
command = "/absolute/path/to/node"
args = ["/absolute/path/to/bridge/dist/cli.js", "stdio", "--config", "/Users/you/.dsh-mcp-state/config.json"]
startup_timeout_sec = 10
tool_timeout_sec = 60
```

也可以通过 Codex CLI 注册：

```sh
codex mcp add dsh_desktop -- /absolute/path/to/node \
  /absolute/path/to/bridge/dist/cli.js stdio \
  --config /Users/you/.dsh-mcp-state/config.json
```

按当前 Codex 界面刷新/重连 MCP。桌面端未开启时，MCP 服务仍可启动，但工具调用会返回 `DESKTOP_UNAVAILABLE`。[官方 Codex MCP 文档](https://learn.chatgpt.com/docs/extend/mcp)。

## 后续使用

参阅[使用指南](USAGE.zh-CN.md)检查权限、提交隔离任务、审查结果和清理文件；连接或状态错误参阅[故障排查](TROUBLESHOOTING.zh-CN.md)。
