export interface RunResult {
  text: string;
  outcome: 'completed' | 'failed' | 'cancelled';
  truncated: boolean;
  error?: { code: string; message: string };
}
export interface RuntimeSession {
  id: string;
  run(prompt: string): Promise<RunResult>;
  cancel(): void;
  dispose(): Promise<void>;
  steer?(prompt: string): void;
}
export interface RuntimeHooks {
  control(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  event(kind: string, data: unknown): void;
  canExecute(): boolean;
}
export interface DesktopRuntime {
  create(cwd: string, preset: string, hooks?: RuntimeHooks): Promise<RuntimeSession>;
}
