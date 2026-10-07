import { Router } from 'express';
import { collarIngestionController } from './controller.js';
import { requireCollarGatewayKey } from './middleware.js';

export const collarIngestionRoutes = Router();

// Provider/gateway webhooks
collarIngestionRoutes.post('/collar-location', requireCollarGatewayKey, collarIngestionController.receiveTelemetry);
collarIngestionRoutes.post('/vendor-webhook/:vendor', requireCollarGatewayKey, collarIngestionController.receiveVendorWebhook);

// Device monitoring & telemetry querying
collarIngestionRoutes.get('/collars', collarIngestionController.getDevices);
collarIngestionRoutes.get('/collars/:deviceId/telemetry', collarIngestionController.getTelemetryHistory);

// Real-time live update stream
collarIngestionRoutes.get('/stream', collarIngestionController.streamEvents);
