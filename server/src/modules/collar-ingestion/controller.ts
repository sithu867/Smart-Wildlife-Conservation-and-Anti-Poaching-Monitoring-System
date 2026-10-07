import type { NextFunction, Request, Response } from 'express';
import { collarIngestionService } from './service.js';
import { collarTelemetrySchema, normalizeVendorPayload } from './validation.js';
import { appEventEmitter, EVENTS } from '../shared/events.js';

export const collarIngestionController = {
  async receiveTelemetry(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await collarIngestionService.ingest(collarTelemetrySchema.parse(req.body));
      return res.status(data.duplicate ? 200 : 202).json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  },

  async receiveVendorWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const vendor = req.params.vendor || 'generic';
      const normalized = normalizeVendorPayload(req.body, vendor);
      const data = await collarIngestionService.ingest(normalized);
      return res.status(data.duplicate ? 200 : 202).json({ success: true, vendor, data });
    } catch (error) {
      return next(error);
    }
  },

  async getDevices(_req: Request, res: Response, next: NextFunction) {
    try {
      const devices = await collarIngestionService.getCollarDevices();
      const stats = await collarIngestionService.getCollarStats();
      return res.status(200).json({ success: true, data: devices, stats });
    } catch (error) {
      return next(error);
    }
  },

  async getTelemetryHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { deviceId } = req.params;
      const history = await collarIngestionService.getCollarTelemetryHistory(deviceId);
      return res.status(200).json({ success: true, data: history });
    } catch (error) {
      return next(error);
    }
  },

  streamEvents(_req: Request, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const onTelemetry = (payload: any) => {
      res.write(`event: collar-telemetry\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    const onAlert = (payload: any) => {
      res.write(`event: conflict-alert\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    appEventEmitter.on(EVENTS.COLLAR_TELEMETRY_RECEIVED, onTelemetry);
    appEventEmitter.on(EVENTS.ALERT_CREATED, onAlert);

    // Initial ping
    res.write(`event: ping\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);

    _req.on('close', () => {
      appEventEmitter.off(EVENTS.COLLAR_TELEMETRY_RECEIVED, onTelemetry);
      appEventEmitter.off(EVENTS.ALERT_CREATED, onAlert);
    });
  }
};
