# 通过 npm 安装

[English](NPM.md) · [返回首页](../README.zh-CN.md) · [权限说明](USAGE.zh-CN.md)

`dsh-desktop-mcp-bridge` 包含独立 MCP 服务和 DSH Desktop 适配器，需要 Node >=22.19 及受支持的官方 Desktop 版本。Codex 插件用户仍可使用随包服务和适配器；同时只注册一种 MCP 接入方式。

当前版本：**0.2.1-rc2**，使用 **next** 预发布渠道。下列命令固定安装这一版本。

## 1. 初始化私有配置

```sh
npx --yes --package dsh-desktop-mcp-bridge@0.2.1-rc2 dsh-desktop-mcp setup
```

这会创建默认的私有状态目录和工作区，或验证已有配置并保留 token。请检查生成配置中的工具权限。需要其他路径时参阅[独立配置指南](STANDALONE-MCP.zh-CN.md)。

## 2. 安装 Desktop 适配器

保存任务并完全退出官方 DSH Desktop，再使用应用自带安装器：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add dsh-desktop-mcp-bridge@0.2.1-rc2 --save-exact
```

应用安装位置不同时请调整路径。此命令将插件安装到 Desktop Profile，不会启动独立 Harness 运行时。完成后重新打开 Desktop。

## 3. 检查连接

```sh
npx --yes --package dsh-desktop-mcp-bridge@0.2.1-rc2 dsh-desktop-mcp doctor
```

应返回桥接版本 `0.2.1-rc2` 和 `runtime: "existing-desktop"`。此检查不调用模型。

## 4. 注册独立 MCP 服务

在 Codex Desktop/CLI 的用户 `config.toml` 中添加：

```toml
[mcp_servers.dsh_desktop]
command = "npx"
args = ["--yes", "--package", "dsh-desktop-mcp-bridge@0.2.1-rc2", "dsh-desktop-mcp", "stdio"]
startup_timeout_sec = 60
tool_timeout_sec = 60
```

若桌面应用找不到 `npx`，将 `command` 改成其绝对路径。首次运行需要下载 npm 包及运行依赖。已有自定义配置可在 `args` 后添加 `--config` 和配置文件绝对路径。

新建本地 Codex 聊天，先调用 `dsh_setup_info`，再调用 `dsh_connection_info`，然后按[使用示例](../README.zh-CN.md#使用示例)提交任务。模型任务会调用 Desktop 已配置的提供方，并可能产生用量费用。

## 更新与卸载

Desktop 完全退出后，通过应用自带安装器安装新版本，并同步修改 Codex 独立 MCP 配置中的版本。已有配置与任务工作区会保留。不再使用时，删除 MCP 配置项并通过 Desktop Plugins 卸载适配器。
