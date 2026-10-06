import type { Request, Response, NextFunction } from 'express';
import { conflictAlertService } from './service.js';
import {
  createAlertSchema,
  simulateCollarSchema,
  communityReportSchema,
  addResponseSchema,
  resolveAlertSchema,
  acknowledgeAlertSchema
  , updateAlertSchema, cancelAlertSchema, updateResponseSchema, deleteSchema
} from './validation.js';

function getAuthenticatedRanger(req: Request): { rangerId: string; rangerName: string } {
  const headerId = req.headers['x-ranger-id'];
  const headerName = req.headers['x-ranger-name'];
  const rangerId = Array.isArray(headerId) ? headerId[0] : (headerId || 'R-101');
  const rangerName = Array.isArray(headerName) ? headerName[0] : (headerName || 'Ranger John');
  return { rangerId, rangerName };
}

export const conflictAlertController = {
  async createAlert(req: Request, res: Response, next: NextFunction) {
    try {
      const input = createAlertSchema.parse(req.body);
      const data = await conflictAlertService.createAlert(input);
      return res.status(201).json({
        success: true,
        data
      });
    } catch (error) {
      return next(error);
    }
  },

  async simulateCollar(req: Request, res: Response, next: NextFunction) {
    try {
      const input = simulateCollarSchema.parse(req.body);
      const data = await conflictAlertService.simulateCollarEvent(input);
      return res.status(201).json({
        success: true,
        data
      });
    } catch (error) {
      return next(error);
    }
  },

  async submitCommunityReport(req: Request, res: Response, next: NextFunction) {
    try {
      const input = communityReportSchema.parse(req.body);
      const data = await conflictAlertService.submitCommunityReport(input);
      return res.status(201).json({
        success: true,
        data
      });
    } catch (error) {
      return next(error);
    }
  },

  async getAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, severity, alertType, includeDeleted } = req.query;
      const filters = {
        status: status ? String(status) : undefined,
        severity: severity ? String(severity) : undefined,
        alertType: alertType ? String(alertType) : undefined,
        includeDeleted: includeDeleted === 'true'
      };
      const data = await conflictAlertService.getAlerts(filters);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      return next(error);
    }
  },

  async getAlertById(req: Request, res: Response, next: NextFunction) {
    try {
      const alertId = String(req.params.alertId);
      const data = await conflictAlertService.getAlertById(alertId, req.query.includeDeleted === 'true');
      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      return next(error);
    }
  },

  async acknowledgeAlert(req: Request, res: Response, next: NextFunction) {
    try {
      const { rangerId, rangerName } = getAuthenticatedRanger(req);
      const alertId = String(req.params.alertId);
      const input = acknowledgeAlertSchema.parse(req.body ?? {});
      const data = await conflictAlertService.acknowledgeAlert(rangerId, rangerName, alertId, input.clientAcknowledgementId);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      return next(error);
    }
  },

  async addResponse(req: Request, res: Response, next: NextFunction) {
    try {
      const { rangerId, rangerName } = getAuthenticatedRanger(req);
      const alertId = String(req.params.alertId);
      const input = addResponseSchema.parse(req.body);
      const data = await conflictAlertService.addResponse(rangerId, rangerName, alertId, input);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      return next(error);
    }
  },

  async resolveAlert(req: Request, res: Response, next: NextFunction) {
    try {
      const { rangerId, rangerName } = getAuthenticatedRanger(req);
      const alertId = String(req.params.alertId);
      const input = resolveAlertSchema.parse(req.body);
      const data = await conflictAlertService.resolveAlert(rangerId, rangerName, alertId, input);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      return next(error);
    }
  }
  ,
  async updateAlert(req: Request, res: Response, next: NextFunction) { try { const { rangerId, rangerName } = getAuthenticatedRanger(req); const data = await conflictAlertService.updateAlert(rangerId, rangerName, String(req.params.alertId), updateAlertSchema.parse(req.body)); return res.json({ success: true, data }); } catch (error) { return next(error); } },
  async deleteAlert(req: Request, res: Response, next: NextFunction) { try { const { rangerId, rangerName } = getAuthenticatedRanger(req); const data = await conflictAlertService.deleteAlert(rangerId, rangerName, String(req.params.alertId), deleteSchema.parse(req.body ?? {}).reason); return res.json({ success: true, data }); } catch (error) { return next(error); } },
  async cancelAlert(req: Request, res: Response, next: NextFunction) { try { const { rangerId, rangerName } = getAuthenticatedRanger(req); const data = await conflictAlertService.cancelAlert(rangerId, rangerName, String(req.params.alertId), cancelAlertSchema.parse(req.body).reason); return res.json({ success: true, data }); } catch (error) { return next(error); } },
  async getResponses(req: Request, res: Response, next: NextFunction) { try { const data = await conflictAlertService.getResponses(String(req.params.alertId)); return res.json({ success: true, data }); } catch (error) { return next(error); } },
  async updateResponse(req: Request, res: Response, next: NextFunction) { try { const { rangerId, rangerName } = getAuthenticatedRanger(req); const data = await conflictAlertService.updateResponse(rangerId, rangerName, String(req.params.alertId), String(req.params.responseId), updateResponseSchema.parse(req.body)); return res.json({ success: true, data }); } catch (error) { return next(error); } },
  async deleteResponse(req: Request, res: Response, next: NextFunction) { try { const { rangerId, rangerName } = getAuthenticatedRanger(req); const data = await conflictAlertService.deleteResponse(rangerId, rangerName, String(req.params.alertId), String(req.params.responseId), deleteSchema.parse(req.body ?? {}).reason); return res.json({ success: true, data }); } catch (error) { return next(error); } },
  async getHistory(req: Request, res: Response, next: NextFunction) { try { const data = await conflictAlertService.getHistory(String(req.params.alertId)); return res.json({ success: true, data }); } catch (error) { return next(error); } }
};
