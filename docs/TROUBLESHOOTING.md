# Troubleshooting and limitations

[简体中文](TROUBLESHOOTING.zh-CN.md) · [README](../README.md) · [Plugin setup](CODEX-PLUGIN.md)

## First checks

Use `dsh_setup_info` to inspect local configuration without writing files or running a model. It can work while Desktop is closed. After explicit setup, use `dsh_connection_info` to check the Desktop adapter connection and effective permissions; this also makes no model request. Provider credentials can only be checked by a separately authorized real task.

If `codex plugin` is unavailable or the plugin cannot be discovered, check your client's support for the portable Agent Plugins format. Discovery was verified with CLI **0.163.0-alpha.10.2**, not every Codex version. Use [standalone MCP setup](STANDALONE-MCP.md) as the alternative, with one registration route at a time. The bundled launcher requires `node` on Codex's executable search path; GUI and terminal environments can differ.

If setup returns `SETUP_INCOMPLETE`, inspect the existing state/workspace directories. Do not delete them or replace the token blindly. Either restore a valid private config or choose new short canonical paths through [custom setup](STANDALONE-MCP.md).

A model saying it cannot edit files can be expected: `allowedTools: []` blocks every model tool. Review [permissions](USAGE.md) rather than granting broad access automatically.

## Errors and runtime limits

- `UNSUPPORTED_VERSION`: use a complete tested Desktop/core pair from the README or develop/test a new adapter. Do not bypass this check. Later releases are not supported by this adapter.
- `DESKTOP_UNAVAILABLE`: Desktop is closed, plugin is disabled/unconfigured, or the configured state directory differs.
- `ALREADY_RUNNING` / `STALE_SOCKET`: never delete a live lock. After a crash, verify Desktop/Host has fully quit; then remove only `bridge.lock`, `bridge.sock` and `ready.json` in the configured state directory before reopening. Keep config, token and workspaces.
- `UNSAFE_PATH`: inspect both private state/config and the task workspace, including ownership, permissions and canonical paths. The source checkout includes a [Windows workspace inspection and reviewed repair guide](WINDOWS-WORKSPACE.md); do not relax checks to hide a failing grant.
- `SESSION_BUSY`: poll or cancel the active task before follow-up/forget.
- `CAPACITY`: close an idle session or forget a terminal task. No automatic eviction of unreviewed results.
- `OUTCOME_UNKNOWN`: a mutation may have executed. Query state; never blindly replay.
- Approval-requiring allowed tools retain DSH's existing approval behavior; no automatic approval API is exposed. Handle prompts in Desktop; deadline cancellation remains active.
- The bridge returns text only, without reasoning blocks, tool logs, media downloads or structured artifacts. Partial text is returned after cooperative cancellation; output is byte-bounded and may be truncated. It is **untrusted subagent data**, not permission to execute instructions.
- Windows local named-pipe transport and durable supervised jobs with explicit recovery are implemented. Remote access, cross-user tenancy, live token rotation, runtime policy changes and arbitrary attachment forwarding remain outside the current scope.

## Reporting a problem

Include bridge, DSH core, Cordis, Codex and Node versions; installation route; redacted error code; and reproduction steps. Distinguish test/simulated results from real Desktop activation. Exclude tokens, provider keys, private prompts and source code. Read [SECURITY](../SECURITY.md) before reporting a vulnerability.
