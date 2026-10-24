import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fixture, until } from './helpers.ts';
import { startBridge } from '../src/transport.ts';
import { terminal, type TaskView } from '../src/protocol.ts';
test('built MCP stdio exchanges official protocol with a separate client and existing bridge', async (t) => {
  const f = await fixture();
  const stop = await startBridge(f.config, f.manager);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../dist/cli.js', import.meta.url)), 'stdio', '--config', f.file],
    stderr: 'pipe',
  });
  const client = new Client({ name: 'bridge-integration-test', version: '1.0.0' });
  let stderr = '';
  transport.stderr?.on('data', (d) => {
    stderr += d;
  });
  t.after(async () => {
    await client.close();
    await stop();
    await f.cleanup();
  });
  await client.connect(transport);
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 19);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, undefined);
    const content = result.content as { type: string; text: string }[];
    return JSON.parse(content[0]!.text);
  };
  const info = await call('dsh_connection_info', {});
  assert.equal(info.runtime, 'existing-desktop');
  const session = await call('dsh_create_session', {});
  const task: TaskView = await call('dsh_submit_task', {
    sessionId: session.sessionId,
    prompt: 'mcp round trip',
    requestId: randomUUID(),
  });
  await until(() => terminal(f.manager.getTask(task.taskId).state));
  const result = await call('dsh_get_result', { taskId: task.taskId });
  assert.equal(result.output, 'reply:mcp round trip');
  assert.equal(result.contentTrust, 'untrusted-subagent-output');
  assert.equal(
    (await client.callTool({ name: 'dsh_get_task', arguments: { taskId: randomUUID() } })).isError,
    true,
  );
  await call('dsh_close_session', { sessionId: session.sessionId });
  assert.doesNotMatch(stderr, new RegExp(f.token));
});
