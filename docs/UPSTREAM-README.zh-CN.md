<p align="center">
  <img src="icon.svg" alt="DSH Desktop MCP Bridge" width="80" height="80" />
</p>

# DSH Desktop MCP Bridge

[English](README.md) · [安装指南](docs/CODEX-PLUGIN.zh-CN.md) · [验证记录](docs/VALIDATION.md) · [安全说明](SECURITY.md)

**Desktop-to-Desktop：Codex Desktop → 已经运行的官方 DeepSeek Harness Desktop。** 直接复用桌面端现有模型配置与运行时；Codex CLI 也可使用同一桥接。每个委派会话使用独立目录或 Git worktree，供 Codex 审查结果。

这是一套**非官方、主动启用的桥接**。它通过现有 Desktop Host 内的插件与经过认证的本地 Unix socket 通信。Codex 启动 MCP stdio 服务；桥接不会启动另一套 DSH CLI/Web 运行时，也不会提取 Desktop 认证秘密。[架构与官方源码核实](docs/UPSTREAM-AUDIT.md)。

## Desktop-to-Desktop，无需复制 API Key

```text
Codex Desktop → MCP stdio → 经过认证的本地 Unix socket → 现有 DSH Desktop
   委派 / 审查                                      模型 / Skills / 获准 Tools
```

- **复用桌面认证。** DSH Desktop 已登录或已配置可用模型提供方后，桥接无需额外配置 DeepSeek API；无需把 `DEEPSEEK_API_KEY` 填入 Codex、桥接配置、额外 `.env` 或桥接启动命令。
- **使用正在运行的 Desktop。** 任务执行直接调用现有 Host 的 Agent 服务，无需调用 DSH CLI，也不启动独立 CLI/Web 运行时。首次安装插件仍可能使用 Codex 命令，以及官方 Desktop 的 Plugins 页面或应用自带安装命令。
- **减少 API_KEY 泄露风险。** 模型凭据继续由 DSH 管理，桥接协议不要求传递模型 API Key；减少密钥在文件和环境变量中的重复配置，可降低意外暴露的机会。桥接自己的私有本地认证 token 与模型凭据相互独立。

DSH 仍会请求其已配置的模型服务。这项设计减少密钥复制，不代表获准工具、提示词或模型输出绝无泄露风险。详见[安全模型](SECURITY.md)。

## 兼容性与状态

**实验性 v0.2.1-rc2。** 测试覆盖范围及已知限制见[验证记录](docs/VALIDATION.md)。

| 组件        | 要求 / 已验证范围                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| DSH Desktop | 官方 macOS **0.2.0-rc.2 / Cordis 4.0.4** 或 **0.2.1-rc.1 / 0.2.1-rc.2（Cordis 4.0.5）**；仅接受完整精确组合 |
| Codex       | 支持便携 Agent Plugins 格式的本地 Desktop/CLI；已验证 CLI **0.163.0-alpha.10.2** 可发现插件                 |
| Node.js     | **>=22.19.0**，Codex 能够找到该可执行程序                                                                   |
| Git         | 创建仓库 worktree 时需要                                                                                    |
| 其他平台    | Linux 传输可测试，但不宣称兼容 Linux Desktop；尚未实现 Windows 传输                                         |

桥接版本 **v0.2.1-rc2** 对应 DSH Desktop **0.2.1-rc.2**，并保留上表中的旧版支持。仅接受这些完整版本组合；其他版本或核心包混装会被拒绝。

新会话在创建时读取 Desktop 的**默认模型**，并使用获准的已安装 Preset。提供方和凭据继续由 Desktop 管理。Skills 按 DSH 原有规则在新工作区发现；不会复制已有聊天、单会话设置、未发送文本及主仓库未提交/忽略的项目文件。[复用范围](docs/USAGE.zh-CN.md)。

## 安装与首次连接

安装包含**两个部分**：

| 部分           | 安装位置         | 用途                             |
| -------------- | ---------------- | -------------------------------- |
| Codex 插件     | Codex            | 随包 MCP 服务与委派 Skill        |
| Desktop 适配器 | 官方 DSH Desktop | 通过 Host 插件机制使用现有运行时 |

### 1. 安装 Codex 插件

从 GitHub 安装固定版本的插件市场：

```sh
codex plugin marketplace add Cryocell77/codex-deepseek-harness-desktop-bridge --ref v0.2.1-rc2
codex plugin add dsh-desktop@dsh-desktop-bridge
```

也可以从 [v0.2.1-rc2 Release](https://github.com/Cryocell77/codex-deepseek-harness-desktop-bridge/releases/tag/v0.2.1-rc2) 下载 `dsh-desktop-codex-plugin-0.2.1-rc2.zip`。若从源码仓库构建安装包：

```sh
npm ci
npm run package:plugin
```

在 ZIP 解压后的市场根目录，或构建后的仓库根目录，执行：

```sh
codex plugin marketplace add .
codex plugin add dsh-desktop@dsh-desktop-bridge
```

已经打包的 ZIP 无需 npm 构建。随包 MCP 启动时不下载 npm 包；Desktop 适配器的依赖安装可能需要网络。ZIP 与 Git 插件市场均包含运行产物，安装不依赖 npm 发布。

### 2. 初始化并安装 Desktop 适配器

新建一个**本地** Codex 聊天，输入：

> 使用 DSH Desktop Bridge，先调用 `dsh_setup_info` 检查安装状态，给我准确的初始化和桌面适配器安装命令。暂时不要提交模型任务。

运行返回的显式初始化命令，再调用 `dsh_setup_info` 获取安装命令。初始化会创建私有默认目录 `~/.dsh-mcp-state`、`~/.dsh-mcp-work`，并保存持久的适配器归档副本。已有配置会被验证，token 不会被替换。仅检查状态不会写文件。

保存当前工作并**完全退出 DSH Desktop**，再使用返回的应用自带命令或官方 Plugins 页面安装已暂存的适配器，然后重新打开 Desktop。默认路径下有效的配置由双方自动发现，无需另行注册 Codex MCP 或修改 shell。[详细安装、更新与卸载说明](docs/CODEX-PLUGIN.zh-CN.md)。

### 3. 检查连接

> 调用 `dsh_connection_info`，报告运行时、适配器版本和有效权限，不要提交模型任务。

应返回 `runtime: "existing-desktop"`，以及与连接桌面端一致的 `adapter: "dsh-v0.2.0-rc.2"` 或 `"dsh-v0.2.1-rc.1"` / `"dsh-v0.2.1-rc.2"`。`desktopVersion`、`cordisVersion` 返回实际检测组合，`supportedDesktops` 列出三组已测试版本。此操作检查桥接连接，不验证模型凭据。默认 `allowedTools: []` 允许模型对话，但拒绝全部模型工具调用。

通过 npm 包 [`dsh-desktop-mcp-bridge`](https://www.npmjs.com/package/dsh-desktop-mcp-bridge/v/0.2.1-rc2) 安装请参阅 [npm 指南](https://github.com/Cryocell77/codex-deepseek-harness-desktop-bridge/blob/main/docs/NPM.zh-CN.md)；源码构建或自定义配置路径参阅[独立 MCP 指南](docs/STANDALONE-MCP.zh-CN.md)。Codex 侧选择一种注册方式，避免工具重复。

## 使用示例

### 首次模型对话

此操作会向 Desktop 选定的模型提供方发起真实请求，可能产生费用：

> 使用 DSH Desktop Bridge 创建新的空白隔离会话，让它回复“桥接已连接”，不使用任何工具。轮询至终态，报告结果，然后关闭会话并保留工作目录。

### 独立 worktree 中的代码任务

先[审查权限](docs/USAGE.zh-CN.md)，允许目标仓库和所需的精确工具，重新加载 Desktop 插件并检查有效权限。将示例路径与任务替换成实际内容：

> 使用 DSH Desktop Bridge，从 `/absolute/path/to/repository` 的 `HEAD` 创建独立 worktree，修复“具体问题”。先检查连接与权限，再提交范围明确的任务并轮询至终态。检查实际 diff、运行相关测试后再提出整合方案。保留工作区，不要修改权限、合并、提交或发布。

[全部十个 MCP 工具、会话续写、取消与结果处理](docs/USAGE.zh-CN.md)。

## 权限与工作区隔离

- 工具**默认全部拒绝**。核对权限后才允许精确的已安装工具名；DSH 原有审批要求继续生效。
- 每个会话使用唯一目录或 detached worktree，不复制主 checkout 的脏文件。关闭会话保留文件，供审查后手动清理。
- 独立工作目录**不是操作系统沙箱**。获准的 shell/文件工具可能访问其他路径，worktree 共享 Git 对象和 hooks。
- 结果为不可信的有界文本。取消是协作式的，不回滚副作用；插件/Desktop 重启会丢失桥接句柄与请求去重记录。

[安全模型](SECURITY.md) · [任务生命周期与清理](docs/USAGE.zh-CN.md) · [认证与协议](docs/PROTOCOL.md)

## 常见问题

| 问题                  | 处理方式                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| 无法连接 Desktop      | 检查应用/插件激活状态及配置路径是否一致，见[故障排查](docs/TROUBLESHOOTING.zh-CN.md)                      |
| 子 Agent 无法编辑文件 | 检查[权限配置](docs/USAGE.zh-CN.md)中的工具与仓库白名单                                                   |
| 已安装更新的 DSH 版本 | 需要新增并验证适配器，不要绕过版本检查                                                                    |
| 如何更新或卸载        | 按[两侧插件生命周期说明](docs/CODEX-PLUGIN.zh-CN.md)操作；移除 Codex 插件会保留桌面适配器、配置与任务文件 |

## 文档导航

| 指南                                                              | 内容                                    |
| ----------------------------------------------------------------- | --------------------------------------- |
| [Codex 插件安装](docs/CODEX-PLUGIN.zh-CN.md)                      | 首次连接、更新、卸载与分发结构          |
| [独立 MCP](docs/STANDALONE-MCP.zh-CN.md)                          | 源码构建、手动注册与自定义路径          |
| [使用指南](docs/USAGE.zh-CN.md)                                   | 权限、完整工具说明、会话、结果与清理    |
| [故障排查](docs/TROUBLESHOOTING.zh-CN.md)                         | 错误、恢复与已知限制                    |
| [验证记录](docs/VALIDATION.md)                                    | 已执行检查与尚未完成的真实 Desktop 验收 |
| [官方源码核实](docs/UPSTREAM-AUDIT.md) / [协议](docs/PROTOCOL.md) | 固定版本源码证据与桥接接口              |

## 贡献与许可证

开发检查见[贡献指南](CONTRIBUTING.md)，版本变化见[CHANGELOG](CHANGELOG.md)，人工发布清单见[RELEASING](docs/RELEASING.md)。没有自动发布工作流。

原创代码使用 [MIT 许可证](LICENSE)。DSH 源码为 MIT；桌面二进制、模型服务、商标和随包依赖分别受各自条款约束。详见 [NOTICE](NOTICE) 与[依赖许可证说明](docs/CODEX-PLUGIN.zh-CN.md#构建与分发)。项目与 DeepSeek/OpenAI 无隶属或背书关系。
