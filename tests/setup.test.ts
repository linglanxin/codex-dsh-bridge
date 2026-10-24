import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, lstat, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DESKTOP_TARGET, CORDIS_TARGET, SUPPORTED_DESKTOPS } from '../src/version.ts';
import { prepareSetup, setupInfo, resolveConfigFile } from '../src/setup.ts';
test('read-only setup inspection leaves files absent and reports exact commands without credentials', async (t) => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'dshsetup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 's', 'config.json');
  const info = await setupInfo(file, join(root, 'plugin'));
  assert.equal(info.configuration.valid, false);
  assert.equal(info.desktopTarget, DESKTOP_TARGET);
  assert.equal(info.cordisTarget, CORDIS_TARGET);
  assert.deepEqual(info.supportedDesktops, SUPPORTED_DESKTOPS);
  assert.ok(info.setupCommand);
  assert.equal(info.desktopInstall, null);
  assert.equal(info.configFile, file);
  await assert.rejects(lstat(join(root, 's')));
  assert.equal(resolveConfigFile(file), file);
});
test('explicit setup creates default-deny config and repeat setup preserves the authentication token', async (t) => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'dshsetup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const options = { stateDir: join(root, 's'), workspaceRoot: join(root, 'w') };
  const a = await prepareSetup(options);
  const token = await readFile(join(options.stateDir, 'auth.token'), 'utf8');
  assert.equal(a.configuration.valid, true);
  const c = JSON.parse(await readFile(a.configFile, 'utf8'));
  assert.deepEqual(c.allowedTools, []);
  await prepareSetup(options);
  assert.equal(await readFile(join(options.stateDir, 'auth.token'), 'utf8'), token);
  assert.doesNotMatch(JSON.stringify(a), new RegExp(token.trim()));
  await assert.rejects(prepareSetup({ stateDir: options.stateDir }), /both/);
  await assert.rejects(prepareSetup({ config: join(root, 'missing.json') }), /Explicit config/);
  await mkdir(join(root, 'existing-work'));
  await assert.rejects(
    prepareSetup({ stateDir: join(root, 'new-state'), workspaceRoot: join(root, 'existing-work') }),
    /will not overwrite/,
  );
  await assert.rejects(lstat(join(root, 'new-state')));
});
