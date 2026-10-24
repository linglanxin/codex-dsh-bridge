import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { initialize, loadConfig, loadToken } from '../src/config.ts';
import { TaskManager } from '../src/manager.ts';
import type { DesktopRuntime, RunResult, RuntimeSession } from '../src/runtime.ts';
export class FakeSession implements RuntimeSession {
  id = randomUUID();
  runs = 0;
  cancelled = false;
  disposed = false;
  release?: (r: RunResult) => void;
  constructor(private mode: 'instant' | 'wait' | 'slow-cancel' | 'fail' = 'instant') {}
  async run(prompt: string): Promise<RunResult> {
    this.runs++;
    this.cancelled = false;
    if (this.mode === 'fail') throw new Error('SECRET_SHOULD_NOT_LEAK');
    if (this.mode === 'instant')
      return { text: `reply:${prompt}`, outcome: 'completed', truncated: false };
    return new Promise<RunResult>((resolve) => {
      this.release = resolve;
    });
  }
  cancel() {
    this.cancelled = true;
    if (this.mode !== 'slow-cancel')
      this.release?.({ text: 'partial', outcome: 'cancelled', truncated: false });
  }
  async dispose() {
    this.disposed = true;
  }
}
export class FakeRuntime implements DesktopRuntime {
  sessions: FakeSession[] = [];
  constructor(private mode: 'instant' | 'wait' | 'slow-cancel' | 'fail' = 'instant') {}
  async create() {
    const s = new FakeSession(this.mode);
    this.sessions.push(s);
    return s;
  }
}
export async function fixture(mode: 'instant' | 'wait' | 'slow-cancel' | 'fail' = 'instant') {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'dshb-'));
  const file = await initialize(join(root, 's'), join(root, 'w'));
  const config = await loadConfig(file);
  const token = await loadToken(config.stateDir);
  const runtime = new FakeRuntime(mode);
  const manager = new TaskManager(config, runtime);
  return {
    root,
    file,
    config,
    token,
    runtime,
    manager,
    async cleanup() {
      await manager.dispose();
      await rm(root, { recursive: true, force: true });
    },
  };
}
export async function until(check: () => boolean) {
  const end = Date.now() + 3000;
  while (!check()) {
    if (Date.now() > end) throw new Error('Timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}
