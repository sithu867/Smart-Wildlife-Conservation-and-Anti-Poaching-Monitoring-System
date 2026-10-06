import { Router } from 'express';
import { patrolController } from './controller.js';

export const patrolRoutes = Router();

// Assignment & Route endpoints
patrolRoutes.get('/my-assignment', patrolController.getMyAssignment);
patrolRoutes.get('/routes/:routeId', patrolController.getRouteById);

// Patrol Session endpoints (under /api/patrols/sessions)
patrolRoutes.get('/sessions/history', patrolController.getPatrolHistory);
patrolRoutes.post('/sessions', patrolController.startPatrol);
patrolRoutes.post('/sessions/sync', patrolController.syncPatrol);
patrolRoutes.get('/sessions/:sessionId', patrolController.getSessionById);
patrolRoutes.post('/sessions/:sessionId/waypoints', patrolController.addWaypoint);
patrolRoutes.post('/sessions/:sessionId/pause', patrolController.pausePatrol);
patrolRoutes.post('/sessions/:sessionId/resume', patrolController.resumePatrol);
patrolRoutes.post('/sessions/:sessionId/cancel', patrolController.cancelPatrol);
patrolRoutes.post('/sessions/:sessionId/complete', patrolController.completePatrol);

// Legacy alias endpoints to support both path conventions (/api/patrol-sessions)
export const patrolSessionRoutes = Router();
patrolSessionRoutes.get('/history', patrolController.getPatrolHistory);
patrolSessionRoutes.post('/', patrolController.startPatrol);
patrolSessionRoutes.post('/sync', patrolController.syncPatrol);
patrolSessionRoutes.get('/:sessionId', patrolController.getSessionById);
patrolSessionRoutes.post('/:sessionId/waypoints', patrolController.addWaypoint);
patrolSessionRoutes.post('/:sessionId/pause', patrolController.pausePatrol);
patrolSessionRoutes.post('/:sessionId/resume', patrolController.resumePatrol);
patrolSessionRoutes.post('/:sessionId/cancel', patrolController.cancelPatrol);
patrolSessionRoutes.post('/:sessionId/complete', patrolController.completePatrol);
