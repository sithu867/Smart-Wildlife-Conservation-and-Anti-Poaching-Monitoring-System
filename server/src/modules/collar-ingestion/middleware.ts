import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env.js';

export function requireCollarGatewayKey(req: Request, res: Response, next: NextFunction) {
  const configuredKey = env.COLLAR_INGESTION_API_KEY;
  const authorization = req.headers.authorization;
  const bearerKey = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  const suppliedKey = req.headers['x-collar-api-key'] || bearerKey;
  const key = Array.isArray(suppliedKey) ? suppliedKey[0] : suppliedKey;

  if (!configuredKey) {
    return res.status(503).json({ success: false, error: 'Collar ingestion is not configured.' });
  }
  if (!key || key !== configuredKey) {
    return res.status(401).json({ success: false, error: 'Invalid collar gateway credentials.' });
  }
  return next();
}
