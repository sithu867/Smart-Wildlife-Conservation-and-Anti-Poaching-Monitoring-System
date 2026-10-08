/**
 * UC-B incident controller: the thin HTTP layer between the routes and IncidentService.
 * Each handler (1) identifies the ranger, (2) validates the body with Zod (a ZodError becomes a 400 in the
 * error handler), (3) calls the service, and (4) replies { success: true, data }. Errors are passed to next()
 * so middleware/errors.ts turns AppErrors into the right status + code (403, 404, 409, 410, ...).
 */
import type { Request, Response, NextFunction } from 'express';
import { incidentService } from './service.js';
import { createIncidentSchema, deleteIncidentSchema, restoreIncidentSchema, updateIncidentSchema } from './validation.js';

/**
 * Who is calling. There is no login yet, so the ranger comes from the x-ranger-id / x-ranger-name headers,
 * falling back to the demo ranger R-101. Replace this when real authentication is added.
 */
function getAuthenticatedRanger(req: Request): { rangerId: string; rangerName: string } {
  const headerId = req.headers['x-ranger-id'];
  const headerName = req.headers['x-ranger-name'];
  const rangerId = Array.isArray(headerId) ? headerId[0] : (headerId || 'R-101');
  const rangerName = Array.isArray(headerName) ? headerName[0] : (headerName || 'Ranger John');
  return { rangerId, rangerName };
}

export const incidentController = {
  /** CREATE - POST /api/incidents. Reports a new incident (also used when an offline report syncs). 201. */
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

  /** READ - GET /api/incidents/my. The ranger's own reports, newest first, with canEdit/canDelete flags. */
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

  /** READ - GET /api/incidents/:id. One report; 403 if another ranger's, 410 if withdrawn. */
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

  /** UPDATE - PATCH /api/incidents/:id. Applies only the changed fields while the report is still editable. */
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

  /** DELETE - DELETE /api/incidents/:id. Withdraws (soft-deletes) the report with a reason; kept for audit. */
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

  /** UNDO DELETE - POST /api/incidents/:id/restore. Brings a withdrawn report back while still editable. */
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
