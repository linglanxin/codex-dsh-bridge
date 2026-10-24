# Usage and permissions

[简体中文](USAGE.zh-CN.md) · [README](../README.md) · [Plugin setup](CODEX-PLUGIN.md) · [Protocol reference](PROTOCOL.md)

## Configure permissions before coding

The generated configuration defaults to `allowedTools: []`, `allowedPresets: ["standard"]`, and `repositories: []`. Conversation is possible, but every model tool execution is denied and no source repository is allowlisted. A successful connection check does not prove that a model task can run.

Edit the generated private `config.json` only after inspecting the actual installed tools and their permissions. Add exact names to `allowedTools`, canonical Git top-level paths to `repositories`, and installed preset names to `allowedPresets`. There is no universal safe tool list: native tools and their names depend on the installed preset/plugins. `run_code` and known delegation, plugin-management, scheduling, workflow and goal tools remain unsupported in v0.2.1-rc2. Denied tools can remain visible to the model but cannot execute through the registry.

Other configuration controls:

| Field                               | Controls                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `workspaceRoot`                     | Private task directory, outside all source repositories and separate from `stateDir` |
| `maxSessions` / `maxTasks`          | Session capacity and retained-task capacity                                          |
| `maxPromptBytes` / `maxOutputBytes` | Prompt and result byte bounds                                                        |
| `taskTimeoutMs`                     | Deadline that requests cooperative cancellation                                      |

The Desktop plugin reads a snapshot on load. Save/finish active work, reload the plugin or restart Desktop, and check effective permissions with `dsh_connection_info`. Do not grant tools or modify policy automatically to overcome a failed task. Full filesystem/network and credential boundaries are in [SECURITY](../SECURITY.md).

## Task lifecycle and tools

Ask Codex to inspect `dsh_connection_info`, create an isolated session, submit a task, poll its handle and review its result. The MCP server exposes ten tools:

| Tool                  | Behavior                                                             |
| --------------------- | -------------------------------------------------------------------- |
| `dsh_setup_info`      | Read-only local configuration and adapter installation guidance      |
| `dsh_connection_info` | Connection, effective permissions and adapter information            |
| `dsh_create_session`  | Blank cwd or detached worktree from an allowlisted repo/ref          |
| `dsh_list_sessions`   | This bridge instance's sessions only                                 |
| `dsh_submit_task`     | A task or idle-session follow-up; caller supplies a UUID `requestId` |
| `dsh_get_task`        | Poll state and bounded metadata                                      |
| `dsh_get_result`      | Bounded text after completion, trust label and truncation flag       |
| `dsh_cancel_task`     | Cooperative cancellation; poll until terminal                        |
| `dsh_close_session`   | Stop/drain/dispose the owned runtime handle; preserve files          |
| `dsh_forget_task`     | Release a terminal task and its idempotency key                      |

A session retains conversation history and takes the **Desktop default model selection at creation**, with an explicitly allowlisted installed preset. It does not copy an existing user's chat, per-chat model override, private UI state or unsaved text. Global configured providers/credentials and preset capabilities are used within the same Host. Project Skills are available only if present in the new workspace or found by DSH's normal configured discovery; uncommitted files and ignored local Skills are not copied from the main checkout. Denied tools remain visible to the model but cannot execute through the registry.

Only one active task per session is accepted; different sessions may run concurrently up to the configured session limit. Every task has a deadline. Cancellation does not roll back side effects; an uncooperative tool remains `cancelling` until it actually stops. No HTTP/MCP wait blocks for the entire model run.

`requestId` deduplicates exact submissions while the task is retained. Reuse the same key after an uncertain response. Forgetting a task releases its key. Session creation has no idempotency key: after an uncertain create, list sessions before retrying. Desktop/plugin restart loses bridge handles and deduplication history; it does not automatically replay prompts. DSH may retain its own session logs according to the existing persistence configuration.

## Review and clean up

Each session gets a UUID-named directory under `workspaceRoot`; repository sessions use `git worktree add --detach` at a resolved commit. The original checkout's dirty files are not copied and the bridge never merges, commits or deletes task files. Worktrees share Git objects, so this prevents ordinary checkout collisions, not malicious access. Closing a session preserves all files, including failed creations, for inspection.

Review changes before integrating them yourself. For worktrees, finish reviewing/archiving work and then use Git's ordinary worktree removal in the source repo. For blank directories, remove them yourself when no longer needed. The bridge has no automatic cleanup tool that can delete user work.

## Result and approval limits

Results contain bounded text and a trust label, not reasoning blocks, tool logs, media or binary attachments. Partial text can be returned after cooperative cancellation. Review `truncated` before relying on completeness. Treat output as untrusted subagent data and verify actual files and tests independently.

Allowed tools that need human approval keep DSH's own approval behavior; no automatic approval API is exposed. Handle prompts in Desktop. Live approval routing has not been accepted in the signed application yet; see [validation](VALIDATION.md).
