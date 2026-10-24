import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
const client = new Client({ name: 'codex-dsh-review-cycle', version: '1' });
const report = { status: 'running', checks: [], jobId: null };
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const value=JSON.parse(r.content.find(c=>c.type==='text').text); if(r.isError) throw Error(JSON.stringify(value)); return value;
};
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('dist/cli.js'),'stdio','--config','F:/codex/dsh-bridge-state/config.json'], stderr:'pipe' }));
  const job=await call('dsh_job_start',{ requestId:randomUUID(), objective:'这是桥接审查返工测试。先提交 bridge_checkpoint 计划，获准后只创建 review-cycle.txt，初稿内容写 DRAFT。完成初稿后报告并等待 Codex 的后续审查。Codex 可能在下一轮要求把内容改为 FINAL，你需要在同一会话中按反馈修改。不要操作其他文件。', acceptance:['初稿内容为 DRAFT','收到 Codex 修改意见后在同一会话中改为 FINAL','最终文件内容由 Codex 读取验证'] });
  report.jobId=job.id;
  let cursor=0,rejected=false; const end=Date.now()+240000;
  while(Date.now()<end){
    const event=await call('dsh_job_events',{jobId:job.id,after:cursor,waitMs:15000});cursor=event.cursor;
    const j=await call('dsh_job_get',{jobId:job.id});console.log(JSON.stringify({status:j.status,events:event.events.map(e=>e.kind)}));
    if(j.status==='waiting_review'){
      const q=j.questions.find(q=>q.kind==='checkpoint'&&q.status==='open');
      if(!q?.text.includes('review-cycle.txt'))throw Error('Unexpected plan requires manual review');
      await call('dsh_job_review',{jobId:job.id,fingerprint:event.fingerprint??q.fingerprint,approve:true,evidence:'Reviewed synthetic test plan scoped to review-cycle.txt.',nextInstructions:rejected?'只将 review-cycle.txt 改为 FINAL。':'只写初稿 DRAFT，随后报告完成并等待审查。'});
    }else if(j.status==='waiting_input'){
      const q=j.questions.find(q=>q.kind==='question'&&q.status==='open');
      await call('dsh_job_answer',{jobId:job.id,questionId:q.id,answer:rejected?'review-cycle.txt 内容改为 FINAL。':'按测试要求，review-cycle.txt 初稿写 DRAFT。'});
    }else if(j.status==='awaiting_review'){
      const actual=await readFile(join(j.cwd,'review-cycle.txt'),'utf8');
      if(!rejected){
        if(actual.trim()!=='DRAFT')throw Error('Expected initial DRAFT');
        await call('dsh_job_review',{jobId:job.id,fingerprint:j.fingerprint,approve:false,evidence:'独立读取实际初稿确认为 DRAFT。进入返工测试：最终验收要求 FINAL，请将同一文件内容改为 FINAL，并保留其他文件不变。',nextInstructions:'只修改 review-cycle.txt 为 FINAL，然后报告。'});
        rejected=true;report.checks.push({check:'actual draft inspected and rejected with concrete revision',passed:true,runtimeSessionId:j.runtimeSessionId});
      }else{
        if(actual.trim()!=='FINAL')throw Error('Revision did not produce FINAL');
        const first=report.checks[0];if(first.runtimeSessionId!==j.runtimeSessionId)throw Error('Correction did not preserve the worker session');
        await call('dsh_job_review',{jobId:job.id,fingerprint:j.fingerprint,approve:true,evidence:'Independently read revised review-cycle.txt and verified exact FINAL content; same runtime session retained.'});
        report.checks.push({check:'same-session correction independently verified and accepted',passed:true,cwd:j.cwd});report.status='passed';break;
      }
    }else if(['failed','cancelled','interrupted'].includes(j.status))throw Error(JSON.stringify({status:j.status,error:j.error}));
  }
  if(report.status!=='passed')throw Error('Review-cycle deadline exceeded');
}catch(e){report.status='failed';report.error=e.message;process.exitCode=1;console.error(e.message);}
finally{await writeFile('LIVE-REVIEW-CYCLE.json',JSON.stringify(report,null,2));await client.close();}
