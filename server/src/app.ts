import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { patrolRoutes, patrolSessionRoutes } from './modules/patrols/routes.js';
import { incidentRoutes } from './modules/incidents/routes.js';
import { conflictAlertRoutes } from './modules/conflict-alerts/routes.js';
import { analyticsRoutes } from './modules/analytics/routes.js';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_URL }));
  app.use(express.json({ limit: '8mb' }));
  app.use(morgan('dev'));

  app.get('/api/health', (_req, res) =>
    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        service: 'wildlife-guard-api',
        timestamp: new Date().toISOString()
      }
    })
  );

  app.use('/api/patrols', patrolRoutes);
  app.use('/api/patrol-sessions', patrolSessionRoutes);
  app.use('/api/incidents', incidentRoutes);
  app.use('/api/conflict-alerts', conflictAlertRoutes);
  app.use('/api/analytics', analyticsRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
