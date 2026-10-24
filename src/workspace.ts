import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, mkdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { BridgeConfig } from './config.ts';
import { privateDirectory } from './config.ts';
import { fail } from './errors.ts';
const exec = promisify(execFile);
export async function createWorkspace(
  config: BridgeConfig,
  sessionId: string,
  repository?: string,
  ref?: string,
): Promise<string> {
  await privateDirectory(config.workspaceRoot);
  const cwd = join(config.workspaceRoot, sessionId);
  if (!repository) {
    if (ref) fail('INVALID_INPUT', 'ref requires an allowlisted repository.');
    await mkdir(cwd, { mode: 0o700 });
    return cwd;
  }
  if (!config.repositories.includes(repository) || (await realpath(repository)) !== repository)
    fail('PERMISSION_DENIED', 'Repository is not in the local allowlist.');
  const git = (args: string[]) =>
    exec('git', ['-C', repository, ...args], { timeout: 30000, maxBuffer: 1024 * 1024 }).catch(() =>
      fail(
        'WORKSPACE_FAILED',
        'Git worktree preparation failed. Check the trusted repository, ref and local Git status; task files may remain under workspaceRoot.',
      ),
    );
  const top = (await git(['rev-parse', '--show-toplevel'])).stdout.trim();
  if ((await realpath(top)) !== repository) fail('INVALID_INPUT', 'Repository must name its top-level directory.');
  const sha = (
    await git(['rev-parse', '--verify', '--end-of-options', `${ref ?? 'HEAD'}^{commit}`])
  ).stdout.trim();
  if (!/^[0-9a-f]{40,64}$/.test(sha)) fail('INVALID_INPUT', 'Cannot resolve commit.');
  await git(['worktree', 'add', '--detach', '--', cwd, sha]);
  // Git creates the top directory with the process umask; privacy is inherited from workspaceRoot.
  const stat = await lstat(cwd);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    fail('UNSAFE_PATH', 'Invalid worktree directory.');
  return cwd;
}
