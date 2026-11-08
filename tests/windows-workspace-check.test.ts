import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fixture } from './helpers.ts';

const windows = process.platform === 'win32';
const powershell = join(
  process.env.SystemRoot ?? 'C:/Windows',
  'System32/WindowsPowerShell/v1.0/powershell.exe',
);
const script = resolve('plugins/dsh-desktop/scripts/check-windows-workspace.ps1');
// Well-known principals on isolated temporary directories, never real local account IDs.
const extraSid = 'S-1-1-0';
const otherSid = 'S-1-5-11';
function check(config: string, args: string[] = []) {
  const result = spawnSync(
    powershell,
    ['-NoProfile', '-NonInteractive', '-File', script, '-ConfigFile', config, ...args],
    {
      encoding: 'utf8',
      timeout: 20000,
      windowsHide: true,
    },
  );
  if (result.error) throw result.error;
  return result;
}
function grant(path: string, sid: string) {
  execFileSync('icacls.exe', [path, '/grant', `*${sid}:(OI)(CI)W`], {
    stdio: 'pipe',
    timeout: 10000,
    windowsHide: true,
  });
}

test(
  'Windows workspace inspection is read-only and preserves private authentication',
  { skip: !windows },
  async (t) => {
    const f = await fixture();
    t.after(() => f.cleanup());
    const beforeConfig = await readFile(f.file);
    const beforeToken = await readFile(join(f.config.stateDir, 'auth.token'));
    const result = check(f.file);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.unexpectedAllowRules, []);
    assert.equal(report.removed, 0);
    assert.equal(report.backup, null);
    assert.deepEqual(await readFile(f.file), beforeConfig);
    assert.deepEqual(await readFile(join(f.config.stateDir, 'auth.token')), beforeToken);
  },
);

test(
  'Windows workspace repair requires the exact inspected SID and respects a running Desktop',
  { skip: !windows },
  async (t) => {
    const f = await fixture();
    t.after(() => f.cleanup());
    grant(f.config.workspaceRoot, extraSid);
    const initial = check(f.file);
    assert.equal(initial.status, 2, initial.stderr);
    assert.equal(JSON.parse(initial.stdout).unexpectedAllowRules[0].sid, extraSid);
    for (const args of [['-Repair'], ['-Repair', '-ReviewedWorkspaceSid', otherSid]]) {
      const refused = check(f.file, args);
      assert.equal(refused.status, 1);
      assert.equal(check(f.file).stdout, initial.stdout);
    }
    const desktop = execFileSync(
      powershell,
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "if (Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue) { 'running' } else { 'absent' }",
      ],
      { encoding: 'utf8', timeout: 10000, windowsHide: true },
    ).trim();
    const repaired = check(f.file, ['-Repair', '-ReviewedWorkspaceSid', extraSid]);
    if (desktop === 'running') {
      assert.equal(repaired.status, 1);
      assert.match(repaired.stderr, /running/);
      assert.equal(check(f.file).stdout, initial.stdout);
    } else {
      assert.equal(repaired.status, 0, repaired.stderr);
      const report = JSON.parse(repaired.stdout);
      assert.equal(report.removed, 1);
      assert.deepEqual(report.unexpectedAllowRules, []);
      assert.match(
        await readFile(join(report.backup, 'workspace-before.sddl'), 'utf8'),
        new RegExp(extraSid),
      );
      assert.doesNotMatch(
        await readFile(join(report.backup, 'workspace-after.sddl'), 'utf8'),
        new RegExp(extraSid),
      );
    }
  },
);

test(
  'Windows workspace helper refuses unsafe state instead of repairing its permissions',
  { skip: !windows },
  async (t) => {
    const f = await fixture();
    t.after(() => f.cleanup());
    grant(f.config.stateDir, extraSid);
    const result = check(f.file, ['-Repair', '-ReviewedWorkspaceSid', extraSid]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /State\/config is not private/);
  },
);
