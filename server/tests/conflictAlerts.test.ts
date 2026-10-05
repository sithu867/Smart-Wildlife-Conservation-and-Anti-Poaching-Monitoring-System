import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  AlertSource,
  ConflictAlertType,
  AlertSeverity,
  AlertStatus,
  ResponseAction,
  LocationSource
} from '../src/types/enums.js';

const app = createApp();

describe('UC-C Wildlife Conflict Alerts & Response API Endpoints', () => {
  const sampleCollarSimulation = {
    animalId: 'ELEPHANT-001',
    latitude: -2.1523,
    longitude: 34.8214,
    alertType: ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY,
    severity: AlertSeverity.HIGH,
    description: 'Tracked elephant ELEPHANT-001 entered village buffer zone.'
  };

  const sampleCommunityReport = {
    reporterName: 'Elder Joseph',
    latitude: -2.1890,
    longitude: 34.8410,
    reportType: ConflictAlertType.CROP_RAID,
    severity: AlertSeverity.MEDIUM,
    description: 'Herds of elephants spotted near maize farm.'
  };

  test('POST /api/conflict-alerts/simulate-collar creates a collar conflict alert', async () => {
    const res = await request(app)
      .post('/api/conflict-alerts/simulate-collar')
      .send(sampleCollarSimulation);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.source).toBe(AlertSource.COLLAR);
    expect(res.body.data.animalId).toBe('ELEPHANT-001');
    expect(res.body.data.status).toBe(AlertStatus.OPEN);
    expect(res.body.data.severity).toBe(AlertSeverity.HIGH);
  });

  test('POST /api/conflict-alerts/community-report creates a community report conflict alert', async () => {
    const res = await request(app)
      .post('/api/conflict-alerts/community-report')
      .send(sampleCommunityReport);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.source).toBe(AlertSource.COMMUNITY_REPORT);
    expect(res.body.data.reporterName).toBe('Elder Joseph');
    expect(res.body.data.status).toBe(AlertStatus.OPEN);
  });

  test('GET /api/conflict-alerts retrieves list of all conflict alerts', async () => {
    const res = await request(app).get('/api/conflict-alerts');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('State Machine Flow: OPEN -> ACKNOWLEDGED -> RESPONDING -> RESOLVED', async () => {
    // 1. Create Alert
    const createRes = await request(app)
      .post('/api/conflict-alerts/simulate-collar')
      .send({
        ...sampleCollarSimulation,
        sourceEventId: `state-test-${Date.now()}`
      });

    expect(createRes.status).toBe(201);
    const alertId = createRes.body.data._id;
    expect(createRes.body.data.status).toBe(AlertStatus.OPEN);

    // 2. Acknowledge Alert (OPEN -> ACKNOWLEDGED)
    const ackRes = await request(app)
      .post(`/api/conflict-alerts/${alertId}/acknowledge`)
      .set('x-ranger-id', 'R-101')
      .set('x-ranger-name', 'Ranger John');

    expect(ackRes.status).toBe(200);
    expect(ackRes.body.data.status).toBe(AlertStatus.ACKNOWLEDGED);
    expect(ackRes.body.data.acknowledgedBy).toBe('R-101');
    expect(ackRes.body.data.acknowledgedName).toBe('Ranger John');

    // 3. Record Response (ACKNOWLEDGED -> RESPONDING)
    const respRes = await request(app)
      .post(`/api/conflict-alerts/${alertId}/responses`)
      .set('x-ranger-id', 'R-101')
      .set('x-ranger-name', 'Ranger John')
      .send({
        action: ResponseAction.INVESTIGATED_AREA,
        notes: 'Dispatched patrol vehicle to inspect village border.'
      });

    expect(respRes.status).toBe(200);
    expect(respRes.body.data.status).toBe(AlertStatus.RESPONDING);
    expect(respRes.body.data.responses.length).toBe(1);
    expect(respRes.body.data.responses[0].action).toBe(ResponseAction.INVESTIGATED_AREA);

    // 4. Resolve Alert (RESPONDING -> RESOLVED)
    const resolveRes = await request(app)
      .post(`/api/conflict-alerts/${alertId}/resolve`)
      .set('x-ranger-id', 'R-101')
      .set('x-ranger-name', 'Ranger John')
      .send({
        resolutionNotes: 'Elephant safely guided back into core reserve buffer zone.'
      });

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.data.status).toBe(AlertStatus.RESOLVED);
    expect(resolveRes.body.data.resolvedBy).toBe('R-101');
    expect(resolveRes.body.data.resolutionNotes).toContain('safely guided');
  });

  test('Invalid State Transition: Cannot acknowledge or respond to a RESOLVED alert', async () => {
    // Create and resolve alert
    const createRes = await request(app)
      .post('/api/conflict-alerts/community-report')
      .send({
        ...sampleCommunityReport,
        sourceEventId: `inv-trans-${Date.now()}`
      });

    const alertId = createRes.body.data._id;

    await request(app)
      .post(`/api/conflict-alerts/${alertId}/acknowledge`)
      .set('x-ranger-id', 'R-101');

    await request(app)
      .post(`/api/conflict-alerts/${alertId}/resolve`)
      .set('x-ranger-id', 'R-101')
      .send({ resolutionNotes: 'Resolved issue' });

    // Attempt invalid transition (Acknowledge resolved alert)
    const invalidAck = await request(app)
      .post(`/api/conflict-alerts/${alertId}/acknowledge`)
      .set('x-ranger-id', 'R-101');

    expect(invalidAck.status).toBe(500); // errorHandler formats service exception
    expect(invalidAck.body.error.message).toContain('Resolved alert cannot be acknowledged');
  });

  test('POST /api/conflict-alerts rejects invalid coordinates', async () => {
    const res = await request(app)
      .post('/api/conflict-alerts/simulate-collar')
      .send({
        ...sampleCollarSimulation,
        latitude: 200 // Invalid
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
