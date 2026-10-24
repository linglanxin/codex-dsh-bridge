import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const client = new Client({ name: 'codex-dsh-live-verification', version: '1.0.0' });
const report = { time: new Date().toISOString(), checks: [], jobId: null, status: 'running' };
const save = async () => writeFile('LIVE-VERIFICATION.json', JSON.stringify(report, null, 2));
const call = async (name, args = {}) => {
  const result = await client.callTool({ name, arguments: args });
  const data = JSON.parse(result.content.find(c => c.type === 'text').text);
  if (result.isError) throw Error(`${name}: ${JSON.stringify(data)}`);
  return data;
};
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('dist/cli.js'), 'stdio', '--config', 'F:/codex/dsh-bridge-state/config.json'], stderr: 'pipe' }));
  const tools = (await client.listTools()).tools.map(t => t.name);
  if (!['dsh_job_start', 'dsh_job_answer', 'dsh_job_review', 'dsh_job_events'].every(t => tools.includes(t))) throw Error('Missing supervised tools');
  report.checks.push({ check: 'MCP discovery', passed: true, tools: tools.length });
  const info = await call('dsh_connection_info');
  if (info.runtime !== 'existing-desktop') throw Error('Not connected to the existing Desktop');
  report.checks.push({ check: 'existing Desktop runtime', passed: true, adapter: info.adapter });
  const requestId = randomUUID();
  const start = { requestId, objective: '这是 Codex–DSH 桥接的集成测试。请先调用 bridge_ask_codex 询问测试输出文件名，选项为 bridge-smoke.txt 与 alternative.txt，推荐 bridge-smoke.txt。收到答复后调用 bridge_checkpoint 提交只写这个文件的简短计划并等待审查。获准后使用 bridge_write_file 写入恰好一行 CODEX_DSH_BRIDGE_OK，然后简短报告完成。不要修改其他文件，不要调用其他服务。', acceptance: ['必须真实提问并等待答复', '必须经过计划审查后再写文件', 'bridge-smoke.txt 的内容必须是 CODEX_DSH_BRIDGE_OK'] };
  const job = await call('dsh_job_start', start); report.jobId = job.id; await save();
  if ((await call('dsh_job_start', start)).id !== job.id) throw Error('Request deduplication failed');
  report.checks.push({ check: 'request deduplication', passed: true });
  const deadline = Date.now() + 300000; let cursor = 0, asked = false, checkpoint = false;
  while (Date.now() < deadline) {
    const event = await call('dsh_job_events', { jobId: job.id, after: cursor, waitMs: 15000 }); cursor = event.cursor;
    const current = await call('dsh_job_get', { jobId: job.id });
    console.log(JSON.stringify({ status: current.status, events: event.events.map(e => e.kind) }));
    if (current.status === 'waiting_input') {
      const q = current.questions.find(q => q.kind === 'question' && q.status === 'open');
      if (!q || !JSON.stringify(q).includes('bridge-smoke.txt')) throw Error('Unexpected question requires manual review');
      await call('dsh_job_answer', { jobId: job.id, questionId: q.id, answer: '选择 bridge-smoke.txt。内容只写 CODEX_DSH_BRIDGE_OK。' });
      asked = true; report.checks.push({ check: 'blocking question and bound answer', passed: true, questionId: q.id }); await save();
    } else if (current.status === 'waiting_review') {
      const q = current.questions.find(q => q.kind === 'checkpoint' && q.status === 'open');
      if (!q) throw Error('Missing checkpoint record');
      if (!asked) {
        await call('dsh_job_review', { jobId: job.id, fingerprint: event.fingerprint ?? q.fingerprint, approve: false, evidence: 'The integration-test requirement says to ask the filename question first; no writes are authorized at this checkpoint.', nextInstructions: '先调用 bridge_ask_codex 询问文件名，再重新提交计划检查点。' });
        report.checks.push({ check: 'early checkpoint rejected with concrete feedback', passed: true }); await save(); continue;
      }
      const text = q.text;
      if (!text.includes('bridge-smoke.txt')) throw Error('Plan does not name the required artifact');
      await call('dsh_job_review', { jobId: job.id, fingerprint: event.fingerprint ?? q.fingerprint, approve: true, evidence: 'Reviewed integration-test plan: writes only the synthetic test artifact inside the assigned task directory.', nextInstructions: '仅写 bridge-smoke.txt，内容 CODEX_DSH_BRIDGE_OK；完成后报告。' });
      checkpoint = true; report.checks.push({ check: 'plan checkpoint reviewed', passed: true }); await save();
    } else if (current.status === 'awaiting_review') {
      if (!asked || !checkpoint) throw Error('Missing required question/checkpoint');
      const actual = await readFile(join(current.cwd, 'bridge-smoke.txt'), 'utf8');
      if (actual.trim() !== 'CODEX_DSH_BRIDGE_OK') throw Error('Artifact content failed independent verification');
      await call('dsh_job_review', { jobId: job.id, fingerprint: current.fingerprint, approve: true, evidence: 'Independently read bridge-smoke.txt from disk and verified exact expected content CODEX_DSH_BRIDGE_OK.' });
      report.checks.push({ check: 'actual artifact verified and final acceptance recorded', passed: true, cwd: current.cwd });
      report.status = 'passed'; await save(); console.log('LIVE_VERIFICATION_PASSED'); break;
    } else if (['failed', 'cancelled', 'interrupted'].includes(current.status)) throw Error(JSON.stringify({ status: current.status, error: current.error, output: current.output }));
  }
  if (report.status !== 'passed') throw Error('Live verification deadline exceeded');
} catch (error) { report.status = 'failed'; report.error = error.message; await save(); console.error(error.message); process.exitCode = 1; }
finally { await client.close(); }
