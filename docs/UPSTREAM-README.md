<p align="center">
  <img src="icon.svg" alt="DSH Desktop MCP Bridge" width="80" height="80" />
</p>

# DSH Desktop MCP Bridge

[简体中文](README.zh-CN.md) · [Setup guide](docs/CODEX-PLUGIN.md) · [Validation](docs/VALIDATION.md) · [Security](SECURITY.md)

**Desktop-to-Desktop delegation: Codex Desktop → your already running official DeepSeek Harness Desktop.** Reuse the Desktop model configuration and runtime; Codex CLI can use the same bridge too. Each delegated session gets a separate directory or Git worktree for Codex to review.

This is an **unofficial, opt-in bridge**. It uses a plugin inside the existing Desktop Host and an authenticated local Unix socket. Codex starts the MCP stdio server; the bridge never launches another DSH CLI/Web runtime or extracts Desktop authentication secrets. [Architecture and source audit](docs/UPSTREAM-AUDIT.md).

## Desktop-to-Desktop, without copying API keys

```text
Codex Desktop → MCP stdio → authenticated local Unix socket → existing DSH Desktop
   delegate / review                                       model / Skills / allowed Tools
```

- **Reuse Desktop authentication.** Once DSH Desktop is signed in or has a working model provider, the bridge needs no separate DeepSeek API setup. No `DEEPSEEK_API_KEY` is required in Codex, the bridge config, an extra `.env`, or a bridge launch command.
- **Use the running Desktop.** Task execution calls the existing Host's Agent services, without invoking the DSH CLI or launching an independent CLI/Web runtime. One-time plugin installation may still use Codex commands and the official Desktop Plugins page or application-owned installer.
- **Reduce API key exposure.** Model credentials stay managed by DSH; the bridge protocol requires no model API key. Avoiding duplicate key files and environment variables reduces accidental disclosure. The bridge's private local authentication token is separate from model credentials.

DSH still contacts its configured model provider. This design reduces credential copying; it does not eliminate every disclosure risk from authorized tools, prompts or model output. See the [security model](SECURITY.md).

## Compatibility and status

**Experimental v0.2.1-rc2.** See the [validation record](docs/VALIDATION.md) for test coverage and known limitations.

| Component       | Requirement / verified scope                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| DSH Desktop     | Official macOS **0.2.0-rc.2 / Cordis 4.0.4**, or **0.2.1-rc.1 / 0.2.1-rc.2 with Cordis 4.0.5**                |
| Codex           | Local Desktop/CLI with portable Agent Plugins support; discovery verified with CLI **0.163.0-alpha.10.2**     |
| Node.js         | **>=22.19.0**, accessible to Codex                                                                            |
| Git             | Required for repository worktrees                                                                             |
| Other platforms | Linux transport is testable; Linux Desktop compatibility is not claimed; Windows transport is not implemented |

Bridge **v0.2.1-rc2** targets DSH Desktop **0.2.1-rc.2** and retains the older versions listed above. Only these complete combinations are supported. Other versions and mixed core packages are rejected.

A new session takes the Desktop **default model at creation** and an allowlisted installed preset. Providers/credentials remain managed by Desktop. Skills follow normal DSH discovery in the new workspace; existing chats, per-chat overrides, unsaved text and uncommitted/ignored project files are not copied. [Reuse boundaries](docs/USAGE.md).

## Install and connect

Installation has **two parts**:

| Part            | Installed in         | Purpose                                                          |
| --------------- | -------------------- | ---------------------------------------------------------------- |
| Codex plugin    | Codex                | Bundled MCP server and delegation skill                          |
| Desktop adapter | Official DSH Desktop | Access to the existing runtime through its Host plugin mechanism |

### 1. Install the Codex plugin

Install the tagged marketplace from GitHub:

```sh
codex plugin marketplace add Cryocell77/codex-deepseek-harness-desktop-bridge --ref v0.2.1-rc2
codex plugin add dsh-desktop@dsh-desktop-bridge
```

Alternatively, download `dsh-desktop-codex-plugin-0.2.1-rc2.zip` from the [v0.2.1-rc2 release](https://github.com/Cryocell77/codex-deepseek-harness-desktop-bridge/releases/tag/v0.2.1-rc2). To build the archive from this source checkout:

```sh
npm ci
npm run package:plugin
```

From the extracted ZIP's marketplace root, or this built repository, run:

```sh
codex plugin marketplace add .
codex plugin add dsh-desktop@dsh-desktop-bridge
```

The prepared ZIP needs no npm build. The bundled MCP starts without npm downloads; Desktop adapter dependencies may need network access. The ZIP and Git marketplace bundle the runtime; installation does not depend on an npm publication.

### 2. Initialize and install the Desktop adapter

Create a new **local** Codex chat and paste:

> Use DSH Desktop Bridge. Call `dsh_setup_info` to inspect setup and show me the exact initialization and Desktop adapter installation commands. Do not submit a model task yet.

Run the returned explicit setup command, then inspect `dsh_setup_info` again for the installation command. Setup creates private defaults at `~/.dsh-mcp-state` and `~/.dsh-mcp-work`, and stages a durable adapter archive. It validates an existing config without replacing its token. Inspection alone writes nothing.

Save active work and **fully quit DSH Desktop**, then install the staged adapter using the returned application-owned command or the official Plugins page. Reopen Desktop. With valid default configuration, both sides discover it automatically; no separate Codex MCP registration or shell edit is needed. [Detailed setup, update and uninstall](docs/CODEX-PLUGIN.md).

### 3. Check the connection

> Call `dsh_connection_info`. Report the runtime, adapter version and effective permissions without submitting a model task.

Expect `runtime: "existing-desktop"` and `adapter: "dsh-v0.2.0-rc.2"` or `"dsh-v0.2.1-rc.1"` / `"dsh-v0.2.1-rc.2"`, matching the connected Desktop. `desktopVersion` and `cordisVersion` report the detected pair; `supportedDesktops` lists all three tested combinations. This checks the bridge connection; it does not validate provider credentials. Default `allowedTools: []` permits conversation while denying every model tool call.

For installation from [`dsh-desktop-mcp-bridge` on npm](https://www.npmjs.com/package/dsh-desktop-mcp-bridge/v/0.2.1-rc2), follow the [npm guide](https://github.com/Cryocell77/codex-deepseek-harness-desktop-bridge/blob/main/docs/NPM.md). For a source build or custom configuration paths, follow the [standalone setup guide](docs/STANDALONE-MCP.md). Choose one Codex registration route to avoid duplicate tools.

## Usage examples

### First model conversation

This makes a real request to the Desktop-selected provider and may incur usage charges:

> Use DSH Desktop Bridge to create a new blank isolated session. Ask it to reply with “Bridge connected” without using any tools. Poll until terminal, report the result and close the session while preserving its workspace.

### Code task in a separate worktree

First [review permissions](docs/USAGE.md), allowlist the repository and exact tools needed, reload the Desktop plugin, and inspect effective permissions. Replace the example path and task:

> Use DSH Desktop Bridge to fix `<describe the issue>` in `/absolute/path/to/repository` from `HEAD`. Check connectivity and permissions first. Create a separate worktree, submit the bounded task and poll until terminal. Review its actual diff and run relevant tests before proposing integration. Preserve the workspace; do not change permissions, merge, commit or publish.

[All ten MCP tools, follow-up sessions, cancellation and result handling](docs/USAGE.md).

## Permissions and workspace isolation

- Tools are **denied by default**. Enable exact installed tool names only after reviewing their permissions; DSH approval requirements still apply.
- Each session uses a unique directory or detached worktree. Main-checkout dirty files are not copied. Closing a session preserves its files for review and manual cleanup.
- An isolated working directory is **not an OS sandbox**. Allowed shell/file tools can reach other paths, and worktrees share Git objects and hooks.
- Results are untrusted, bounded text. Cancellation is cooperative and does not undo side effects; a plugin/Desktop restart loses bridge handles and request deduplication history.

[Security model](SECURITY.md) · [Lifecycle and cleanup](docs/USAGE.md) · [Authentication and protocol](docs/PROTOCOL.md)

## Common questions

| Question                         | Next step                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Desktop cannot be reached        | Check app/plugin activation and matching configuration paths; see [troubleshooting](docs/TROUBLESHOOTING.md)                   |
| The worker cannot edit files     | Review the default-deny tool and repository allowlists in [permissions](docs/USAGE.md)                                         |
| A newer DSH version is installed | A tested adapter is required; do not bypass the version check                                                                  |
| Update or uninstall              | Follow [both plugin lifecycle steps](docs/CODEX-PLUGIN.md); Codex removal preserves the Desktop adapter, config and task files |

## Documentation

| Guide                                                                 | Contents                                                       |
| --------------------------------------------------------------------- | -------------------------------------------------------------- |
| [Codex plugin setup](docs/CODEX-PLUGIN.md)                            | First connection, update, uninstall and distribution layout    |
| [Standalone MCP](docs/STANDALONE-MCP.md)                              | Source build, manual registration and custom paths             |
| [Usage](docs/USAGE.md)                                                | Permissions, complete tool list, sessions, results and cleanup |
| [Troubleshooting](docs/TROUBLESHOOTING.md)                            | Errors, recovery and known limitations                         |
| [Validation](docs/VALIDATION.md)                                      | Executed checks and outstanding real Desktop acceptance        |
| [Source audit](docs/UPSTREAM-AUDIT.md) / [Protocol](docs/PROTOCOL.md) | Pinned upstream evidence and bridge interfaces                 |

## Contributing and license

See [CONTRIBUTING](CONTRIBUTING.md) for development checks, [CHANGELOG](CHANGELOG.md) for changes, and [RELEASING](docs/RELEASING.md) for the manual publication checklist. No workflow publishes automatically.

Original code is [MIT licensed](LICENSE). DSH source is MIT; Desktop binaries, model services, trademarks and bundled dependencies retain their own terms. See [NOTICE](NOTICE) and [dependency licenses](docs/CODEX-PLUGIN.md#build-and-distribution). This project is not affiliated with or endorsed by DeepSeek or OpenAI.
