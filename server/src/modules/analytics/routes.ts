import { Router } from 'express';
import { analyticsController } from './controller.js';
export const analyticsRoutes = Router();
analyticsRoutes.use(analyticsController.managerOnly);
analyticsRoutes.get('/parks', analyticsController.listParks);
analyticsRoutes.get('/', analyticsController.get);
analyticsRoutes.get('/summary', analyticsController.get);
analyticsRoutes.get('/report', analyticsController.report);
