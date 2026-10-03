import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  calculateHaversineDistanceKm,
  calculateTotalWaypointsDistanceKm,
  patrolService
} from '../src/modules/patrols/service.js';
import { LocationSource, PatrolStatus, SyncStatus } from '../src/types/enums.js';
import { PatrolSessionModel } from '../src/modules/patrols/models.js';

describe('UC-A Backend Comprehensive Integration & Quality Audit Test Suite', () => {
  const app = createApp();

  // 1. Calculation utilities
  test('calculateHaversineDistanceKm calculates distance between two points accurately', () => {
    const dist = calculateHaversineDistanceKm(0, 0, 1, 1);
    expect(dist).toBeGreaterThan(150);
    expect(dist).toBeLessThan(160);
  });

  test('calculateTotalWaypointsDistanceKm returns 0 for empty or single waypoint', () => {
    expect(calculateTotalWaypointsDistanceKm([])).toBe(0);
    expect(
      calculateTotalWaypointsDistanceKm([
        { latitude: -2.15, longitude: 34.82, timestamp: new Date(), source: LocationSource.GPS }
      ])
    ).toBe(0);
  });

  test('calculateTotalWaypointsDistanceKm sums distances correctly across multiple waypoints', () => {
    const waypoints = [
      { latitude: -2.1523, longitude: 34.8214, timestamp: new Date(), source: LocationSource.GPS },
      { latitude: -2.148, longitude: 34.832, timestamp: new Date(), source: LocationSource.GPS },
      { latitude: -2.141, longitude: 34.845, timestamp: new Date(), source: LocationSource.GPS }
    ];
    const totalDist = calculateTotalWaypointsDistanceKm(waypoints);
    expect(totalDist).toBeGreaterThan(2);
    expect(totalDist).toBeLessThan(5);
  });

  // 2. REST API Integration Tests
  test('1. Ranger retrieves assigned patrol via GET /api/patrols/my-assignment', async () => {
    const res = await request(app)
      .get('/api/patrols/my-assignment')
      .set('x-ranger-id', 'R-101')
      .set('x-ranger-name', 'Ranger John');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.assignment).toBeDefined();
    expect(res.body.data.assignment.rangerId).toBe('R-101');
  });

  test('2. Ranger starts valid patrol via POST /api/patrols/sessions', async () => {
    const rangerId = `R-${Date.now()}`;
    const res = await request(app)
      .post('/api/patrols/sessions')
      .set('x-ranger-id', rangerId)
      .send({ clientSessionId: `client-sess-${rangerId}` });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(PatrolStatus.ACTIVE);
    expect(res.body.data.rangerId).toBe(rangerId);
  });

  test('3. Ranger cannot start duplicate active patrol when session is already active', async () => {
    const rangerId = `R-DUP-${Date.now()}`;
    // First start
    await request(app).post('/api/patrols/sessions').set('x-ranger-id', rangerId).send();

    // Second start attempt
    const res = await request(app).post('/api/patrols/sessions').set('x-ranger-id', rangerId).send();
    expect(res.status).toBe(500);
    expect(res.body.error.message).toContain('already active');
  });

  test('4. Valid GPS waypoint is accepted via POST /api/patrols/sessions/:id/waypoints', async () => {
    const rangerId = `R-WP-${Date.now()}`;
    const startRes = await request(app).post('/api/patrols/sessions').set('x-ranger-id', rangerId).send();
    const sessionId = startRes.body.data._id;

    const wpRes = await request(app)
      .post(`/api/patrols/sessions/${sessionId}/waypoints`)
      .set('x-ranger-id', rangerId)
      .send({
        latitude: -2.1523,
        longitude: 34.8214,
        timestamp: new Date().toISOString(),
        source: LocationSource.GPS,
        accuracy: 8
      });

    expect(wpRes.status).toBe(200);
    expect(wpRes.body.data.waypoints.length).toBe(1);
    expect(wpRes.body.data.waypoints[0].latitude).toBe(-2.1523);
  });

  test('5. Invalid latitude is rejected by backend validation', async () => {
    const rangerId = `R-INV-${Date.now()}`;
    const startRes = await request(app).post('/api/patrols/sessions').set('x-ranger-id', rangerId).send();
    const sessionId = startRes.body.data._id;

    const wpRes = await request(app)
      .post(`/api/patrols/sessions/${sessionId}/waypoints`)
      .set('x-ranger-id', rangerId)
      .send({
        latitude: 105, // Invalid!
        longitude: 34.8214,
        timestamp: new Date().toISOString(),
        source: LocationSource.GPS
      });

    expect(wpRes.status).toBe(500);
  });

  test('6. Invalid longitude is rejected by backend validation', async () => {
    const rangerId = `R-INV2-${Date.now()}`;
    const startRes = await request(app).post('/api/patrols/sessions').set('x-ranger-id', rangerId).send();
    const sessionId = startRes.body.data._id;

    const wpRes = await request(app)
      .post(`/api/patrols/sessions/${sessionId}/waypoints`)
      .set('x-ranger-id', rangerId)
      .send({
        latitude: -2.1523,
        longitude: 210, // Invalid!
        timestamp: new Date().toISOString(),
        source: LocationSource.GPS
      });

    expect(wpRes.status).toBe(500);
  });

  test('7. Manual waypoint is accepted via POST /api/patrols/sessions/:id/waypoints', async () => {
    const rangerId = `R-MAN-${Date.now()}`;
    const startRes = await request(app).post('/api/patrols/sessions').set('x-ranger-id', rangerId).send();
    const sessionId = startRes.body.data._id;

    const wpRes = await request(app)
      .post(`/api/patrols/sessions/${sessionId}/waypoints`)
      .set('x-ranger-id', rangerId)
      .send({
        latitude: -2.1523,
        longitude: 34.8214,
        timestamp: new Date().toISOString(),
        source: LocationSource.MANUAL,
        note: 'Fresh tracks near northern boundary waterhole.'
      });

    expect(wpRes.status).toBe(200);
    expect(wpRes.body.data.waypoints[0].source).toBe(LocationSource.MANUAL);
    expect(wpRes.body.data.waypoints[0].note).toBe('Fresh tracks near northern boundary waterhole.');
  });

  test('8. Patrol can be completed via POST /api/patrols/sessions/:id/complete', async () => {
    const rangerId = `R-CMP-${Date.now()}`;
    const startRes = await request(app).post('/api/patrols/sessions').set('x-ranger-id', rangerId).send();
    const sessionId = startRes.body.data._id;

    const compRes = await request(app)
      .post(`/api/patrols/sessions/${sessionId}/complete`)
      .set('x-ranger-id', rangerId)
      .send({ endTime: new Date().toISOString() });

    expect(compRes.status).toBe(200);
    expect(compRes.body.data.status).toBe(PatrolStatus.COMPLETED);
    expect(compRes.body.data.endTime).toBeDefined();
  });

  test('9. Waypoint cannot be added to a COMPLETED patrol session', async () => {
    const rangerId = `R-CMP2-${Date.now()}`;
    const startRes = await request(app).post('/api/patrols/sessions').set('x-ranger-id', rangerId).send();
    const sessionId = startRes.body.data._id;

    await request(app)
      .post(`/api/patrols/sessions/${sessionId}/complete`)
      .set('x-ranger-id', rangerId)
      .send();

    // Try adding waypoint to completed session
    const wpRes = await request(app)
      .post(`/api/patrols/sessions/${sessionId}/waypoints`)
      .set('x-ranger-id', rangerId)
      .send({
        latitude: -2.1523,
        longitude: 34.8214,
        timestamp: new Date().toISOString(),
        source: LocationSource.GPS
      });

    expect(wpRes.status).toBe(500);
    expect(wpRes.body.error.message).toContain('not ACTIVE');
  });

  test('10. Unauthorized Ranger cannot access another Ranger session', async () => {
    const ranger1 = `R-AUTH1-${Date.now()}`;
    const ranger2 = `R-AUTH2-${Date.now()}`;

    const startRes = await request(app).post('/api/patrols/sessions').set('x-ranger-id', ranger1).send();
    const sessionId = startRes.body.data._id;

    // Ranger 2 attempts to add waypoint to Ranger 1 session
    const wpRes = await request(app)
      .post(`/api/patrols/sessions/${sessionId}/waypoints`)
      .set('x-ranger-id', ranger2)
      .send({
        latitude: -2.1523,
        longitude: 34.8214,
        timestamp: new Date().toISOString(),
        source: LocationSource.GPS
      });

    expect(wpRes.status).toBe(500);
    expect(wpRes.body.error.message).toContain('Unauthorized');
  });

  test('11. Sync request creates central patrol and repeated sync request is idempotent (0 duplicates)', async () => {
    const rangerId = `R-SYNC-${Date.now()}`;
    const clientSessionId = `client-sync-${Date.now()}`;

    const syncPayload = {
      clientSessionId,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      status: PatrolStatus.COMPLETED,
      waypoints: [
        { latitude: -2.1523, longitude: 34.8214, timestamp: new Date().toISOString(), source: LocationSource.GPS },
        { latitude: -2.148, longitude: 34.832, timestamp: new Date().toISOString(), source: LocationSource.MANUAL, note: 'Sync note' }
      ],
      totalDistanceKm: 1.2,
      durationSeconds: 300
    };

    // First sync call
    const res1 = await request(app)
      .post('/api/patrols/sessions/sync')
      .set('x-ranger-id', rangerId)
      .send(syncPayload);

    expect(res1.status).toBe(200);
    expect(res1.body.data.status).toBe(PatrolStatus.COMPLETED);
    expect(res1.body.data.waypoints.length).toBe(2);

    // Second sync call (Retry)
    const res2 = await request(app)
      .post('/api/patrols/sessions/sync')
      .set('x-ranger-id', rangerId)
      .send(syncPayload);

    expect(res2.status).toBe(200);
    expect(res2.body.data._id).toBe(res1.body.data._id); // Same database document ID!
  });

  test('12. GET /api/patrols/routes/:routeId returns route details with geometry', async () => {
    const assignRes = await request(app).get('/api/patrols/my-assignment').set('x-ranger-id', 'R-101').send();
    const routeId = assignRes.body.data.assignment.patrolRoute._id;

    const routeRes = await request(app).get(`/api/patrols/routes/${routeId}`).send();
    expect(routeRes.status).toBe(200);
    expect(routeRes.body.data.name).toBe('Northern Boundary Patrol');
    expect(routeRes.body.data.geometry.coordinates.length).toBeGreaterThan(0);
  });
});
