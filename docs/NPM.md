# Install from npm

[简体中文](NPM.zh-CN.md) · [README](../README.md) · [Permissions](USAGE.md)

The `dsh-desktop-mcp-bridge` package contains the standalone MCP server and the DSH Desktop adapter. It requires Node >=22.19 and a supported official Desktop version. Codex plugin users can continue using the bundled server and adapter; register one MCP route at a time.

Current version: **0.2.1-rc2**. Prerelease channel: **next**. Commands below pin the version explicitly.

## 1. Initialize the private bridge configuration

```sh
npx --yes --package dsh-desktop-mcp-bridge@0.2.1-rc2 dsh-desktop-mcp setup
```

This creates the default private state/workspace directories or validates existing configuration without changing its token. Review tool permissions in the generated config. See [custom paths](STANDALONE-MCP.md) if the defaults cannot be used.

## 2. Install the Desktop adapter

Save work and fully quit official DSH Desktop, then install the package using its application-owned installer:

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add dsh-desktop-mcp-bridge@0.2.1-rc2 --save-exact
```

Use the actual application path if installed elsewhere. This command installs a plugin into the Desktop profile; it does not launch a separate Harness runtime. Reopen Desktop afterwards.

## 3. Check the connection

```sh
npx --yes --package dsh-desktop-mcp-bridge@0.2.1-rc2 dsh-desktop-mcp doctor
```

The result should report bridge `0.2.1-rc2` and `runtime: "existing-desktop"`. This check does not call the model.

## 4. Register the standalone MCP server

For Codex Desktop/CLI, add this to the user `config.toml`:

```toml
[mcp_servers.dsh_desktop]
command = "npx"
args = ["--yes", "--package", "dsh-desktop-mcp-bridge@0.2.1-rc2", "dsh-desktop-mcp", "stdio"]
startup_timeout_sec = 60
tool_timeout_sec = 60
```

Use an absolute path to `npx` if the GUI cannot find it. The first run downloads the package and production dependencies. For an existing custom config, append `--config` and its absolute path to `args`.

Open a new local Codex chat and call `dsh_setup_info`, then `dsh_connection_info`. Continue with the [task examples](../README.md#usage-examples). Model tasks use the Desktop provider and may incur usage charges.

## Updates and removal

Install the new exact package version through the Desktop installer while Desktop is quit, and update the standalone MCP version in Codex. Existing configuration and task workspaces are retained. Remove the MCP entry and uninstall the adapter through Desktop Plugins when no longer needed.
