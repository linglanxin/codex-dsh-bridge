# Bridge protocol v1

MCP uses the official TypeScript SDK's stdio transport. The private Desktop channel is HTTP/1.1 over an owner-only Unix-domain socket, never a TCP port. It accepts only `POST /v1/call`, `Content-Type: application/json`, and `Authorization: Bearer <32-byte-hex-token>`. Browser Origin/Sec-Fetch-Site requests are refused. Do not expose this socket through a proxy or tunnel.

```json
{
  "version": 1,
  "operation": "submit_task",
  "params": { "sessionId": "UUID", "requestId": "UUID", "prompt": "Task" }
}
```

```json
{
  "ok": true,
  "result": {
    "taskId": "UUID",
    "sessionId": "UUID",
    "state": "running",
    "createdAt": "ISO-8601",
    "truncated": false
  }
}
```

```json
{ "ok": false, "error": { "code": "SESSION_BUSY", "message": "..." } }
```

MCP names prefix operations with `dsh_`. The separate local `dsh_setup_info` tool reads configuration status and installation instructions without making a Desktop RPC or writing files. The shared Zod schemas in `src/protocol.ts` are authoritative, reject unknown fields, and require UUIDs for bridge handles. DSH runtime session IDs are opaque and never accepted as authority to control arbitrary existing sessions. All local clients possessing the same token share one bridge instance and its owned-session roster.

| Operation       | Parameters                             | Result                                                |
| --------------- | -------------------------------------- | ----------------------------------------------------- |
| connection_info | `{}`                                   | adapter/version, permissions, workspaceRoot, lifetime |
| create_session  | optional `preset`, `repository`, `ref` | sessionId, runtimeSessionId, cwd, preset              |
| list_sessions   | `{}`                                   | owned sessions, activeTaskId where running            |
| submit_task     | sessionId, prompt, requestId           | task metadata; exact input retries share taskId       |
| get_task        | taskId                                 | state, timestamps, error code, truncation             |
| get_result      | taskId                                 | task metadata + complete, output, contentTrust        |
| cancel_task     | taskId                                 | current state after cancellation request              |
| close_session   | sessionId                              | closed, workspacePreserved                            |
| forget_task     | taskId                                 | forgotten, idempotencyKeyReleased                     |

A task starts `running`. A user cancellation or deadline changes it to `cancelling`; it stays nonterminal until the runtime settles. Terminal states: `completed`, `failed`, `cancelled`, `timed_out`. An error, blocked turn or token-limited turn is not successful completion. Cancellation preserves any returned partial text and never undoes external side effects. Runtime failure details are redacted; inspect the owned DSH session locally for provider diagnostics.

Result output is text only and capped in UTF-8 bytes without splitting a character. Protocol JSON encoding may be larger; transport bounds account for JSON escaping. Result text is untrusted model output. No token/config values or prompts are included in status responses. DSH's own logs still follow its configured storage policy.

Reads and exact retained-key submissions can be retried. Create/close/forget mutations have no durable transaction log: after disconnect query owned sessions/tasks before acting again. A timeout or lost response yields `OUTCOME_UNKNOWN`, not a fabricated failure/success. `requestId` deduplication lasts until forget or plugin restart. No automatic request retry or prompt replay is implemented.

The server accepts at most 32 socket connections, bounds request/response bytes and header/body time, and enforces configured session/task quotas. Task execution deadlines are cooperative. Creation may include a Git checkout (30s process deadline); failures can leave a workspace for manual inspection. Session-close RPC can outlast the 45s client timeout if a tool does not stop; it keeps draining in the Host, and clients must query state instead of creating conflicting work.

桥接协议与 MCP 协议是两层：MCP 对 Codex 使用标准 stdio；桌面插件使用本项目私有的 UDS + token 协议。取消请求不是结束证明，连接断开不是失败证明，返回文本不是可信指令。任务句柄和去重键只在当前插件生命周期内有效。
