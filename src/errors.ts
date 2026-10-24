export class BridgeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BridgeError';
  }
}
export function fail(code: string, message: string): never {
  throw new BridgeError(code, message);
}
export function publicError(error: unknown): { code: string; message: string } {
  if (error instanceof BridgeError) return { code: error.code, message: error.message };
  return {
    code: 'INTERNAL',
    message:
      'Bridge operation failed. Inspect the local Desktop diagnostic; do not retry a mutation blindly.',
  };
}
