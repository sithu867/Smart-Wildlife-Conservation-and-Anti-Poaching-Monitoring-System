/**
 * UC-B "Report & Manage Conservation Incidents" - HTTP routes (mounted at /api/incidents in app.ts).
 *
 *   POST   /                      Create (report) an incident - also used by offline sync
 *   GET    /my                    List the ranger's own reports (withdrawn ones excluded)
 *   GET    /:incidentId           Read one report (410 if withdrawn)
 *   PATCH  /:incidentId           Update (edit) a report while it is still editable
 *   DELETE /:incidentId           Delete = withdraw (soft delete) a report, kept for audit
 *   POST   /:incidentId/restore   Undo a withdrawal
 */
import { Router } from 'express';
import { incidentController } from './controller.js';

export const incidentRoutes = Router();

// Create + read
incidentRoutes.post('/', incidentController.createIncident);
incidentRoutes.get('/my', incidentController.getMyIncidents);
incidentRoutes.get('/:incidentId', incidentController.getIncidentById);
// Update
incidentRoutes.patch('/:incidentId', incidentController.updateIncident);
// Withdraw (soft delete) and undo
incidentRoutes.delete('/:incidentId', incidentController.deleteIncident);
incidentRoutes.post('/:incidentId/restore', incidentController.restoreIncident);
