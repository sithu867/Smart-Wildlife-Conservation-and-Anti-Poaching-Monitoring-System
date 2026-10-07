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
  const message = error instanceof Error ? error.message : 'Internal server error';
  const statusCode = error.message && error.message.includes('Unauthorized') ? 403 : 500;
  return res.status(statusCode).json({ success: false, error: { message } });
};
