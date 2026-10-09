import {
  addWaypointSchema,
  completePatrolSchema,
  startPatrolSchema,
  syncPatrolSchema
} from '../src/modules/patrols/validation.js';
import { LocationSource, PatrolStatus } from '../src/types/enums.js';

// UC-A request validation (zod schemas used by the patrol controller).
const gpsWaypoint = { latitude: 6.475, longitude: 80.88, timestamp: '2026-10-01T06:00:00.000Z', source: LocationSource.GPS, accuracy: 5 };

describe('UC-A startPatrolSchema', () => {
  test('accepts an assignment, route and client session id', () => {
    expect(startPatrolSchema.parse({ assignmentId: 'a-1', patrolRouteId: 'route-1', clientSessionId: 'sess-1' })).toEqual({
      assignmentId: 'a-1',
      patrolRouteId: 'route-1',
      clientSessionId: 'sess-1'
    });
  });

  test('accepts an empty body because the server resolves the ranger assignment', () => {
    expect(startPatrolSchema.parse({})).toEqual({});
  });

  test.each([
    ['assignmentId', { assignmentId: 42 }],
    ['clientSessionId', { clientSessionId: ['sess-1'] }]
  ])('rejects a non-string %s', (field, body) => {
    const result = startPatrolSchema.safeParse(body);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual([field]);
  });
});

describe('UC-A addWaypointSchema', () => {
  test('accepts a GPS waypoint and converts the timestamp to a Date', () => {
    const parsed = addWaypointSchema.parse(gpsWaypoint);
    expect(parsed.timestamp).toEqual(new Date('2026-10-01T06:00:00.000Z'));
    expect(parsed).toMatchObject({ latitude: 6.475, longitude: 80.88, source: LocationSource.GPS, accuracy: 5 });
  });

  test('accepts a manual waypoint with an observation note and an epoch timestamp', () => {
    const parsed = addWaypointSchema.parse({ latitude: 6.48, longitude: 80.895, timestamp: 1759298400000, source: LocationSource.MANUAL, note: 'Fresh elephant tracks' });
    expect(parsed.source).toBe(LocationSource.MANUAL);
    expect(parsed.note).toBe('Fresh elephant tracks');
    expect(parsed.timestamp).toEqual(new Date(1759298400000));
  });

  test.each([
    [-90, -180],
    [90, 180],
    [0, 0]
  ])('accepts boundary coordinates latitude %d, longitude %d', (latitude, longitude) => {
    expect(addWaypointSchema.safeParse({ ...gpsWaypoint, latitude, longitude }).success).toBe(true);
  });

  test.each([
    ['latitude', { latitude: -90.0001 }],
    ['latitude', { latitude: 90.0001 }],
    ['longitude', { longitude: -180.0001 }],
    ['longitude', { longitude: 180.0001 }]
  ])('rejects out-of-range %s', (field, override) => {
    const result = addWaypointSchema.safeParse({ ...gpsWaypoint, ...override });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map(issue => issue.path[0])).toEqual([field]);
  });

  test('rejects coordinates sent as strings instead of numbers', () => {
    const result = addWaypointSchema.safeParse({ ...gpsWaypoint, latitude: '6.475', longitude: '80.88' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map(issue => issue.path[0]).sort()).toEqual(['latitude', 'longitude']);
  });

  test.each(['latitude', 'longitude', 'timestamp', 'source'])('rejects a waypoint missing %s', field => {
    const { [field as keyof typeof gpsWaypoint]: _omitted, ...rest } = gpsWaypoint;
    const result = addWaypointSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual([field]);
  });

  test('rejects an unsupported waypoint source', () => {
    const result = addWaypointSchema.safeParse({ ...gpsWaypoint, source: 'SATELLITE' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['source']);
  });

  test('accepts a 500-character note and rejects 501 characters', () => {
    expect(addWaypointSchema.safeParse({ ...gpsWaypoint, note: 'n'.repeat(500) }).success).toBe(true);
    const result = addWaypointSchema.safeParse({ ...gpsWaypoint, note: 'n'.repeat(501) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['note']);
  });
});

describe('UC-A completePatrolSchema', () => {
  test('uses the supplied end time', () => {
    expect(completePatrolSchema.parse({ endTime: '2026-10-01T10:30:00.000Z' }).endTime).toEqual(new Date('2026-10-01T10:30:00.000Z'));
  });

  test('defaults the end time to the server clock when omitted', () => {
    const before = Date.now();
    const { endTime } = completePatrolSchema.parse({});
    expect(endTime.getTime()).toBeGreaterThanOrEqual(before);
    expect(endTime.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test('rejects a non-string, non-number end time', () => {
    expect(completePatrolSchema.safeParse({ endTime: { at: 'noon' } }).success).toBe(false);
  });
});

describe('UC-A syncPatrolSchema (offline patrol upload)', () => {
  const offlineSession = {
    clientSessionId: 'sess-offline-1',
    patrolAssignmentId: 'a-1',
    startTime: '2026-10-01T06:00:00.000Z',
    endTime: '2026-10-01T08:00:00.000Z',
    status: PatrolStatus.COMPLETED,
    waypoints: [gpsWaypoint, { ...gpsWaypoint, source: LocationSource.MANUAL, note: 'Snare removed' }],
    totalDistanceKm: 1.2,
    durationSeconds: 7200
  };

  test('accepts a completed offline session with mixed GPS and manual waypoints', () => {
    const parsed = syncPatrolSchema.parse(offlineSession);
    expect(parsed.startTime).toEqual(new Date('2026-10-01T06:00:00.000Z'));
    expect(parsed.endTime).toEqual(new Date('2026-10-01T08:00:00.000Z'));
    expect(parsed.waypoints.map(point => point.source)).toEqual([LocationSource.GPS, LocationSource.MANUAL]);
    expect(parsed.waypoints[1].note).toBe('Snare removed');
  });

  test('defaults missing waypoints, distance and duration for an active session', () => {
    const parsed = syncPatrolSchema.parse({ clientSessionId: 'sess-2', startTime: 1759298400000, endTime: null, status: PatrolStatus.ACTIVE });
    expect(parsed).toMatchObject({ waypoints: [], totalDistanceKm: 0, durationSeconds: 0, endTime: null });
  });

  test('requires the client session id used for idempotent retries', () => {
    const { clientSessionId: _omitted, ...rest } = offlineSession;
    const result = syncPatrolSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['clientSessionId']);
  });

  test('rejects an unknown patrol status', () => {
    const result = syncPatrolSchema.safeParse({ ...offlineSession, status: 'ABANDONED' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['status']);
  });

  test('reports the exact invalid waypoint inside the uploaded track', () => {
    const result = syncPatrolSchema.safeParse({ ...offlineSession, waypoints: [gpsWaypoint, { ...gpsWaypoint, latitude: 95 }] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['waypoints', 1, 'latitude']);
  });
});
