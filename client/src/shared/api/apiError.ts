import axios from 'axios';

/** An error returned by the API, carrying the server's machine-readable `code` (e.g. EDIT_CONFLICT). */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Converts an axios error that has a server response into an ApiError.
 * Returns null when there was no response at all (offline / network failure).
 */
export function toApiError(error: unknown): ApiError | null {
  if (axios.isAxiosError(error) && error.response) {
    const body = error.response.data as { error?: { message?: string; code?: string; details?: unknown } } | undefined;
    return new ApiError(
      body?.error?.message || `Request failed (${error.response.status}).`,
      error.response.status,
      body?.error?.code,
      body?.error?.details
    );
  }
  return null;
}
