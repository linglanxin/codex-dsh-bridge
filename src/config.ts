import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { z } from 'zod';
import { fail } from './errors.ts';
let windowsSid: string | undefined;
const windowsAclCache = new Map<string, number>();
function currentWindowsSid(): string {
  return windowsSid ??= execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true, timeout: 10000 }).match(/S-1-5-[0-9-]+/)?.[0] ?? fail('UNSAFE_PATH', 'Cannot resolve current Windows identity.');
}
function secureWindowsDirectory(path: string) {
  if (process.platform !== 'win32') return;
  execFileSync('icacls.exe', [path, '/inheritance:r', '/grant:r', `*${currentWindowsSid()}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F'], { windowsHide: true, stdio: 'pipe', timeout: 10000 });
}
function verifyWindowsAcl(path: string, changed: number) {
  if (process.platform !== 'win32' || windowsAclCache.get(path) === changed) return;
  const systemRoot = process.env.SystemRoot ?? 'C:/Windows';
  const env = {
    ...process.env,
    PSModulePath: join(systemRoot, 'System32/WindowsPowerShell/v1.0/Modules'),
    DSH_BRIDGE_ACL_PATH: path,
  };
  // Get-Acl can stall inside an MCP-filtered Windows environment. Read only
  // the DACL through .NET instead, retaining SID-based allow checks.
  const script = `$ErrorActionPreference='Stop'; $sections=[System.Security.AccessControl.AccessControlSections]::Access; if([System.IO.Directory]::Exists($env:DSH_BRIDGE_ACL_PATH)){ $acl=[System.IO.Directory]::GetAccessControl($env:DSH_BRIDGE_ACL_PATH,$sections) }else{ $acl=[System.IO.File]::GetAccessControl($env:DSH_BRIDGE_ACL_PATH,$sections) }; $allowed=@('${currentWindowsSid()}','S-1-5-18','S-1-5-32-544'); foreach($rule in $acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])){ if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin $allowed){ throw 'Bridge path has permissions for other accounts' } }; 'OK'; exit 0`;
  try { execFileSync(join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true, timeout: 10000, env, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { fail('UNSAFE_PATH', 'Windows bridge state must be private to this account, SYSTEM and Administrators.'); }
  windowsAclCache.set(path, changed);
}
export const configSchema = z
  .object({
    version: z.literal(1),
    stateDir: z.string(),
    workspaceRoot: z.string(),
    workspaceTitle: z.string().trim().min(1).max(128).optional(),
    allowedTools: z.array(z.string().min(1).max(128)).max(100),
    allowedPresets: z.array(z.string().min(1).max(128)).min(1).max(20),
    repositories: z.array(z.string()).max(20),
    maxSessions: z.number().int().min(1).max(32),
    maxTasks: z.number().int().min(1).max(1000),
    maxPromptBytes: z.number().int().min(1).max(65536),
    maxOutputBytes: z.number().int().min(128).max(1048576),
    taskTimeoutMs: z.number().int().min(100).max(3600000),
  })
  .strict()
  .refine(config => !config.workspaceTitle || config.allowedTools.length === 0, {
    message: 'Named Desktop workspaces require task-scoped bridge tools only (allowedTools must be empty).',
    path: ['allowedTools'],
  });
export type BridgeConfig = z.infer<typeof configSchema>;
export function contains(parent: string, child: string): boolean {
  const r = relative(parent, child);
  return r === '' || (!r.startsWith(`..${sep}`) && r !== '..' && !isAbsolute(r));
}
export function configPath(stateDir: string): string {
  return join(stateDir, 'config.json');
}
export function socketPath(stateDir: string): string {
  if (process.platform === 'win32') return `\\\\.\\pipe\\codex-dsh-${createHash('sha256').update(resolve(stateDir).toLowerCase()).digest('hex').slice(0, 24)}`;
  const p = join(stateDir, 'bridge.sock');
  if (Buffer.byteLength(p) > 100)
    fail('CONFIG', 'stateDir is too long for a macOS Unix socket (path must be <=100 bytes).');
  return p;
}
export async function privateDirectory(path: string): Promise<string> {
  if (!isAbsolute(path)) fail('CONFIG', 'Directory paths must be absolute.');
  const stat = await lstat(path).catch(() =>
    fail('UNSAFE_PATH', 'Bridge directory is missing or unreadable.'),
  );
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (process.platform !== 'win32' && (stat.uid !== process.getuid?.() ||
    (stat.mode & 0o077) !== 0))
  )
    fail('UNSAFE_PATH', 'Bridge directories must be real, owner-only directories (0700).');
  const actual = await realpath(path);
  verifyWindowsAcl(path, stat.ctimeMs);
  if (actual !== resolve(path))
    fail('UNSAFE_PATH', 'Bridge paths must use canonical paths without symlink ancestors.');
  return actual;
}
export async function readPrivate(path: string): Promise<string> {
  const before = await lstat(path).catch(() => fail('CONFIG_UNREADABLE', 'Config/token is missing.'));
  if (before.isSymbolicLink()) fail('UNSAFE_PATH', 'Config/token must not be a symlink.');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() =>
    fail('CONFIG_UNREADABLE', 'Config/token file is missing, unreadable or a symlink.'),
  );
  try {
    const stat = await file.stat();
    verifyWindowsAcl(path, stat.ctimeMs);
    if (
      !stat.isFile() ||
      (process.platform !== 'win32' && (stat.uid !== process.getuid?.() ||
      (stat.mode & 0o077) !== 0)) ||
      stat.size > 65536
    )
      fail('UNSAFE_PATH', 'Config and token must be owner-only regular files <=64 KiB.');
    return await file.readFile('utf8');
  } finally {
    await file.close();
  }
}
export async function loadConfig(path: string): Promise<BridgeConfig> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readPrivate(path));
  } catch (error) {
    if (error instanceof SyntaxError) fail('CONFIG', 'Invalid config JSON.');
    throw error;
  }
  const validated = configSchema.safeParse(parsed);
  if (!validated.success)
    fail(
      'CONFIG',
      `Invalid configuration fields: ${validated.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  const c = validated.data;
  await privateDirectory(c.stateDir);
  await privateDirectory(c.workspaceRoot);
  socketPath(c.stateDir);
  if (resolve(path) !== configPath(c.stateDir))
    fail('CONFIG', 'Config must be stateDir/config.json.');
  if (contains(c.stateDir, c.workspaceRoot) || contains(c.workspaceRoot, c.stateDir))
    fail('CONFIG', 'stateDir and workspaceRoot must be separate.');
  for (const repo of c.repositories) {
    if (!isAbsolute(repo) || (await realpath(repo)) !== repo)
      fail('CONFIG', 'Repository allowlist paths must be canonical and absolute.');
    if (contains(repo, c.workspaceRoot) || contains(c.workspaceRoot, repo))
      fail('CONFIG', 'workspaceRoot must be outside every source repository.');
  }
  // These capabilities can change policy or spawn uncontrolled descendants.
  if (
    c.allowedTools.some((t) =>
      /^(run_code|.*subagent.*|plugin_manager|.*plugin.*|.*schedule.*|.*workflow.*|.*goal.*)$/i.test(
        t,
      ),
    )
  )
    fail(
      'CONFIG',
      'Composite execution, delegation, runtime mutation and autonomous scheduling tools are unsupported by this adapter.',
    );
  return c;
}
export async function loadToken(stateDir: string): Promise<string> {
  await privateDirectory(stateDir);
  const token = (await readPrivate(join(stateDir, 'auth.token'))).trim();
  if (!/^[a-f0-9]{64}$/.test(token)) fail('CONFIG', 'Invalid bridge token.');
  return token;
}
export async function initialize(stateDir: string, workspaceRoot: string): Promise<string> {
  stateDir = resolve(stateDir);
  workspaceRoot = resolve(workspaceRoot);
  socketPath(stateDir);
  if (contains(stateDir, workspaceRoot) || contains(workspaceRoot, stateDir))
    fail('CONFIG', 'Choose separate state and workspace directories.');
  await mkdir(stateDir, { mode: 0o700 }); // Deliberately refuses existing state; never rotates live credentials.
  await mkdir(workspaceRoot, { mode: 0o700 });
  secureWindowsDirectory(stateDir);
  secureWindowsDirectory(workspaceRoot);
  await privateDirectory(stateDir);
  await privateDirectory(workspaceRoot);
  const c: BridgeConfig = {
    version: 1,
    stateDir,
    workspaceRoot,
    allowedTools: [],
    allowedPresets: ['standard'],
    repositories: [],
    maxSessions: 8,
    maxTasks: 100,
    maxPromptBytes: 65536,
    maxOutputBytes: 262144,
    taskTimeoutMs: 300000,
  };
  const write = async (name: string, data: string) => {
    const f = await open(join(stateDir, name), 'wx', 0o600);
    try {
      await f.writeFile(data);
    } finally {
      await f.close();
    }
  };
  await write('auth.token', randomBytes(32).toString('hex'));
  await write('config.json', JSON.stringify(c, null, 2) + '\n');
  return configPath(stateDir);
}
