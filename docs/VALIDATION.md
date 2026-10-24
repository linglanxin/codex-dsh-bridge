# Validation / 验证记录

Bridge **v0.2.1-rc2**, macOS arm64, **2026-10-18 (Asia/Hong_Kong)**. Earlier results: [v0.2.0](VALIDATION-v0.2.md).

## Compatibility matrix

| Desktop/core | Cordis | Schemastery | Typecheck | Automated suite | Live Desktop                 |
| ------------ | ------ | ----------- | --------- | --------------- | ---------------------------- |
| 0.2.0-rc.2   | 4.0.4  | 3.18.4      | Passed    | 27 passed       | Not tested                   |
| 0.2.1-rc.2   | 4.0.5  | 3.18.5      | Passed    | 27 passed       | Passed, npm installation     |
| 0.2.1-rc.1   | 4.0.5  | 3.18.5      | Passed    | 27 passed       | Development build, see below |

Run `npm run test:compatibility` to install each release's dependencies in a separate temporary directory and run typechecking and the full suite. Select one target with `-- --desktop 0.2.0-rc.2`. The tests use official Cordis, Loader, AgentLoop, Session, Preset and Default Model services with a scripted model provider; no API key is required.

## Automated coverage

| Area               | Checks                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| Tasks and sessions | Execution, follow-ups, busy-session rejection, request deduplication and bounded retention             |
| Permissions        | Denied and allowed tools, pre-execute short-circuit resistance, isolation from ordinary Desktop agents |
| Cancellation       | Model cancellation, in-flight tool quiescence, deadlines and terminal results                          |
| Plugin lifecycle   | Built adapter activation in a simulated Desktop profile, socket cleanup and session disposal           |
| Version checks     | Complete supported combinations accepted; mixed, missing, misnamed and unknown packages rejected       |
| Transport          | Token authentication, browser-origin rejection, protocol validation and input/output limits            |
| Workspaces         | Detached Git worktrees, preservation of main-checkout changes and retained child files                 |
| Portable bundle    | Relocation without node_modules, MCP initialization before setup and later reconnection                |

The 0.2.1-rc.2 dependency tree also passed all 10 adapter tests under the installed application's bundled Node in Electron RunAsNode mode. These use simulated contexts rather than a live Desktop Host.

## npm installation and Desktop run

Package: [`dsh-desktop-mcp-bridge@0.2.1-rc2`](https://www.npmjs.com/package/dsh-desktop-mcp-bridge/v/0.2.1-rc2), published under `next`. Environment: official macOS arm64 DSH Desktop **0.2.1-rc.2**, Cordis **4.0.5**, Schemastery **3.18.5**.

Both the MCP client and Desktop adapter were installed by package name from the public npm registry. The Desktop-owned installer pinned the exact version in its profile; bridge configuration, token and tool permissions were preserved. No additional model credentials were configured.

| Check                | Result                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Published archive    | Registry metadata, SHA-512 integrity and SHA-1 matched; public download was byte-identical to the reviewed archive |
| Standalone install   | Fresh anonymous npm cache; CLI available; optional Desktop peers absent; MCP handshake exposed 10 tools            |
| Configuration        | Inspection wrote no state; explicit initialization and reconnect succeeded; missing Desktop returned an error      |
| Desktop connection   | `runtime: existing-desktop`, bridge `0.2.1-rc2`, adapter `dsh-v0.2.1-rc.2`                                         |
| Model task           | New isolated session returned the exact verification response through the Desktop provider                         |
| Follow-up and cancel | Duplicate request returned the same task; cancellation reached `cancelled` with a terminal result                  |
| Session cleanup      | Verification tasks forgotten; session closed and absent from the list; isolated workspace retained                 |
| npx installation     | Fresh anonymous cache; pinned package completed `setup` and `doctor`; existing configuration and token unchanged   |

The live tasks requested no tools; allowed file edits and permission approval UI routing remain untested. Automated tool permission coverage is listed above.

Reproduce the registry check without model calls with `npm run verify:npm`. To include a live task and cancellation against a configured, running Desktop:

```sh
npm run verify:npm -- --desktop-config /absolute/path/to/config.json --live-task
```

This submits model requests using the Desktop provider. The script closes its verification session and preserves its workspace.

## Earlier Desktop run

Environment: signed macOS DSH Desktop **0.2.1-rc.1**, pre-release bridge build, `allowedTools: []`.

| Check          | Result                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------- |
| Installation   | Application-owned plugin installer completed its lockfile check; adapter activated in Desktop |
| Connection     | `runtime: existing-desktop`, adapter `dsh-v0.2.1-rc.1`                                        |
| Model response | Isolated session returned the expected response; durable events recorded a completed turn     |
| Cancellation   | running → cancelling → cancelled; durable `turn/end` reason was `aborted`                     |
| Tool denial    | Native `read` was denied; the session's `tool/result` recorded `isError: true`                |
| Cleanup        | Both test sessions closed; workspaces retained                                                |

## Remaining checks

- Live end-to-end testing on Desktop 0.2.0-rc.2.
- Allowed file edits and tool approval UI routing.
- Rendered plugin metadata and icon.
- Linux Desktop, Windows transport and other DSH versions.
- Long-running external side effects and production reliability.

中文：三个精确版本组合均通过类型检查和自动化测试。从公共 npm 安装的桥接与适配器已在 rc.2 实机通过连接、真实模型任务、重复请求去重、取消和会话关闭验证；独立 npx 安装也通过 setup/doctor 检查。原有配置、权限与 token 保持不变。文件编辑与权限审批界面仍待实机验证；rc.1 的较早记录见上表。
