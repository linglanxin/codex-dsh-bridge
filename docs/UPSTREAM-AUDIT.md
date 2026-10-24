# Official upstream audit / 官方源码核实

Bridge **v0.2.1-rc2**, reviewed **2026-10-18**. [Earlier audit](UPSTREAM-AUDIT-v0.2.md).

| Subject                | Verified target                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| Official repository    | https://github.com/deepseek-ai/deepseek-harness                                                       |
| New pinned release     | `dsh-v0.2.1-rc.2`, commit `687f282e8625c6b8d11ff58211a90524be2e4317`                                  |
| Old pinned release     | `dsh-v0.2.0-rc.2`, commit `639ed015397290b3745d163aafe02ffee4aa3f84`, Cordis `4.0.4`, schema `3.18.4` |
| Installed macOS app    | `/Applications/DeepSeek Harness.app`, Info.plist `0.2.1-rc.2`                                         |
| Bundled core manifests | Agent, Session, LLM, Tools, Preset Registry and Default Model: `0.2.1-rc.2`                           |
| Cordis / schema        | `4.0.5` / `3.18.5`                                                                                    |
| Source license         | MIT; see [NOTICE](../NOTICE)                                                                          |

The installed application was inspected read-only, including targeted manifests in `app.asar`; no application file, cookie, launch secret or provider credential was extracted or patched. The release SHA matches the local upstream checkout and [official release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.2).

## Current extension and authentication model

The [official Desktop README](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/apps/desktop/README.md) continues to describe an Electron-owned Host and Desktop profile, with application authentication and a documented plugin installation surface. No supported external MCP attach/pairing API was established by this audit. The bridge uses a Cordis plugin in that existing Host and its own private Unix socket/token protocol. It never boots a CLI/Web replacement or reads Host authentication material.

All three supported releases provide `pluginPackages.packageOf` and `tools.guard()`: see the older [metadata service](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/boot/app-boot/src/profile-resolution/service.ts) and [Tools service](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/tools/src/index.ts).

## Shared adapter decisions

- **Metadata:** `ctx.pluginPackages.packageOf(specifier, parentURL)` is the official [profile package metadata service](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/boot/app-boot/src/profile-resolution/service.ts). Use it instead of independently guessing package resolution in the Desktop ASAR/profile layout. Missing service/package or any mismatching guarded version fails closed.
- **Permissions:** the [Tools service](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/tools/src/index.ts) provides monotonic `tools.guard()` in all supported releases. A scope-local guard may deny or abstain; an extensible pre-execute listener cannot force-allow a denial. The bridge registers it through each new agent context before mounting the preset and retains the earlier pre-execute/execute checks. Real executor tests verify short-circuit resistance and that ordinary unguarded Desktop agents still execute tools. Trusted in-process code remains outside the threat model.
- **Preset lifecycle:** the [registry](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/preset/agent-preset-registry/src/index.ts) tracks retained compositions internally; the adapter uses its public `resolve` and `mount`, without inspecting internal mount storage. Model selection continues through `agentDefaultModel.currentSelection()`.
- **Tasks/cancellation:** `agents.create`, `followup`, `whenIdle`, `cancel` and owned-handle disposal remain the integration path. Results are read from durable `assistant/message` and `turn/end` events. Compatibility tests cover model cancellation, delayed tool quiescence, task deadlines and completed/cancelled results through the private socket.
- **Dependencies:** runtime peers allow three exact releases. Development pins use the newer release; the independent matrix runner switches to all older DSH and vendor pins (Cordis 4.0.4, Loader 1.0.5, Group 1.0.4, Include 1.0.9, Schemastery 3.18.4). The production metadata guard requires one complete pair across all six DSH core packages, Cordis and Schemastery, not independently mixed peer ranges. No version exemptions or legacy peer-dependency bypasses are used.

## Supported scope

The adapter accepts three complete combinations:

| DSH core   | Cordis | Schemastery |
| ---------- | ------ | ----------- |
| 0.2.0-rc.2 | 4.0.4  | 3.18.4      |
| 0.2.1-rc.1 | 4.0.5  | 3.18.5      |
| 0.2.1-rc.2 | 4.0.5  | 3.18.5      |

The rc.1 → rc.2 source diff leaves the Host authentication, package metadata, Agent, AgentLoop, Session, Tools, Preset Registry, Default Model and LLM interfaces used by this bridge unchanged. Vendored Cordis and Schemastery are unchanged. The installed rc.2 application's ASAR manifests match the latest combination above. The MIT license is unchanged. Test results and platform limits are in [VALIDATION.md](VALIDATION.md).

中文：rc.2 保持了桥接使用的 Host、Agent、会话与工具权限接口，Cordis 和 Schemastery 版本也未变化。适配器增加精确 rc.2 组合，继续使用现有 Desktop Host、独立 socket 认证和原有工具白名单。
