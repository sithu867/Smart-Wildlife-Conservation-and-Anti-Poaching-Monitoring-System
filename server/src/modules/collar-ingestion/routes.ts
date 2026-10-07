import { Router } from 'express';
import { collarIngestionController } from './controller.js';
import { requireCollarGatewayKey } from './middleware.js';

export const collarIngestionRoutes = Router();

// Provider/gateway webhook. The simulator is intentionally kept separate.
collarIngestionRoutes.post('/collar-location', requireCollarGatewayKey, collarIngestionController.receiveTelemetry);
