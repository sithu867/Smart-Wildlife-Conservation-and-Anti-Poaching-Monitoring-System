import { Router } from 'express';
import { incidentController } from './controller.js';

export const incidentRoutes = Router();

incidentRoutes.post('/', incidentController.createIncident);
incidentRoutes.get('/my', incidentController.getMyIncidents);
incidentRoutes.get('/:incidentId', incidentController.getIncidentById);
incidentRoutes.patch('/:incidentId', incidentController.updateIncident);
// Withdraw (soft delete) and undo
incidentRoutes.delete('/:incidentId', incidentController.deleteIncident);
incidentRoutes.post('/:incidentId/restore', incidentController.restoreIncident);
