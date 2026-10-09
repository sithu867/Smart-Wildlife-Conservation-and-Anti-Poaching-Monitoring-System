import { jest } from '@jest/globals';
import request from 'supertest';
import { resetPatrolPrisma } from './patrolPrismaMock.js';
import { LocationSource, PatrolStatus } from '../src/types/enums.js';

const { createApp } = await import('../src/app.js');
const { patrolService } = await import('../src/modules/patrols/service.js');

// UC-A HTTP layer: ranger identity, request validation and error-to-status mapping.
// The service is replaced per test so these tests cover the controller and routes only.
const app = createApp();
const session = { _id: 'sess-1', status: PatrolStatus.ACTIVE };
const waypoint = { latitude: 6.475, longitude: 80.88, timestamp: '2026-10-01T06:00:00.000Z', source: LocationSource.GPS };

beforeEach(() => resetPatrolPrisma());
afterEach(() => jest.restoreAllMocks());

test('GET /my-assignment uses the ranger headers', async () => {
  const spy = jest.spyOn(patrolService, 'getAssignedPatrol').mockResolvedValue({ assignment: null, assignments: [], activeSession: null } as never);

  const res = await request(app).get('/api/patrols/my-assignment').set('x-ranger-id', 'R-7').set('x-ranger-name', 'Ranger Seven');

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ success: true, data: { assignment: null, assignments: [], activeSession: null } });
  expect(spy).toHaveBeenCalledWith('R-7', 'Ranger Seven');
});

test('requests without ranger headers fall back to the demo ranger', async () => {
  const spy = jest.spyOn(patrolService, 'getPatrolHistory').mockResolvedValue([]);

  await request(app).get('/api/patrols/sessions/history').expect(200);

  expect(spy).toHaveBeenCalledWith('R-101');
});

test('POST /sessions starts a patrol with 201 and forwards the assignment and client session id', async () => {
  const spy = jest.spyOn(patrolService, 'startPatrol').mockResolvedValue(session);

  const res = await request(app).post('/api/patrols/sessions').set('x-ranger-id', 'R-7').send({ assignmentId: 'assign-1', clientSessionId: 'sess-c1' });

  expect(res.status).toBe(201);
  expect(res.body.data).toEqual(session);
  expect(spy).toHaveBeenCalledWith('R-7', 'Ranger John', 'assign-1', 'sess-c1');
});

test('POST /sessions rejects a malformed body with 400 before starting a patrol', async () => {
  const spy = jest.spyOn(patrolService, 'startPatrol');

  const res = await request(app).post('/api/patrols/sessions').send({ assignmentId: 12 });

  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('VALIDATION_ERROR');
  expect(spy).not.toHaveBeenCalled();
});

test('POST /waypoints passes a validated waypoint with a Date timestamp', async () => {
  const spy = jest.spyOn(patrolService, 'addWaypoint').mockResolvedValue(session);

  const res = await request(app).post('/api/patrols/sessions/sess-1/waypoints').set('x-ranger-id', 'R-7').send(waypoint);

  expect(res.status).toBe(200);
  expect(spy).toHaveBeenCalledWith('R-7', 'sess-1', { ...waypoint, timestamp: new Date(waypoint.timestamp) });
});

test.each([
  ['latitude out of range', { latitude: 91 }, 'latitude'],
  ['longitude out of range', { longitude: -181 }, 'longitude'],
  ['unknown source', { source: 'SATELLITE' }, 'source']
])('POST /waypoints returns 400 for %s', async (_label, override, field) => {
  const spy = jest.spyOn(patrolService, 'addWaypoint');

  const res = await request(app).post('/api/patrols/sessions/sess-1/waypoints').send({ ...waypoint, ...override });

  expect(res.status).toBe(400);
  expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual([field]);
  expect(spy).not.toHaveBeenCalled();
});

test('POST /complete defaults the end time when the client sends none', async () => {
  const spy = jest.spyOn(patrolService, 'completePatrol').mockResolvedValue({ ...session, status: PatrolStatus.COMPLETED });

  await request(app).post('/api/patrols/sessions/sess-1/complete').send({}).expect(200);

  expect(spy.mock.calls[0][2]).toBeInstanceOf(Date);
});

test.each([
  ['pause', 'pausePatrol'],
  ['resume', 'resumePatrol'],
  ['cancel', 'cancelPatrol']
] as const)('POST /%s acts on the ranger session', async (action, method) => {
  const spy = jest.spyOn(patrolService, method).mockResolvedValue(session);

  await request(app).post(`/api/patrols/sessions/sess-1/${action}`).set('x-ranger-id', 'R-7').expect(200);

  expect(spy).toHaveBeenCalledWith('R-7', 'sess-1');
});

test('GET /routes/:routeId and GET /sessions/:sessionId return the requested records', async () => {
  jest.spyOn(patrolService, 'getPatrolRoute').mockResolvedValue({ _id: 'route-1' });
  const sessionSpy = jest.spyOn(patrolService, 'getPatrolSession').mockResolvedValue(session);

  expect((await request(app).get('/api/patrols/routes/route-1')).body.data).toEqual({ _id: 'route-1' });
  expect((await request(app).get('/api/patrols/sessions/sess-1').set('x-ranger-id', 'R-7')).body.data).toEqual(session);
  expect(sessionSpy).toHaveBeenCalledWith('R-7', 'sess-1');
});

test('POST /sessions/sync validates and forwards an offline patrol', async () => {
  const spy = jest.spyOn(patrolService, 'syncPatrolSession').mockResolvedValue(session);
  const body = { clientSessionId: 'sess-off', startTime: '2026-10-01T06:00:00.000Z', status: PatrolStatus.COMPLETED, waypoints: [waypoint] };

  await request(app).post('/api/patrols/sessions/sync').set('x-ranger-id', 'R-7').send(body).expect(200);

  expect(spy.mock.calls[0][0]).toBe('R-7');
  expect(spy.mock.calls[0][2]).toMatchObject({ clientSessionId: 'sess-off', status: PatrolStatus.COMPLETED, startTime: new Date(body.startTime) });
});

test('POST /sessions/sync rejects an upload without a client session id', async () => {
  const spy = jest.spyOn(patrolService, 'syncPatrolSession');

  const res = await request(app).post('/api/patrols/sessions/sync').send({ startTime: '2026-10-01T06:00:00.000Z', status: PatrolStatus.ACTIVE });

  expect(res.status).toBe(400);
  expect(spy).not.toHaveBeenCalled();
});

test.each([
  ['Patrol session not found.', 404],
  ['Unauthorized: Patrol session does not belong to this ranger.', 403],
  // Business-rule violations are plain Errors, which the shared handler currently maps to 500.
  ['Cannot add waypoints to a patrol session that is not ACTIVE.', 500]
])('service error "%s" is returned as HTTP %d with its message', async (message, status) => {
  jest.spyOn(patrolService, 'addWaypoint').mockRejectedValue(new Error(message));

  const res = await request(app).post('/api/patrols/sessions/sess-1/waypoints').send(waypoint);

  expect(res.status).toBe(status);
  expect(res.body).toEqual({ success: false, error: { message } });
});

test.each([
  ['get', '/api/patrols/my-assignment', 'getAssignedPatrol'],
  ['get', '/api/patrols/routes/route-1', 'getPatrolRoute'],
  ['post', '/api/patrols/sessions', 'startPatrol'],
  ['post', '/api/patrols/sessions/sess-1/complete', 'completePatrol'],
  ['post', '/api/patrols/sessions/sess-1/pause', 'pausePatrol'],
  ['post', '/api/patrols/sessions/sess-1/resume', 'resumePatrol'],
  ['post', '/api/patrols/sessions/sess-1/cancel', 'cancelPatrol'],
  ['get', '/api/patrols/sessions/sess-1', 'getPatrolSession'],
  ['get', '/api/patrols/sessions/history', 'getPatrolHistory']
] as const)('%s %s returns the service failure as an error response', async (method, url, serviceMethod) => {
  jest.spyOn(patrolService, serviceMethod).mockRejectedValue(new Error('Patrol session not found.'));

  const res = await request(app)[method](url).send({});

  expect(res.status).toBe(404);
  expect(res.body).toEqual({ success: false, error: { message: 'Patrol session not found.' } });
});

test('a database failure during sync is returned as HTTP 500', async () => {
  jest.spyOn(patrolService, 'syncPatrolSession').mockRejectedValue(new Error('connection reset'));

  const res = await request(app)
    .post('/api/patrols/sessions/sync')
    .send({ clientSessionId: 'sess-off', startTime: '2026-10-01T06:00:00.000Z', status: PatrolStatus.ACTIVE });

  expect(res.status).toBe(500);
  expect(res.body.error.message).toBe('connection reset');
});

test('the legacy /api/patrol-sessions alias reaches the same handlers', async () => {
  const spy = jest.spyOn(patrolService, 'startPatrol').mockResolvedValue(session);

  await request(app).post('/api/patrol-sessions').send({}).expect(201);

  expect(spy).toHaveBeenCalledTimes(1);
});
