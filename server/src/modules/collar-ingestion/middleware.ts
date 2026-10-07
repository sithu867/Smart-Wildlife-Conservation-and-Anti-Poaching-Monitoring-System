import type { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import { env } from '../../config/env.js';

export function requireCollarGatewayKey(req: Request, res: Response, next: NextFunction) {
  const configuredKey = env.COLLAR_INGESTION_API_KEY;
  const configuredSecret = env.COLLAR_WEBHOOK_SECRET;

  const authorization = req.headers.authorization;
  const bearerKey = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  const suppliedKeyHeader = req.headers['x-collar-api-key'] || req.headers['x-api-key'] || bearerKey;
  const key = Array.isArray(suppliedKeyHeader) ? suppliedKeyHeader[0] : suppliedKeyHeader;

  // Check HMAC signature if vendor provided signature header
  const signatureHeader = req.headers['x-signature'] || req.headers['x-hub-signature-256'] || req.headers['x-vendor-signature'];
  const rawSignature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

  if (rawSignature && configuredSecret) {
    try {
      const bodyString = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const computed = crypto.createHmac('sha256', configuredSecret).update(bodyString).digest('hex');
      const expected = rawSignature.replace(/^sha256=/, '');
      if (crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(expected))) {
        return next();
      }
    } catch {
      return res.status(401).json({ success: false, error: 'Invalid HMAC signature.' });
    }
  }

  if (!configuredKey && !configuredSecret) {
    return res.status(503).json({ success: false, error: 'Collar ingestion is not configured.' });
  }

  if (key && configuredKey && key === configuredKey) {
    return next();
  }

  return res.status(401).json({ success: false, error: 'Invalid collar gateway credentials or signature.' });
}
