import type { NextFunction, Request, Response } from 'express';
import { collarIngestionService } from './service.js';
import { collarTelemetrySchema } from './validation.js';

export const collarIngestionController = {
  async receiveTelemetry(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await collarIngestionService.ingest(collarTelemetrySchema.parse(req.body));
      return res.status(data.duplicate ? 200 : 202).json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  }
};
