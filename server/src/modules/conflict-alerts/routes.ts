import { Router } from 'express';
import { conflictAlertController } from './controller.js';

export const conflictAlertRoutes = Router();

// Retrieve all alerts / filter alerts
conflictAlertRoutes.get('/', conflictAlertController.getAlerts);

// Direct alert creation / simulation / community report endpoints
conflictAlertRoutes.post('/', conflictAlertController.createAlert);
conflictAlertRoutes.post('/simulate-collar', conflictAlertController.simulateCollar);
conflictAlertRoutes.post('/community-report', conflictAlertController.submitCommunityReport);

// Get specific alert details
conflictAlertRoutes.get('/:alertId', conflictAlertController.getAlertById);

// State transitions & ranger actions
conflictAlertRoutes.post('/:alertId/acknowledge', conflictAlertController.acknowledgeAlert);
conflictAlertRoutes.post('/:alertId/responses', conflictAlertController.addResponse);
conflictAlertRoutes.post('/:alertId/resolve', conflictAlertController.resolveAlert);
