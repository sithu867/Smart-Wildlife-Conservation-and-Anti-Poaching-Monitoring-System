import request from 'supertest';
import { jest } from '@jest/globals';
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

jest.setTimeout(60000);

describe('UC-C Wildlife Conflict Alerts & Response API Endpoints', () => {
  const getCollarSimulation = () => ({
    sourceEventId: `collar-test-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    animalId: 'ELEPHANT-001',
    latitude: -2.1523,
    longitude: 34.8214,
    alertType: ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY,
    severity: AlertSeverity.HIGH,
    description: 'Tracked elephant ELEPHANT-001 entered village buffer zone.'
  });
  const sampleCollarSimulation = getCollarSimulation();

  const sampleCommunityReport = {
    reporterName: 'Elder Joseph',
    latitude: -2.1890,
    longitude: 34.8410,
    reportType: ConflictAlertType.CROP_RAID,
    severity: AlertSeverity.MEDIUM,
    description: 'Herds of elephants spotted near maize farm.'
  };

  // 1. Valid Alert Creation - Collar Simulator Inside Risk Zone
  test('1. POST /api/conflict-alerts/simulate-collar creates a collar conflict alert when inside high-risk zone', async () => {
    const res = await request(app)
      .post('/api/conflict-alerts/simulate-collar')
      .send(getCollarSimulation());

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.alertCreated).toBe(true);
    expect(res.body.data.source).toBe(AlertSource.COLLAR);
    expect(res.body.data.animalId).toBe('ELEPHANT-001');
    expect(res.body.data.status).toBe(AlertStatus.OPEN);
    expect(res.body.data.severity).toBe(AlertSeverity.HIGH);
    expect(res.body.data.location.source).toBe(LocationSource.GPS);
  });

  // 1b. Collar Telemetry Outside Risk Zone -> Stored without creating alert
  test('1b. POST /api/conflict-alerts/simulate-collar stores telemetry without alert creation when outside risk zones', async () => {
    const res = await request(app)
      .post('/api/conflict-alerts/simulate-collar')
      .send({
        animalId: 'LION-999',
        latitude: -1.0000, // Safe distance away from all high-risk zones
        longitude: 30.0000,
        description: 'Collar tracking outside reserve boundaries.'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.alertCreated).toBe(false);
    expect(res.body.data.telemetrySaved).toBe(true);
    expect(res.body.data.message).toContain('recorded successfully');
  });

  // 2. Valid Alert Creation - Community Report
  test('2. POST /api/conflict-alerts/community-report creates a community report conflict alert', async () => {
    const res = await request(app)
      .post('/api/conflict-alerts/community-report')
      .send(sampleCommunityReport);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.source).toBe(AlertSource.COMMUNITY_REPORT);
    expect(res.body.data.reporterName).toBe('Elder Joseph');
    expect(res.body.data.status).toBe(AlertStatus.OPEN);
    expect(res.body.data.location.source).toBe(LocationSource.MANUAL);
  });

  // 3. Direct Alert Creation Endpoint
  test('3. POST /api/conflict-alerts creates a direct alert with full parameters', async () => {
    const res = await request(app)
      .post('/api/conflict-alerts')
      .send({
        source: AlertSource.COLLAR,
        alertType: ConflictAlertType.LIVESTOCK_THREAT,
        severity: AlertSeverity.CRITICAL,
        latitude: -2.1234,
        longitude: 34.7890,
        description: 'Lion pride detected near cattle boma boundary.',
        animalId: 'LION-003',
        locationSource: LocationSource.GPS
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.alertType).toBe(ConflictAlertType.LIVESTOCK_THREAT);
    expect(res.body.data.severity).toBe(AlertSeverity.CRITICAL);
    expect(res.body.data.animalId).toBe('LION-003');
  });

  // 4. Invalid Alert Creation Rejected (Validation)
  test('4. POST /api/conflict-alerts rejects invalid payload with short description or invalid enum', async () => {
    const shortDesc = await request(app)
      .post('/api/conflict-alerts')
      .send({
        source: AlertSource.COLLAR,
        alertType: ConflictAlertType.LIVESTOCK_THREAT,
        severity: AlertSeverity.LOW,
        latitude: -2.1,
        longitude: 34.8,
        description: 'ab' // < 3 chars
      });
    expect(shortDesc.status).toBe(400);

    const invalidEnum = await request(app)
      .post('/api/conflict-alerts')
      .send({
        source: 'INVALID_SOURCE',
        alertType: ConflictAlertType.LIVESTOCK_THREAT,
        severity: AlertSeverity.LOW,
        latitude: -2.1,
        longitude: 34.8,
        description: 'Valid description here'
      });
    expect(invalidEnum.status).toBe(400);
  });

  // 5. Invalid Location Rejected
  test('5. Rejects out-of-range coordinates', async () => {
    const resLat = await request(app)
      .post('/api/conflict-alerts/simulate-collar')
      .send({ ...sampleCollarSimulation, latitude: 120 });
    expect(resLat.status).toBe(400);

    const resLon = await request(app)
      .post('/api/conflict-alerts/simulate-collar')
      .send({ ...sampleCollarSimulation, longitude: -200 });
    expect(resLon.status).toBe(400);
  });

  // 6. Invalid Community Report Input Rejected
  test('6. POST /api/conflict-alerts/community-report rejects description shorter than 5 chars', async () => {
    const res = await request(app)
      .post('/api/conflict-alerts/community-report')
      .send({
        reporterName: 'John',
        latitude: -2.18,
        longitude: 34.84,
        reportType: ConflictAlertType.CROP_RAID,
        description: 'hi' // < 5 chars
      });
    expect(res.status).toBe(400);
  });

  // 7. Deterministic Collar Simulator - Duplicate Prevention
  test('7. Deterministic Collar Simulation: identical event twice returns same single open alert', async () => {
    const event = {
      animalId: 'ELEPHANT-001',
      latitude: -2.1523,
      longitude: 34.8214,
      sourceEventId: `deterministic-collar-${Date.now()}`
    };

    const first = await request(app).post('/api/conflict-alerts/simulate-collar').send(event);
    const second = await request(app).post('/api/conflict-alerts/simulate-collar').send(event);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.data._id).toBe(second.body.data._id);
  });

  // 8. Retrieve All Alerts & Filter By Status, Severity, Type
  test('8. GET /api/conflict-alerts retrieves list of all conflict alerts and supports filters', async () => {
    const resAll = await request(app).get('/api/conflict-alerts');
    expect(resAll.status).toBe(200);
    expect(Array.isArray(resAll.body.data)).toBe(true);

    const resFiltered = await request(app).get('/api/conflict-alerts?status=OPEN&severity=HIGH');
    expect(resFiltered.status).toBe(200);
    expect(Array.isArray(resFiltered.body.data)).toBe(true);
    for (const item of resFiltered.body.data) {
      expect(item.status).toBe(AlertStatus.OPEN);
      expect(item.severity).toBe(AlertSeverity.HIGH);
    }
  });

  // 9. Retrieve Alert By ID (and 404/500 on non-existent)
  test('9. GET /api/conflict-alerts/:alertId retrieves details and rejects unknown alert', async () => {
    const created = await request(app)
      .post('/api/conflict-alerts/simulate-collar')
      .send({ ...sampleCollarSimulation, sourceEventId: `detail-get-${Date.now()}` });
    const alertId = created.body.data._id;

    const res = await request(app).get(`/api/conflict-alerts/${alertId}`);
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(alertId);

    const notFoundRes = await request(app).get('/api/conflict-alerts/non-existent-alert-id');
    expect(notFoundRes.status).toBe(500);
    expect(notFoundRes.body.error.message).toContain('not found');
  });

  // 10. Core Lifecycle: OPEN -> ACKNOWLEDGED -> RESPONDING -> RESOLVED
  test('10. Core Lifecycle: OPEN -> ACKNOWLEDGED -> RESPONDING -> RESOLVED', async () => {
    const createRes = await request(app)
      .post('/api/conflict-alerts/simulate-collar')
      .send({ ...sampleCollarSimulation, sourceEventId: `full-flow-${Date.now()}` });
    const alertId = createRes.body.data._id;
    expect(createRes.body.data.status).toBe(AlertStatus.OPEN);

    // Acknowledge
    const ackRes = await request(app)
      .post(`/api/conflict-alerts/${alertId}/acknowledge`)
      .set('x-ranger-id', 'R-101')
      .set('x-ranger-name', 'Ranger John');
    expect(ackRes.status).toBe(200);
    expect(ackRes.body.data.status).toBe(AlertStatus.ACKNOWLEDGED);
    expect(ackRes.body.data.acknowledgedBy).toBe('R-101');
    expect(ackRes.body.data.acknowledgedName).toBe('Ranger John');

    // Add Response
    const respRes = await request(app)
      .post(`/api/conflict-alerts/${alertId}/responses`)
      .set('x-ranger-id', 'R-101')
      .set('x-ranger-name', 'Ranger John')
      .send({
        action: ResponseAction.INVESTIGATED_AREA,
        notes: 'Dispatched patrol vehicle to inspect village border.',
        outcome: 'Area quiet, tracks visible heading north'
      });
    expect(respRes.status).toBe(200);
    expect(respRes.body.data.status).toBe(AlertStatus.RESPONDING);
    expect(respRes.body.data.responses).toHaveLength(1);
    expect(respRes.body.data.responses[0].outcome).toBe('Area quiet, tracks visible heading north');

    // Resolve
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

  // 11. Server-Controlled Ranger Identity (Security)
  test('11. Identity is derived strictly from authentication headers, ignoring spoofed body parameters', async () => {
    const created = await request(app)
      .post('/api/conflict-alerts/simulate-collar')
      .send({ ...sampleCollarSimulation, sourceEventId: `sec-ident-${Date.now()}` });
    const alertId = created.body.data._id;

    // Acknowledge with spoofed body
    const ack = await request(app)
      .post(`/api/conflict-alerts/${alertId}/acknowledge`)
      .set('x-ranger-id', 'R-GENUINE')
      .set('x-ranger-name', 'Officer Genuine')
      .send({ acknowledgedBy: 'R-SPOOFED', acknowledgedName: 'Hacker' });
    expect(ack.status).toBe(200);
    expect(ack.body.data.acknowledgedBy).toBe('R-GENUINE');
    expect(ack.body.data.acknowledgedName).toBe('Officer Genuine');

    // Response with spoofed body
    const resp = await request(app)
      .post(`/api/conflict-alerts/${alertId}/responses`)
      .set('x-ranger-id', 'R-GENUINE')
      .set('x-ranger-name', 'Officer Genuine')
      .send({
        action: ResponseAction.WARNED_COMMUNITY,
        notes: 'Warned villagers.',
        responderId: 'R-SPOOFED',
        responderName: 'Hacker'
      });
    expect(resp.status).toBe(200);
    expect(resp.body.data.responses[0].responderId).toBe('R-GENUINE');
    expect(resp.body.data.responses[0].responderName).toBe('Officer Genuine');

    // Resolve with spoofed body
    const resolve = await request(app)
      .post(`/api/conflict-alerts/${alertId}/resolve`)
      .set('x-ranger-id', 'R-GENUINE')
      .set('x-ranger-name', 'Officer Genuine')
      .send({
        resolutionNotes: 'Genuine resolution notes.',
        resolvedBy: 'R-SPOOFED',
        resolvedName: 'Hacker'
      });
    expect(resolve.status).toBe(200);
    expect(resolve.body.data.resolvedBy).toBe('R-GENUINE');
    expect(resolve.body.data.resolvedName).toBe('Officer Genuine');
  });

  // 12. Multiple Responses Preserved In History
  test('12. Multiple responses accumulate in history without overwriting prior responses', async () => {
    const created = await request(app)
      .post('/api/conflict-alerts/simulate-collar')
      .send({ ...sampleCollarSimulation, sourceEventId: `multi-resp-${Date.now()}` });
    const alertId = created.body.data._id;
    await request(app).post(`/api/conflict-alerts/${alertId}/acknowledge`);

    await request(app).post(`/api/conflict-alerts/${alertId}/responses`).send({
      action: ResponseAction.INVESTIGATED_AREA,
      notes: 'Response 1: Visual assessment completed.'
    });
    await request(app).post(`/api/conflict-alerts/${alertId}/responses`).send({
      action: ResponseAction.WARNED_COMMUNITY,
      notes: 'Response 2: Community leadership briefed.'
    });
    const finalResp = await request(app).post(`/api/conflict-alerts/${alertId}/responses`).send({
      action: ResponseAction.REDIRECTED_WILDLIFE,
      notes: 'Response 3: Wildlife redirected using non-lethal deterrents.'
    });

    expect(finalResp.status).toBe(200);
    expect(finalResp.body.data.responses).toHaveLength(3);
    expect(finalResp.body.data.responses[0].action).toBe(ResponseAction.INVESTIGATED_AREA);
    expect(finalResp.body.data.responses[1].action).toBe(ResponseAction.WARNED_COMMUNITY);
    expect(finalResp.body.data.responses[2].action).toBe(ResponseAction.REDIRECTED_WILDLIFE);
  });

  // 13. Idempotent Responses (duplicate clientResponseId)
  test('13. Same clientResponseId is idempotent and does not create duplicate response', async () => {
    const created = await request(app)
      .post('/api/conflict-alerts/simulate-collar')
      .send({ ...sampleCollarSimulation, sourceEventId: `dup-resp-id-${Date.now()}` });
    const alertId = created.body.data._id;
    await request(app).post(`/api/conflict-alerts/${alertId}/acknowledge`);

    const input = {
      clientResponseId: `stable-resp-${Date.now()}`,
      action: ResponseAction.SECURED_AREA,
      notes: 'Secured area around crop perimeter.'
    };

    const first = await request(app).post(`/api/conflict-alerts/${alertId}/responses`).send(input);
    const second = await request(app).post(`/api/conflict-alerts/${alertId}/responses`).send(input);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.responses).toHaveLength(1);
    expect(second.body.data.responses[0].clientResponseId).toBe(input.clientResponseId);
  });

  // 14. Idempotent Acknowledgement (duplicate clientAcknowledgementId)
  test('14. Same clientAcknowledgementId is idempotent on retry', async () => {
    const created = await request(app)
      .post('/api/conflict-alerts/simulate-collar')
      .send({ ...sampleCollarSimulation, sourceEventId: `dup-ack-id-${Date.now()}` });
    const alertId = created.body.data._id;

    const clientAckId = `ack-${Date.now()}`;
    const first = await request(app).post(`/api/conflict-alerts/${alertId}/acknowledge`).send({ clientAcknowledgementId: clientAckId });
    const second = await request(app).post(`/api/conflict-alerts/${alertId}/acknowledge`).send({ clientAcknowledgementId: clientAckId });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe(AlertStatus.ACKNOWLEDGED);
  });

  // 15. Idempotent Resolution (duplicate clientActionId)
  test('15. Same clientActionId on resolveAlert is idempotent on retry', async () => {
    const created = await request(app)
      .post('/api/conflict-alerts/simulate-collar')
      .send({ ...sampleCollarSimulation, sourceEventId: `dup-res-id-${Date.now()}` });
    const alertId = created.body.data._id;
    await request(app).post(`/api/conflict-alerts/${alertId}/acknowledge`);
    await request(app).post(`/api/conflict-alerts/${alertId}/responses`).send({
      action: ResponseAction.INVESTIGATED_AREA,
      notes: 'Initial response completed.'
    });

    const clientActionId = `resolve-action-${Date.now()}`;
    const first = await request(app).post(`/api/conflict-alerts/${alertId}/resolve`).send({
      clientActionId,
      resolutionNotes: 'Conflict condition subsided.'
    });
    const second = await request(app).post(`/api/conflict-alerts/${alertId}/resolve`).send({
      clientActionId,
      resolutionNotes: 'Conflict condition subsided.'
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe(AlertStatus.RESOLVED);
  });

  // 16. Invalid Transition: Cannot resolve before response exists
  test('16. Resolution is rejected when alert has not yet had a response recorded', async () => {
    const created = await request(app)
      .post('/api/conflict-alerts/simulate-collar')
      .send({ ...sampleCollarSimulation, sourceEventId: `no-resp-resolve-${Date.now()}` });
    const alertId = created.body.data._id;
    await request(app).post(`/api/conflict-alerts/${alertId}/acknowledge`);

    const res = await request(app).post(`/api/conflict-alerts/${alertId}/resolve`).send({
      resolutionNotes: 'Cannot skip response step.'
    });
    expect(res.status).toBe(500);
    expect(res.body.error.message).toContain('cannot be resolved');
  });

  // 17. Invalid Transition: Cannot acknowledge or respond to an already RESOLVED alert
  test('17. Invalid State Transition: Cannot acknowledge or add responses to a RESOLVED alert', async () => {
    const created = await request(app)
      .post('/api/conflict-alerts/simulate-collar')
      .send({ ...sampleCollarSimulation, sourceEventId: `stale-resolved-${Date.now()}` });
    const alertId = created.body.data._id;
    await request(app).post(`/api/conflict-alerts/${alertId}/acknowledge`);
    await request(app).post(`/api/conflict-alerts/${alertId}/responses`).send({
      action: ResponseAction.INVESTIGATED_AREA,
      notes: 'Area secured.'
    });
    await request(app).post(`/api/conflict-alerts/${alertId}/resolve`).send({
      resolutionNotes: 'Alert permanently resolved.'
    });

    // Try acknowledging
    const ackStale = await request(app).post(`/api/conflict-alerts/${alertId}/acknowledge`);
    expect(ackStale.status).toBe(500);
    expect(ackStale.body.error.message).toContain('Resolved alert cannot be acknowledged');

    // Try responding
    const respStale = await request(app).post(`/api/conflict-alerts/${alertId}/responses`).send({
      action: ResponseAction.MONITORED_WILDLIFE,
      notes: 'Late response attempt.'
    });
    expect(respStale.status).toBe(500);
    expect(respStale.body.error.message).toContain('Resolved alert cannot accept new responses');
  });

  // 18. Invalid Transition: Cannot respond to OPEN alert without acknowledging
  test('18. Cannot record response on an OPEN alert before acknowledging', async () => {
    const created = await request(app)
      .post('/api/conflict-alerts/simulate-collar')
      .send({ ...sampleCollarSimulation, sourceEventId: `unack-resp-${Date.now()}` });
    const alertId = created.body.data._id;

    const resp = await request(app).post(`/api/conflict-alerts/${alertId}/responses`).send({
      action: ResponseAction.INVESTIGATED_AREA,
      notes: 'Tried to respond without ack.'
    });
    expect(resp.status).toBe(500);
    expect(resp.body.error.message).toContain('must be acknowledged before recording response');
  });

  // 19. Simultaneous Response with markResolved
  test('19. Simultaneous response with markResolved: true transitions to RESOLVED', async () => {
    const created = await request(app)
      .post('/api/conflict-alerts/simulate-collar')
      .send({ ...sampleCollarSimulation, sourceEventId: `mark-res-${Date.now()}` });
    const alertId = created.body.data._id;
    await request(app).post(`/api/conflict-alerts/${alertId}/acknowledge`);

    const res = await request(app).post(`/api/conflict-alerts/${alertId}/responses`).send({
      action: ResponseAction.REDIRECTED_WILDLIFE,
      notes: 'Guided animals away and resolved threat.',
      markResolved: true,
      resolutionNotes: 'Successfully redirected without incident.'
    });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(AlertStatus.RESOLVED);
    expect(res.body.data.resolutionNotes).toBe('Successfully redirected without incident.');
    expect(res.body.data.responses).toHaveLength(1);
  });

  // 20. Validation on response and resolution notes
  test('20. Validates minimum length for response notes and resolution notes', async () => {
    const created = await request(app)
      .post('/api/conflict-alerts/simulate-collar')
      .send({ ...sampleCollarSimulation, sourceEventId: `val-notes-${Date.now()}` });
    const alertId = created.body.data._id;
    await request(app).post(`/api/conflict-alerts/${alertId}/acknowledge`);

    const shortResp = await request(app).post(`/api/conflict-alerts/${alertId}/responses`).send({
      action: ResponseAction.INVESTIGATED_AREA,
      notes: 'no' // < 3 chars
    });
    expect(shortResp.status).toBe(400);

    const emptyResolve = await request(app).post(`/api/conflict-alerts/${alertId}/resolve`).send({
      resolutionNotes: 'ab' // < 3 chars
    });
    expect(emptyResolve.status).toBe(400);
  });
});

describe('UC03 CRUD, cancellation and audit extensions', () => {
  const createAlert = async () => {
    const res = await request(app).post('/api/conflict-alerts').send({ source: AlertSource.COMMUNITY_REPORT, alertType: ConflictAlertType.CROP_RAID, severity: AlertSeverity.MEDIUM, latitude: -2.189, longitude: 34.841, description: `CRUD alert ${Date.now()}`, reporterName: 'Test reporter', locationSource: LocationSource.MANUAL });
    return res.body.data;
  };

  test('supports controlled alert update and audit history', async () => {
    const alert = await createAlert();
    const updated = await request(app).put(`/api/conflict-alerts/${alert._id}`).set('x-ranger-id', 'R-CRUD').send({ description: 'Updated conservation description', severity: AlertSeverity.HIGH });
    expect(updated.status).toBe(200); expect(updated.body.data.description).toBe('Updated conservation description');
    const history = await request(app).get(`/api/conflict-alerts/${alert._id}/history`);
    expect(history.status).toBe(200); expect(history.body.data.some((entry: any) => entry.action === 'UPDATE')).toBe(true);
  });

  test('soft-deletes an alert and hides it from normal list', async () => {
    const alert = await createAlert();
    const deleted = await request(app).delete(`/api/conflict-alerts/${alert._id}`).send({ reason: 'Duplicate test alert' });
    expect(deleted.status).toBe(200); expect(deleted.body.data.isDeleted).toBe(true);
    const list = await request(app).get('/api/conflict-alerts');
    expect(list.body.data.some((item: any) => item._id === alert._id)).toBe(false);
    const included = await request(app).get(`/api/conflict-alerts?includeDeleted=true`);
    expect(included.body.data.some((item: any) => item._id === alert._id)).toBe(true);
  });

  test('supports response read/update/delete without changing lifecycle', async () => {
    const alert = await createAlert();
    await request(app).post(`/api/conflict-alerts/${alert._id}/acknowledge`).set('x-ranger-id', 'R-RESP');
    const created = await request(app).post(`/api/conflict-alerts/${alert._id}/responses`).set('x-ranger-id', 'R-RESP').send({ action: ResponseAction.INVESTIGATED_AREA, notes: 'Initial response notes' });
    const responseId = created.body.data.responses[0].responseId;
    expect((await request(app).get(`/api/conflict-alerts/${alert._id}/responses`)).body.data).toHaveLength(1);
    const updated = await request(app).put(`/api/conflict-alerts/${alert._id}/responses/${responseId}`).set('x-ranger-id', 'R-RESP').send({ notes: 'Edited response notes' });
    expect(updated.status).toBe(200); expect(updated.body.data.responses[0].notes).toBe('Edited response notes');
    const deleted = await request(app).delete(`/api/conflict-alerts/${alert._id}/responses/${responseId}`).set('x-ranger-id', 'R-RESP');
    expect(deleted.status).toBe(200); expect(deleted.body.data.responses).toHaveLength(0);
  });

  test('requires cancellation reason and rejects cancelled lifecycle actions', async () => {
    const alert = await createAlert();
    expect((await request(app).post(`/api/conflict-alerts/${alert._id}/cancel`).send({})).status).toBe(400);
    const cancelled = await request(app).post(`/api/conflict-alerts/${alert._id}/cancel`).send({ reason: 'No longer an active conflict' });
    expect(cancelled.status).toBe(200); expect(cancelled.body.data.status).toBe(AlertStatus.CANCELLED);
    expect((await request(app).post(`/api/conflict-alerts/${alert._id}/acknowledge`)).status).toBe(500);
    expect((await request(app).post(`/api/conflict-alerts/${alert._id}/responses`).send({ action: ResponseAction.INVESTIGATED_AREA, notes: 'Late response' })).status).toBe(500);
  });

  test('rejects response changes by a different ranger', async () => {
    const alert = await createAlert(); await request(app).post(`/api/conflict-alerts/${alert._id}/acknowledge`).set('x-ranger-id', 'R-OWNER');
    const created = await request(app).post(`/api/conflict-alerts/${alert._id}/responses`).set('x-ranger-id', 'R-OWNER').send({ action: ResponseAction.INVESTIGATED_AREA, notes: 'Owner response' });
    const responseId = created.body.data.responses[0].responseId;
    const result = await request(app).put(`/api/conflict-alerts/${alert._id}/responses/${responseId}`).set('x-ranger-id', 'R-OTHER').send({ notes: 'Unauthorized edit' });
    expect(result.status).toBe(403); expect(result.body.error.message).toContain('Unauthorized');
  });
});
