import type { Request, Response, NextFunction } from 'express';
import { patrolService } from './service.js';
import { startPatrolSchema, addWaypointSchema, completePatrolSchema, syncPatrolSchema } from './validation.js';

function getAuthenticatedRanger(req: Request): { rangerId: string; rangerName: string } {
  const headerId = req.headers['x-ranger-id'];
  const headerName = req.headers['x-ranger-name'];
  const rangerId = Array.isArray(headerId) ? headerId[0] : (headerId || 'R-101');
  const rangerName = Array.isArray(headerName) ? headerName[0] : (headerName || 'Ranger John');
  return { rangerId, rangerName };
}

export const patrolController = {
  async getMyAssignment(req: Request, res: Response, next: NextFunction) {
    try {
      const { rangerId, rangerName } = getAuthenticatedRanger(req);
      const data = await patrolService.getAssignedPatrol(rangerId, rangerName);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      return next(error);
    }
  },

  async getRouteById(req: Request, res: Response, next: NextFunction) {
    try {
      const routeId = String(req.params.routeId);
      const data = await patrolService.getPatrolRoute(routeId);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      return next(error);
    }
  },

  async startPatrol(req: Request, res: Response, next: NextFunction) {
    try {
      const { rangerId, rangerName } = getAuthenticatedRanger(req);
      const body = startPatrolSchema.parse(req.body);
      const data = await patrolService.startPatrol(rangerId, rangerName, body.assignmentId, body.clientSessionId);
      return res.status(201).json({
        success: true,
        data
      });
    } catch (error) {
      return next(error);
    }
  },

  async addWaypoint(req: Request, res: Response, next: NextFunction) {
    try {
      const { rangerId } = getAuthenticatedRanger(req);
      const sessionId = String(req.params.sessionId);
      const waypointData = addWaypointSchema.parse(req.body);
      const data = await patrolService.addWaypoint(rangerId, sessionId, waypointData);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      return next(error);
    }
  },

  async completePatrol(req: Request, res: Response, next: NextFunction) {
    try {
      const { rangerId } = getAuthenticatedRanger(req);
      const sessionId = String(req.params.sessionId);
      const body = completePatrolSchema.parse(req.body);
      const data = await patrolService.completePatrol(rangerId, sessionId, body.endTime);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      return next(error);
    }
  },

  async getSessionById(req: Request, res: Response, next: NextFunction) {
    try {
      const { rangerId } = getAuthenticatedRanger(req);
      const sessionId = String(req.params.sessionId);
      const data = await patrolService.getPatrolSession(rangerId, sessionId);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      return next(error);
    }
  },

  async syncPatrol(req: Request, res: Response, next: NextFunction) {
    try {
      const { rangerId, rangerName } = getAuthenticatedRanger(req);
      const payload = syncPatrolSchema.parse(req.body);
      const data = await patrolService.syncPatrolSession(rangerId, rangerName, payload);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      return next(error);
    }
  }
};
