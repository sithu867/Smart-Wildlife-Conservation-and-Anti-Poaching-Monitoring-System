import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, error: { message: 'Route not found' } });
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) return _next(error);
  
  if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: { message: 'Request body exceeds the 8 MB limit.' } });
  }

  if (error instanceof ZodError) {
    const msg = error.issues.map(i => i.message).join(', ') || 'Validation error';
    return res.status(400).json({ success: false, error: { message: msg } });
  }

  const message = error instanceof Error ? error.message : 'Internal server error';
  const statusCode = error.message && error.message.includes('Unauthorized') ? 403 : 500;
  return res.status(statusCode).json({ success: false, error: { message } });
};
