import { z } from 'zod';
export const VERSION = 1;
export const id = z.string().uuid();
export const operations = {
  job_start: z.object({ requestId: id, objective: z.string().min(1).max(24000), acceptance: z.array(z.string().min(1).max(2000)).min(1).max(30) }).strict(),
  job_get: z.object({ jobId: id }).strict(),
  job_list: z.object({}).strict(),
  job_events: z.object({ jobId: id, after: z.number().int().min(0).default(0), waitMs: z.number().int().min(0).max(25000).default(20000) }).strict(),
  job_answer: z.object({ jobId: id, questionId: id, answer: z.string().min(1).max(16000) }).strict(),
  job_review: z.object({ jobId: id, fingerprint: z.string().regex(/^[a-f0-9]{64}$/), approve: z.boolean(), evidence: z.string().min(1).max(16000), nextInstructions: z.string().max(16000).optional() }).strict(),
  job_cancel: z.object({ jobId: id }).strict(),
  job_resume: z.object({ jobId: id, instructions: z.string().min(1).max(16000) }).strict(),
  job_steer: z.object({ jobId: id, instructions: z.string().min(1).max(16000) }).strict(),
  connection_info: z.object({}).strict(),
  create_session: z
    .object({
      preset: z.string().min(1).max(128).optional(),
      repository: z.string().min(1).max(4096).optional(),
      ref: z.string().min(1).max(200).optional(),
    })
    .strict(),
  list_sessions: z.object({}).strict(),
  close_session: z.object({ sessionId: id }).strict(),
  submit_task: z
    .object({ sessionId: id, prompt: z.string().min(1).max(65536), requestId: id })
    .strict(),
  get_task: z.object({ taskId: id }).strict(),
  get_result: z.object({ taskId: id }).strict(),
  cancel_task: z.object({ taskId: id }).strict(),
  forget_task: z.object({ taskId: id }).strict(),
} as const;
export type Operation = keyof typeof operations;
export const envelope = z
  .object({
    version: z.literal(VERSION),
    operation: z.enum(Object.keys(operations) as [Operation, ...Operation[]]),
    params: z.unknown(),
  })
  .strict();
export const taskState = z.enum([
  'running',
  'cancelling',
  'completed',
  'failed',
  'cancelled',
  'timed_out',
]);
export type TaskState = z.infer<typeof taskState>;
export const terminal = (state: TaskState): boolean => !['running', 'cancelling'].includes(state);
export interface TaskView {
  taskId: string;
  sessionId: string;
  state: TaskState;
  createdAt: string;
  finishedAt?: string;
  error?: { code: string; message: string };
  truncated: boolean;
}
export interface SessionView {
  sessionId: string;
  runtimeSessionId: string;
  cwd: string;
  preset: string;
  activeTaskId?: string;
}
