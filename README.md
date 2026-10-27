# Codex × DeepSeek Harness Desktop — Windows

由 Codex 接收任务、制定验收标准和监督进度，DeepSeek Harness Desktop 执行；遇到方向问题暂停并回传 Codex，成果由 Codex 检查，必要时在同一会话中返工。

这是基于 [DSH Desktop MCP Bridge](https://github.com/Cryocell77/deepseek-harness-desktop-mcp-bridge) 的实验性 Windows 适配与监督流程扩展。保留上游 MIT 许可证及第三方归属，与 OpenAI、DeepSeek 无官方隶属关系。

## 安装与市场发现

当前公开预发布版本为 **0.2.1-rc3-windows.5**。安装包、官方格式索引与跨电脑配置步骤见 [市场安装说明](docs/MARKETPLACE.md)。本项目为社区插件；索引可供 DSH 加载，不代表官方审核收录。

## 已实现

- Windows 命名管道通信与本地认证，连接已运行的 DSH Desktop。
- MCP 异步派发、事件等待、状态查询、取消和显式恢复。
- 结构化方向问答，绑定任务和问题编号。
- 写入前的计划检查点、执行后的独立验收与退回修改。
- 成果指纹：验收后的文件变化使旧验收失效。
- 独立任务目录、限制路径的文件工具及 Windows 状态目录权限检查。
- 可指定 DSH 工作区名称，桥接创建的会话自动归入该工作区。

```text
用户 → Codex → MCP → DSH Desktop 插件
         ↑               ↓
         └─ 问题 / 检查点 / 成果 ─┘
```

## 当前验证范围

本机实测：Windows，DSH Desktop **0.2.1-rc.3**，桥接 **0.2.1-rc3-windows.4**，Cordis 4.0.5，Schemastery 3.18.5。

- 37 项自动检查通过（含新增的工作区归属与失败处理检查）。
- 真实模型完成“提问 → 答复 → 计划审查 → 写文件 → 验收”。
- 真实模型完成同一会话中的“初稿 → 退回修改 → 复验通过”。
- DSH 实机创建 `codex自动` 工作区，通过桥接新建会话并核实持久化归属，见 [工作区验证](WORKSPACE-VERIFICATION.json)。此项验证无需调用模型。

详见 [验证结果](验证结果.md)、[兼容性核对](兼容性核对.md) 和两份 `LIVE-*.json` 记录。受控测试与真实模型联调在记录中分别标明；尚未做长期稳定性验证。

## 开发与检查

需要 Node.js 22.19+、npm，以及已配置模型的官方 DSH Desktop。复现 Windows 验证环境建议使用 Node.js 24。

```sh
npm ci --ignore-scripts
npm run check
```

公开版本的配置步骤见 [市场安装说明](docs/MARKETPLACE.md)。[本机使用说明](使用说明.md)、协作技能和历史联调脚本保留原部署路径作为记录；公开运行入口默认使用当前账号目录。

## 运行边界

首版串行执行。DSH 默认只获得任务目录内的文件工具，构建、命令运行和外部核验可由 Codex 处理。输入材料由 Codex 在计划审查前按授权范围准备。任务目录限制并非操作系统级沙箱。

当前聊天执行期间可等待 DSH 事件；关闭 Codex 聊天后的自动唤醒尚未实现。取消保留已写文件；中断后的任务需检查成果后显式恢复。

仓库不包含本机认证令牌、模型凭据、Desktop 二进制和安装日志。运行时状态目录及认证文件应保持私有。

## 上游与许可

- [Cryocell77/deepseek-harness-desktop-mcp-bridge](https://github.com/Cryocell77/deepseek-harness-desktop-mcp-bridge)：原始桌面桥接实现。
- [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)：官方 Harness 与扩展接口。
- 上游原始说明保存在 `docs/UPSTREAM-README*.md`。

许可证与归属见 [LICENSE](LICENSE)、[NOTICE](NOTICE) 和打包运行时的第三方许可证。
