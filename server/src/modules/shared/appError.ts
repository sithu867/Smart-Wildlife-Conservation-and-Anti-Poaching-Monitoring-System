/**
 * Error with an explicit HTTP status and a stable machine-readable code.
 * The error handler serialises it as { success: false, error: { message, code, details? } }
 * so clients can map `code` to a user-friendly message.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}
