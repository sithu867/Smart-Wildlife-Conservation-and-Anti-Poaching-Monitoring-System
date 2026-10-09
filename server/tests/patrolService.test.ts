import { jest } from '@jest/globals';
import { mockSeededRanger, prisma, resetPatrolPrisma, route } from './patrolPrismaMock.js';
import { LocationSource, PatrolStatus, SyncStatus } from '../src/types/enums.js';

const { patrolService } = await import('../src/modules/patrols/service.js');

// UC-A patrol service business rules, with Prisma mocked (no database).
const RANGER = 'R-1';
const START = new Date('2026-10-01T06:00:00.000Z');
const assignmentRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'assign-1',
  rangerId: RANGER,
  rangerName: 'Ranger One',
  patrolRouteId: 'route-1',
  status: PatrolStatus.ASSIGNED,
  patrolRoute: route,
  ...overrides
});
const sessionRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'sess-1',
  clientSessionId: null,
  rangerId: RANGER,
  rangerName: 'Ranger One',
  patrolAssignmentId: 'assign-1',
  patrolRouteId: 'route-1',
  startTime: START,
  endTime: null,
  status: PatrolStatus.ACTIVE,
  syncStatus: SyncStatus.SYNCED,
  totalDistanceKm: 0,
  durationSeconds: 0,
  waypoints: [] as unknown[],
  patrolRoute: route,
  patrolAssignment: { id: 'assign-1', rangerId: RANGER },
  ...overrides
});
const point = (latitude: number, longitude: number, source = LocationSource.GPS, note?: string) => ({
  latitude,
  longitude,
  timestamp: new Date('2026-10-01T07:00:00.000Z'),
  source,
  ...(note ? { note } : {})
});
// Echo update/create data back as the stored row, as Prisma would.
const echoSession = (base: Record<string, unknown> = {}) => async (args?: any) => ({ ...sessionRow(base), ...args.data });

beforeEach(() => resetPatrolPrisma());
afterEach(() => jest.useRealTimers());

describe('A. assigned patrol retrieval', () => {
  test('returns the ranger assignment with route and park shaped for the client', async () => {
    mockSeededRanger({ assignment: assignmentRow() });

    const result = await patrolService.getAssignedPatrol(RANGER, 'Ranger One');

    expect(result.assignment).toMatchObject({ _id: 'assign-1', rangerId: RANGER, status: PatrolStatus.ASSIGNED });
    expect(result.assignment.patrolRoute).toMatchObject({ _id: 'route-1', name: route.name, park: { _id: 'park-1', code: 'YALA-NP' } });
    expect(result.assignments).toHaveLength(1);
    expect(result.activeSession).toBeNull();
    expect(prisma.patrolAssignment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ rangerId: RANGER, patrolRouteId: 'route-1' }) }));
  });

  test('includes the ranger in-progress session so the patrol can be resumed', async () => {
    mockSeededRanger({ assignment: assignmentRow({ status: PatrolStatus.ACTIVE }), activeSession: sessionRow({ status: PatrolStatus.PAUSED }) });

    const result = await patrolService.getAssignedPatrol(RANGER);

    expect(result.activeSession).toMatchObject({ _id: 'sess-1', status: PatrolStatus.PAUSED, patrolRoute: { _id: 'route-1' } });
    // An in-progress session keeps the assignment ACTIVE instead of resetting it.
    expect(prisma.patrolAssignment.updateMany).not.toHaveBeenCalled();
  });

  test('a ranger without an assignment is given the scheduled route assignment', async () => {
    mockSeededRanger({ assignment: null, createdAssignment: assignmentRow({ id: 'assign-new' }) });

    const result = await patrolService.getAssignedPatrol(RANGER, 'Ranger One');

    expect(prisma.patrolAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rangerId: RANGER, patrolRouteId: 'route-1', status: PatrolStatus.ASSIGNED }) })
    );
    expect(result.assignment._id).toBe('assign-new');
  });

  test('a first-time ranger gets the seeded route created when it does not exist yet', async () => {
    mockSeededRanger({ assignment: assignmentRow() });
    prisma.patrolRoute.findFirst.mockResolvedValue(null);
    prisma.patrolRoute.create.mockResolvedValue(route);
    prisma.patrolSession.count.mockResolvedValue(0);
    prisma.patrolAssignment.create.mockResolvedValue(assignmentRow({ id: 'demo-assign', status: PatrolStatus.COMPLETED }));
    prisma.patrolSession.create.mockResolvedValue(sessionRow({ status: PatrolStatus.COMPLETED }));

    await patrolService.getAssignedPatrol(RANGER);

    expect(prisma.patrolRoute.create).toHaveBeenCalledWith({ data: expect.objectContaining({ parkId: 'park-1', name: route.name }) });
    // The demo history session is stored as a completed, synced patrol with GPS and manual waypoints.
    const demo = prisma.patrolSession.create.mock.calls[0][0].data;
    expect(demo).toMatchObject({ rangerId: RANGER, status: PatrolStatus.COMPLETED, syncStatus: SyncStatus.SYNCED });
    expect(demo.waypoints.create.map((w: { source: string }) => w.source)).toEqual(['GPS', 'MANUAL', 'GPS', 'GPS']);
  });

  test('propagates a database failure', async () => {
    mockSeededRanger();
    prisma.park.upsert.mockRejectedValue(new Error('connection reset'));

    await expect(patrolService.getAssignedPatrol(RANGER)).rejects.toThrow('connection reset');
  });

  test('getPatrolRoute shapes the route and rejects an unknown route', async () => {
    prisma.patrolRoute.findUnique.mockResolvedValueOnce(route).mockResolvedValueOnce(null);

    await expect(patrolService.getPatrolRoute('route-1')).resolves.toMatchObject({ _id: 'route-1', park: { _id: 'park-1' } });
    await expect(patrolService.getPatrolRoute('missing')).rejects.toThrow('Patrol route not found');
  });
});

describe('B. start patrol', () => {
  test('starts an ACTIVE, synced session for the ranger own assignment and activates the assignment', async () => {
    prisma.patrolAssignment.findUnique.mockResolvedValue(assignmentRow());
    prisma.patrolSession.findFirst.mockResolvedValue(null);
    prisma.patrolSession.create.mockImplementation(echoSession());
    const before = Date.now();

    const session = await patrolService.startPatrol(RANGER, 'Ranger One', 'assign-1', 'sess-client-1');

    const data = prisma.patrolSession.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      clientSessionId: 'sess-client-1',
      rangerId: RANGER,
      rangerName: 'Ranger One',
      patrolAssignmentId: 'assign-1',
      patrolRouteId: 'route-1',
      status: PatrolStatus.ACTIVE,
      syncStatus: SyncStatus.SYNCED
    });
    expect(data.startTime.getTime()).toBeGreaterThanOrEqual(before);
    expect(prisma.patrolAssignment.update).toHaveBeenCalledWith({ where: { id: 'assign-1' }, data: { status: PatrolStatus.ACTIVE } });
    expect(session).toMatchObject({ _id: 'sess-1', status: PatrolStatus.ACTIVE });
  });

  test('without an assignment id, uses the ranger ASSIGNED assignment', async () => {
    prisma.patrolAssignment.findFirst.mockResolvedValue(assignmentRow({ id: 'assign-7', patrolRouteId: 'route-7' }));
    prisma.patrolSession.findFirst.mockResolvedValue(null);
    prisma.patrolSession.create.mockImplementation(echoSession());

    await patrolService.startPatrol(RANGER);

    expect(prisma.patrolAssignment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { rangerId: RANGER, status: PatrolStatus.ASSIGNED } }));
    expect(prisma.patrolSession.create.mock.calls[0][0].data).toMatchObject({ patrolAssignmentId: 'assign-7', patrolRouteId: 'route-7' });
  });

  test("another ranger's assignment is never used; the ranger's own assignment is resolved instead", async () => {
    prisma.patrolAssignment.findUnique.mockResolvedValue(assignmentRow({ id: 'foreign', rangerId: 'R-OTHER', patrolRouteId: 'route-x' }));
    mockSeededRanger({ assignment: assignmentRow({ id: 'own-assign' }) });
    prisma.patrolSession.findFirst.mockResolvedValue(null);
    prisma.patrolSession.create.mockImplementation(echoSession());

    await patrolService.startPatrol(RANGER, 'Ranger One', 'foreign');

    const data = prisma.patrolSession.create.mock.calls[0][0].data;
    expect(data.patrolAssignmentId).toBe('own-assign');
    expect(data.rangerId).toBe(RANGER);
  });

  test('rejects a second start while a patrol is ACTIVE or PAUSED', async () => {
    prisma.patrolAssignment.findUnique.mockResolvedValue(assignmentRow());
    prisma.patrolSession.findFirst.mockResolvedValue(sessionRow({ clientSessionId: 'sess-original' }));

    await expect(patrolService.startPatrol(RANGER, 'Ranger One', 'assign-1', 'sess-different')).rejects.toMatchObject({
      statusCode: 409,
      code: 'PATROL_ALREADY_ACTIVE',
      message: 'A patrol session is already active or paused for this ranger.'
    });
    expect(prisma.patrolSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { rangerId: RANGER, status: { in: [PatrolStatus.ACTIVE, PatrolStatus.PAUSED] } } })
    );
    expect(prisma.patrolSession.create).not.toHaveBeenCalled();
  });

  test('a retried start with the same client session id returns the existing session (idempotent)', async () => {
    prisma.patrolAssignment.findUnique.mockResolvedValue(assignmentRow());
    prisma.patrolSession.findFirst.mockResolvedValue(sessionRow({ clientSessionId: 'sess-retry' }));

    const session = await patrolService.startPatrol(RANGER, 'Ranger One', 'assign-1', 'sess-retry');

    expect(session).toMatchObject({ _id: 'sess-1', clientSessionId: 'sess-retry' });
    expect(prisma.patrolSession.create).not.toHaveBeenCalled();
    expect(prisma.patrolAssignment.update).not.toHaveBeenCalled();
  });

  test('fails when no assignment can be resolved for the ranger', async () => {
    prisma.patrolAssignment.findFirst.mockResolvedValue(null);
    mockSeededRanger({ assignment: null, createdAssignment: null });

    await expect(patrolService.startPatrol(RANGER)).rejects.toMatchObject({ statusCode: 404, code: 'ASSIGNMENT_NOT_FOUND', message: 'No valid patrol assignment found for ranger.' });
    expect(prisma.patrolSession.create).not.toHaveBeenCalled();
  });

  test('a failed session insert does not activate the assignment', async () => {
    prisma.patrolAssignment.findUnique.mockResolvedValue(assignmentRow());
    prisma.patrolSession.findFirst.mockResolvedValue(null);
    prisma.patrolSession.create.mockRejectedValue(new Error('insert failed'));

    await expect(patrolService.startPatrol(RANGER, 'Ranger One', 'assign-1')).rejects.toThrow('insert failed');
    expect(prisma.patrolAssignment.update).not.toHaveBeenCalled();
  });
});

describe('C/D. GPS and manual waypoints', () => {
  test('records a GPS waypoint on the session and recalculates distance and duration', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-01T06:30:00.000Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    prisma.patrolSession.findUnique.mockResolvedValue(sessionRow({ waypoints: [point(0, 0)] }));
    prisma.patrolSession.update.mockImplementation(echoSession());

    const gps = { ...point(0, 1), accuracy: 4 };
    await patrolService.addWaypoint(RANGER, 'sess-1', gps);

    expect(prisma.waypoint.create).toHaveBeenCalledWith({
      data: { patrolSessionId: 'sess-1', latitude: 0, longitude: 1, timestamp: gps.timestamp, source: LocationSource.GPS, accuracy: 4, note: undefined }
    });
    expect(prisma.patrolSession.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'sess-1' },
      data: { totalDistanceKm: 111.195, durationSeconds: 1800 }
    });
  });

  test('records a manual waypoint with its source and observation note', async () => {
    prisma.patrolSession.findUnique.mockResolvedValue(sessionRow());
    prisma.patrolSession.update.mockImplementation(echoSession());

    await patrolService.addWaypoint(RANGER, 'sess-1', point(6.48, 80.895, LocationSource.MANUAL, 'Snare found near fence'));

    expect(prisma.waypoint.create.mock.calls[0][0].data).toMatchObject({ source: LocationSource.MANUAL, note: 'Snare found near fence', latitude: 6.48, longitude: 80.895 });
    // The first waypoint of a patrol has no distance yet.
    expect(prisma.patrolSession.update.mock.calls[0][0].data.totalDistanceKm).toBe(0);
  });

  test.each([
    [-90, -180],
    [90, 180]
  ])('accepts boundary coordinates (%d, %d)', async (latitude, longitude) => {
    prisma.patrolSession.findUnique.mockResolvedValue(sessionRow());
    prisma.patrolSession.update.mockImplementation(echoSession());

    await patrolService.addWaypoint(RANGER, 'sess-1', point(latitude, longitude));

    expect(prisma.waypoint.create.mock.calls[0][0].data).toMatchObject({ latitude, longitude });
  });

  test('uses the current time when a waypoint has no timestamp', async () => {
    prisma.patrolSession.findUnique.mockResolvedValue(sessionRow());
    prisma.patrolSession.update.mockImplementation(echoSession());

    await patrolService.addWaypoint(RANGER, 'sess-1', { ...point(1, 1), timestamp: undefined as unknown as Date });

    expect(prisma.waypoint.create.mock.calls[0][0].data.timestamp).toBeInstanceOf(Date);
  });

  test.each([
    [{ latitude: 90.5 }, 'Invalid latitude: must be between -90 and 90 degrees.'],
    [{ latitude: -91 }, 'Invalid latitude: must be between -90 and 90 degrees.'],
    [{ longitude: 180.5 }, 'Invalid longitude: must be between -180 and 180 degrees.'],
    [{ longitude: -181 }, 'Invalid longitude: must be between -180 and 180 degrees.']
  ])('rejects invalid coordinates %o before touching the database', async (override, message) => {
    await expect(patrolService.addWaypoint(RANGER, 'sess-1', { ...point(0, 0), ...override })).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR', message: message });
    expect(prisma.patrolSession.findUnique).not.toHaveBeenCalled();
  });

  test('rejects an unknown session', async () => {
    prisma.patrolSession.findUnique.mockResolvedValue(null);
    await expect(patrolService.addWaypoint(RANGER, 'missing', point(1, 1))).rejects.toThrow('Patrol session not found.');
  });

  test("rejects a waypoint on another ranger's session", async () => {
    prisma.patrolSession.findUnique.mockResolvedValue(sessionRow({ rangerId: 'R-OTHER' }));
    await expect(patrolService.addWaypoint(RANGER, 'sess-1', point(1, 1))).rejects.toThrow('Unauthorized: Patrol session does not belong to this ranger.');
    expect(prisma.waypoint.create).not.toHaveBeenCalled();
  });

  test.each([PatrolStatus.PAUSED, PatrolStatus.COMPLETED, PatrolStatus.CANCELLED])('rejects a waypoint while the session is %s', async status => {
    prisma.patrolSession.findUnique.mockResolvedValue(sessionRow({ status }));
    await expect(patrolService.addWaypoint(RANGER, 'sess-1', point(1, 1))).rejects.toMatchObject({ statusCode: 409, code: 'INVALID_STATE_TRANSITION', message: 'Cannot add waypoints to a patrol session that is not ACTIVE.' });
    expect(prisma.waypoint.create).not.toHaveBeenCalled();
  });

  test('propagates a waypoint write failure without updating the session totals', async () => {
    prisma.patrolSession.findUnique.mockResolvedValue(sessionRow());
    prisma.waypoint.create.mockRejectedValue(new Error('write failed'));

    await expect(patrolService.addWaypoint(RANGER, 'sess-1', point(1, 1))).rejects.toThrow('write failed');
    expect(prisma.patrolSession.update).not.toHaveBeenCalled();
  });
});

describe('E. pause and resume', () => {
  test('pauses an ACTIVE session and resumes a PAUSED session', async () => {
    prisma.patrolSession.findUnique.mockResolvedValueOnce(sessionRow()).mockResolvedValueOnce(sessionRow({ status: PatrolStatus.PAUSED }));
    prisma.patrolSession.update.mockImplementation(echoSession());

    await expect(patrolService.pausePatrol(RANGER, 'sess-1')).resolves.toMatchObject({ status: PatrolStatus.PAUSED });
    await expect(patrolService.resumePatrol(RANGER, 'sess-1')).resolves.toMatchObject({ status: PatrolStatus.ACTIVE });
    expect(prisma.patrolSession.update.mock.calls.map(call => call[0].data)).toEqual([{ status: PatrolStatus.PAUSED }, { status: PatrolStatus.ACTIVE }]);
  });

  test('rejects pausing a session that is already paused', async () => {
    prisma.patrolSession.findUnique.mockResolvedValue(sessionRow({ status: PatrolStatus.PAUSED }));
    await expect(patrolService.pausePatrol(RANGER, 'sess-1')).rejects.toMatchObject({ statusCode: 409, code: 'INVALID_STATE_TRANSITION', message: 'Only ACTIVE patrol sessions can be paused.' });
    expect(prisma.patrolSession.update).not.toHaveBeenCalled();
  });

  test('rejects resuming a session that is not paused', async () => {
    prisma.patrolSession.findUnique.mockResolvedValue(sessionRow({ status: PatrolStatus.ACTIVE }));
    await expect(patrolService.resumePatrol(RANGER, 'sess-1')).rejects.toMatchObject({ statusCode: 409, code: 'INVALID_STATE_TRANSITION', message: 'Only PAUSED patrol sessions can be resumed.' });
  });

  test.each(['pausePatrol', 'resumePatrol'] as const)('%s rejects unknown and foreign sessions', async method => {
    prisma.patrolSession.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(sessionRow({ rangerId: 'R-OTHER' }));
    await expect(patrolService[method](RANGER, 'missing')).rejects.toThrow('Patrol session not found.');
    await expect(patrolService[method](RANGER, 'sess-1')).rejects.toThrow('Unauthorized');
  });
});

describe('F. complete patrol', () => {
  const end = new Date('2026-10-01T08:05:00.000Z');

  test('completes an ACTIVE patrol with end time, duration, distance and completed assignment', async () => {
    prisma.patrolSession.findUnique.mockResolvedValue(sessionRow({ waypoints: [point(0, 0), point(0, 1), point(1, 1)] }));
    prisma.patrolSession.update.mockImplementation(echoSession());

    const completed = await patrolService.completePatrol(RANGER, 'sess-1', end);

    expect(prisma.patrolSession.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'sess-1' },
      data: { status: PatrolStatus.COMPLETED, endTime: end, durationSeconds: 7500, totalDistanceKm: 222.39, syncStatus: SyncStatus.SYNCED }
    });
    // Any other open session of the ranger is closed so only one patrol can be in progress.
    expect(prisma.patrolSession.updateMany).toHaveBeenCalledWith({
      where: { rangerId: RANGER, status: { in: [PatrolStatus.ACTIVE, PatrolStatus.PAUSED] } },
      data: { status: PatrolStatus.COMPLETED, endTime: end }
    });
    expect(prisma.patrolAssignment.update).toHaveBeenCalledWith({ where: { id: 'assign-1' }, data: { status: PatrolStatus.COMPLETED } });
    expect(completed).toMatchObject({ _id: 'sess-1', status: PatrolStatus.COMPLETED });
  });

  test.each([
    ['no waypoints', [], 0],
    ['one waypoint', [point(0, 0)], 0],
    ['two waypoints', [point(0, 0), point(0, 1)], 111.195]
  ])('records the distance for a patrol with %s', async (_label, waypoints, distance) => {
    prisma.patrolSession.findUnique.mockResolvedValue(sessionRow({ waypoints }));
    prisma.patrolSession.update.mockImplementation(echoSession());

    await patrolService.completePatrol(RANGER, 'sess-1', end);

    expect(prisma.patrolSession.update.mock.calls[0][0].data.totalDistanceKm).toBe(distance);
  });

  test('a PAUSED patrol can be completed', async () => {
    prisma.patrolSession.findUnique.mockResolvedValue(sessionRow({ status: PatrolStatus.PAUSED }));
    prisma.patrolSession.update.mockImplementation(echoSession());

    await expect(patrolService.completePatrol(RANGER, 'sess-1', end)).resolves.toMatchObject({ status: PatrolStatus.COMPLETED });
  });

  test('an end time before the start never produces a negative duration', async () => {
    prisma.patrolSession.findUnique.mockResolvedValue(sessionRow());
    prisma.patrolSession.update.mockImplementation(echoSession());

    await patrolService.completePatrol(RANGER, 'sess-1', new Date('2026-10-01T05:00:00.000Z'));

    expect(prisma.patrolSession.update.mock.calls[0][0].data.durationSeconds).toBe(0);
  });

  test('rejects an already COMPLETED patrol', async () => {
    prisma.patrolSession.findUnique.mockResolvedValue(sessionRow({ status: PatrolStatus.COMPLETED }));
    await expect(patrolService.completePatrol(RANGER, 'sess-1', end)).rejects.toMatchObject({ statusCode: 409, code: 'INVALID_STATE_TRANSITION', message: 'Patrol session is already COMPLETED.' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // Regression: a cancelled patrol used to be silently turned into a COMPLETED one.
  test('rejects completing a CANCELLED patrol', async () => {
    prisma.patrolSession.findUnique.mockResolvedValue(sessionRow({ status: PatrolStatus.CANCELLED }));
    await expect(patrolService.completePatrol(RANGER, 'sess-1', end)).rejects.toMatchObject({ statusCode: 409, code: 'INVALID_STATE_TRANSITION', message: 'Cancelled patrol session cannot be completed.' });
    expect(prisma.patrolAssignment.update).not.toHaveBeenCalled();
  });

  test('rejects unknown and foreign sessions', async () => {
    prisma.patrolSession.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(sessionRow({ rangerId: 'R-OTHER' }));
    await expect(patrolService.completePatrol(RANGER, 'missing', end)).rejects.toThrow('Patrol session not found.');
    await expect(patrolService.completePatrol(RANGER, 'sess-1', end)).rejects.toThrow('Unauthorized');
  });

  test('propagates an update failure and leaves the assignment untouched', async () => {
    prisma.patrolSession.findUnique.mockResolvedValue(sessionRow());
    prisma.patrolSession.update.mockRejectedValue(new Error('update failed'));

    await expect(patrolService.completePatrol(RANGER, 'sess-1', end)).rejects.toThrow('update failed');
    expect(prisma.patrolAssignment.update).not.toHaveBeenCalled();
  });
});

describe('G. cancel patrol', () => {
  test.each([PatrolStatus.ACTIVE, PatrolStatus.PAUSED])('cancels a %s patrol and returns the assignment to ASSIGNED', async status => {
    jest.useFakeTimers({ now: new Date('2026-10-01T07:00:00.000Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    prisma.patrolSession.findUnique.mockResolvedValue(sessionRow({ status }));
    prisma.patrolSession.update.mockImplementation(echoSession());

    const cancelled = await patrolService.cancelPatrol(RANGER, 'sess-1');

    expect(prisma.patrolSession.update.mock.calls[0][0].data).toEqual({
      status: PatrolStatus.CANCELLED,
      endTime: new Date('2026-10-01T07:00:00.000Z'),
      durationSeconds: 3600
    });
    expect(prisma.patrolAssignment.update).toHaveBeenCalledWith({ where: { id: 'assign-1' }, data: { status: PatrolStatus.ASSIGNED } });
    expect(cancelled.status).toBe(PatrolStatus.CANCELLED);
  });

  test('rejects cancelling a COMPLETED patrol', async () => {
    prisma.patrolSession.findUnique.mockResolvedValue(sessionRow({ status: PatrolStatus.COMPLETED }));
    await expect(patrolService.cancelPatrol(RANGER, 'sess-1')).rejects.toMatchObject({ statusCode: 409, code: 'INVALID_STATE_TRANSITION', message: 'Completed patrol session cannot be cancelled.' });
    expect(prisma.patrolSession.update).not.toHaveBeenCalled();
  });

  test('rejects unknown and foreign sessions', async () => {
    prisma.patrolSession.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(sessionRow({ rangerId: 'R-OTHER' }));
    await expect(patrolService.cancelPatrol(RANGER, 'missing')).rejects.toThrow('Patrol session not found.');
    await expect(patrolService.cancelPatrol(RANGER, 'sess-1')).rejects.toThrow('Unauthorized');
  });
});

describe('session reads', () => {
  test("getPatrolSession returns the ranger's session and rejects others", async () => {
    prisma.patrolSession.findUnique
      .mockResolvedValueOnce(sessionRow())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(sessionRow({ rangerId: 'R-OTHER' }));

    await expect(patrolService.getPatrolSession(RANGER, 'sess-1')).resolves.toMatchObject({ _id: 'sess-1', patrolAssignment: { _id: 'assign-1' } });
    await expect(patrolService.getPatrolSession(RANGER, 'missing')).rejects.toThrow('Patrol session not found.');
    await expect(patrolService.getPatrolSession(RANGER, 'sess-1')).rejects.toThrow('Unauthorized');
  });

  test("getPatrolHistory lists only the ranger's sessions, newest first", async () => {
    prisma.patrolSession.findMany.mockResolvedValue([sessionRow({ id: 'newer' }), sessionRow({ id: 'older', patrolAssignment: null })]);

    const history = await patrolService.getPatrolHistory(RANGER);

    expect(prisma.patrolSession.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { rangerId: RANGER }, orderBy: { startTime: 'desc' } }));
    expect(history.map((session: { _id: string }) => session._id)).toEqual(['newer', 'older']);
    expect(history[1].patrolAssignment).toBeNull();
  });
});

describe('offline patrol synchronisation', () => {
  const payload = (overrides: Record<string, unknown> = {}) => ({
    clientSessionId: 'sess-offline-1',
    patrolAssignmentId: 'assign-1',
    startTime: START,
    endTime: new Date('2026-10-01T08:00:00.000Z'),
    status: PatrolStatus.COMPLETED,
    waypoints: [point(6.475, 80.88), point(6.482, 80.895, LocationSource.MANUAL, 'Snare removed'), point(6.49, 80.91)],
    totalDistanceKm: 99,
    durationSeconds: 1,
    ...overrides
  });

  test('creates a synced session from a completed offline patrol with all waypoints', async () => {
    prisma.patrolSession.findFirst.mockResolvedValue(null);
    prisma.patrolAssignment.findUnique.mockResolvedValue(assignmentRow());
    prisma.patrolSession.create.mockImplementation(echoSession());

    await patrolService.syncPatrolSession(RANGER, 'Ranger One', payload());

    const data = prisma.patrolSession.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      clientSessionId: 'sess-offline-1',
      rangerId: RANGER,
      patrolAssignmentId: 'assign-1',
      patrolRouteId: 'route-1',
      status: PatrolStatus.COMPLETED,
      syncStatus: SyncStatus.SYNCED,
      // Duration and distance are recalculated from the uploaded data, not trusted from the client.
      durationSeconds: 7200,
      totalDistanceKm: 3.712
    });
    expect(data.waypoints.create).toEqual([
      expect.objectContaining({ latitude: 6.475, source: LocationSource.GPS }),
      expect.objectContaining({ latitude: 6.482, source: LocationSource.MANUAL, note: 'Snare removed' }),
      expect.objectContaining({ latitude: 6.49, source: LocationSource.GPS })
    ]);
    expect(prisma.patrolAssignment.update).toHaveBeenCalledWith({ where: { id: 'assign-1' }, data: { status: PatrolStatus.COMPLETED } });
  });

  test('an ACTIVE offline patrol keeps the client duration and activates the assignment', async () => {
    prisma.patrolSession.findFirst.mockResolvedValue(null);
    prisma.patrolAssignment.findUnique.mockResolvedValue(assignmentRow());
    prisma.patrolSession.create.mockImplementation(echoSession());

    await patrolService.syncPatrolSession(RANGER, 'Ranger One', payload({ status: PatrolStatus.ACTIVE, endTime: null, durationSeconds: 900, waypoints: [] }));

    expect(prisma.patrolSession.create.mock.calls[0][0].data).toMatchObject({ durationSeconds: 900, totalDistanceKm: 0, endTime: null, waypoints: { create: [] } });
    expect(prisma.patrolAssignment.update).toHaveBeenCalledWith({ where: { id: 'assign-1' }, data: { status: PatrolStatus.ACTIVE } });
  });

  test('a retried sync replaces the waypoints of the existing session instead of duplicating it', async () => {
    prisma.patrolSession.findFirst.mockResolvedValue(sessionRow({ id: 'server-sess', clientSessionId: 'sess-offline-1', durationSeconds: 42 }));
    prisma.patrolAssignment.findUnique.mockResolvedValue(assignmentRow());
    prisma.patrolSession.update.mockImplementation(echoSession());

    await patrolService.syncPatrolSession(RANGER, 'Ranger One', payload({ durationSeconds: undefined }));

    expect(prisma.waypoint.deleteMany).toHaveBeenCalledWith({ where: { patrolSessionId: 'server-sess' } });
    const update = prisma.patrolSession.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'server-sess' });
    expect(update.data).toMatchObject({ status: PatrolStatus.COMPLETED, durationSeconds: 42, totalDistanceKm: 3.712 });
    expect(update.data.waypoints.create).toHaveLength(3);
    expect(prisma.patrolSession.create).not.toHaveBeenCalled();
  });

  test('a client-only (stale) assignment id is resolved to the ranger server assignment', async () => {
    prisma.patrolAssignment.findUnique.mockResolvedValue(null);
    mockSeededRanger({ assignment: assignmentRow({ id: 'server-assign' }) });
    prisma.patrolSession.findFirst.mockResolvedValue(null);
    prisma.patrolSession.create.mockImplementation(echoSession());

    await patrolService.syncPatrolSession(RANGER, 'Ranger One', payload({ patrolAssignmentId: 'assign-seed-01' }));

    expect(prisma.patrolSession.create.mock.calls[0][0].data.patrolAssignmentId).toBe('server-assign');
  });

  test("rejects syncing onto another ranger's assignment", async () => {
    prisma.patrolSession.findFirst.mockResolvedValue(null);
    prisma.patrolAssignment.findUnique.mockResolvedValue(assignmentRow({ rangerId: 'R-OTHER' }));

    await expect(patrolService.syncPatrolSession(RANGER, 'Ranger One', payload())).rejects.toThrow('Unauthorized: Patrol assignment does not belong to this ranger.');
    expect(prisma.patrolSession.create).not.toHaveBeenCalled();
  });

  test('fails when no assignment can be resolved', async () => {
    prisma.patrolSession.findFirst.mockResolvedValue(null);
    prisma.patrolAssignment.findUnique.mockResolvedValue(null);
    mockSeededRanger({ assignment: null, createdAssignment: null });

    await expect(patrolService.syncPatrolSession(RANGER, 'Ranger One', payload())).rejects.toMatchObject({ statusCode: 404, code: 'ASSIGNMENT_NOT_FOUND', message: 'Failed to resolve assignment for sync.' });
  });

  test('propagates a database failure during sync', async () => {
    prisma.patrolSession.findFirst.mockRejectedValue(new Error('timeout'));
    await expect(patrolService.syncPatrolSession(RANGER, 'Ranger One', payload())).rejects.toThrow('timeout');
  });
});
