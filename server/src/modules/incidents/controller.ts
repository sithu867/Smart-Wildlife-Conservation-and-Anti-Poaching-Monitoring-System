import type { Request, Response, NextFunction } from 'express';
import { incidentService } from './service.js';
import { createIncidentSchema, deleteIncidentSchema, restoreIncidentSchema, updateIncidentSchema } from './validation.js';

function getAuthenticatedRanger(req: Request): { rangerId: string; rangerName: string } {
  const headerId = req.headers['x-ranger-id'];
  const headerName = req.headers['x-ranger-name'];
  const rangerId = Array.isArray(headerId) ? headerId[0] : (headerId || 'R-101');
  const rangerName = Array.isArray(headerName) ? headerName[0] : (headerName || 'Ranger John');
  return { rangerId, rangerName };
}

export const incidentController = {
  async createIncident(req: Request, res: Response, next: NextFunction) {
    try {
      const { rangerId, rangerName } = getAuthenticatedRanger(req);
      const input = createIncidentSchema.parse(req.body);
      const data = await incidentService.createIncident(rangerId, rangerName, input);
      return res.status(201).json({
        success: true,
        data
      });
    } catch (error) {
      return next(error);
    }
  },

  async getMyIncidents(req: Request, res: Response, next: NextFunction) {
    try {
      const { rangerId } = getAuthenticatedRanger(req);
      const data = await incidentService.getRangerIncidents(rangerId);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      return next(error);
    }
  },

  async getIncidentById(req: Request, res: Response, next: NextFunction) {
    try {
      const { rangerId } = getAuthenticatedRanger(req);
      const incidentId = String(req.params.incidentId);
      const data = await incidentService.getIncidentById(rangerId, incidentId);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      return next(error);
    }
  },

  async updateIncident(req: Request, res: Response, next: NextFunction) {
    try {
      const { rangerId, rangerName } = getAuthenticatedRanger(req);
      const incidentId = String(req.params.incidentId);
      const input = updateIncidentSchema.parse(req.body);
      const data = await incidentService.updateIncident(rangerId, rangerName, incidentId, input);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      return next(error);
    }
  },

  async deleteIncident(req: Request, res: Response, next: NextFunction) {
    try {
      const { rangerId } = getAuthenticatedRanger(req);
      const incidentId = String(req.params.incidentId);
      const input = deleteIncidentSchema.parse(req.body ?? {});
      const data = await incidentService.deleteIncident(rangerId, incidentId, input);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      return next(error);
    }
  },

  async restoreIncident(req: Request, res: Response, next: NextFunction) {
    try {
      const { rangerId } = getAuthenticatedRanger(req);
      const incidentId = String(req.params.incidentId);
      const input = restoreIncidentSchema.parse(req.body ?? {});
      const data = await incidentService.restoreIncident(rangerId, incidentId, input);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      return next(error);
    }
  }
};
