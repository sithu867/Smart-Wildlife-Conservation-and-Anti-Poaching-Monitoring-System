/**
 * Shared Express error handling. Every API error is returned as { success: false, error: { message, code?, details? } }
 * so the client can show a friendly message per `code` (used heavily by the incident CRUD popups).
 */
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../modules/shared/appError.js';

/** 404 for any route that does not exist. */
export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, error: { message: 'Route not found', code: 'ROUTE_NOT_FOUND' } });
};

/** Maps thrown errors to HTTP responses: body too large -> 413, Zod -> 400, AppError -> its own status/code. */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) return _next(error);
  // Malformed JSON is a client error; never echo parser excerpts or internals.
  if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: { message: 'Request must contain valid JSON.' } });
  }

  if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: { message: 'Request body exceeds the 8 MB limit.', code: 'PAYLOAD_TOO_LARGE' } });
  }

  if (error instanceof ZodError) {
    const msg = error.issues.map(i => i.message).join(', ') || 'Validation error';
    const details = error.issues.map(i => ({ path: i.path.join('.'), message: i.message }));
    return res.status(400).json({ success: false, error: { message: msg, code: 'VALIDATION_ERROR', details } });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      error: { message: error.message, code: error.code, ...(error.details !== undefined ? { details: error.details } : {}) }
    });
  }

  // Legacy path for modules that still throw plain Errors
  const message = error instanceof Error ? error.message : '';
  if (message.includes('Unauthorized')) return res.status(403).json({ success: false, error: { message } });
  if (message.includes('not found')) return res.status(404).json({ success: false, error: { message } });

  // Anything else is unexpected: keep database/internal details and stack traces in the server log only.
  console.error('Unhandled API error:', error);
  return res.status(500).json({ success: false, error: { message: 'Internal server error' } });
};
