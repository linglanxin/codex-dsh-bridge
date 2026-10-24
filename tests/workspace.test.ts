import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './helpers.ts';
const exec = promisify(execFile);
test('Git worktrees isolate main checkout and preserve changes on session close', async (t) => {
  const f = await fixture();
  t.after(() => f.cleanup());
  const repo = join(f.root, 'repo');
  await mkdir(repo);
  const git = (args: string[]) => exec('git', ['-C', repo, ...args]);
  await git(['init']);
  await git(['config', 'user.email', 'test@example.invalid']);
  await git(['config', 'user.name', 'Test']);
  await writeFile(join(repo, 'code.txt'), 'committed');
  await git(['add', '.']);
  await git(['commit', '-m', 'test']);
  await writeFile(join(repo, 'code.txt'), 'main dirty');
  f.config.repositories.push(repo);
  await assert.rejects(
    f.manager.createSession({ repository: join(f.root, 'unknown') }),
    /allowlist/,
  );
  await assert.rejects(f.manager.createSession({ repository: repo, ref: '--help' }));
  const a = await f.manager.createSession({ repository: repo });
  const b = await f.manager.createSession({ repository: repo });
  assert.notEqual(a.cwd, b.cwd);
  assert.equal(await readFile(join(a.cwd, 'code.txt'), 'utf8'), 'committed');
  await writeFile(join(a.cwd, 'code.txt'), 'child change');
  await f.manager.closeSession(a.sessionId);
  assert.equal(await readFile(join(repo, 'code.txt'), 'utf8'), 'main dirty');
  assert.equal(await readFile(join(b.cwd, 'code.txt'), 'utf8'), 'committed');
  assert.equal(await readFile(join(a.cwd, 'code.txt'), 'utf8'), 'child change');
});
