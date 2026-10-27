import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-app-boot';
import type {} from '@deepseek-ai/dsh-workspace';
import schema from '@deepseek-ai/schemastery';
import { configPath, loadConfig } from './config.ts';
import { DshDesktopRuntime } from './dsh-adapter.ts';
import { TaskManager } from './manager.ts';
import { startBridge } from './transport.ts';
import { fail } from './errors.ts';
import { Coordinator } from './coordinator.ts';
import { resolve } from 'node:path';
import { pathExists, resolveConfigFile } from './setup.ts';
import { SUPPORTED_DESKTOPS, type DesktopCompatibility } from './version.ts';
export const name = 'dsh-desktop-mcp-bridge';
export const inject = ['agents', 'agentPresets', 'agentDefaultModel', 'tools', 'pluginPackages'];
export interface Config {
  configFile?: string;
}
export const Config = schema.object({ configFile: schema.string() });
export async function assertCompatible(ctx: Context): Promise<DesktopCompatibility> {
  if (ctx.get('profileContext')?.name !== 'desktop')
    fail('UNSUPPORTED_HOST', 'This plugin only connects to an existing official Desktop profile.');
  const packages = ctx.get('pluginPackages');
  if (!packages) fail('UNSUPPORTED_HOST', 'Official Desktop package metadata service is required.');
  const names = [
    'cordis',
    'schemastery',
    'dsh-agent',
    'dsh-session',
    'dsh-llm',
    'dsh-tools',
    'dsh-agent-preset-registry',
    'dsh-agent-default-model',
  ];
  const observed = names.map((name) => ({
    name,
    metadata: packages.packageOf(`@deepseek-ai/${name}`, import.meta.url),
  }));
  const compatible = SUPPORTED_DESKTOPS.find((target) =>
    observed.every(({ name, metadata }) => {
      const expected =
        name === 'cordis'
          ? target.cordis
          : name === 'schemastery'
            ? target.schemastery
            : target.desktop;
      return metadata?.name === `@deepseek-ai/${name}` && metadata.version === expected;
    }),
  );
  if (!compatible) {
    const found = observed
      .map(({ name, metadata }) => `${name}@${metadata?.version ?? 'unresolved'}`)
      .join(', ');
    fail(
      'UNSUPPORTED_VERSION',
      `Unsupported Desktop dependency combination: ${found}. Requires one complete tested version pair; bridge stays disabled.`,
    );
  }
  return { ...compatible };
}
export async function apply(ctx: Context, options: Config = {}): Promise<void> {
  await activate(ctx, options);
}
async function activate(ctx: Context, options: Config = {}): Promise<void> {
  const explicit = options.configFile ?? (process.env.DSH_DESKTOP_BRIDGE_CONFIG || undefined);
  const file = resolve(resolveConfigFile(explicit));
  if (!explicit && !(await pathExists(file))) {
    ctx.logger.warn(
      'Desktop MCP bridge is disabled. Run the explicit setup command or set configFile/DSH_DESKTOP_BRIDGE_CONFIG.',
    );
    return;
  }
  const compatibility = await assertCompatible(ctx);
  const config = await loadConfig(file);
  if (file !== configPath(config.stateDir)) fail('CONFIG', 'Use canonical configFile path.');
  const start = async (runtimeCtx: Context) => {
    const workspace = config.workspaceTitle
      ? await runtimeCtx.workspaceRegistry.create(config.workspaceRoot, config.workspaceTitle)
      : undefined;
    if (workspace && workspace.title !== config.workspaceTitle)
      await workspace.setTitle(config.workspaceTitle!);
    const runtime = new DshDesktopRuntime(runtimeCtx, config.allowedTools, config.maxOutputBytes, workspace);
    const manager = new TaskManager(
      config,
      runtime,
      compatibility,
    );
    const coordinator = new Coordinator(config, runtime);
    await runtimeCtx.effect(async () => {
      const stop = await startBridge(config, manager, coordinator);
      return async () => {
        await stop();
        await coordinator.dispose();
        await manager.dispose();
      };
    });
  };
  // WorkspaceRegistry is optional for existing installations, but mandatory
  // and lifecycle-tracked when grouping is explicitly configured.
  if (config.workspaceTitle) await ctx.inject(['workspaceRegistry'], start);
  else await start(ctx);
}
