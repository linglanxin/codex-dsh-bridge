import type { Context } from '@deepseek-ai/cordis';
import type { AgentHandle } from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-agent-default-model';
import type {} from '@deepseek-ai/dsh-agent-preset-registry';
import type {} from '@deepseek-ai/dsh-tools';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import type { SessionId } from '@deepseek-ai/dsh-session';
import { randomUUID } from 'node:crypto';
import type { DesktopRuntime, RuntimeSession, RunResult, RuntimeHooks } from './runtime.ts';
import { boundedText } from './manager.ts';
import { BridgeError } from './errors.ts';
// Distinct source attribution: an MCP agent is not a direct human user.
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'desktop-mcp-bridge': { kind: 'desktop-mcp-bridge' };
  }
}
export class DshDesktopRuntime implements DesktopRuntime {
  constructor(
    private ctx: Context,
    private allowedTools: readonly string[],
    private maxOutputBytes: number,
  ) {}
  async create(cwd: string, preset: string, hooks?: RuntimeHooks): Promise<RuntimeSession> {
    const localTools = hooks ? ['bridge_ask_codex', 'bridge_checkpoint', 'bridge_read_file', 'bridge_write_file', 'bridge_list_files'] : [];
    const permitted = (name: string) => localTools.includes(name) || this.allowedTools.includes(name);
    const selection = this.ctx.agentDefaultModel.currentSelection();
    const resolved = await this.ctx.agentPresets.resolve(preset);
    const handle = await this.ctx.agents.create({
      sessionId: `mcp-${randomUUID()}` as SessionId,
      meta: { cwd, agentPreset: resolved.id },
      agentOptions: { ...selection },
      setup: async (agentCtx, agent) => {
        // The official monotonic guard survives a pre-execute listener returning allow
        // without next(). Register through the Agent context so other chats are unaffected.
        agentCtx.tools.guard((exec) =>
          permitted(exec.name) && (!hooks || hooks.canExecute())
            ? undefined
            : `Desktop MCP bridge does not permit tool ${exec.name}.`,
        );
        // Keep the pre-execute and dispatch checks as additional scoped enforcement.
        agentCtx.on('tools/pre-execute', async (exec, next) => {
          if (!permitted(exec.name) || (hooks && !hooks.canExecute()))
            return {
              kind: 'deny',
              reason: `Desktop MCP bridge does not permit tool ${exec.name}.`,
            };
          return next();
        });
        agentCtx.on('tools/execute', async (exec, next) => {
          if (!permitted(exec.name) || (hooks && !hooks.canExecute()))
            return {
              isError: true,
              content: [{ type: 'text', text: 'Desktop MCP bridge tool permission denied.' }],
              error: {
                name: 'BridgePermissionError',
                code: 'BRIDGE_PERMISSION_DENIED',
                message: 'Tool is not locally allowed.',
              },
            };
          return next();
        });
        await this.ctx.agentPresets.mount(agentCtx, resolved.id);
        if (hooks) {
          agentCtx.tools.presentAs('native');
          const schemas: Record<string, { description: string; properties: Record<string, unknown>; required: string[] }> = {
            bridge_ask_codex: { description: 'Pause execution and ask the Codex supervisor a direction question. Include options, recommendation and consequences. Wait for the returned answer before proceeding.', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, recommendation: { type: 'string' } }, required: ['question', 'options', 'recommendation'] },
            bridge_checkpoint: { description: 'Pause for Codex review of the current plan or stage artifacts. Submit before implementation and at stage boundaries. Follow returned review feedback.', properties: { summary: { type: 'string' } }, required: ['summary'] },
            bridge_read_file: { description: 'Read a UTF-8 file inside this task workspace. Relative paths only; links and escapes are denied.', properties: { path: { type: 'string' } }, required: ['path'] },
            bridge_write_file: { description: 'Write a UTF-8 artifact inside this task workspace after plan approval. Relative paths only. Maximum 1 MiB.', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
            bridge_list_files: { description: 'List files inside the assigned task workspace.', properties: { path: { type: 'string' } }, required: [] },
          };
          const deniedGlobals = agentCtx.tools.schemas(agent).map(tool => tool.name).filter(name => name !== 'run_code' && !this.allowedTools.includes(name));
          if (deniedGlobals.length) agentCtx.tools.restrict({ deny: deniedGlobals });
          for (const [name, spec] of Object.entries(schemas)) agentCtx.tools.register({
            name, description: spec.description,
            parameters: { type: 'object', properties: spec.properties, required: spec.required, additionalProperties: false },
            output: { schema: {}, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
            execute: (args, exec) => hooks.control(name, args as Record<string, unknown>, exec.signal),
          });
          agentCtx.on('tools/result', (exec, result) => { hooks.event('tool_result', { name: exec.name, isError: result.isError }); });
        }
      },
    });
    return new DshSession(handle, this.maxOutputBytes);
  }
}
class DshSession implements RuntimeSession {
  readonly id: string;
  constructor(
    private handle: AgentHandle,
    private limit: number,
  ) {
    this.id = handle.agent.id;
  }
  async run(prompt: string): Promise<RunResult> {
    const agent = this.handle.agent;
    const start = agent.session.seq;
    agent.followup(
      createUserMessage({
        content: [{ type: 'text', text: prompt }],
        source: { kind: 'desktop-mcp-bridge' },
      }),
    );
    await agent.whenIdle();
    let text = '';
    let truncated = false;
    let outcome: RunResult['outcome'] = 'failed';
    let ended = false;
    let error: RunResult['error'];
    for (const event of agent.session.snapshotEvents(start)) {
      if (event.type === 'assistant/message') {
        for (const block of event.data.message.content) {
          if (block.type === 'text') {
            const result = boundedText(text + block.text, this.limit);
            text = result.text;
            truncated ||= result.truncated;
          }
        }
      } else if (event.type === 'turn/end') {
        ended = true;
        switch (event.data.reason.kind) {
          case 'completed':
            outcome = 'completed';
            break;
          case 'aborted':
          case 'interrupted':
            outcome = 'cancelled';
            break;
          case 'error':
            outcome = 'failed';
            error = {
              code: 'RUNTIME_FAILURE',
              message:
                'Desktop model/tool execution failed. Inspect the owned DSH session for details.',
            };
            break;
          case 'blocked':
            outcome = 'failed';
            error = { code: 'RUNTIME_BLOCKED', message: 'Desktop blocked the task.' };
            break;
          case 'max-tokens':
            outcome = 'failed';
            error = {
              code: 'OUTPUT_LIMIT',
              message: 'Desktop model reached its output-token limit.',
            };
            break;
          default:
            outcome = 'failed';
        }
      }
    }
    if (!ended)
      throw new BridgeError('RUNTIME_FAILURE', 'Agent became idle without a durable turn outcome.');
    return { text, outcome, truncated, error };
  }
  cancel() {
    this.handle.agent.cancel({ kind: 'user' });
  }
  steer(prompt: string) {
    this.handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'desktop-mcp-bridge' } }));
  }
  async dispose() {
    await this.handle.dispose();
  }
}
