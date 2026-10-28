import { spawnSync } from 'node:child_process';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

if (process.platform !== 'win32') process.exit(0);
const root = process.env.SystemRoot ?? 'C:/Windows';
const executable = join(root, 'System32/WindowsPowerShell/v1.0/powershell.exe');
const filtered = getDefaultEnvironment();
const restored = { ...filtered, SystemRoot: root, WINDIR: root, ComSpec: join(root, 'System32/cmd.exe'), COMPUTERNAME: hostname(), OS: 'Windows_NT' };
const script = "[Console]::Error.WriteLine('ACL_PROBE started'); $acl=Get-Acl -LiteralPath $env:DSH_BRIDGE_ACL_PATH; [Console]::Error.WriteLine('ACL_PROBE acl-read'); $rules=$acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]); [Console]::Error.WriteLine('ACL_PROBE rules-read'); 'OK'; exit 0";
for (const [name, environment, encoded, ignoreInput] of [
  ['full-encoded-pipe', process.env, true, false],
  ['filtered-encoded-pipe', filtered, true, false],
  ['restored-encoded-pipe', restored, true, false],
  ['filtered-encoded-ignore', filtered, true, true],
  ['filtered-command-ignore', filtered, false, true],
]) {
  const env = { ...environment, PSModulePath: join(root, 'System32/WindowsPowerShell/v1.0/Modules'), DSH_BRIDGE_ACL_PATH: join(process.cwd(), 'package.json') };
  const args = ['-NoProfile', '-NonInteractive', encoded ? '-EncodedCommand' : '-Command', encoded ? Buffer.from(script, 'utf16le').toString('base64') : script];
  const started = Date.now();
  const result = spawnSync(executable, args, { env, windowsHide: true, encoding: 'utf8', timeout: 5000, stdio: [ignoreInput ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
  const record = { name, elapsedMs: Date.now() - started, status: result.status, error: result.error?.code, stages: [...(result.stderr ?? '').matchAll(/ACL_PROBE ([a-z-]+)/g)].map(match => match[1]), producedOk: (result.stdout ?? '').includes('OK') };
  console.log(`::notice title=Windows ACL probe::${JSON.stringify(record)}`);
}
