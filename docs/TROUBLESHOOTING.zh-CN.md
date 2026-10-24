# 故障排查与限制

[English](TROUBLESHOOTING.md) · [返回首页](../README.zh-CN.md) · [插件安装](CODEX-PLUGIN.zh-CN.md)

## 先做这些检查

用 `dsh_setup_info` 只读检查本地配置：不会写文件或调用模型，Desktop 关闭时也可使用。显式初始化后，用 `dsh_connection_info` 检查桌面适配器连接和有效权限；该操作也不调用模型。模型凭据只能通过另行授权的真实任务验证。

若没有 `codex plugin` 命令或无法发现插件，检查客户端是否支持便携 Agent Plugins 格式。已验证 CLI **0.163.0-alpha.10.2** 能发现插件，不代表所有 Codex 版本均受支持。可改用[独立 MCP 配置](STANDALONE-MCP.zh-CN.md)，同时只保留一种注册方式。随包启动器要求 Codex 的可执行文件搜索路径包含 `node`；桌面应用和终端的环境可能不同。

若初始化返回 `SETUP_INCOMPLETE`，先检查已存在的状态/工作目录，不要盲目删除或替换 token。恢复有效的私有配置，或通过[自定义配置](STANDALONE-MCP.zh-CN.md)选择新的短规范路径。

模型表示无法编辑文件可能符合预期：`allowedTools: []` 会拒绝所有模型工具。请先审查[权限配置](USAGE.zh-CN.md)，不要自动授予宽泛权限。

## 错误与运行限制

- `UNSUPPORTED_VERSION`：应使用 README 中列出的完整精确版本组合，其他版本需要新增并测试适配器；不要绕过检查。
- `DESKTOP_UNAVAILABLE`：应用未开、插件未配置/未启用，或双方状态目录不一致。
- `ALREADY_RUNNING` / `STALE_SOCKET`：不要删除活跃锁。崩溃后先确认 Desktop/Host 完全退出，再只删除状态目录中的 `bridge.lock`、`bridge.sock`、`ready.json`，保留 token、配置和工作区。
- `UNSAFE_PATH`：检查所有者、权限与路径是否包含软链接；不要随意修改共享目录权限。
- `SESSION_BUSY`：先等待或取消当前任务。
- `CAPACITY`：关闭闲置会话或忘记已结束任务；不会自动丢弃未审查结果。
- `OUTCOME_UNKNOWN`：操作可能已经执行，先查询状态，不要盲目重放。
- 获准工具需要人工审批时继续走 DSH 原有流程，在 Desktop 中处理；本项目不提供自动同意工具。
- 当前只返回有界文本，不转发 reasoning、工具日志、媒体或二进制附件；取消后的部分文本可返回，超过限制会标记截断。返回内容属于不可信子 Agent 数据。
- 暂无持久任务恢复、远程访问、多用户隔离、Windows 传输、在线 token 轮换、热权限更新或任意附件转发。

## 报告问题

提供桥接、DSH core、Cordis、Codex 和 Node 版本，安装方式、脱敏错误码和复现步骤。区分模拟测试与真实 Desktop 激活结果。不要附带 token、模型密钥、私有提示词或源码。报告漏洞前请阅读[安全说明](../SECURITY.md)。
