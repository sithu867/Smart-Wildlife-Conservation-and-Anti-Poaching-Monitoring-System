import type { ErrorRequestHandler, RequestHandler } from 'express';
export const notFound: RequestHandler = (_req, res) => { res.status(404).json({ success: false, error: { message: 'Route not found' } }); };
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => { console.error(error); res.status(500).json({ success: false, error: { message: error instanceof Error ? error.message : 'Internal server error' } }); };
