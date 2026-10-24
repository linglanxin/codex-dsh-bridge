<p align="center">
  <img src="assets/icon.svg" alt="DSH Desktop MCP Bridge" width="80" height="80" />
</p>

# DSH Desktop Bridge — Codex plugin

[简体中文](README.zh-CN.md)

**Desktop-to-Desktop:** reuse the running DSH Desktop and its configured provider, without another model API key in Codex or bridge configuration. Task execution does not invoke the DSH CLI; installation can still use the application-owned installer. This reduces duplicated API key exposure while keeping DSH provider calls and tool permissions in effect.

Installation has two parts: this Codex plugin contains a self-contained MCP server and delegation skill; the bundled adapter must also be installed separately into official DSH Desktop. Requires Node >=22.19 and official DSH Desktop **0.2.0-rc.2 / Cordis 4.0.4** or **0.2.1-rc.1 / 0.2.1-rc.2 with Cordis 4.0.5**. Starting the MCP server downloads nothing and never launches another Harness CLI/Web runtime.

Extract the prepared marketplace ZIP, then from its root:

```sh
codex plugin marketplace add .
codex plugin add dsh-desktop@dsh-desktop-bridge
```

For a source checkout, first run `npm ci && npm run package:plugin`. The prepared ZIP needs no npm setup. Release archives are available from the repository releases page; no published npm package is required.

Create a new local Codex chat and ask it to check DSH Desktop Bridge setup without submitting a model task. `dsh_setup_info` returns exact paths in the installed copy. Run its explicit setup command to initialize private `~/.dsh-mcp-state` and `~/.dsh-mcp-work` with tools denied by default; repeat setup validates existing config without rotating the token. Setup also copies the Desktop archive into private state `adapters/` for a durable installation path independent of the Codex cache. Inspection alone creates no files.

After setup, call `dsh_setup_info` again to obtain `desktopInstall`, which points to the durable staged archive. Save active tasks and fully quit DSH Desktop yourself. Install that archive through official Plugins or the returned Desktop-owned command, then reopen Desktop. The returned application path assumes `/Applications/DeepSeek Harness.app`; adjust it to your actual installation if needed. Adapter dependency installation may require network access; MCP startup does not. Confirm `runtime: "existing-desktop"` with `dsh_connection_info`. This makes no model call and does not verify provider credentials. A subsequent model task can incur provider usage charges.

Both sides discover a valid private config at the default location, so no separate Codex MCP registration or shell edit is needed. Custom paths can still use standalone `--config`; for plugin use, pass it via a local plugin-MCP override and set Desktop `configFile` to match. Do not assume arbitrary environment variables are forwarded.

Delegate only in separate sessions/workspaces. Allow exact tools in the private config when authorized, reload the Desktop plugin, and review child output/diffs. An isolated cwd is not an OS sandbox.

```sh
codex plugin remove dsh-desktop@dsh-desktop-bridge
codex plugin marketplace remove dsh-desktop-bridge
```

Uninstalling this Codex plugin preserves the Desktop adapter, credentials/config and task files; remove those separately when safe. Experimental; see the repository validation guide for test coverage and limitations. MIT; bundled dependency licenses are in THIRD_PARTY_NOTICES.txt. No DeepSeek/OpenAI endorsement.
