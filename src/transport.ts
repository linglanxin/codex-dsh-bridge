import http, { type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { lstat, mkdir, rm, chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  loadConfig,
  loadToken,
  privateDirectory,
  socketPath,
  type BridgeConfig,
} from './config.ts';
import { BridgeError, fail, publicError } from './errors.ts';
import { envelope, operations, type Operation } from './protocol.ts';
import type { TaskManager } from './manager.ts';
import type { Coordinator } from './coordinator.ts';
async function body(req: IncomingMessage, limit: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;
    let settled = false;
    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      length += chunk.length;
      if (length > limit) {
        settled = true;
        chunks.length = 0;
        reject(new BridgeError('PAYLOAD_TOO_LARGE', 'Request exceeds byte limit.'));
        return;
      }
      chunks.push(chunk);
    });
    req.once('error', reject);
    req.once('end', () => {
      if (settled) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new BridgeError('INVALID_INPUT', 'Invalid JSON request.'));
      }
    });
  });
}
export async function dispatch(
  manager: TaskManager,
  operation: Operation,
  params: unknown,
  coordinator?: Coordinator,
): Promise<unknown> {
  if (operation.startsWith('job_')) {
    if (!coordinator) fail('UNAVAILABLE', 'Supervised coordinator is not enabled.');
    switch (operation) {
      case 'job_start': return coordinator.start(operations.job_start.parse(params));
      case 'job_get': return coordinator.get(operations.job_get.parse(params).jobId);
      case 'job_list': operations.job_list.parse(params); return coordinator.list();
      case 'job_events': { const p = operations.job_events.parse(params); return coordinator.events(p.jobId, p.after, p.waitMs); }
      case 'job_answer': return coordinator.answer(operations.job_answer.parse(params));
      case 'job_review': return coordinator.review(operations.job_review.parse(params));
      case 'job_cancel': return coordinator.cancel(operations.job_cancel.parse(params).jobId);
      case 'job_resume': { const p = operations.job_resume.parse(params); return coordinator.resume(p.jobId, p.instructions); }
      case 'job_steer': { const p = operations.job_steer.parse(params); return coordinator.steer(p.jobId, p.instructions); }
    }
  }
  switch (operation) {
    case 'connection_info':
      operations.connection_info.parse(params);
      return manager.info();
    case 'create_session':
      return manager.createSession(operations.create_session.parse(params));
    case 'list_sessions':
      operations.list_sessions.parse(params);
      return manager.listSessions();
    case 'close_session':
      return manager.closeSession(operations.close_session.parse(params).sessionId);
    case 'submit_task':
      return manager.submit(operations.submit_task.parse(params));
    case 'get_task':
      return manager.getTask(operations.get_task.parse(params).taskId);
    case 'get_result':
      return manager.getResult(operations.get_result.parse(params).taskId);
    case 'cancel_task':
      return manager.cancel(operations.cancel_task.parse(params).taskId);
    case 'forget_task':
      return manager.forget(operations.forget_task.parse(params).taskId);
  }
}
function reply(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}
export async function startBridge(
  config: BridgeConfig,
  manager: TaskManager,
  coordinator?: Coordinator,
): Promise<() => Promise<void>> {
  await privateDirectory(config.stateDir);
  const token = await loadToken(config.stateDir);
  const lock = join(config.stateDir, 'bridge.lock');
  const ownership = randomUUID();
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch {
    fail(
      'ALREADY_RUNNING',
      'Bridge lock exists. If Desktop crashed, verify it has quit before removing bridge.lock and bridge.sock.',
    );
  }
  let server: Server | undefined;
  const socket = socketPath(config.stateDir);
  const ready = join(config.stateDir, 'ready.json');
  let listening = false;
  const cleanup = async () => {
    if (server?.listening) {
      const closed = new Promise<void>((resolve, reject) =>
        server!.close((e) => (e ? reject(e) : resolve())),
      );
      server.closeAllConnections();
      await closed;
    }
    if (listening) {
      if (process.platform !== 'win32') await rm(socket, { force: true });
      await rm(ready, { force: true });
    }
    await rm(lock, { recursive: true, force: true });
  };
  try {
    await writeFile(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, ownership }), {
      mode: 0o600,
      flag: 'wx',
    });
    try {
      if (process.platform !== 'win32') await lstat(socket); else throw Object.assign(new Error('Windows named pipe'), { code: 'ENOENT' });
      fail(
        'STALE_SOCKET',
        'Socket path already exists; verify the old Desktop process has quit before cleanup.',
      );
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    server = http.createServer(async (req, res) => {
      try {
        // No browser clients, Origin-based bypass, TCP binding or forwarded credentials.
        const supplied = Buffer.from(req.headers.authorization ?? '');
        const expected = Buffer.from(`Bearer ${token}`);
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
          fail('UNAUTHORIZED', 'Bridge authentication failed.');
        if (req.headers.origin || req.headers['sec-fetch-site'])
          fail('PERMISSION_DENIED', 'Browser requests are not accepted.');
        if (
          req.method !== 'POST' ||
          req.url !== '/v1/call' ||
          req.headers['content-type'] !== 'application/json'
        )
          fail('INVALID_INPUT', 'Use POST /v1/call with application/json.');
        const parsed = envelope.parse(await body(req, config.maxPromptBytes * 6 + 8192));
        reply(res, 200, {
          ok: true,
          result: await dispatch(manager, parsed.operation, parsed.params, coordinator),
        });
      } catch (error) {
        const info =
          error instanceof z.ZodError
            ? {
                code: 'INVALID_INPUT',
                message: 'Invalid operation parameters or protocol version.',
              }
            : publicError(error);
        reply(res, info.code === 'UNAUTHORIZED' ? 401 : info.code === 'INTERNAL' ? 500 : 400, {
          ok: false,
          error: info,
        });
      }
    });
    server.requestTimeout = 15000;
    server.headersTimeout = 10000;
    server.maxConnections = 32;
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);
      server!.listen(socket, resolve);
    });
    listening = true;
    if (process.platform !== 'win32') await chmod(socket, 0o600);
    server.on('error', () => {
      /* Runtime listener errors do not expose credentials through MCP stdout. */
    });
    await writeFile(
      ready,
      JSON.stringify({
        version: 1,
        pid: process.pid,
        instanceId: ownership,
        adapter: manager.info().adapter,
      }),
      { mode: 0o600, flag: 'wx' },
    );
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}
export class BridgeClient {
  constructor(
    private config: BridgeConfig,
    private token: string,
  ) {}
  static async fromConfig(path: string): Promise<BridgeClient> {
    const c = await loadConfig(path);
    return new BridgeClient(c, await loadToken(c.stateDir));
  }
  async call(operation: Operation, params: unknown): Promise<unknown> {
    operations[operation].parse(params);
    await privateDirectory(this.config.stateDir);
    const socket = socketPath(this.config.stateDir);
    const stat = process.platform === 'win32' ? null : await lstat(socket).catch(() =>
      fail(
        'DESKTOP_UNAVAILABLE',
        'Bridge socket is missing. Open official Desktop and enable the configured plugin.',
      ),
    );
    if (stat && (!stat.isSocket() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0))
      fail('UNSAFE_PATH', 'Invalid or insecure bridge socket.');
    const data = JSON.stringify({ version: 1, operation, params });
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          socketPath: socket,
          path: '/v1/call',
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.token}`,
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(data),
          },
          timeout: 45000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > this.config.maxOutputBytes * 6 + 262144) {
              req.destroy(new BridgeError('PAYLOAD_TOO_LARGE', 'Response exceeds byte limit.'));
            } else chunks.push(chunk);
          });
          res.on('error', reject);
          res.on('end', () => {
            try {
              const response = z
                .discriminatedUnion('ok', [
                  z.object({ ok: z.literal(true), result: z.unknown() }),
                  z.object({
                    ok: z.literal(false),
                    error: z.object({ code: z.string(), message: z.string() }),
                  }),
                ])
                .parse(JSON.parse(Buffer.concat(chunks).toString()));
              if (!response.ok)
                reject(new BridgeError(response.error.code, response.error.message));
              else resolve(response.result);
            } catch {
              reject(
                new BridgeError('PROTOCOL_ERROR', 'Desktop bridge returned an invalid response.'),
              );
            }
          });
        },
      );
      req.on('timeout', () =>
        req.destroy(
          new BridgeError(
            'OUTCOME_UNKNOWN',
            'Bridge request timed out. Query state; retry submit_task only with the same requestId.',
          ),
        ),
      );
      req.on('error', (error) =>
        reject(
          error instanceof BridgeError
            ? error
            : ['ENOENT', 'ECONNREFUSED'].includes((error as NodeJS.ErrnoException).code ?? '')
              ? new BridgeError('DESKTOP_UNAVAILABLE', 'Bridge socket is missing. Open Desktop and enable the bridge plugin.')
            : new BridgeError(
                'OUTCOME_UNKNOWN',
                'Desktop bridge connection was lost. A mutation may have executed; query state before retrying.',
              ),
        ),
      );
      req.end(data);
    });
  }
}
