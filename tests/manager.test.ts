import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { fixture, until } from './helpers.ts';
import { boundedText } from '../src/manager.ts';
import { terminal } from '../src/protocol.ts';
test('session follow-ups preserve context handle and deduplicate request UUIDs', async (t) => {
  const f = await fixture();
  t.after(() => f.cleanup());
  const s = await f.manager.createSession({});
  const input = { sessionId: s.sessionId, prompt: 'hello', requestId: randomUUID() };
  const a = f.manager.submit(input);
  const b = f.manager.submit(input);
  assert.equal(a.taskId, b.taskId);
  assert.throws(() => f.manager.submit({ ...input, prompt: 'changed' }), /different input/);
  await until(() => terminal(f.manager.getTask(a.taskId).state));
  assert.equal(f.manager.getResult(a.taskId).output, 'reply:hello');
  assert.equal(f.runtime.sessions[0]?.runs, 1);
  f.manager.submit({ ...input, prompt: 'follow-up', requestId: randomUUID() });
  await until(() => !f.manager.listSessions()[0]?.activeTaskId);
  assert.equal(f.runtime.sessions[0]?.runs, 2);
});
test('running sessions reject concurrent input; cancellation waits for quiescence', async (t) => {
  const f = await fixture('slow-cancel');
  t.after(() => f.cleanup());
  const s = await f.manager.createSession({});
  const a = f.manager.submit({ sessionId: s.sessionId, prompt: 'wait', requestId: randomUUID() });
  assert.throws(
    () => f.manager.submit({ sessionId: s.sessionId, prompt: 'race', requestId: randomUUID() }),
    /current task/,
  );
  assert.throws(() => f.manager.forget(a.taskId), /terminal/);
  assert.equal(f.manager.cancel(a.taskId).state, 'cancelling');
  assert.equal(f.manager.getResult(a.taskId).complete, false);
  f.runtime.sessions[0]!.release!({ text: 'partial', outcome: 'completed', truncated: false });
  await until(() => terminal(f.manager.getTask(a.taskId).state));
  assert.equal(f.manager.getTask(a.taskId).state, 'cancelled');
  assert.equal(f.manager.cancel(a.taskId).state, 'cancelled');
});
test('timeouts request cooperative stop and report timed_out after execution stops', async (t) => {
  const f = await fixture('wait');
  f.config.taskTimeoutMs = 100;
  t.after(() => f.cleanup());
  const s = await f.manager.createSession({});
  const a = f.manager.submit({
    sessionId: s.sessionId,
    prompt: 'timeout',
    requestId: randomUUID(),
  });
  await until(() => terminal(f.manager.getTask(a.taskId).state));
  assert.equal(f.manager.getTask(a.taskId).state, 'timed_out');
});
test('bounds prompts, output, sessions and task retention; never forwards raw errors', async (t) => {
  const f = await fixture('fail');
  t.after(() => f.cleanup());
  f.config.maxSessions = 1;
  f.config.maxTasks = 1;
  f.config.maxPromptBytes = 4;
  const s = await f.manager.createSession({});
  await assert.rejects(f.manager.createSession({}), /limit/);
  assert.throws(
    () => f.manager.submit({ sessionId: s.sessionId, prompt: '中文', requestId: randomUUID() }),
    /byte limit/,
  );
  const a = f.manager.submit({ sessionId: s.sessionId, prompt: 'fail', requestId: randomUUID() });
  await until(() => terminal(f.manager.getTask(a.taskId).state));
  assert.equal(f.manager.getTask(a.taskId).state, 'failed');
  assert.doesNotMatch(JSON.stringify(f.manager.getResult(a.taskId)), /SECRET/);
  assert.throws(
    () => f.manager.submit({ sessionId: s.sessionId, prompt: 'next', requestId: randomUUID() }),
    /retention/,
  );
  f.manager.forget(a.taskId);
  assert.throws(() => f.manager.getTask(a.taskId), /Unknown task/);
});
test('closing cancels owned work and preserves workspace for review', async (t) => {
  const f = await fixture('wait');
  t.after(() => f.cleanup());
  const s = await f.manager.createSession({});
  const a = f.manager.submit({ sessionId: s.sessionId, prompt: 'wait', requestId: randomUUID() });
  await f.manager.closeSession(s.sessionId);
  assert.equal(f.manager.getTask(a.taskId).state, 'cancelled');
  assert.equal(f.runtime.sessions[0]!.disposed, true);
  assert.equal((await lstat(s.cwd)).isDirectory(), true);
  assert.deepEqual(f.manager.listSessions(), []);
});
test('output limits preserve UTF-8 text at byte boundaries', () => {
  assert.deepEqual(boundedText('中🙂a', 6), { text: '中', truncated: true });
  assert.equal(boundedText('中🙂a', 7).text, '中🙂');
  assert.equal(boundedText('a', 1).truncated, false);
});
test('shutdown waits for in-flight agent creation and disposes its late handle', async (t) => {
  const f = await fixture();
  t.after(() => f.cleanup());
  const original = f.runtime.create.bind(f.runtime);
  let release!: () => void;
  let entered = false;
  f.runtime.create = async () => {
    entered = true;
    await new Promise<void>((r) => {
      release = r;
    });
    return original();
  };
  const creating = f.manager.createSession({});
  const rejection = assert.rejects(creating, /stopped during/);
  await until(() => entered);
  let stopped = false;
  const disposing = f.manager.dispose().then(() => {
    stopped = true;
  });
  await Promise.resolve();
  assert.equal(stopped, false);
  release();
  await disposing;
  await rejection;
  assert.equal(f.runtime.sessions[0]!.disposed, true);
  assert.deepEqual(f.manager.listSessions(), []);
});
test('concurrent close joins one cancellation and disposal', async (t) => {
  const f = await fixture('wait');
  t.after(() => f.cleanup());
  const session = await f.manager.createSession({});
  f.manager.submit({ sessionId: session.sessionId, prompt: 'wait', requestId: randomUUID() });
  await Promise.all([
    f.manager.closeSession(session.sessionId),
    f.manager.closeSession(session.sessionId),
  ]);
  assert.equal(f.runtime.sessions[0]!.disposed, true);
});
