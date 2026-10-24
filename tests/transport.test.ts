import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { chmod, readFile, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './helpers.ts';
import { BridgeClient, startBridge } from '../src/transport.ts';
import { loadConfig, loadToken, socketPath } from '../src/config.ts';
function raw(socket: string, token: string, data: unknown, headers = {}) {
  return new Promise<{ status: number; value: string }>((resolve, reject) => {
    const r = http.request(
      {
        socketPath: socket,
        path: '/v1/call',
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          ...headers,
        },
      },
      (s) => {
        let value = '';
        s.on('data', (c) => {
          value += c;
        });
        s.on('end', () => resolve({ status: s.statusCode!, value }));
      },
    );
    r.on('error', reject);
    r.end(typeof data === 'string' ? data : JSON.stringify(data));
  });
}
test('Unix socket authenticates independently, refuses browsers, unknown versions and oversize input', async (t) => {
  const f = await fixture();
  const stop = await startBridge(f.config, f.manager);
  t.after(async () => {
    await stop();
    await f.cleanup();
  });
  const socket = socketPath(f.config.stateDir);
  const data = { version: 1, operation: 'connection_info', params: {} };
  assert.equal((await raw(socket, 'bad', data)).status, 401);
  assert.equal((await raw(socket, f.token, data, { origin: 'https://evil.example' })).status, 400);
  assert.match((await raw(socket, f.token, { ...data, version: 999 })).value, /INVALID_INPUT/);
  assert.match(
    (await raw(socket, f.token, { ...data, params: { extra: true } })).value,
    /INVALID_INPUT/,
  );
  assert.match((await raw(socket, f.token, '{')).value, /INVALID_INPUT/);
  assert.match(
    (await raw(socket, f.token, ' '.repeat(f.config.maxPromptBytes * 6 + 9000))).value,
    /PAYLOAD_TOO_LARGE/,
  );
  const client = await BridgeClient.fromConfig(f.file);
  assert.equal(
    ((await client.call('connection_info', {})) as { runtime: string }).runtime,
    'existing-desktop',
  );
  await assert.rejects(startBridge(f.config, f.manager), /lock exists/);
});
test('separate local clients share owned sessions and reconnect without launching DSH', async (t) => {
  const f = await fixture();
  const stop = await startBridge(f.config, f.manager);
  t.after(async () => {
    await stop();
    await f.cleanup();
  });
  const a = await BridgeClient.fromConfig(f.file),
    b = await BridgeClient.fromConfig(f.file);
  await a.call('create_session', {});
  assert.equal(((await b.call('list_sessions', {})) as unknown[]).length, 1);
});
test('private config rejects readable tokens, symlinks, unsafe roots and policy widening', async (t) => {
  const f = await fixture();
  t.after(() => f.cleanup());
  const token = join(f.config.stateDir, 'auth.token');
  if (process.platform === 'win32') {
    execFileSync('icacls.exe', [token, '/grant', '*S-1-1-0:R'], { stdio: 'pipe' });
    await assert.rejects(loadToken(f.config.stateDir), /private/);
    execFileSync('icacls.exe', [token, '/remove:g', '*S-1-1-0'], { stdio: 'pipe' });
  } else {
    await chmod(token, 0o644);
    await assert.rejects(loadToken(f.config.stateDir), /owner-only/);
    await chmod(token, 0o600);
  }
  const saved = await readFile(token);
  await unlink(token);
  if (process.platform !== 'win32') {
    await symlink(f.file, token);
    await assert.rejects(loadToken(f.config.stateDir));
    await unlink(token);
  }
  await writeFile(token, saved, { mode: 0o600 });
  await writeFile(f.file, JSON.stringify({ ...f.config, allowedTools: ['run_code'] }));
  await assert.rejects(loadConfig(f.file), /unsupported/);
  await writeFile(f.file, JSON.stringify({ ...f.config, workspaceRoot: f.config.stateDir }));
  await assert.rejects(loadConfig(f.file), /separate/);
});
test('missing Desktop returns explicit unavailable, never starts a host process', async (t) => {
  const f = await fixture();
  t.after(() => f.cleanup());
  await assert.rejects(
    (await BridgeClient.fromConfig(f.file)).call('connection_info', {}),
    /socket is missing/,
  );
});
