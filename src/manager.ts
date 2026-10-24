import { randomUUID } from 'node:crypto';
import { BRIDGE_VERSION, SUPPORTED_DESKTOPS, type DesktopCompatibility } from './version.ts';
import type { BridgeConfig } from './config.ts';
import { fail, publicError } from './errors.ts';
import { terminal, type SessionView, type TaskView } from './protocol.ts';
import type { DesktopRuntime, RuntimeSession } from './runtime.ts';
import { createWorkspace } from './workspace.ts';
interface SessionRecord {
  view: SessionView;
  runtime: RuntimeSession;
  closed: boolean;
}
interface TaskRecord {
  view: TaskView;
  prompt: string;
  requestId: string;
  output: string;
  done: Promise<void>;
}
export function boundedText(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const b = Buffer.from(text);
  if (b.length <= maxBytes) return { text, truncated: false };
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let n = maxBytes;
  for (;;) {
    try {
      return { text: decoder.decode(b.subarray(0, n)), truncated: true };
    } catch {
      n--;
    }
  }
}
export class TaskManager {
  private sessions = new Map<string, SessionRecord>();
  private tasks = new Map<string, TaskRecord>();
  private requests = new Map<string, string>();
  private creating = 0;
  private pendingCreates = new Set<Promise<SessionView>>();
  private closing = new Map<string, Promise<{ closed: boolean; workspacePreserved: string }>>();
  private stopping = false;
  constructor(
    private config: BridgeConfig,
    private runtime: DesktopRuntime,
    private compatibility?: DesktopCompatibility,
  ) {}
  info() {
    return {
      protocol: 1,
      bridgeVersion: BRIDGE_VERSION,
      adapter: this.compatibility ? `dsh-v${this.compatibility.desktop}` : 'test-runtime',
      desktopVersion: this.compatibility?.desktop,
      cordisVersion: this.compatibility?.cordis,
      supportedDesktops: SUPPORTED_DESKTOPS.map((target) => ({ ...target })),
      runtime: 'existing-desktop',
      instanceLifetime: 'until-plugin-unload',
      allowedTools: this.config.allowedTools,
      allowedPresets: this.config.allowedPresets,
      workspaceRoot: this.config.workspaceRoot,
      sandbox: false,
    };
  }
  createSession(input: {
    preset?: string;
    repository?: string;
    ref?: string;
  }): Promise<SessionView> {
    const pending = this.create(input);
    this.pendingCreates.add(pending);
    void pending.then(
      () => this.pendingCreates.delete(pending),
      () => this.pendingCreates.delete(pending),
    );
    return pending;
  }
  private async create(input: {
    preset?: string;
    repository?: string;
    ref?: string;
  }): Promise<SessionView> {
    if (this.stopping) fail('SHUTTING_DOWN', 'Desktop bridge is shutting down.');
    if (this.sessions.size + this.creating >= this.config.maxSessions)
      fail('CAPACITY', 'Session limit reached; close a session first.');
    const preset = input.preset ?? this.config.allowedPresets[0]!;
    if (!this.config.allowedPresets.includes(preset))
      fail('PERMISSION_DENIED', 'Preset is not allowed.');
    this.creating++;
    try {
      const sessionId = randomUUID();
      const cwd = await createWorkspace(this.config, sessionId, input.repository, input.ref);
      const runtime = await this.runtime.create(cwd, preset);
      if (this.stopping) {
        await runtime.dispose();
        fail('SHUTTING_DOWN', 'Desktop bridge stopped during session creation.');
      }
      const view = { sessionId, runtimeSessionId: runtime.id, cwd, preset };
      this.sessions.set(sessionId, { view, runtime, closed: false });
      return { ...view };
    } finally {
      this.creating--;
    }
  }
  listSessions(): SessionView[] {
    return [...this.sessions.values()].map((s) => ({ ...s.view }));
  }
  private session(id: string): SessionRecord {
    const s = this.sessions.get(id);
    if (!s || s.closed) fail('NOT_FOUND', 'Unknown bridge session.');
    return s;
  }
  private task(id: string): TaskRecord {
    const t = this.tasks.get(id);
    if (!t)
      fail('NOT_FOUND', 'Unknown task; Desktop restart does not restore bridge task handles.');
    return t;
  }
  submit(input: { sessionId: string; prompt: string; requestId: string }): TaskView {
    if (this.stopping) fail('SHUTTING_DOWN', 'Bridge is shutting down.');
    const previous = this.requests.get(input.requestId);
    if (previous) {
      const t = this.task(previous);
      if (t.view.sessionId !== input.sessionId || t.prompt !== input.prompt)
        fail('IDEMPOTENCY_CONFLICT', 'requestId was used with different input.');
      return { ...t.view };
    }
    const s = this.session(input.sessionId);
    if (s.view.activeTaskId)
      fail('SESSION_BUSY', 'Wait for or cancel the current task before sending a follow-up.');
    if (this.tasks.size >= this.config.maxTasks)
      fail('CAPACITY', 'Task retention limit reached; forget a terminal task first.');
    if (Buffer.byteLength(input.prompt) > this.config.maxPromptBytes)
      fail('PAYLOAD_TOO_LARGE', 'Prompt exceeds configured byte limit.');
    const view: TaskView = {
      taskId: randomUUID(),
      sessionId: input.sessionId,
      state: 'running',
      createdAt: new Date().toISOString(),
      truncated: false,
    };
    const t: TaskRecord = {
      view,
      prompt: input.prompt,
      requestId: input.requestId,
      output: '',
      done: Promise.resolve(),
    };
    s.view.activeTaskId = view.taskId;
    this.tasks.set(view.taskId, t);
    this.requests.set(input.requestId, view.taskId);
    t.done = this.run(s, t);
    return { ...view };
  }
  private async run(s: SessionRecord, t: TaskRecord): Promise<void> {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      t.view.state = 'cancelling';
      this.requestCancel(s, t);
    }, this.config.taskTimeoutMs);
    try {
      const result = await s.runtime.run(t.prompt);
      const bounded = boundedText(result.text, this.config.maxOutputBytes);
      t.output = bounded.text;
      t.view.truncated = bounded.truncated || result.truncated;
      t.view.error = result.error;
      t.view.state = timedOut
        ? 'timed_out'
        : t.view.state === 'cancelling'
          ? 'cancelled'
          : result.outcome;
    } catch (error) {
      t.view.state = timedOut
        ? 'timed_out'
        : t.view.state === 'cancelling'
          ? 'cancelled'
          : 'failed';
      t.view.error = publicError(error);
    } finally {
      clearTimeout(timer);
      t.view.finishedAt = new Date().toISOString();
      delete s.view.activeTaskId;
    }
  }
  getTask(taskId: string): TaskView {
    return { ...this.task(taskId).view };
  }
  getResult(taskId: string) {
    const t = this.task(taskId);
    return {
      ...t.view,
      output: t.output,
      contentTrust: 'untrusted-subagent-output',
      complete: terminal(t.view.state),
    };
  }
  private requestCancel(s: SessionRecord, t: TaskRecord): void {
    try {
      s.runtime.cancel();
    } catch {
      t.view.error = {
        code: 'CANCEL_FAILED',
        message: 'Runtime rejected cancellation; the task may still be running.',
      };
    }
  }
  cancel(taskId: string): TaskView {
    const t = this.task(taskId);
    if (!terminal(t.view.state)) {
      t.view.state = 'cancelling';
      this.requestCancel(this.sessions.get(t.view.sessionId)!, t);
    }
    return { ...t.view };
  }
  forget(taskId: string) {
    const t = this.task(taskId);
    if (!terminal(t.view.state)) fail('SESSION_BUSY', 'Only terminal tasks can be forgotten.');
    this.requests.delete(t.requestId);
    this.tasks.delete(taskId);
    return { forgotten: true, idempotencyKeyReleased: true };
  }
  closeSession(sessionId: string): Promise<{ closed: boolean; workspacePreserved: string }> {
    const pending = this.closing.get(sessionId);
    if (pending) return pending;
    const closing = this.close(sessionId);
    this.closing.set(sessionId, closing);
    void closing.then(
      () => this.closing.delete(sessionId),
      () => this.closing.delete(sessionId),
    );
    return closing;
  }
  private async close(sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (!s) fail('NOT_FOUND', 'Unknown bridge session.');
    s.closed = true;
    if (s.view.activeTaskId) {
      const t = this.task(s.view.activeTaskId);
      t.view.state = 'cancelling';
      this.requestCancel(s, t);
      await t.done;
    }
    await s.runtime.dispose();
    this.sessions.delete(sessionId);
    return { closed: true, workspacePreserved: s.view.cwd };
  }
  async dispose(): Promise<void> {
    this.stopping = true;
    await Promise.allSettled([...this.pendingCreates]);
    const results = await Promise.allSettled(
      [...this.sessions.keys()].map((id) => this.closeSession(id)),
    );
    if (results.some((r) => r.status === 'rejected'))
      fail('DISPOSAL_FAILED', 'One or more owned Desktop agents could not be disposed.');
  }
}
