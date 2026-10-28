import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, realpath, rm, readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { loadConfig } from '../src/config.ts';
import { startBridge } from '../src/transport.ts';
import { TaskManager } from '../src/manager.ts';
import { FakeRuntime } from './helpers.ts';
test('relocated portable plugin works without node_modules and can complete setup after MCP startup', async (t) => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'dshplugin-'));
  const plugin = join(root, 'copied plugin with spaces');
  await cp(new URL('../plugins/dsh-desktop', import.meta.url), plugin, { recursive: true });
  const configFile = join(root, 's', 'config.json');
  const mcp = JSON.parse(await readFile(join(plugin, 'mcp.json'), 'utf8')).mcpServers[
    'dsh-desktop'
  ];
  const args = mcp.args.map((arg: string) => arg.replaceAll('${PLUGIN_ROOT}', plugin));
  args.push('stdio', '--config', configFile);
  const client = new Client({ name: 'relocated-portable-plugin-test', version: '1' });
  let stage = 'connect';
  let stderr = '';
  let stop: (() => Promise<void>) | undefined;
  let manager: TaskManager | undefined;
  t.after(async () => {
    t.diagnostic(`MCP_STAGE ${stage}`);
    if (stderr) t.diagnostic(`MCP_STDERR ${stderr.slice(-12000)}`);
    await client.close();
    await stop?.();
    await manager?.dispose();
    await rm(root, { recursive: true, force: true });
  });
  await assert.rejects(lstat(join(plugin, 'node_modules')));
  const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', fileURLToPath(new URL('./trace-child.mjs', import.meta.url)), ...args],
      cwd: mcp.cwd.replaceAll('${PLUGIN_ROOT}', plugin),
      stderr: 'pipe',
    });
  transport.stderr?.on('data', data => { stderr += data; });
  await client.connect(transport);
  stage = 'listTools';
  assert.equal((await client.listTools()).tools.length, 19);
  const text = (r: Awaited<ReturnType<typeof client.callTool>>) =>
    JSON.parse((r.content as { text: string }[])[0]!.text);
  stage = 'setupInfoBefore';
  const before = text(await client.callTool({ name: 'dsh_setup_info', arguments: {} }));
  assert.equal(before.configuration.valid, false);
  const manifest = JSON.parse(await readFile(join(plugin, 'plugin.json'), 'utf8'));
  assert.equal(before.bridgeVersion, manifest.version);
  await assert.rejects(lstat(join(root, 's')));
  assert.equal(
    (await client.callTool({ name: 'dsh_connection_info', arguments: {} })).isError,
    true,
  );
  const launcher = join(plugin, 'scripts/start.mjs');
  stage = 'setup';
  const setup = await promisify(execFile)(process.execPath, [
    launcher,
    'setup',
    '--state-dir',
    join(root, 's'),
    '--workspace-root',
    join(root, 'w'),
  ]);
  const prepared = JSON.parse(setup.stdout);
  assert.equal(prepared.configuration.valid, true);
  const staged = prepared.desktopInstall.args.at(-1);
  assert.ok(staged.startsWith(join(root, 's', 'adapters')));
  const cached = join(plugin, 'desktop', `dsh-desktop-mcp-bridge-${manifest.version}.tgz`);
  assert.deepEqual(await readFile(staged), await readFile(cached));
  await rm(cached);
  assert.ok((await lstat(staged)).isFile());
  const config = await loadConfig(configFile);
  manager = new TaskManager(config, new FakeRuntime());
  stop = await startBridge(config, manager);
  stage = 'connectionInfo';
  const connected = await client.callTool({ name: 'dsh_connection_info', arguments: {} });
  assert.equal(connected.isError, undefined);
  assert.equal(text(connected).runtime, 'existing-desktop');
  stage = 'completed';
});
