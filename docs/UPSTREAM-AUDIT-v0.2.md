> Archived v0.2.0 evidence for DSH 0.2.0-rc.2 / Cordis 4.0.4. See the current guide for v0.2.1.

# Official upstream audit / 官方源码核实

Audited on **2026-10-17 (Asia/Hong_Kong)**.

| Subject                  | Observed source/version                                                                                                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Official repository      | https://github.com/deepseek-ai/deepseek-harness                                                                                                                                                                       |
| Official master at audit | `1600d8a1e140dcde43a1a0941940a0480712c011`, release `0.2.1-rc.1`, commit dated 2026-10-16                                                                                                                             |
| Installed macOS bundle   | `/Applications/DeepSeek Harness.app`, `CFBundleShortVersionString = 0.2.0-rc.2` (Info.plist read only; targeted ASAR package manifests also confirm Cordis 4.0.4 and all six guarded DSH core packages at 0.2.0-rc.2) |
| Adapter target           | tag `dsh-v0.2.0-rc.2`, commit `639ed015397290b3745d163aafe02ffee4aa3f84`, dated 2026-09-29                                                                                                                            |
| Source license           | MIT, copyright 2026 DeepSeek                                                                                                                                                                                          |
| Codex configuration      | https://learn.chatgpt.com/docs/extend/mcp (official OpenAI documentation, redirected from developers.openai.com/codex/extend/mcp)                                                                                     |

## Findings and implementation decisions

1. **Desktop architecture.** [Official master Desktop README](https://github.com/deepseek-ai/deepseek-harness/blob/1600d8a1e140dcde43a1a0941940a0480712c011/apps/desktop/README.md) and [target release README](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/desktop/README.md): Electron starts the complete shared profile Host in an Electron RunAsNode child, uses Node IPC for readiness/shutdown, and owns `$DSH_HOME/profiles/desktop`. The Host binds `127.0.0.1` and normally receives an OS-assigned port. Installing a plugin composes it into this existing Host, instead of starting a separate `dsh web` process.

2. **Authentication.** [web-document.ts](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/desktop/src/web-document.ts) exchanges the launch URL for an authority-bound browser cookie. [main.ts](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/desktop/src/main.ts) attaches Host credentials only to matching owned-window WebSocket requests. Existing Session/Workspace remote APIs are behind that application's authenticated transport. Neither source documents a stable third-party Desktop attach/pairing protocol. The bridge uses a separate authenticated Unix socket without accessing Host credentials.

3. **Supported extension mechanism, pre-stable service APIs.** [Official plugin developer reference](https://github.com/deepseek-ai/deepseek-harness/blob/1600d8a1e140dcde43a1a0941940a0480712c011/packages/preset/agent-preset/skills/cordis-plugin-development/references/host-plugin.md) describes `dsh.bundle.patch`, named `apply`/`inject` exports and `ctx.effect` cleanup. The released Desktop README documents local package installation through the Plugins page or the Desktop-installed command while Desktop is quit. [Plugin manager README](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/boot/plugin-manager/README.md) owns activation, dependency checks and restart outcomes. These are official extension surfaces; the bridge itself is an unofficial plugin. DSH APIs are pre-stable, so exact release checking is deliberate.

4. **Agent ownership and lifecycle.** [Agent registry](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/src/index.ts) exposes `agents.create`, returning an owned `AgentHandle` with `dispose()`. [Runtime types](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/src/runtime-types.ts) expose `followup`, `cancel`, `whenIdle`. The bridge creates new root sessions within the Desktop registry; existing chat state is not inherited.

5. **Composition and configured model.** [Preset registry](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/preset/agent-preset-registry/src/index.ts) exposes `resolve`/`mount`. [Default model service](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent-default-model/src/index.ts) exposes `currentSelection()`. The bridge follows the same composition direction as the official [Session controller's create path](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/api/session-controller/src/agent.ts), with explicit preset selection and a fresh cwd. Credentials stay inside existing providers. Scope-local capabilities mount from the selected preset; the bridge cannot promise that every globally installed/disabled plugin is an available tool, or that ignored project-local Skills will appear in a worktree.

6. **Permission enforcement.** [Tools service](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/tools/src/index.ts) defines scope-filtered `tools/pre-execute` and `tools/execute` waterfalls. The adapter installs exact-name checks before mounting the preset. Real executor tests demonstrate deny/allow behavior; an instruction in a prompt is not the enforcement mechanism. Trusted in-process plugins can still execute host code and powerful allowed tools can escape cwd. This is not a plugin sandbox or a defense against malicious same-user software.

7. **Result and cancellation evidence.** [Session event vocabulary](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/session/src/types.ts) defines durable `assistant/message` and `turn/end` with completed/error/aborted/blocked/token-limit reasons. The adapter reads events since submission and waits for the agent to stop before returning a terminal cancellation result.

8. **License.** [Pinned LICENSE](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/LICENSE) and [master LICENSE](https://github.com/deepseek-ai/deepseek-harness/blob/1600d8a1e140dcde43a1a0941940a0480712c011/LICENSE) are MIT. This independently written adapter can use MIT; [NOTICE](../NOTICE) retains attribution and the upstream license. npm dependencies retain separate licenses in their distributions. An MIT source license is not evidence that API service access is free, or permission to distribute trademarks/account credentials. The official binary's distribution terms are not re-licensed by this project.

## Supported scope and unresolved evidence

- Official plugin mechanism and released service calls are source-verified; the service APIs are pre-stable.
- Exact npm release packages and the rc.2 vendored Cordis/Loader dependency versions were used for real keyless Loader/AgentLoop tests; the installed Electron application and profile were not mutated.
- Actual signed macOS Desktop activation, resolver behavior in the packaged Host, rendered plugin metadata, approval UI integration and a live model task remain acceptance-test items.
- Current master has changed runtime/preset implementations; no compatibility override exists. Add a new version-tested adapter before enabling a later Desktop release.
- Profile-name and package-version checks reduce accidental misuse; they are not cryptographic attestation that a process is an official signed binary.

## 中文结论

官方桌面端确实运行完整 Host，并有应用专用认证。没有在审查范围内发现面向第三方 MCP 的受支持直接连接协议，因此使用官方插件扩展机制，在现有 Host 内调用公开 Agent/Preset 服务，再开放项目自己的私有本地 socket。没有绕过认证，没有启动第二套运行时。公开服务目前是预稳定 API，所以适配器锁定用户本机的 `0.2.0-rc.2`，拒绝不匹配版本；尚未进行真实桌面应用安装激活与模型验收。MIT 选择基于官方源码许可证，不能推导出模型服务、商标或二进制分发的额外授权。
