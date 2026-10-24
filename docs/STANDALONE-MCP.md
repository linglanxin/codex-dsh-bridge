# Standalone MCP setup on macOS

[简体中文](STANDALONE-MCP.zh-CN.md) · [README](../README.md) · [Recommended plugin setup](CODEX-PLUGIN.md)

Use this route if you want only the MCP server, are developing the bridge, or your Codex client cannot load the portable plugin format. **Choose either this route or the Codex plugin route** to avoid registering the same tools twice. Both routes require the same Desktop adapter and permissions.

To install a published package without a source checkout, use the [npm guide](NPM.md).

## Build and prepare the Desktop archive

Requirements: macOS, official DSH Desktop **0.2.0-rc.2 / Cordis 4.0.4** or **0.2.1-rc.1 / 0.2.1-rc.2 with Cordis 4.0.5**, Node **>=22.19.0**, npm, and Git for worktrees. Other DSH versions and mixed core packages are rejected. See [validation](VALIDATION.md) for test coverage and limitations.

From the source checkout:

```sh
npm ci
npm run check
npm pack
```

`dist/cli.js` is the standalone MCP entry; `npm pack` produces `dsh-desktop-mcp-bridge-0.2.1-rc2.tgz` in the repository root. Keep the built source checkout and its production dependencies available to Codex. All automated model tests use scripted providers without API keys.

## Configure and connect

Replace every example path with your actual absolute path. The installer below assumes the application is in `/Applications`; use the actual application-owned command if it is installed elsewhere.

1. Initialize **new**, short, private absolute directories. Both parents must exist; symlink aliases are refused. Use the canonical macOS home path. Example (replace `/Users/you` with your own home):

   ```sh
   node /absolute/path/to/bridge/dist/cli.js init \
     --state-dir /Users/you/.dsh-mcp-state \
     --workspace-root /Users/you/.dsh-mcp-work
   ```

   `config.json` and `auth.token` have mode 0600; state/workspace directories have mode 0700. Existing directories are refused by `init`; it never silently rotates credentials. Keep state paths short: the complete socket path must be <=100 UTF-8 bytes.

2. Review `config.json`. `allowedTools: []` permits model conversation but **denies every model tool call**. Add exact tool names only after inspecting their real permissions. `repositories` is an allowlist of canonical Git top-level paths; leave it empty for blank workspaces. `allowedPresets` defaults to `standard`. Choose a preset with native tools; `run_code`, known delegation/plugin-management/scheduling/workflow/goal tools are refused in v0.2.1-rc2. The bridge takes a config snapshot on plugin load; restart the plugin/Desktop to apply changes.

   ```json
   {
     "allowedTools": [],
     "allowedPresets": ["standard"],
     "repositories": ["/Users/you/projects/example"]
   }
   ```

   These are fields to edit in the generated config, **not** a complete config. `workspaceRoot` must be outside each allowlisted repository. Shell or general file access can reach other paths; a tool-name allowlist and an isolated cwd are **not an OS sandbox**. Only enable powerful tools for trusted tasks. Git checkout hooks in an allowlisted repository may execute during worktree creation.

3. For a custom config location, set the plugin's `configFile` to the generated file in the Desktop Plugins UI, or set `DSH_DESKTOP_BRIDGE_CONFIG` in the environment inherited by Desktop. Desktop reads the login-shell environment on macOS at launch. For example, set the following in your own login-shell setup and fully reopen Desktop:

   ```sh
   export DSH_DESKTOP_BRIDGE_CONFIG=/Users/you/.dsh-mcp-state/config.json
   ```

   If configuring through the profile patch, use:

   ```yaml
   - id: desktop-mcp-bridge
     config:
       configFile: /Users/you/.dsh-mcp-state/config.json
   ```

   Official profile patch overrides replace a row's whole config. The adapter discovers a valid private config at `~/.dsh-mcp-state/config.json` after explicit setup. If no default config or explicit path exists, it stays disabled and logs a diagnostic.

4. Install the local package through the official Desktop **Plugins** page using the local archive/package spec. Alternatively, after initializing Desktop once, fully quit it and use the **Desktop-installed `dsh` command**:

   ```sh
   "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add /absolute/path/to/dsh-desktop-mcp-bridge-0.2.1-rc2.tgz
   ```

   Reopen Desktop and observe plugin activation. Do not use an npm-installed CLI to mutate the Desktop profile, do not launch that profile as a CLI, and do not use version-exemption flags. The installed application's Plugins UI owns activation/restart outcomes.

5. Confirm connection without submitting a model task:

   ```sh
   node /absolute/path/to/bridge/dist/cli.js doctor \
     --config /Users/you/.dsh-mcp-state/config.json
   ```

   It must report `runtime: "existing-desktop"`, protocol 1 and the adapter version. This verifies the bridge, not whether a provider credential is valid.

6. Add the MCP server to Codex. Use an absolute Node executable on GUI systems if PATH is ambiguous:

   ```toml
   [mcp_servers.dsh_desktop]
   command = "/absolute/path/to/node"
   args = ["/absolute/path/to/bridge/dist/cli.js", "stdio", "--config", "/Users/you/.dsh-mcp-state/config.json"]
   startup_timeout_sec = 10
   tool_timeout_sec = 60
   ```

   Put this in your user Codex `config.toml`, or use the CLI:

   ```sh
   codex mcp add dsh_desktop -- /absolute/path/to/node \
     /absolute/path/to/bridge/dist/cli.js stdio \
     --config /Users/you/.dsh-mcp-state/config.json
   ```

   Reopen/refresh Codex's MCP connection as appropriate. The server starts even when Desktop is unavailable; tool calls then return `DESKTOP_UNAVAILABLE`. [Official Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp).

## Next steps

Use the [usage guide](USAGE.md) to inspect permissions, submit an isolated task, review results and clean up. See [troubleshooting](TROUBLESHOOTING.md) for connection and state errors.
