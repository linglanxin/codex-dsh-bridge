import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { initialize, loadConfig, loadToken, privateDirectory } from './config.ts';
import { fail, publicError } from './errors.ts';
import { BRIDGE_VERSION, DESKTOP_TARGET, CORDIS_TARGET, SUPPORTED_DESKTOPS } from './version.ts';
export function defaultBridgePaths() {
  return {
    stateDir: resolve(homedir(), '.dsh-mcp-state'),
    workspaceRoot: resolve(homedir(), '.dsh-mcp-work'),
  };
}
export function resolveConfigFile(explicit?: string): string {
  return (
    explicit ??
    (process.env.DSH_DESKTOP_BRIDGE_CONFIG || join(defaultBridgePaths().stateDir, 'config.json'))
  );
}
export async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}
export async function setupInfo(configFile: string, pluginRoot?: string) {
  let configuration: { valid: boolean; error?: { code: string; message: string } };
  let stagedArchive: string | undefined;
  try {
    const config = await loadConfig(configFile);
    await loadToken(config.stateDir);
    if (pluginRoot) {
      const dir = join(config.stateDir, 'adapters');
      const file = join(dir, `dsh-desktop-mcp-bridge-${BRIDGE_VERSION}.tgz`);
      if (await pathExists(file)) {
        await privateDirectory(dir);
        const stat = await lstat(file);
        if (
          !stat.isFile() ||
          stat.isSymbolicLink() ||
          (process.platform !== 'win32' && (stat.uid !== process.getuid?.() ||
          (stat.mode & 0o077) !== 0))
        )
          fail('UNSAFE_PATH', 'The staged Desktop adapter must be an owner-only regular file.');
        stagedArchive = file;
      }
    }
    configuration = { valid: true };
  } catch (error) {
    configuration = { valid: false, error: publicError(error) };
  }
  return {
    bridgeVersion: BRIDGE_VERSION,
    configFile,
    configuration,
    desktopTarget: DESKTOP_TARGET,
    cordisTarget: CORDIS_TARGET,
    supportedDesktops: SUPPORTED_DESKTOPS.map((target) => ({ ...target })),
    setupCommand: pluginRoot
      ? {
          command: process.execPath,
          args: [
            join(pluginRoot, 'scripts/start.mjs'),
            'setup',
            ...(configFile === join(defaultBridgePaths().stateDir, 'config.json')
              ? [
                  '--state-dir',
                  defaultBridgePaths().stateDir,
                  '--workspace-root',
                  defaultBridgePaths().workspaceRoot,
                ]
              : ['--config', configFile]),
          ],
        }
      : null,
    desktopInstall: stagedArchive
      ? {
          command: '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh',
          args: ['plugin', '--profile', 'desktop', 'add', stagedArchive],
          prerequisite:
            'Fully quit official DSH Desktop after saving active work. This command installs the adapter; it does not launch a Harness runtime.',
        }
      : null,
    nextStep: configuration.valid
      ? pluginRoot && !stagedArchive
        ? 'Run setup once to stage a durable Desktop adapter archive, then inspect setup status again.'
        : 'Install/enable the staged adapter in official Desktop, open Desktop, then call dsh_connection_info.'
      : 'Run the explicit setup command to create a default-deny private config. No files have been created by this read-only tool.',
  };
}
export async function prepareSetup(
  options: { config?: string; stateDir?: string; workspaceRoot?: string },
  pluginRoot?: string,
) {
  if (Boolean(options.stateDir) !== Boolean(options.workspaceRoot))
    fail('USAGE', 'Supply both --state-dir and --workspace-root, or neither.');
  const defaults = defaultBridgePaths();
  const stateDir = resolve(options.stateDir ?? defaults.stateDir);
  const workspaceRoot = resolve(options.workspaceRoot ?? defaults.workspaceRoot);
  const configFile =
    options.config ?? (options.stateDir ? join(stateDir, 'config.json') : resolveConfigFile());
  if (await pathExists(configFile)) {
    const c = await loadConfig(configFile);
    await loadToken(c.stateDir);
  } else {
    if (options.config || (!options.stateDir && process.env.DSH_DESKTOP_BRIDGE_CONFIG))
      fail(
        'CONFIG_UNREADABLE',
        'Explicit config does not exist. Use init with matching state/workspace paths first.',
      );
    if ((await pathExists(stateDir)) || (await pathExists(workspaceRoot)))
      fail(
        'SETUP_INCOMPLETE',
        'State/workspace directories already exist without a valid config. Inspect them or choose new paths; setup will not overwrite them.',
      );
    await initialize(stateDir, workspaceRoot);
  }
  if (pluginRoot) {
    const config = await loadConfig(configFile);
    const dir = join(config.stateDir, 'adapters');
    await mkdir(dir, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
    });
    await privateDirectory(dir);
    const name = `dsh-desktop-mcp-bridge-${BRIDGE_VERSION}.tgz`;
    const data = await readFile(join(pluginRoot, 'desktop', name));
    const temporary = join(dir, `.${randomUUID()}.tmp`);
    try {
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(data);
      } finally {
        await file.close();
      }
      await rename(temporary, join(dir, name));
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return setupInfo(configFile, pluginRoot);
}
