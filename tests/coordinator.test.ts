import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Coordinator } from '../src/coordinator.ts';
import type { DesktopRuntime, RuntimeHooks, RuntimeSession, RunResult } from '../src/runtime.ts';
import type { BridgeConfig } from '../src/config.ts';

async function until(check: () => boolean) { const end = Date.now() + 3000; while (!check()) { if (Date.now() > end) throw Error('Timeout'); await new Promise(r => setTimeout(r, 5)); } }
async function fixture(mode: 'question' | 'checkpoint' | 'instant' = 'question') {
  const root = await mkdtemp(join(tmpdir(), 'dsh-supervised-')); await mkdir(join(root, 'state')); await mkdir(join(root, 'work'));
  let calls = 0;
  const runtime: DesktopRuntime = { async create(_cwd, _preset, hooks): Promise<RuntimeSession> {
    const abort = new AbortController();
    return { id: randomUUID(), async run(): Promise<RunResult> {
      calls++; if (mode !== 'instant') await hooks!.control(mode === 'question' ? 'bridge_ask_codex' : 'bridge_checkpoint', mode === 'question' ? { question: 'Which output?', options: ['A', 'B'], recommendation: 'A' } : { summary: 'Write result.txt' }, abort.signal);
      if (abort.signal.aborted) return { text: '', outcome: 'cancelled', truncated: false };
      if (mode === 'question') await hooks!.control('bridge_checkpoint', { summary: 'Write result.txt' }, abort.signal);
      if (mode !== 'instant') await hooks!.control('bridge_write_file', { path: 'result.txt', content: 'OK' }, abort.signal);
      return { text: 'done', outcome: 'completed', truncated: false };
    }, cancel() { abort.abort(); }, async dispose() {} };
  } };
  const config = { stateDir: join(root, 'state'), workspaceRoot: join(root, 'work'), allowedPresets: ['standard'], taskTimeoutMs: 300000 } as BridgeConfig;
  const coordinator = new Coordinator(config, runtime);
  return { root, config, runtime, coordinator, get calls() { return calls; }, async cleanup() { await coordinator.dispose(); await rm(root, { recursive: true, force: true }); } };
}
test('question blocks writes, binds IDs, rejects duplicate replies, and requires independent acceptance', async t => {
  const f = await fixture(); t.after(() => f.cleanup());
  const input = { requestId: randomUUID(), objective: 'Generate file', acceptance: ['File contains OK'] };
  const j = await f.coordinator.start(input); await until(() => f.coordinator.get(j.id).status === 'waiting_input');
  assert.equal((await f.coordinator.start(input)).id, j.id); assert.equal(f.calls, 1);
  await assert.rejects(readFile(join(j.cwd, 'result.txt')));
  assert.throws(() => f.coordinator.answer({ jobId: j.id, questionId: randomUUID(), answer: 'A' }));
  const q = f.coordinator.get(j.id).questions[0]!;
  f.coordinator.answer({ jobId: j.id, questionId: q.id, answer: 'A' });
  assert.throws(() => f.coordinator.answer({ jobId: j.id, questionId: q.id, answer: 'B' }));
  await until(() => f.coordinator.get(j.id).status === 'waiting_review');
  const checkpoint = f.coordinator.get(j.id).questions.find(q => q.kind === 'checkpoint')!;
  f.coordinator.review({ jobId: j.id, fingerprint: checkpoint.fingerprint!, approve: true, evidence: 'Plan reviewed' });
  await until(() => f.coordinator.get(j.id).status === 'awaiting_review');
  const result = f.coordinator.get(j.id);
  assert.equal(await readFile(join(j.cwd, 'result.txt'), 'utf8'), 'OK');
  assert.throws(() => f.coordinator.review({ jobId: j.id, fingerprint: '0'.repeat(64), approve: true, evidence: 'stale' }));
  f.coordinator.review({ jobId: j.id, fingerprint: result.fingerprint!, approve: true, evidence: 'Read actual file: OK' });
  assert.equal(f.coordinator.get(j.id).status, 'accepted');
  await writeFile(join(j.cwd, 'result.txt'), 'CHANGED');
  assert.equal(f.coordinator.get(j.id).status, 'awaiting_review');
});
test('checkpoint pauses, requires exact fingerprint, then resumes reviewed work', async t => {
  const f = await fixture('checkpoint'); t.after(() => f.cleanup());
  const j = await f.coordinator.start({ requestId: randomUUID(), objective: 'Stage task', acceptance: ['OK'] });
  await until(() => f.coordinator.get(j.id).status === 'waiting_review');
  const paused = f.coordinator.get(j.id);
  await assert.rejects(readFile(join(j.cwd, 'result.txt')));
  f.coordinator.review({ jobId: j.id, fingerprint: paused.questions[0]!.fingerprint!, approve: true, evidence: 'Plan reviewed', nextInstructions: 'Write result.txt only' });
  await until(() => f.coordinator.get(j.id).status === 'awaiting_review');
});
test('cancellation releases blocking question and does not fabricate completion', async t => {
  const f = await fixture(); t.after(() => f.cleanup());
  const j = await f.coordinator.start({ requestId: randomUUID(), objective: 'Cancel task', acceptance: ['OK'] });
  await until(() => f.coordinator.get(j.id).status === 'waiting_input');
  f.coordinator.cancel(j.id); await until(() => f.coordinator.get(j.id).status === 'cancelled');
  await assert.rejects(readFile(join(j.cwd, 'result.txt')));
});
test('restart preserves questions and request deduplication without executing them again', async t => {
  const f = await fixture(); t.after(() => f.cleanup());
  const input = { requestId: randomUUID(), objective: 'Recover task', acceptance: ['OK'] };
  const j = await f.coordinator.start(input); await until(() => f.coordinator.get(j.id).status === 'waiting_input');
  const recovered = new Coordinator(f.config, f.runtime);
  assert.equal(recovered.get(j.id).status, 'interrupted');
  assert.equal(recovered.get(j.id).questions.length, 1);
  assert.equal((await recovered.start(input)).id, j.id); assert.equal(f.calls, 1);
  recovered.answer({ jobId: j.id, questionId: recovered.get(j.id).questions[0]!.id, answer: 'A' });
  assert.equal(recovered.get(j.id).status, 'interrupted');
});
test('workspace escapes are rejected', async t => {
  const f = await fixture('instant'); t.after(() => f.cleanup());
  const j = await f.coordinator.start({ requestId: randomUUID(), objective: 'Paths', acceptance: ['OK'] });
  await until(() => f.coordinator.get(j.id).status === 'awaiting_review');
  const signal = new AbortController().signal;
  (f.coordinator as any).jobs.get(j.id).status = 'running';
  await assert.rejects((f.coordinator as any).control((f.coordinator as any).jobs.get(j.id), 'bridge_write_file', { path: '../escape.txt', content: 'bad' }, signal));
});
