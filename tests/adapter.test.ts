import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { PluginPackages } from '@deepseek-ai/dsh-app-boot';
import { randomUUID } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SUPPORTED_DESKTOPS } from '../src/version.ts';
import Loader from '@deepseek-ai/cordis-plugin-loader';
import Group from '@deepseek-ai/cordis-plugin-group';
import LlmRuntime, {
  LlmAdapter,
  ToolCallId,
  type GenerateOptions,
  type StreamChunk,
  type LlmResolvedModelInfo,
} from '@deepseek-ai/dsh-llm';
import type {} from '@deepseek-ai/dsh-session-projection';
import { defineContentToolFixture } from '@deepseek-ai/dsh-tools';
import { DshDesktopRuntime } from '../src/dsh-adapter.ts';
import { assertCompatible } from '../src/desktop-plugin.ts';
import { until } from './helpers.ts';
class ScriptAdapter extends LlmAdapter {
  requests: GenerateOptions[] = [];
  constructor(private script: ('text' | 'tool' | 'bridge' | 'hang' | 'failure')[]) {
    super();
  }
  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return { provider, id: model, name: model };
  }
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options);
    const item = this.script.shift();
    if (item === 'hang') {
      await new Promise<void>((resolve, reject) => {
        if (options.signal?.aborted) {
          reject(options.signal.reason);
          return;
        }
        options.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
          once: true,
        });
      });
      return;
    }
    if (item === 'failure') throw new Error('MODEL_SECRET');
    if (item === 'tool' || item === 'bridge') {
      const block = {
        type: 'tool-call' as const,
        id: ToolCallId('test-call'),
        name: item === 'bridge' ? 'bridge_checkpoint' : 'fixture_tool',
        arguments: item === 'bridge' ? '{"summary":"Plan for test"}' : '{}',
      };
      yield { type: 'block-start', index: 0, blockType: 'tool-call' };
      yield {
        type: 'tool-call-delta',
        index: 0,
        id: block.id,
        name: block.name,
        argumentsDelta: block.arguments,
      };
      yield { type: 'block-end', index: 0, block };
      yield { type: 'finish', reason: { kind: 'tool-calls' } };
      return;
    }
    assert.equal(item, 'text', 'Test script exhausted');
    const text = 'official-runtime-response';
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'text-delta', index: 0, text };
    yield { type: 'block-end', index: 0, block: { type: 'text', text } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
}
async function compose(
  script: ('text' | 'tool' | 'bridge' | 'hang' | 'failure')[],
  toolBody?: (signal: AbortSignal) => Promise<void>,
) {
  const ctx = new Context();
  await ctx.plugin(PluginPackages, {});
  await ctx.plugin(Loader, { baseUrl: new URL('../', import.meta.url).href });
  ctx.loader.builtins.group = Group;
  for (const [name, config] of [
    ['dsh-llm', {}],
    ['dsh-session', {}],
    ['dsh-session-projection', {}],
    ['dsh-system-prompt', { personaPrefix: '' }],
    ['dsh-tools', {}],
    ['dsh-agent', {}],
    ['dsh-agent-loop', { agents: [] }],
    ['dsh-agent-default-model', { provider: 'bridge-test', model: 'configured-model' }],
    ['dsh-agent-preset-registry', { default: 'standard' }],
  ] as const) {
    await ctx.loader.create({ name: `@deepseek-ai/${name}`, config });
  }
  await ctx.loader.await();
  assert.ok(ctx.get('agents'));
  assert.ok(ctx.get('agentPresets'));
  const unregister = await ctx.agentPresets.register({ id: 'standard', plugins: [] });
  ctx.effect(() => unregister);
  const adapter = new ScriptAdapter(script);
  ctx.effect(() => ctx.llm.registerAdapter(['bridge-test'], adapter));
  let executions = 0;
  ctx.effect(() =>
    ctx.tools.register(
      defineContentToolFixture({
        name: 'fixture_tool',
        description: 'Test permission executor',
        parameters: {},
        execute: async (_args, exec) => {
          executions++;
          await toolBody?.(exec.signal);
          return [{ type: 'text', text: 'executed' }];
        },
      }),
    ),
  );
  return { ctx, adapter, executions: () => executions };
}
test('adapter uses official Loader, AgentLoop, Preset and configured model; follow-ups share session', async (t) => {
  const f = await compose(['text', 'text']);
  t.after(() => f.ctx.fiber.dispose());
  const runtime = new DshDesktopRuntime(f.ctx, [], 1024);
  const session = await runtime.create('/tmp', 'standard');
  const result = await session.run('one');
  assert.equal(result.outcome, 'completed');
  assert.equal(result.text, 'official-runtime-response');
  await session.run('two');
  assert.equal(f.adapter.requests.length, 2);
  assert.equal(f.adapter.requests[0]!.model, 'configured-model');
  const events = f.ctx.agents
    .get(session.id as Parameters<typeof f.ctx.agents.get>[0])!
    .session.snapshotEvents();
  assert.equal(events.filter((e) => e.type === 'user/message').length, 2);
  assert.match(JSON.stringify(events), /desktop-mcp-bridge/);
  await session.dispose();
  assert.equal(f.ctx.agents.get(session.id as Parameters<typeof f.ctx.agents.get>[0]), undefined);
});
test('supervised tools register in the real AgentLoop, block at checkpoint and continue after response', async t => {
  const f = await compose(['bridge', 'text']); t.after(() => f.ctx.fiber.dispose());
  let release: ((answer: unknown) => void) | undefined;
  const session = await new DshDesktopRuntime(f.ctx, [], 1024).create('/tmp', 'standard', {
    canExecute: () => true, event() {},
    control: async (name, args) => { assert.equal(name, 'bridge_checkpoint'); assert.equal(args.summary, 'Plan for test'); return new Promise(done => { release = done; }); },
  });
  const result = session.run('Submit plan checkpoint');
  await until(() => Boolean(release)); assert.equal(f.adapter.requests.length, 1);
  release!({ approved: true }); assert.equal((await result).outcome, 'completed');
  assert.equal(f.adapter.requests.length, 2); await session.dispose();
});
test('unallowlisted tools are denied by the real executor and allowed tools run', async (t) => {
  const f = await compose(['tool', 'text', 'tool', 'text']);
  t.after(() => f.ctx.fiber.dispose());
  const denied = await new DshDesktopRuntime(f.ctx, [], 1024).create('/tmp', 'standard');
  await denied.run('call tool');
  assert.equal(f.executions(), 0);
  const allowed = await new DshDesktopRuntime(f.ctx, ['fixture_tool'], 1024).create(
    '/tmp',
    'standard',
  );
  await allowed.run('call tool');
  assert.equal(f.executions(), 1);
  await denied.dispose();
  await allowed.dispose();
});
test('real AgentLoop cancellation drains before reporting cancellation', async (t) => {
  const f = await compose(['hang']);
  t.after(() => f.ctx.fiber.dispose());
  const session = await new DshDesktopRuntime(f.ctx, [], 1024).create('/tmp', 'standard');
  const result = session.run('wait');
  await until(() => f.adapter.requests.length === 1);
  session.cancel();
  assert.equal((await result).outcome, 'cancelled');
  await session.dispose();
});
test('Desktop adapter refuses a non-Desktop host', async (t) => {
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  await assert.rejects(assertCompatible(ctx), /official Desktop/);
});

test('real model failures report failure without exposing provider secrets', async (t) => {
  const f = await compose(['failure']);
  t.after(() => f.ctx.fiber.dispose());
  const session = await new DshDesktopRuntime(f.ctx, [], 1024).create('/tmp', 'standard');
  const result = await session.run('fail');
  assert.equal(result.outcome, 'failed');
  assert.equal(result.error?.code, 'RUNTIME_FAILURE');
  assert.doesNotMatch(JSON.stringify(result), /MODEL_SECRET/);
  await session.dispose();
});
test('built plugin activates in a simulated Desktop profile and cleans up its socket on unload', async (t) => {
  const { fixture } = await import('./helpers.ts');
  const { BridgeClient } = await import('../src/transport.ts');
  const f = await compose(['text', 'hang']);
  const local = await fixture();
  t.after(async () => {
    await f.ctx.fiber.dispose();
    await local.cleanup();
  });
  f.ctx.provide('profileContext', {
    name: 'desktop',
    dir: local.root,
    patchPath: '',
    installAnchor: '',
    cwd: local.root,
    home: local.root,
    startedBundles: [],
    overlays: [],
    telemetryDisabledEnv: undefined,
  });
  const matched = await assertCompatible(f.ctx);
  const entryId = await f.ctx.loader.create({
    name: new URL('../dist/desktop-plugin.js', import.meta.url).href,
    config: { configFile: local.file },
  });
  await f.ctx.loader.await();
  const client = await BridgeClient.fromConfig(local.file);
  const info = (await client.call('connection_info', {})) as {
    adapter: string;
    desktopVersion: string;
    cordisVersion: string;
  };
  assert.equal(info.adapter, `dsh-v${matched.desktop}`);
  assert.equal(info.desktopVersion, matched.desktop);
  assert.equal(info.cordisVersion, matched.cordis);
  const ready = JSON.parse(await readFile(join(local.config.stateDir, 'ready.json'), 'utf8'));
  assert.equal(ready.adapter, info.adapter);
  const session = (await client.call('create_session', {})) as { sessionId: string };
  const task = (await client.call('submit_task', {
    sessionId: session.sessionId,
    prompt: 'plugin smoke',
    requestId: randomUUID(),
  })) as { taskId: string };
  let result: { complete?: boolean; output?: string } = {};
  for (let i = 0; i < 100 && !result.complete; i++)
    result = (await client.call('get_result', { taskId: task.taskId })) as typeof result;
  assert.equal(result.output, 'official-runtime-response');
  const waiting = (await client.call('submit_task', {
    sessionId: session.sessionId,
    prompt: 'cancel this follow-up',
    requestId: randomUUID(),
  })) as { taskId: string };
  await until(() => f.adapter.requests.length === 2);
  const cancellation = (await client.call('cancel_task', { taskId: waiting.taskId })) as {
    state: string;
  };
  assert.equal(cancellation.state, 'cancelling');
  let cancelled: { complete?: boolean; state?: string } = {};
  for (let i = 0; i < 100 && !cancelled.complete; i++) {
    cancelled = (await client.call('get_result', { taskId: waiting.taskId })) as typeof cancelled;
    if (!cancelled.complete) await new Promise((r) => setTimeout(r, 5));
  }
  assert.equal(cancelled.state, 'cancelled');
  const closed = (await client.call('close_session', { sessionId: session.sessionId })) as {
    closed: boolean;
    workspacePreserved: string;
  };
  assert.equal(closed.closed, true);
  assert.ok((await lstat(closed.workspacePreserved)).isDirectory());
  await f.ctx.loader.resolve(entryId).fiber!.dispose();
  await assert.rejects(client.call('connection_info', {}), /socket is missing/);
});

test('monotonic allowlist survives pre-execute short circuit and does not restrict ordinary Desktop agents', async (t) => {
  const f = await compose(['tool', 'text', 'tool', 'text']);
  t.after(() => f.ctx.fiber.dispose());
  const worker = await new DshDesktopRuntime(f.ctx, [], 1024).create('/tmp', 'standard');
  const agent = f.ctx.agents.get(worker.id as Parameters<typeof f.ctx.agents.get>[0])!;
  agent.ctx.on('tools/pre-execute', () => Promise.resolve({ kind: 'allow' }), { prepend: true });
  await worker.run('attempt a denied call');
  assert.equal(f.executions(), 0);
  assert.match(JSON.stringify(agent.session.snapshotEvents()), /does not permit tool fixture_tool/);
  const ordinary = await f.ctx.agents.create({
    sessionId: `ordinary-${randomUUID()}` as Parameters<typeof f.ctx.agents.create>[0]['sessionId'],
    meta: { cwd: '/tmp' },
    agentOptions: { provider: 'bridge-test', model: 'configured-model' },
    setup: async (ctx) => {
      await f.ctx.agentPresets.mount(ctx, 'standard');
    },
  });
  const { createUserMessage } = await import('@deepseek-ai/dsh-llm');
  ordinary.agent.followup(
    createUserMessage({
      content: [{ type: 'text', text: 'ordinary chat tool' }],
      source: { kind: 'desktop-mcp-bridge' },
    }),
  );
  await ordinary.agent.whenIdle();
  assert.equal(f.executions(), 1);
  await worker.dispose();
  await ordinary.dispose();
});

test('cancellation of an allowed in-flight tool waits for its actual quiescence', async (t) => {
  let release!: () => void;
  let started = false;
  let signal!: AbortSignal;
  const f = await compose(['tool'], async (value) => {
    signal = value;
    started = true;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  t.after(async () => {
    release?.();
    await f.ctx.fiber.dispose();
  });
  const session = await new DshDesktopRuntime(f.ctx, ['fixture_tool'], 1024).create(
    '/tmp',
    'standard',
  );
  let settled = false;
  const running = session.run('run the slow tool').then((result) => {
    settled = true;
    return result;
  });
  await until(() => started);
  session.cancel();
  await until(() => signal.aborted);
  assert.equal(settled, false);
  release();
  assert.equal((await running).outcome, 'cancelled');
  await session.dispose();
});

test('task deadline cancels the official AgentLoop request and retains terminal result', async (t) => {
  const { fixture } = await import('./helpers.ts');
  const { TaskManager } = await import('../src/manager.ts');
  const { terminal } = await import('../src/protocol.ts');
  const f = await compose(['hang']);
  const local = await fixture();
  local.config.taskTimeoutMs = 100;
  const manager = new TaskManager(local.config, new DshDesktopRuntime(f.ctx, [], 1024));
  t.after(async () => {
    await manager.dispose();
    await f.ctx.fiber.dispose();
    await local.cleanup();
  });
  const session = await manager.createSession({});
  const task = manager.submit({
    sessionId: session.sessionId,
    prompt: 'timeout',
    requestId: randomUUID(),
  });
  await until(() => terminal(manager.getTask(task.taskId).state));
  assert.equal(manager.getResult(task.taskId).state, 'timed_out');
  assert.equal(manager.getResult(task.taskId).complete, true);
  assert.equal(f.adapter.requests[0]!.signal?.aborted, true);
});

test('official metadata accepts complete supported pairs and rejects mixed or unresolved packages', async (t) => {
  const f = await compose([]);
  t.after(() => f.ctx.fiber.dispose());
  f.ctx.provide('profileContext', {
    name: 'desktop',
    dir: '/tmp',
    patchPath: '',
    installAnchor: '',
    cwd: '/tmp',
    home: '/tmp',
    startedBundles: [],
    overlays: [],
    telemetryDisabledEnv: undefined,
  });
  const actual = await assertCompatible(f.ctx);
  assert.equal(
    actual.desktop,
    f.ctx.pluginPackages.packageOf('@deepseek-ai/dsh-agent', import.meta.url)!.version,
  );
  const lookup = f.ctx.pluginPackages.packageOf.bind(f.ctx.pluginPackages);
  for (const target of SUPPORTED_DESKTOPS) {
    f.ctx.pluginPackages.packageOf = (specifier, parent) => {
      const meta = lookup(specifier, parent);
      const version = specifier.endsWith('/cordis')
        ? target.cordis
        : specifier.endsWith('/schemastery')
          ? target.schemastery
          : target.desktop;
      return meta ? { ...meta, version } : undefined;
    };
    assert.deepEqual(await assertCompatible(f.ctx), target);
  }
  for (const [name, version] of [
    ['cordis', actual.cordis === '4.0.4' ? '4.0.5' : '4.0.4'],
    ['schemastery', actual.schemastery === '3.18.4' ? '3.18.5' : '3.18.4'],
    ['dsh-session', actual.desktop === '0.2.1-rc.1' ? '0.2.1-rc.2' : '0.2.1-rc.1'],
  ]) {
    f.ctx.pluginPackages.packageOf = (specifier, parent) => {
      const meta = lookup(specifier, parent);
      return meta && specifier.endsWith(`/${name}`) ? { ...meta, version } : meta;
    };
    await assert.rejects(assertCompatible(f.ctx), /Unsupported Desktop dependency combination/);
  }
  f.ctx.pluginPackages.packageOf = (specifier, parent) =>
    specifier.endsWith('/dsh-tools') ? undefined : lookup(specifier, parent);
  await assert.rejects(assertCompatible(f.ctx), /dsh-tools@unresolved/);
  f.ctx.pluginPackages.packageOf = (specifier, parent) => {
    const meta = lookup(specifier, parent);
    return meta && specifier.endsWith('/dsh-agent') ? { ...meta, version: '0.2.1-rc.4' } : meta;
  };
  await assert.rejects(assertCompatible(f.ctx), /Unsupported Desktop dependency combination/);
  f.ctx.pluginPackages.packageOf = (specifier, parent) => {
    const meta = lookup(specifier, parent);
    return meta && specifier.endsWith('/dsh-agent') ? { ...meta, name: 'wrong-package' } : meta;
  };
  await assert.rejects(assertCompatible(f.ctx), /Unsupported Desktop dependency combination/);
});
