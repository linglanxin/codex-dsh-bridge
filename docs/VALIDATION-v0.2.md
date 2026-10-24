> Archived v0.2.0 evidence for DSH 0.2.0-rc.2 / Cordis 4.0.4. See the current guide for v0.2.1.

# Validation record / 验证记录

## v0.2.0 plugin packaging

- Strict typecheck/build and **23 tests passed, 0 failed, 0 skipped**. Added read-only setup/no-file-creation checks, repeat setup/token preservation, incomplete setup refusal, and relocated self-contained plugin startup with setup completed after MCP initialization. The adapter archive is staged in private persistent state and remains available after its original cached copy is removed.
- Portable `plugin.json` and `mcp.json` passed the official Agent Plugins 1.0.0 JSON schemas; the packaged Skill passed Skill Creator validation.
- The installed Codex CLI `0.163.0-alpha.10.2` discovered `dsh-desktop@dsh-desktop-bridge`, version `0.2.0`, through a read-only local-marketplace listing with temporary inline configuration overrides. The plugin was not installed into the user profile by this check.
- The MCP launcher uses a bundled CommonJS server and works after copying the plugin to a directory with spaces and no node_modules. It lists 10 tools even when configuration is missing and reconnects after explicit setup without restarting MCP.
- The extracted release ZIP was separately unpacked to a path with spaces: real Codex CLI discovery and SDK MCP initialization succeeded with 10 tools, no node_modules, no installation and no model calls. Its Desktop archive version and license/security resources were inspected.
- The installed Electron Node runtime again passed all 6 official-service adapter tests after the v0.2.0 changes.
- `npm run format:check` and `npm run verify:plugin` passed; dependency audit reported 0 vulnerabilities.
- `npm run package:plugin` prepared a local marketplace ZIP, Desktop npm archive, complete source ZIP and SHA-256 checksums. It includes bundled third-party license notices and excludes private state/dependencies/research scratch directories.

Actual Codex UI installation and signed DSH Desktop adapter activation/live-provider acceptance are still unverified.

## v0.1.0 baseline validation

Date: **2026-10-17 (Asia/Hong_Kong)**. Local platform: macOS arm64. Development runtime: Node **24.21.0**, npm **11.19.0**. Installed official Desktop: **0.2.0-rc.2**, bundled Electron **44.0.0** / Node **24.18.1**. Its targeted ASAR package manifests confirm Cordis **4.0.4** and six checked DSH core packages at **0.2.0-rc.2**; no credentials were read.

## Executed successfully

| Check                        | Observed result                                                                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean lockfile install       | `npm ci --ignore-scripts` succeeded, followed by the complete check command (20/20 passed)                                                                                                                                            |
| `npm run typecheck`          | Strict TypeScript compilation passed against exact target-release DSH services                                                                                                                                                        |
| `npm run build`              | MCP CLI and Desktop plugin built as ESM; executable CLI produced                                                                                                                                                                      |
| `npm test`                   | **20 tests passed, 0 failed, 0 skipped**                                                                                                                                                                                              |
| Official-service integration | Real Cordis Loader, AgentLoop, Session, Preset and default-model services; model provider is a scripted, keyless test adapter                                                                                                         |
| Built plugin lifecycle       | Loaded built plugin in a **simulated** `desktop` profile; task completed; unloading removed socket and disposed owned agents                                                                                                          |
| Permission execution         | Real tool executor denied unallowlisted tools; explicitly allowed fixture tool executed                                                                                                                                               |
| Model errors / cancellation  | Failure state redacted provider errors; cancellation waited for actual idle; timeout remained cooperative                                                                                                                             |
| Concurrency / shutdown       | Busy-session rejection, retained request deduplication/conflict, concurrent close joining, late-create disposal during shutdown                                                                                                       |
| Local security / bounds      | Independent token auth, browser-origin refusal, wrong protocol/extra fields/invalid JSON, oversized body refusal, private-file/symlink checks, byte-safe UTF-8 truncation                                                             |
| Workspaces                   | Separate detached Git worktrees; main checkout dirty file preserved; close preserved child edits                                                                                                                                      |
| MCP stdio                    | Official SDK client launched built server, listed 9 tools and completed a round trip against a test bridge                                                                                                                            |
| Bundled runtime              | **6 adapter tests passed** under the installed DSH Electron executable's Node mode, using the same simulated Profile and scripted provider; this did not open a Desktop window or launch a CLI/Web application                        |
| `npm run format:check`       | Formatting check passed                                                                                                                                                                                                               |
| `npm audit`                  | **0 reported vulnerabilities** at audit time; no guarantee about future advisories                                                                                                                                                    |
| Clean packed installation    | Local `.tgz` installed into an empty temporary npm project with production dependencies only; no DSH peers were auto-installed; packed MCP initialized, listed 9 tools, and returned `DESKTOP_UNAVAILABLE` when no bridge was present |
| Package inventory            | Runtime package contains built files, docs, examples, icon/locales, LICENSE/NOTICE; no token, private config, task workspace or node_modules                                                                                          |

Keyless official-service tests are in `tests/adapter.test.ts`; task/transport/worktree tests use controlled fixtures. The project CI file is prepared for Node 22/24 on macOS/Linux; **remote GitHub CI and the Node 22/Linux matrix have not been executed here**. No live model credentials or external paid requests were used.

## Not verified / 未验证

- Installation and activation inside the user's actual signed Desktop profile, including packaged Host module resolution and plugin-manager UI outcomes.
- Rendered English/Chinese plugin metadata and icon in the application.
- A real provider task using existing Desktop credentials and user-installed Skills/Tools.
- Human approval routing for tools that require it, live child editing under a selected real sandbox policy, and long-running external side effects.
- Later DSH Desktop/core releases, Windows named pipes, multi-user/remote deployments, or persistent recovery.

## User-run signed Desktop acceptance procedure

1. Review README and SECURITY. Build/pack locally. Save/finish current Desktop work before a restart; do not interrupt active sessions casually.
2. Initialize new short private state/workspace roots. Leave `allowedTools` empty. Set the explicit plugin config path.
3. Install the local package through the official Plugins surface or the Desktop-installed command while the application is quit. Reopen it; verify real activation and record shell/core/Cordis versions. Do not grant compatibility exemptions.
4. Inspect plugin metadata in English and Chinese. Run `doctor`: confirm existing-desktop, correct adapter and default-deny policy. No model call should occur.
5. Connect Codex using the documented stdio entry. Create a blank session, submit a harmless short response request, poll to terminal and inspect the returned text. This step uses the selected provider and may incur cost.
6. Submit an idle-session follow-up and verify context continuity. Request cancellation during a suitably bounded task; verify `cancelling` changes to a terminal state only after actual stop.
7. If tools are required, inspect exact tool names and implementations, allow only selected tools in local config, and reload. Test the real DSH approval UI where applicable. Remember that broad file/shell tools can reach outside cwd.
8. For code work, add a trusted repository to the allowlist and create a worktree session. Make one harmless child edit; verify the main checkout is unchanged. Review the diff; close the session and verify child files remain.
9. Disconnect/reconnect Codex and verify owned sessions still exist while Desktop remains running. Quit Desktop cleanly; verify calls fail explicitly and prompts are not replayed automatically after restart.
10. Record observations here before declaring a public supported release. Keep workspaces for review and remove them manually only when safe.

中文说明：20 项自动化测试与 6 项 bundled Electron Node 测试均通过，但后者使用模拟 Desktop Profile 与脚本模型。真实桌面应用安装、界面展示、现有模型凭据、Skills/Tools 和人工审批仍需按上面的步骤验收。
