import request from 'supertest';
import { createApp } from '../src/app.js';
import { calculateHaversineDistanceKm, calculateTotalWaypointsDistanceKm, patrolService } from '../src/modules/patrols/service.js';
import { LocationSource, PatrolStatus } from '../src/types/enums.js';

describe('Patrol Utilities & Calculation Tests', () => {
  test('calculateHaversineDistanceKm calculates distance between two points accurately', () => {
    const dist = calculateHaversineDistanceKm(0, 0, 1, 1);
    expect(dist).toBeGreaterThan(150);
    expect(dist).toBeLessThan(160);
  });

  test('calculateTotalWaypointsDistanceKm returns 0 for empty or single waypoint', () => {
    expect(calculateTotalWaypointsDistanceKm([])).toBe(0);
    expect(calculateTotalWaypointsDistanceKm([{ latitude: -2.15, longitude: 34.82, timestamp: new Date(), source: LocationSource.GPS }])).toBe(0);
  });

  test('calculateTotalWaypointsDistanceKm sums distances correctly across multiple waypoints', () => {
    const waypoints = [
      { latitude: -2.1523, longitude: 34.8214, timestamp: new Date(), source: LocationSource.GPS },
      { latitude: -2.1480, longitude: 34.8320, timestamp: new Date(), source: LocationSource.GPS },
      { latitude: -2.1410, longitude: 34.8450, timestamp: new Date(), source: LocationSource.GPS }
    ];
    const totalDist = calculateTotalWaypointsDistanceKm(waypoints);
    expect(totalDist).toBeGreaterThan(2);
    expect(totalDist).toBeLessThan(5);
  });
});

describe('UC-A Alternate & Sync Validation Tests', () => {
  test('rejects waypoints with invalid latitude coordinates (< -90 or > 90)', async () => {
    await expect(
      patrolService.addWaypoint('R-101', 'non-existent-session-id', {
        latitude: 105, // Invalid!
        longitude: 34.82,
        timestamp: new Date(),
        source: LocationSource.GPS
      })
    ).rejects.toThrow();
  });

  test('POST /api/patrols/sessions/sync rejects invalid waypoint payload format', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/patrols/sessions/sync')
      .set('x-ranger-id', 'R-101')
      .send({
        clientSessionId: 'test-client-id-01',
        startTime: new Date().toISOString(),
        status: PatrolStatus.ACTIVE,
        waypoints: [
          { latitude: 200, longitude: 34.82, source: 'INVALID_SOURCE' } // Invalid coordinates & source!
        ]
      });

    expect(res.status).toBe(500); // Caught by error middleware
  });
});
