# Codex 插件安装与生命周期

[English](CODEX-PLUGIN.md) · [返回首页](../README.zh-CN.md) · [使用与权限](USAGE.zh-CN.md)

**v0.2.1-rc2 接受三组经过测试的精确 Desktop/核心版本组合，安装包含两部分**：Codex 插件提供 MCP 服务和委派 Skill；Desktop 适配器运行在现有的官方 Desktop Host 中。委派任务需要两者，单独安装 Codex 插件不能完成桌面连接。

需要 macOS、官方 DSH Desktop **0.2.0-rc.2 / Cordis 4.0.4** 或 **0.2.1-rc.1 / 0.2.1-rc.2（Cordis 4.0.5）**、Codex 能找到的 Node **>=22.19.0**，以及支持便携 Agent Plugins 格式的 Codex 客户端。已验证 CLI **0.163.0-alpha.10.2** 可发现插件；测试覆盖范围及限制见[验证记录](VALIDATION.md)。

## 安装 Codex 插件

解压本地准备好的 `dsh-desktop-codex-plugin-0.2.1-rc2.zip`，在解压后的市场根目录执行：

```sh
codex plugin marketplace add .
codex plugin add dsh-desktop@dsh-desktop-bridge
```

若使用源码仓库，先执行 `npm ci && npm run package:plugin`。已打包 ZIP 无需构建。此处使用本地文件，不假定远端已经发布；保留市场源目录，以便之后刷新和更新。

插件采用便携 Agent Plugins 格式：`plugin.json`、`mcp.json`、`skills/`、资源文件，以及 `extensions.com.openai` 下的展示信息。MCP 使用 `${PLUGIN_ROOT}` 定位随包启动器。不支持此格式的客户端可使用[独立 MCP 配置](STANDALONE-MCP.zh-CN.md)，两条注册路径二选一。

## 首次配置 Desktop

1. 新建本地 Codex 聊天，要求使用 DSH Desktop Bridge，先调用 `dsh_setup_info`。该只读工具返回配置有效性和已安装副本的准确命令，不创建文件。
2. 运行返回的显式 `setup` 命令。默认私有目录为 `~/.dsh-mcp-state` 和 `~/.dsh-mcp-work`。已有配置和 token 会被验证并保留；新配置默认拒绝全部模型工具。初始化还会将桌面适配器复制到状态目录的 `adapters/` 中，避免 Codex 缓存更新/卸载影响 DSH 的安装源。
3. 初始化后再次调用 `dsh_setup_info`。持久归档存在后，才会返回 `desktopInstall`。保存当前工作并完全退出 DSH Desktop，使用该命令指向的应用自带 `runtime/cli/bin/dsh`，或通过官方 Plugins 页面安装该归档。返回命令假定应用位于 `/Applications/DeepSeek Harness.app`；若安装位置不同，请使用该应用自带的实际命令路径。桌面 Profile 需事先打开 Desktop 初始化过；适配器依赖安装可能需要网络。
4. 重新打开 Desktop。插件会发现有效的默认配置，或读取明确指定的配置路径。调用 `dsh_connection_info`，确认 `runtime: "existing-desktop"` 与目标适配版本。配置有效不等于桌面已连接；连接成功也不等于模型凭据有效。
5. 按[首页示例](../README.zh-CN.md)执行首次模型对话；此操作可能产生模型费用。编码前先[审查权限](USAGE.zh-CN.md)、允许目标仓库和精确工具，并重新加载 Desktop 插件。

助手不会自行退出 Desktop、安装适配器、修改 Profile 或启动另一套运行时。安装必须使用官方 Desktop 的 Plugins 页面或应用自带命令，不使用另行安装的 DSH CLI 修改桌面 Profile，也不使用版本豁免。

MCP 在尚未配置时也能完成初始化，提供诊断工具；显式初始化后会在后续调用中重新尝试加载配置。共有十个 MCP 工具；`dsh_setup_info` 是本地只读工具，不增加 Desktop RPC 或自动审批 API。

## 自定义路径

默认安装无需单独注册 MCP 或修改 shell。已有自定义配置必须在双方指向同一个文件：通过本地 Codex 插件 MCP 覆盖配置传入 `--config`，并设置 Desktop 适配器的 `configFile`。不要假定 Codex 会转发任意环境变量。

新自定义目录先按[独立配置指南](STANDALONE-MCP.zh-CN.md)显式初始化，再向插件 setup 传入已有配置。使用目录参数时，`--state-dir` 与 `--workspace-root` 必须同时提供。若选择独立 MCP 路径，按该指南手动注册，避免再注册同一插件的 MCP。

## 更新与卸载

本地市场先更新/重新构建源目录，再刷新市场并重新安装：

```sh
codex plugin marketplace upgrade dsh-desktop-bridge
codex plugin add dsh-desktop@dsh-desktop-bridge
```

之后新建本地聊天，重新执行 setup，暂存对应版本的桌面适配器；保存工作、退出 Desktop 后，通过官方界面/命令更新适配器，再重新打开。不要强制重启活跃 Host。旧版本归档会保留在私有状态目录。

卸载 Codex 一侧：

```sh
codex plugin remove dsh-desktop@dsh-desktop-bridge
codex plugin marketplace remove dsh-desktop-bridge
```

这不会删除 Desktop 适配器、暂存归档、配置、token 或任务文件。桌面适配器需通过 Desktop Plugins 另行卸载；先审查/归档任务内容，再自行清理状态目录和工作区。

## 构建与分发

```sh
npm ci
npm run check
npm run package:plugin
npm run verify:plugin
```

构建产物：

| 文件                                                  | 用途                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| `outputs/dsh-desktop-codex-plugin-0.2.1-rc2.zip`      | 可安装的本地市场，包含 MCP、Skill、桌面适配器、文档与许可证 |
| `outputs/dsh-desktop-mcp-bridge-0.2.1-rc2.tgz`        | Desktop 插件归档                                            |
| `outputs/dsh-desktop-mcp-bridge-source-0.2.1-rc2.zip` | 源码、测试与构建产物，不含依赖、Git 内部文件和临时状态      |
| `outputs/SHA256SUMS.txt`                              | 本版本三个归档的校验值                                      |

`plugins/dsh-desktop/runtime/server.cjs` 与 Desktop 归档是生成文件，应修改源码后重新打包。MCP 包含运行依赖，可在没有 `node_modules` 的位置启动；`THIRD_PARTY_NOTICES.txt` 保留全部随包依赖许可证。Desktop 适配器仍需由官方 Host 解析其运行依赖，不包含 Desktop 二进制。没有自动安装或发布 hooks。

## 设计依据

市场、MCP 与 Skill 的组合参考了[指定项目的固定版本](https://github.com/Seann0824/deepseek-harness-for-codex/tree/12174fcf17bfd760509340b9e34418c7c1213e3f)，未复制其运行实现。该项目管理独立 DSH Web 进程；本项目的任务始终位于现有 Desktop Host，因而需要桌面适配器。

便携结构依据 [OpenAI 官方插件封装文档](https://developers.openai.com/plugins/build/plugins)；清单已通过 Agent Plugins 1.0.0 schema 验证。本地/Git 市场与公开目录提交是不同步骤，本项目只准备本地分发。上游接口和认证证据见[源码核实](UPSTREAM-AUDIT.md)。
