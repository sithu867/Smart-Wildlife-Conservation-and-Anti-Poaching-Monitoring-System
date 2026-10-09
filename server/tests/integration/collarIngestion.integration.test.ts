import request from 'supertest';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';

const app = createApp();

describe('Collar Telemetry Ingestion & Device Monitoring API', () => {
  const apiKey = env.COLLAR_INGESTION_API_KEY || 'local-development-collar-key-change-in-production';

  test('1. Rejects request without API key with 401', async () => {
    const res = await request(app)
      .post('/api/device-ingestion/collar-location')
      .send({
        eventId: `test-unauth-${Date.now()}`,
        deviceId: 'COLLAR-UNAUTH',
        animalId: 'ELEPHANT-999',
        latitude: -2.1523,
        longitude: 34.8214,
        recordedAt: new Date().toISOString()
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('2. Ingests valid collar location with x-collar-api-key header', async () => {
    const eventId = `test-auth-${Date.now()}`;
    const res = await request(app)
      .post('/api/device-ingestion/collar-location')
      .set('x-collar-api-key', apiKey)
      .send({
        eventId,
        deviceId: 'COLLAR-TEST-001',
        animalId: 'ELEPHANT-TEST-001',
        latitude: -2.1523,
        longitude: 34.8214,
        recordedAt: new Date().toISOString(),
        batteryPercent: 85,
        accuracyMeters: 5
      });

    expect([200, 202]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.data.telemetrySaved).toBe(true);
    expect(res.body.data.alertCreated).toBe(true);
  });

  test('3. Prevents duplicate eventId ingestion', async () => {
    const eventId = `dup-event-${Date.now()}`;
    const payload = {
      eventId,
      deviceId: 'COLLAR-TEST-002',
      animalId: 'ELEPHANT-TEST-002',
      latitude: -2.1523,
      longitude: 34.8214,
      recordedAt: new Date().toISOString()
    };

    const first = await request(app)
      .post('/api/device-ingestion/collar-location')
      .set('x-collar-api-key', apiKey)
      .send(payload);

    const second = await request(app)
      .post('/api/device-ingestion/collar-location')
      .set('x-collar-api-key', apiKey)
      .send(payload);

    expect(first.status).toBe(202);
    expect(second.status).toBe(200);
    expect(second.body.data.duplicate).toBe(true);
  });

  test('4. Ingests vendor payload via /vendor-webhook/ttn', async () => {
    const res = await request(app)
      .post('/api/device-ingestion/vendor-webhook/ttn')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        end_device_ids: { device_id: 'collar-lion-007' },
        uplink_message: {
          decoded_payload: {
            latitude: -2.1890,
            longitude: 34.8410,
            battery: 45
          }
        },
        received_at: new Date().toISOString()
      });

    expect([200, 202]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.vendor).toBe('ttn');
  });

  test('5. GET /api/device-ingestion/collars returns collar device list & stats', async () => {
    const res = await request(app).get('/api/device-ingestion/collars');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.totalDevices).toBeGreaterThanOrEqual(1);
  });

  test('6. GET /api/device-ingestion/collars/:deviceId/telemetry returns device history', async () => {
    const res = await request(app).get('/api/device-ingestion/collars/COLLAR-TEST-001/telemetry');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
