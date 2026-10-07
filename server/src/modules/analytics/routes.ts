import { Router } from 'express';
import { analyticsController } from './controller.js';
import { conservationReportController } from './reportController.js';
export const analyticsRoutes = Router();
analyticsRoutes.use(analyticsController.managerOnly);
analyticsRoutes.get('/parks', analyticsController.listParks);
analyticsRoutes.get('/', analyticsController.get);
analyticsRoutes.get('/summary', analyticsController.get);
analyticsRoutes.get('/report', analyticsController.report);
analyticsRoutes.post('/reports', conservationReportController.generate);
analyticsRoutes.get('/reports', conservationReportController.list);
analyticsRoutes.get('/reports/:reportId', conservationReportController.detail);
analyticsRoutes.patch(
  '/reports/:reportId',
  conservationReportController.update,
);
analyticsRoutes.delete(
  '/reports/:reportId',
  conservationReportController.archive,
);
analyticsRoutes.post(
  '/reports/:reportId/regenerate',
  conservationReportController.regenerate,
);
analyticsRoutes.get(
  '/reports/:reportId/pdf',
  conservationReportController.exportPdf,
);
