import { Router } from 'express';
import { incidentController } from './controller.js';

export const incidentRoutes = Router();

incidentRoutes.post('/', incidentController.createIncident);
incidentRoutes.get('/my', incidentController.getMyIncidents);
incidentRoutes.get('/:incidentId', incidentController.getIncidentById);
