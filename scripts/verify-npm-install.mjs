import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify, parseArgs } from 'node:util';
import { mkdtemp, readFile, writeFile, realpath, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const exec = promisify(execFile);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const { values } = parseArgs({
  options: {
    package: { type: 'string' },
    'desktop-config': { type: 'string' },
    'live-task': { type: 'boolean', default: false },
  },
});
if (values['live-task'] && !values['desktop-config'])
  throw new Error('--live-task requires --desktop-config.');
const spec = values.package ?? `${pkg.name}@${pkg.version}`;
const source = spec.startsWith('.') || spec.startsWith('/') ? resolve(spec) : spec;
const stage = await mkdtemp(join(await realpath(tmpdir()), 'dshnpm-'));
let client;
let session;
let activeTask;
let call;
const terminal = (task) => !['running', 'cancelling'].includes(task.state);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = {
  package: pkg.name,
  version: pkg.version,
  installSource: source.startsWith('/') ? 'local-tarball' : 'public-registry',
};
try {
  await writeFile(
    join(stage, 'package.json'),
    JSON.stringify({ name: 'npm-install-check', private: true }),
  );
  await writeFile(join(stage, '.npmrc'), 'registry=https://registry.npmjs.org/\n', { mode: 0o600 });
  await exec(
    'npm',
    [
      'install',
      '--save-exact',
      '--no-audit',
      '--no-fund',
      '--userconfig',
      join(stage, '.npmrc'),
      '--cache',
      join(stage, 'cache'),
      '--registry=https://registry.npmjs.org/',
      source,
    ],
    { cwd: stage, maxBuffer: 4 * 1024 * 1024 },
  );
  const installed = join(stage, 'node_modules', pkg.name);
  const metadata = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  assert.equal(metadata.name, pkg.name);
  assert.equal(metadata.version, pkg.version);
  assert.equal(metadata.repository.url, pkg.repository.url);
  for (const name of Object.keys(pkg.peerDependencies))
    assert.equal(await lstat(join(stage, 'node_modules', name)).catch(() => undefined), undefined);
  const bin = join(stage, 'node_modules', '.bin', 'dsh-desktop-mcp');
  const help = await exec(bin, ['help']);
  assert.match(help.stdout, /dsh-desktop-mcp stdio/);
  report.cliBin = 'passed';
  report.anonymousProductionInstall = 'passed';
  report.optionalDesktopPeersInstalled = false;

  const require = createRequire(join(stage, 'package.json'));
  const { Client } = await import(
    pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js'))
  );
  const { StdioClientTransport } = await import(
    pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js'))
  );
  const cli = join(installed, 'dist', 'cli.js');
  const connect = async (configFile) => {
    const next = new Client({ name: 'npm-install-verification', version: '1' });
    await next.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [cli, 'stdio', '--config', configFile],
        cwd: stage,
        stderr: 'pipe',
      }),
    );
    return next;
  };
  const invoke = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const data = JSON.parse(result.content[0].text);
    if (result.isError) throw new Error(`${name}: ${data.code}`);
    return data;
  };
  call = invoke;
  const config = join(stage, 's', 'config.json');
  client = await connect(config);
  assert.equal((await client.listTools()).tools.length, 10);
  assert.equal((await call('dsh_setup_info')).configuration.valid, false);
  assert.equal(await lstat(join(stage, 's')).catch(() => undefined), undefined);
  await exec(process.execPath, [
    cli,
    'init',
    '--state-dir',
    join(stage, 's'),
    '--workspace-root',
    join(stage, 'w'),
  ]);
  const setup = await call('dsh_setup_info');
  assert.equal(setup.bridgeVersion, pkg.version);
  assert.equal(setup.configuration.valid, true);
  assert.equal(setup.supportedDesktops.length, 3);
  const unavailable = await client.callTool({ name: 'dsh_connection_info', arguments: {} });
  assert.equal(unavailable.isError, true);
  assert.equal(JSON.parse(unavailable.content[0].text).code, 'DESKTOP_UNAVAILABLE');
  report.mcpTools = 10;
  report.privateInitializationAndReconnect = 'passed';
  report.missingDesktop = 'DESKTOP_UNAVAILABLE';
  await client.close();
  client = undefined;

  if (values['desktop-config']) {
    client = await connect(resolve(values['desktop-config']));
    const connection = await call('dsh_connection_info');
    assert.equal(connection.bridgeVersion, pkg.version);
    assert.equal(connection.runtime, 'existing-desktop');
    report.desktopConnection = { version: connection.desktopVersion, adapter: connection.adapter };
    if (values['live-task']) {
      const wait = async (taskId, seconds = 90) => {
        const deadline = Date.now() + seconds * 1000;
        while (Date.now() < deadline) {
          const task = await call('dsh_get_task', { taskId });
          if (terminal(task)) return task;
          await pause(500);
        }
        throw new Error('Live task did not settle within the verification deadline.');
      };
      session = await call('dsh_create_session');
      assert.notEqual(resolve(session.cwd), resolve(process.cwd()));
      const marker = `NPM_BRIDGE_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
      activeTask = await call('dsh_submit_task', {
        sessionId: session.sessionId,
        requestId: randomUUID(),
        prompt: `Reply with exactly ${marker}. Do not use any tools.`,
      });
      assert.equal((await wait(activeTask.taskId)).state, 'completed');
      const result = await call('dsh_get_result', { taskId: activeTask.taskId });
      assert.equal(result.complete, true);
      assert.ok(
        result.output.trim() === marker,
        'Model reply did not match the verification marker.',
      );
      report.liveModelTask = 'completed';
      await call('dsh_forget_task', { taskId: activeTask.taskId });
      activeTask = undefined;
      const requestId = randomUUID();
      const prompt = 'Without tools, keep counting upward in words until interrupted.';
      activeTask = await call('dsh_submit_task', {
        sessionId: session.sessionId,
        requestId,
        prompt,
      });
      const duplicate = await call('dsh_submit_task', {
        sessionId: session.sessionId,
        requestId,
        prompt,
      });
      assert.equal(duplicate.taskId, activeTask.taskId);
      await call('dsh_cancel_task', { taskId: activeTask.taskId });
      assert.equal((await wait(activeTask.taskId, 30)).state, 'cancelled');
      assert.equal((await call('dsh_get_result', { taskId: activeTask.taskId })).complete, true);
      report.followupDeduplicationAndCancellation = 'passed';
      await call('dsh_forget_task', { taskId: activeTask.taskId });
      activeTask = undefined;
      const closed = await call('dsh_close_session', { sessionId: session.sessionId });
      assert.equal(closed.closed, true);
      assert.equal(closed.workspacePreserved, session.cwd);
      assert.ok((await lstat(session.cwd)).isDirectory());
      assert.ok(!(await call('dsh_list_sessions')).some((s) => s.sessionId === session.sessionId));
      report.sessionClose = 'passed; workspace preserved';
      session = undefined;
    }
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (client && activeTask)
    await call('dsh_cancel_task', { taskId: activeTask.taskId }).catch(() => {});
  if (client && session)
    await call('dsh_close_session', { sessionId: session.sessionId }).catch(() => {
      console.error(
        `Inspect verification session ${session.sessionId}; its workspace is retained.`,
      );
    });
  await client?.close();
  await rm(stage, { recursive: true, force: true });
}
