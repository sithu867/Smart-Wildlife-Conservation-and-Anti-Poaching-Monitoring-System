import { Router } from 'express';
import { conflictAlertController } from './controller.js';

export const conflictAlertRoutes = Router();

// Retrieve all alerts / filter alerts
conflictAlertRoutes.get('/', conflictAlertController.getAlerts);

// Direct alert creation / simulation / community report endpoints
conflictAlertRoutes.post('/', conflictAlertController.createAlert);
conflictAlertRoutes.post('/simulate-collar', conflictAlertController.simulateCollar);
conflictAlertRoutes.post('/community-report', conflictAlertController.submitCommunityReport);

conflictAlertRoutes.put('/:alertId', conflictAlertController.updateAlert);
conflictAlertRoutes.delete('/:alertId', conflictAlertController.deleteAlert);

// Get specific alert details
conflictAlertRoutes.get('/:alertId', conflictAlertController.getAlertById);

// State transitions & ranger actions
conflictAlertRoutes.post('/:alertId/acknowledge', conflictAlertController.acknowledgeAlert);
conflictAlertRoutes.post('/:alertId/responses', conflictAlertController.addResponse);
conflictAlertRoutes.get('/:alertId/responses', conflictAlertController.getResponses);
conflictAlertRoutes.put('/:alertId/responses/:responseId', conflictAlertController.updateResponse);
conflictAlertRoutes.delete('/:alertId/responses/:responseId', conflictAlertController.deleteResponse);
conflictAlertRoutes.post('/:alertId/resolve', conflictAlertController.resolveAlert);
conflictAlertRoutes.post('/:alertId/cancel', conflictAlertController.cancelAlert);
conflictAlertRoutes.get('/:alertId/history', conflictAlertController.getHistory);
