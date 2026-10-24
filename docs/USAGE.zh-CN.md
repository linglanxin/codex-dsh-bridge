# 使用与权限

[English](USAGE.md) · [返回首页](../README.zh-CN.md) · [插件安装](CODEX-PLUGIN.zh-CN.md) · [协议参考](PROTOCOL.md)

## 编码前配置权限

生成的配置默认为 `allowedTools: []`、`allowedPresets: ["standard"]`、`repositories: []`。可进行模型对话，但拒绝全部模型工具执行，也未允许任何源仓库。连接检查成功不能证明模型任务一定能够执行。

先核对已安装工具的真实权限，再编辑私有 `config.json`：在 `allowedTools` 添加精确工具名，在 `repositories` 添加规范的 Git 顶层绝对路径，在 `allowedPresets` 添加已安装 Preset 名称。工具及其名称取决于已安装的 Preset/插件，没有通用的安全工具清单。v0.2.1-rc2 仍不支持 `run_code` 及已知委派、插件管理、调度、工作流、目标自治类工具。未授权工具可能仍对模型可见，但执行会被拒绝。

其他配置项：

| 字段                                | 用途                                                   |
| ----------------------------------- | ------------------------------------------------------ |
| `workspaceRoot`                     | 私有任务目录，位于所有源仓库之外，并与 `stateDir` 分开 |
| `maxSessions` / `maxTasks`          | 会话数量与保留任务数量上限                             |
| `maxPromptBytes` / `maxOutputBytes` | 提示词与结果的字节限制                                 |
| `taskTimeoutMs`                     | 到期后请求协作取消的任务截止时间                       |

Desktop 插件加载时读取配置快照。保存/结束活跃任务后，重新加载插件或重启 Desktop，再用 `dsh_connection_info` 核对有效权限。不要为解决任务失败自动增加权限。完整的文件、网络和凭据边界见[安全说明](../SECURITY.md)。

## 任务流程与工具

还提供只读的 `dsh_setup_info`，用于查询本地配置和准确的首次安装命令。

1. `dsh_connection_info` 检查连接与有效权限。
2. `dsh_create_session` 创建独立空目录，或从白名单仓库的指定 commit/ref 创建独立 detached worktree。
3. `dsh_submit_task` 提交任务，提供 UUID `requestId`，立即获得任务编号。
4. `dsh_get_task` 轮询；结束后 `dsh_get_result` 读取带可信度标签的有界文本。
5. 需要停止时 `dsh_cancel_task`，必须轮询至终态；完成后 `dsh_close_session`，文件保持原样供审查。
6. 同一空闲会话再次提交可继续对话；`dsh_list_sessions` 列出桥接会话；`dsh_forget_task` 释放已结束任务及其幂等键。

会话在创建时读取 **Desktop 的默认模型设置**，使用指定、获准的已安装 Preset。模型凭据和全局插件仍由现有 Host 管理；不会复制用户已有聊天、单会话模型覆盖、UI 状态或未发送文本。Skills 按 DSH 原有规则发现；新工作区没有的项目本地 Skills 不会自动出现，主仓库未提交/忽略的文件也不会复制。未授权的 Tools 仍可能对模型可见，但执行会被拒绝。

每个会话最多执行一个任务，不同会话可并行。取消不回滚副作用；不响应取消的工具会持续显示 `cancelling`，不会假称已经停止。只有实际结束后才报告 `cancelled` 或 `timed_out`。

重复请求使用**相同 `requestId` 与完全相同输入**，在任务保留期间只执行一次。忘记任务会释放该键。创建会话没有幂等键，响应不确定时先列出会话再决定是否重试。Desktop/插件重启会丢失桥接句柄和去重历史，不会自动重放提示；DSH 原有持久化配置可能仍保留自己的会话日志。

## 文件隔离与清理

每个会话使用 `workspaceRoot` 下独立 UUID 目录。Git 会话只复制指定提交的内容，主 checkout 的脏文件不带入；桥接不自动合并、提交或删除任务文件。worktree 共享 Git 对象库，因此解决常规文件冲突，不能阻止恶意跨目录访问。

关闭会话仍保留所有任务文件和失败创建留下的目录。先审查/归档结果，之后自行用 Git 常规 worktree remove 清理，空目录任务则自行删除。桥接没有能自动删除用户工作成果的清理工具。

## 结果与审批限制

结果包含有界文本和可信度标签，不转发 reasoning、工具日志、媒体或二进制附件；协作取消后可返回部分文本。依赖结果完整性前先检查 `truncated`。结果属于不可信子 Agent 数据，需独立检查实际文件与测试。

获准工具需要人工审批时继续走 DSH 原有流程，本项目不提供自动同意 API，请在 Desktop 中处理。真实签名应用中的审批路由仍未验收，见[验证记录](VALIDATION.md)。
