<p align="center">
  <img src="assets/icon.svg" alt="DSH Desktop MCP Bridge" width="80" height="80" />
</p>

# DSH Desktop Bridge — Codex 插件

[English](README.md)

**Desktop-to-Desktop：** 复用正在运行的 DSH Desktop 与已配置的模型提供方，无需向 Codex 或桥接额外提供 API Key。任务执行不调用 DSH CLI，首次安装仍可使用应用自带安装命令。减少重复配置可降低 API_KEY 暴露风险；DSH 的模型请求和工具权限继续生效。

安装分为两部分：Codex 插件包含可离线启动的 MCP 服务与委派 Skill；随包 DSH Desktop 适配器需要另行安装到官方桌面端。需要 Node >=22.19，以及官方 DSH Desktop **0.2.0-rc.2 / Cordis 4.0.4** 或 **0.2.1-rc.1 / 0.2.1-rc.2（Cordis 4.0.5）**。运行时不会下载 npm 包，也不会启动第二套 DSH CLI/Web。

## 在 Codex 安装

解压发布 ZIP 后，在解压目录执行：

```sh
codex plugin marketplace add .
codex plugin add dsh-desktop@dsh-desktop-bridge
```

如果使用源码仓库，请先 `npm ci && npm run package:plugin`，再执行上面的命令。已经打包的 ZIP 不需要 npm。安装包可从仓库 Releases 页面获取，不需要发布到 npm。

## 首次连接

安装后新建本地 Codex 聊天，输入：

> 使用 DSH Desktop Bridge，先检查安装状态并帮助我完成首次连接，暂时不要提交模型任务。

插件的 `dsh_setup_info` 返回已安装副本的准确路径及初始化/安装命令。按照返回值运行显式 `setup` 命令，会创建 `~/.dsh-mcp-state` 和 `~/.dsh-mcp-work`，默认拒绝所有工具；已有配置会被验证，token 不会被替换。初始化还将桌面适配器归档复制到状态目录的 `adapters/` 中，供 DSH 持久引用；Codex 更新或卸载不会删除这个副本。仅检查状态不会创建文件。

初始化后再次调用 `dsh_setup_info`，获取指向持久归档副本的 `desktopInstall`。保存当前桌面任务并**自行完全退出 DSH Desktop**，再通过官方 Plugins 页面安装该副本，或运行返回的 Desktop 自带命令。返回路径假定应用位于 `/Applications/DeepSeek Harness.app`；如安装位置不同，请调整为该应用自带的实际路径。适配器可能需要联网安装其 npm 依赖；MCP 启动本身不需要网络。重新打开 Desktop 后，再调用 `dsh_connection_info` 确认返回 `runtime: "existing-desktop"`。连接检查不调用模型，也不验证模型凭据；之后的真实模型任务可能产生费用。

默认路径下有效、私有的配置由双方自动发现，无需编辑 Codex MCP 配置或 shell 启动文件。自定义配置继续支持独立 CLI 的 `--config`；若要为插件使用自定义路径，请在 Codex 插件 MCP 的本地覆盖配置中传入该参数，并同步设置 Desktop 插件的 `configFile`。不要依赖 Codex 自动转发任意环境变量。

## 使用与权限

先检查连接，再创建独立会话，提交任务并轮询结果。默认 `allowedTools: []` 只允许模型对话；代码编辑等能力需要在私有配置中明确允许，并重载 Desktop 插件。独立目录/worktree 用于减少文件冲突，不是操作系统沙箱。子 Agent 结果需要由 Codex 独立审查。

卸载 Codex 插件：

```sh
codex plugin remove dsh-desktop@dsh-desktop-bridge
codex plugin marketplace remove dsh-desktop-bridge
```

这不会删除 DSH 适配器、配置、token 或任务文件。适配器应通过官方 Plugins 页面另行卸载，文件在确认不再使用后自行清理。

本包为实验版；测试覆盖范围及限制见仓库中的验证指南。MIT；依赖许可证见 THIRD_PARTY_NOTICES.txt；无 DeepSeek/OpenAI 官方背书。
