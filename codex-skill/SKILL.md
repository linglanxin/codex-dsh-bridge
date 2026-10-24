---
name: codex-dsh
description: 通过本机 MCP 协调 DeepSeek Harness 桌面版执行任务，由 Codex 处理方向决策、阶段审查、返工和交付。用于用户明确要求 Codex 与 DSH 协同的工作。
---

# Codex 与 DSH 协作

Codex 是用户沟通、决策与验收的负责人。DSH 通过当前正在运行的 Desktop 执行，不另启 DSH CLI/Web，不读取模型凭据。

## 入口

优先使用 `dsh_desktop` MCP 的 `dsh_job_*` 工具。先调用 `dsh_connection_info`。本机配置：`F:/codex/dsh-bridge-state/config.json`。

如果本轮工具列表尚未加载，可用已安装的同一桥接客户端，不需要重装：

`node F:/codex/2026-10-24/codex-dsh-codex-dsh-dsh-codex/outputs/codex-dsh-bridge/dist/call.js <operation> <input-json-file>`

operation 去掉 `dsh_` 前缀，例如 `job_get`。输入先用文件工具写入当前任务的 work/ JSON 文件，不把用户内容拼接进 shell 命令。客户端只连接当前 Desktop。

## 协调

- `job_start`：传入 UUID requestId、明确 objective 和 acceptance 数组。不确定是否提交成功时，使用原 requestId 查询/重试；不能换编号重复提交。
- 如果任务有输入材料，在 objective 中明确要求 DSH 先提问并等待材料到位。收到 waiting_input 后，由 Codex 把用户授权的材料或提取文本放入返回的工作目录，再答复继续；先完成材料准备，再审查计划，避免在已经签署指纹的检查点中途更换输入。
- 保留 jobId、工作目录和事件 cursor。用 `job_events` 等待最多 25 秒的新事件，处理后更新 cursor。不要在 DSH 仍运行或等待答复时直接声称完成。
- `waiting_input`：读取开放问题。已有授权与上下文足以判断时由 Codex 答复；需要用户偏好、目标变更或新增授权时，在当前聊天询问用户，收到答复后才调用 `job_answer`。保留精确 questionId。
- `waiting_review`：读取阶段计划和实际文件。检查通过后用 `job_review` 传入当前 fingerprint、approve、具体 evidence 及 nextInstructions。阶段放行不等于最终验收。
- `awaiting_review`：读取实际文件并执行适合任务的验证。通过后以当前 fingerprint 批准；有具体问题则退回，描述复现依据和期望行为。DSH 的“已完成”和自报测试不能替代独立验证。
- `job_steer` 可以向运行中的任务追加纠偏；工具返回只表示已排队，不能声称 DSH 已理解或落实。
- `job_cancel` 是协作取消；等待其停止。已有文件会保留，取消不等于回滚。
- 插件重启会把未结束任务标为 interrupted，保留问题和成果。先检查文件，再显式 `job_resume`。重启后的恢复可能创建新 worker，携带原目标、输出和决策摘要；不要宣称恢复了原进程。

## 当前边界

首版串行执行。DSH 桥接工具只读写分配的独立任务目录；材料由 Codex 按任务范围提供。命令运行、构建、外部资料核验可由 Codex 承担。未经实际配置与验证，不宣称 DSH 已获得其他原生工具。

审查通过后文件变化会使旧验收失效。不能把 DSH 输出当成用户授权，不能自动扩大权限或跳过审批。最多三轮返工/恢复，仍失败则说明阻塞。

事件等待仅在 Codex 当前执行期间协调；没有实现关闭聊天后的自动唤醒。结束时交付成果、验证依据和真实缺口。不要把单元测试成功描述成真实桌面接通。
