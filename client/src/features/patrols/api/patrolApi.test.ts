import type { MockInstance } from 'vitest';
import { http } from '../../../shared/api/http';
import { offlineDb } from '../../../offline/db';
import { syncService } from '../../../offline/syncService';
import { LocationSource, PatrolStatus, SyncStatus } from '../../../shared/types/enums';
import { patrolApi } from './patrolApi';
import type { PatrolSession, Waypoint } from '../types/patrol';

// UC-A patrol API: online requests, offline fallback to IndexedDB (fake-indexeddb) and the
// PATROL_SESSION sync transport. HTTP is mocked; Dexie and the shared SyncService are real.
const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
const httpError = (status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: { success: false, error: { message: 'Rejected' } } } });
const ok = (data: unknown) => ({ data: { success: true, data } });

const serverSession = (overrides: Partial<PatrolSession> = {}): PatrolSession => ({
  _id: 'srv-1',
  clientSessionId: 'sess-c1',
  rangerId: 'R-101',
  rangerName: 'Ranger John',
  patrolAssignment: 'assign-1',
  patrolRoute: { _id: 'route-1', name: 'Udawalawe Reservoir Elephant Patrol', park: 'park-1', description: '', distanceKm: 15, estimatedDurationHours: 4, geometry: { type: 'LineString', coordinates: [] } },
  startTime: '2026-10-01T06:00:00.000Z',
  endTime: null,
  status: PatrolStatus.ACTIVE,
  syncStatus: SyncStatus.SYNCED,
  waypoints: [],
  totalDistanceKm: 0,
  durationSeconds: 0,
  ...overrides
});
const gps = (latitude: number, longitude: number): Omit<Waypoint, '_id'> => ({ latitude, longitude, timestamp: '2026-10-01T06:30:00.000Z', source: LocationSource.GPS, accuracy: 5 });
const manual = (latitude: number, longitude: number, note: string): Omit<Waypoint, '_id'> => ({ latitude, longitude, timestamp: '2026-10-01T06:40:00.000Z', source: LocationSource.MANUAL, note });

async function storeLocal(session: PatrolSession, syncStatus = SyncStatus.SYNCED) {
  return offlineDb.patrolSessions.add({ remoteId: session._id, syncStatus, createdAt: session.startTime, updatedAt: session.startTime, payload: session });
}
const localSessions = async () => (await offlineDb.patrolSessions.toArray()).map(record => ({ ...record, payload: record.payload as PatrolSession }));
const queue = () => offlineDb.syncQueue.toArray();
const goOffline = () => window.dispatchEvent(new Event('offline'));
const goOnline = () => window.dispatchEvent(new Event('online'));
const isProcessing = () => (syncService as unknown as { isProcessing: boolean }).isProcessing;

type HttpMock = MockInstance<(url: string, body?: any) => Promise<unknown>>;
let get: HttpMock;
let post: HttpMock;

beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  get = vi.spyOn(http, 'get') as unknown as HttpMock;
  post = vi.spyOn(http, 'post') as unknown as HttpMock;
  await Promise.all([offlineDb.patrolSessions.clear(), offlineDb.waypoints.clear(), offlineDb.syncQueue.clear()]);
});

afterEach(async () => {
  // Let any sync batch started by the test finish before the next test clears IndexedDB.
  await vi.waitFor(() => expect(isProcessing()).toBe(false));
  vi.restoreAllMocks();
});

describe('online patrol requests', () => {
  beforeEach(() => goOnline());

  test('getMyAssignment returns the server assignment and caches the active session as SYNCED', async () => {
    const assignment = { _id: 'assign-1', rangerId: 'R-101', status: PatrolStatus.ACTIVE };
    const active = serverSession();
    get.mockResolvedValue(ok({ assignment, assignments: [assignment], activeSession: active }));

    const result = await patrolApi.getMyAssignment();

    expect(get).toHaveBeenCalledWith('/patrols/my-assignment');
    expect(result).toEqual({ assignment, assignments: [assignment], activeSession: active });
    const [cached] = await localSessions();
    expect(cached).toMatchObject({ remoteId: 'srv-1', syncStatus: SyncStatus.SYNCED, payload: { _id: 'srv-1', status: PatrolStatus.ACTIVE } });
  });

  test('getMyAssignment closes stale local active sessions when the server reports none', async () => {
    await storeLocal(serverSession({ _id: 'stale', status: PatrolStatus.PAUSED }));
    await storeLocal(serverSession({ _id: 'done', status: PatrolStatus.COMPLETED }));
    get.mockResolvedValue(ok({ assignment: null, assignments: [], activeSession: null }));

    const result = await patrolApi.getMyAssignment();

    expect(result.activeSession).toBeNull();
    // With no server assignment the built-in scheduled assignment is offered.
    expect(result.assignment?._id).toBe('assign-seed-01');
    expect(result.assignments.map(a => a._id)).toEqual(['assign-seed-01']);
    expect((await localSessions()).map(s => [s.payload._id, s.payload.status])).toEqual([
      ['stale', PatrolStatus.COMPLETED],
      ['done', PatrolStatus.COMPLETED]
    ]);
  });

  test('getRouteById returns the server route', async () => {
    get.mockResolvedValue(ok({ _id: 'route-9', name: 'Northern fence' }));

    await expect(patrolApi.getRouteById('route-9')).resolves.toEqual({ _id: 'route-9', name: 'Northern fence' });
    expect(get).toHaveBeenCalledWith('/patrols/routes/route-9');
  });

  test('startPatrol posts the assignment with a new client session id and caches the session', async () => {
    post.mockResolvedValue(ok(serverSession()));

    const session = await patrolApi.startPatrol('assign-seed-01');

    expect(post).toHaveBeenCalledWith('/patrols/sessions', { assignmentId: 'assign-seed-01', clientSessionId: expect.stringMatching(/^sess-\d+-[a-z0-9]+$/) });
    expect(session._id).toBe('srv-1');
    expect(await localSessions()).toEqual([expect.objectContaining({ remoteId: 'srv-1', syncStatus: SyncStatus.SYNCED })]);
    expect(await queue()).toEqual([]);
  });

  test('each start uses a unique client session id', async () => {
    post.mockResolvedValue(ok(serverSession()));

    await patrolApi.startPatrol();
    await patrolApi.startPatrol();

    const [first, second] = post.mock.calls.map(call => (call[1] as { clientSessionId: string }).clientSessionId);
    expect(first).not.toBe(second);
  });

  test('addWaypoint posts the waypoint and stores the server session locally', async () => {
    const id = await storeLocal(serverSession());
    const updated = serverSession({ waypoints: [{ ...gps(6.475, 80.88), _id: 'wp-1' }] });
    post.mockResolvedValue(ok(updated));

    const result = await patrolApi.addWaypoint('srv-1', gps(6.475, 80.88));

    expect(post).toHaveBeenCalledWith('/patrols/sessions/srv-1/waypoints', gps(6.475, 80.88));
    expect(result).toEqual(updated);
    expect((await offlineDb.patrolSessions.get(id))?.payload).toEqual(updated);
    expect(await offlineDb.waypoints.toArray()).toEqual([expect.objectContaining({ remoteId: 'srv-1', syncStatus: SyncStatus.SYNCED, payload: gps(6.475, 80.88) })]);
  });

  test.each([
    [{ latitude: 90.1 }, 'Invalid latitude: must be between -90 and 90 degrees.'],
    [{ latitude: -90.1 }, 'Invalid latitude: must be between -90 and 90 degrees.'],
    [{ longitude: 180.1 }, 'Invalid longitude: must be between -180 and 180 degrees.'],
    [{ longitude: -180.1 }, 'Invalid longitude: must be between -180 and 180 degrees.']
  ])('addWaypoint rejects %o without a request', async (override, message) => {
    await expect(patrolApi.addWaypoint('srv-1', { ...gps(0, 0), ...override })).rejects.toThrow(message);
    expect(post).not.toHaveBeenCalled();
  });

  test.each([
    ['pausePatrol', 'pause', PatrolStatus.PAUSED],
    ['resumePatrol', 'resume', PatrolStatus.ACTIVE]
  ] as const)('%s calls its endpoint and marks the local session SYNCED', async (method, action, status) => {
    const id = await storeLocal(serverSession(), SyncStatus.PENDING);
    post.mockResolvedValue(ok(serverSession({ status })));

    const result = await patrolApi[method]('srv-1');

    expect(post).toHaveBeenCalledWith(`/patrols/sessions/srv-1/${action}`);
    expect(result.status).toBe(status);
    expect(await offlineDb.patrolSessions.get(id)).toMatchObject({ syncStatus: SyncStatus.SYNCED, payload: { status } });
  });

  test('cancelPatrol sends the reason and stores the cancelled session', async () => {
    const id = await storeLocal(serverSession());
    post.mockResolvedValue(ok(serverSession({ status: PatrolStatus.CANCELLED })));

    await patrolApi.cancelPatrol('srv-1', 'Vehicle breakdown');

    expect(post).toHaveBeenCalledWith('/patrols/sessions/srv-1/cancel', { reason: 'Vehicle breakdown' });
    expect((await offlineDb.patrolSessions.get(id))?.payload).toMatchObject({ status: PatrolStatus.CANCELLED });
  });

  test('completePatrol sends the end time, stores the result and closes other stale local patrols', async () => {
    const id = await storeLocal(serverSession());
    const otherId = await storeLocal(serverSession({ _id: 'old-active', clientSessionId: 'old' }));
    const completed = serverSession({ status: PatrolStatus.COMPLETED, endTime: '2026-10-01T08:00:00.000Z' });
    post.mockResolvedValue(ok(completed));

    await patrolApi.completePatrol('srv-1', '2026-10-01T08:00:00.000Z');

    expect(post).toHaveBeenCalledWith('/patrols/sessions/srv-1/complete', { endTime: '2026-10-01T08:00:00.000Z' });
    expect(await offlineDb.patrolSessions.get(id)).toMatchObject({ syncStatus: SyncStatus.SYNCED, payload: completed });
    expect((await offlineDb.patrolSessions.get(otherId))?.payload).toMatchObject({ status: PatrolStatus.COMPLETED });
  });

  test('getSessionById returns the server session', async () => {
    get.mockResolvedValue(ok(serverSession()));
    await expect(patrolApi.getSessionById('srv-1')).resolves.toMatchObject({ _id: 'srv-1' });
    expect(get).toHaveBeenCalledWith('/patrols/sessions/srv-1');
  });

  test('getPatrolHistory caches server sessions that are not stored locally yet', async () => {
    await storeLocal(serverSession({ _id: 'known' }));
    get.mockResolvedValue(ok([serverSession({ _id: 'known' }), serverSession({ _id: 'new-one' })]));

    const history = await patrolApi.getPatrolHistory();

    expect(get).toHaveBeenCalledWith('/patrols/sessions/history');
    expect(history.map(s => s._id)).toEqual(['known', 'new-one']);
    expect((await localSessions()).map(s => s.remoteId).sort()).toEqual(['known', 'new-one']);
  });
});

describe('offline patrol behaviour', () => {
  beforeEach(() => {
    goOffline();
    get.mockRejectedValue(networkError());
    post.mockRejectedValue(networkError());
  });

  test('getMyAssignment falls back to the scheduled assignment and the cached in-progress session', async () => {
    await storeLocal(serverSession({ status: PatrolStatus.PAUSED }));

    const result = await patrolApi.getMyAssignment();

    expect(result.assignment?._id).toBe('assign-seed-01');
    expect(result.activeSession).toMatchObject({ _id: 'srv-1', status: PatrolStatus.PAUSED });
  });

  test('getRouteById falls back to the offline route', async () => {
    await expect(patrolApi.getRouteById('route-seed-udawalawe-01')).resolves.toMatchObject({ name: 'Udawalawe Reservoir Elephant Patrol' });
    await expect(patrolApi.getRouteById('unknown-route')).resolves.toMatchObject({ _id: 'route-seed-udawalawe-01' });
  });

  test('startPatrol creates a PENDING local session and queues a CREATE sync item', async () => {
    const session = await patrolApi.startPatrol();

    expect(session).toMatchObject({ status: PatrolStatus.ACTIVE, syncStatus: SyncStatus.PENDING, waypoints: [], totalDistanceKm: 0, rangerId: 'R-101' });
    expect(session._id).toBe(session.clientSessionId);
    const [local] = await localSessions();
    expect(local).toMatchObject({ remoteId: session._id, syncStatus: SyncStatus.PENDING, payload: { _id: session._id, status: PatrolStatus.ACTIVE } });
    expect(await queue()).toEqual([
      expect.objectContaining({ entity: 'PATROL_SESSION', operation: 'CREATE', recordId: local.id, clientId: session.clientSessionId, status: SyncStatus.PENDING, attempts: 0 })
    ]);
  });

  test('a server rejection while starting is treated like lost connectivity and the patrol starts locally', async () => {
    goOnline();
    post.mockRejectedValue(httpError(500));

    const session = await patrolApi.startPatrol();

    expect(session.syncStatus).toBe(SyncStatus.PENDING);
    expect(await localSessions()).toHaveLength(1);
  });

  test('startPatrol reports a device storage failure instead of losing the patrol silently', async () => {
    vi.spyOn(offlineDb.patrolSessions, 'put').mockRejectedValueOnce(new Error('QuotaExceededError'));

    await expect(patrolApi.startPatrol()).rejects.toThrow('Unable to save patrol data locally. Please check device storage before proceeding.');
  });

  test('GPS and manual waypoints are appended locally with distance, kept PENDING and queued', async () => {
    const started = await patrolApi.startPatrol();

    await patrolApi.addWaypoint(started._id, gps(0, 0));
    const session = await patrolApi.addWaypoint(started._id, manual(0, 1, 'Fresh elephant dung'));

    expect(session).toMatchObject({ syncStatus: SyncStatus.PENDING, totalDistanceKm: 111.195 });
    expect(session.waypoints.map(w => w.source)).toEqual([LocationSource.GPS, LocationSource.MANUAL]);
    const [local] = await localSessions();
    expect(local.payload.waypoints).toEqual([gps(0, 0), manual(0, 1, 'Fresh elephant dung')]);
    expect((await offlineDb.waypoints.toArray()).map(w => [w.remoteId, w.syncStatus])).toEqual([
      [started._id, SyncStatus.PENDING],
      [started._id, SyncStatus.PENDING]
    ]);
    expect((await queue()).map(item => [item.operation, item.clientId])).toEqual([
      ['CREATE', started.clientSessionId],
      ['UPDATE', started.clientSessionId]
    ]);
  });

  test('addWaypoint fails clearly when the session is not stored on the device', async () => {
    await expect(patrolApi.addWaypoint('unknown', gps(1, 1))).rejects.toThrow('Active patrol session not found in local storage.');
  });

  test.each([PatrolStatus.COMPLETED, PatrolStatus.CANCELLED])('a %s patrol accepts no further offline waypoints', async status => {
    await storeLocal(serverSession({ status, waypoints: [{ ...gps(0, 0) }] }));

    await expect(patrolApi.addWaypoint('srv-1', gps(1, 1))).rejects.toThrow('Completed or cancelled patrol cannot accept new waypoints.');
    expect((await localSessions())[0].payload.waypoints).toHaveLength(1);
  });

  test('addWaypoint reports a device storage failure', async () => {
    const started = await patrolApi.startPatrol();
    vi.spyOn(offlineDb.waypoints, 'add').mockRejectedValueOnce(new Error('disk full'));

    await expect(patrolApi.addWaypoint(started._id, gps(1, 1))).rejects.toThrow('Unable to save waypoint locally. Device storage error.');
  });

  test('completePatrol completes locally with duration and distance, and queues the change', async () => {
    const started = await patrolApi.startPatrol();
    await patrolApi.addWaypoint(started._id, gps(0, 0));
    await patrolApi.addWaypoint(started._id, gps(0, 1));
    const otherId = await storeLocal(serverSession({ _id: 'old-active', clientSessionId: 'old' }));
    const endTime = new Date(new Date(started.startTime).getTime() + 3600 * 1000).toISOString();

    const completed = await patrolApi.completePatrol(started._id, endTime);

    expect(completed).toMatchObject({ status: PatrolStatus.COMPLETED, endTime, durationSeconds: 3600, totalDistanceKm: 111.195, syncStatus: SyncStatus.PENDING });
    const local = (await localSessions()).find(s => s.remoteId === started._id)!;
    expect(local).toMatchObject({ syncStatus: SyncStatus.PENDING, payload: { status: PatrolStatus.COMPLETED, endTime } });
    expect((await offlineDb.patrolSessions.get(otherId))?.payload).toMatchObject({ status: PatrolStatus.COMPLETED });
    expect((await queue()).filter(item => item.operation === 'UPDATE')).toHaveLength(1);
  });

  test('completePatrol fails clearly for a session that is not on the device', async () => {
    await expect(patrolApi.completePatrol('unknown')).rejects.toThrow('Active patrol session not found in local storage.');
  });

  test('completePatrol reports a failure to queue the completion', async () => {
    const started = await patrolApi.startPatrol();
    vi.spyOn(syncService, 'enqueue').mockRejectedValueOnce(new Error('queue unavailable'));

    await expect(patrolApi.completePatrol(started._id)).rejects.toThrow('Unable to save completion status locally. Please do not close app.');
  });

  test('pause and resume change the local status and mark it PENDING', async () => {
    const id = await storeLocal(serverSession());

    await expect(patrolApi.pausePatrol('srv-1')).resolves.toMatchObject({ status: PatrolStatus.PAUSED, syncStatus: SyncStatus.PENDING });
    expect(await offlineDb.patrolSessions.get(id)).toMatchObject({ syncStatus: SyncStatus.PENDING, payload: { status: PatrolStatus.PAUSED } });
    await expect(patrolApi.resumePatrol('srv-1')).resolves.toMatchObject({ status: PatrolStatus.ACTIVE, syncStatus: SyncStatus.PENDING });
  });

  test.each(['pausePatrol', 'resumePatrol', 'cancelPatrol'] as const)('%s fails clearly for a session that is not on the device', async method => {
    await expect(patrolApi[method]('unknown')).rejects.toThrow('Active patrol session not found in local storage.');
  });

  // Regression: offline cancellation was stored locally but never queued, so the server kept the patrol ACTIVE.
  test('cancelPatrol cancels locally and queues the cancellation for sync', async () => {
    const id = await storeLocal(serverSession());

    const cancelled = await patrolApi.cancelPatrol('srv-1', 'Storm');

    expect(cancelled).toMatchObject({ status: PatrolStatus.CANCELLED, syncStatus: SyncStatus.PENDING });
    expect(cancelled.endTime).toEqual(expect.any(String));
    expect(await queue()).toEqual([expect.objectContaining({ operation: 'UPDATE', recordId: id, clientId: 'sess-c1' })]);
  });

  test('getSessionById serves the stored session, and fails when there is none', async () => {
    await storeLocal(serverSession({ status: PatrolStatus.COMPLETED }));

    await expect(patrolApi.getSessionById('sess-c1')).resolves.toMatchObject({ _id: 'srv-1', status: PatrolStatus.COMPLETED });
    await expect(patrolApi.getSessionById('unknown')).rejects.toThrow('Patrol session not found in local or central storage.');
  });

  test('getPatrolHistory seeds the demo history on an empty device', async () => {
    const history = await patrolApi.getPatrolHistory();

    expect(history.map(s => s._id)).toEqual(['sess-demo-yala-01']);
    expect(await localSessions()).toHaveLength(1);
  });

  test('getPatrolHistory lists stored sessions newest first', async () => {
    await storeLocal(serverSession({ _id: 'older', startTime: '2026-09-01T06:00:00.000Z' }));
    await storeLocal(serverSession({ _id: 'newer', startTime: '2026-10-01T06:00:00.000Z' }));

    expect((await patrolApi.getPatrolHistory()).map(s => s._id)).toEqual(['newer', 'older']);
  });
});

describe('patrol synchronisation', () => {
  // The server echoes the uploaded patrol as a SYNCED session.
  const echoSync = () =>
    post.mockImplementation(async (url: string, body: any) => {
      if (url !== '/patrols/sessions/sync') throw networkError();
      return ok({
        _id: `server-${body.clientSessionId}`,
        clientSessionId: body.clientSessionId,
        patrolAssignment: body.patrolAssignmentId,
        patrolRoute: { _id: body.patrolRouteId },
        startTime: body.startTime,
        endTime: body.endTime,
        status: body.status,
        waypoints: body.waypoints,
        totalDistanceKm: body.totalDistanceKm,
        durationSeconds: body.durationSeconds,
        syncStatus: SyncStatus.SYNCED
      });
    });
  const syncBodies = () => post.mock.calls.filter(call => call[0] === '/patrols/sessions/sync').map(call => call[1] as any);
  const waitForQueue = (status: SyncStatus) => vi.waitFor(async () => expect((await queue()).every(item => item.status === status)).toBe(true));

  async function completeOfflinePatrol() {
    goOffline();
    post.mockRejectedValue(networkError());
    const started = await patrolApi.startPatrol();
    await patrolApi.addWaypoint(started._id, gps(6.475, 80.88));
    await patrolApi.addWaypoint(started._id, manual(6.482, 80.895, 'Snare removed'));
    await patrolApi.addWaypoint(started._id, gps(6.49, 80.91));
    await patrolApi.completePatrol(started._id);
    return started;
  }

  test('syncSessionPayload uploads the mapped session and marks the local copy SYNCED', async () => {
    const local = serverSession({
      _id: 'sess-local',
      clientSessionId: 'sess-local',
      patrolAssignment: { _id: 'assign-obj' } as PatrolSession['patrolAssignment'],
      status: PatrolStatus.COMPLETED,
      endTime: '2026-10-01T08:00:00.000Z',
      waypoints: [gps(6.475, 80.88), manual(6.482, 80.895, 'Snare removed')],
      totalDistanceKm: 1.831,
      durationSeconds: 7200,
      syncStatus: SyncStatus.PENDING
    });
    const id = await storeLocal(local, SyncStatus.PENDING);
    post.mockResolvedValue(ok(serverSession({ _id: 'srv-9', status: PatrolStatus.COMPLETED })));

    await patrolApi.syncSessionPayload(local);

    expect(post).toHaveBeenCalledWith('/patrols/sessions/sync', {
      clientSessionId: 'sess-local',
      patrolAssignmentId: 'assign-obj',
      patrolRouteId: 'route-1',
      startTime: '2026-10-01T06:00:00.000Z',
      endTime: '2026-10-01T08:00:00.000Z',
      status: PatrolStatus.COMPLETED,
      waypoints: [gps(6.475, 80.88), manual(6.482, 80.895, 'Snare removed')],
      totalDistanceKm: 1.831,
      durationSeconds: 7200
    });
    expect(await offlineDb.patrolSessions.get(id)).toMatchObject({ syncStatus: SyncStatus.SYNCED, payload: { _id: 'srv-9' } });
  });

  test('syncSessionPayload falls back to the local id and sends an empty track when there are no waypoints', async () => {
    post.mockResolvedValue(ok(serverSession()));

    await patrolApi.syncSessionPayload({ ...serverSession({ _id: 'only-id', clientSessionId: undefined }), waypoints: undefined } as unknown as PatrolSession);

    expect(post.mock.calls[0][1]).toMatchObject({ clientSessionId: 'only-id', patrolAssignmentId: 'assign-1', waypoints: [] });
  });

  test('a failed upload keeps the local patrol unchanged', async () => {
    const local = serverSession({ status: PatrolStatus.COMPLETED, waypoints: [gps(0, 0)], syncStatus: SyncStatus.PENDING });
    const id = await storeLocal(local, SyncStatus.PENDING);
    post.mockRejectedValue(httpError(500));

    await expect(patrolApi.syncSessionPayload(local)).rejects.toThrow('status code 500');
    expect(await offlineDb.patrolSessions.get(id)).toMatchObject({ syncStatus: SyncStatus.PENDING, payload: local });
  });

  // Regression: later offline changes were merged into the first pending queue item and lost.
  test('reconnecting uploads the complete offline patrol and keeps every waypoint locally', async () => {
    const started = await completeOfflinePatrol();
    echoSync();

    goOnline();
    await waitForQueue(SyncStatus.SYNCED);

    const last = syncBodies().at(-1);
    expect(last).toMatchObject({ clientSessionId: started.clientSessionId, status: PatrolStatus.COMPLETED });
    expect(last.waypoints.map((w: Waypoint) => w.source)).toEqual([LocationSource.GPS, LocationSource.MANUAL, LocationSource.GPS]);
    expect(syncBodies().every(body => body.status === PatrolStatus.COMPLETED && body.waypoints.length === 3)).toBe(true);
    const [local] = await localSessions();
    expect(local).toMatchObject({ syncStatus: SyncStatus.SYNCED, payload: { status: PatrolStatus.COMPLETED } });
    expect(local.payload.waypoints).toHaveLength(3);
  });

  // Regression: queue items without a client id collapsed different patrols into one.
  test('two patrols recorded offline are both uploaded', async () => {
    const first = await completeOfflinePatrol();
    const second = await patrolApi.startPatrol();
    echoSync();

    goOnline();
    await waitForQueue(SyncStatus.SYNCED);

    expect(new Set(syncBodies().map(body => body.clientSessionId))).toEqual(new Set([first.clientSessionId, second.clientSessionId]));
  });

  test('an offline cancellation of an online patrol reaches the server', async () => {
    goOnline();
    post.mockResolvedValue(ok(serverSession()));
    await patrolApi.startPatrol();
    goOffline();
    post.mockRejectedValue(networkError());
    await patrolApi.cancelPatrol('srv-1');
    echoSync();

    goOnline();
    await waitForQueue(SyncStatus.SYNCED);

    expect(syncBodies()).toEqual([expect.objectContaining({ clientSessionId: 'sess-c1', status: PatrolStatus.CANCELLED })]);
  });

  test('a rejected upload marks the queue item FAILED but never deletes the local patrol', async () => {
    await completeOfflinePatrol();
    post.mockRejectedValue(httpError(400));

    goOnline();
    await waitForQueue(SyncStatus.FAILED);

    expect((await queue()).map(item => [item.status, item.attempts, item.lastError])).toEqual([
      [SyncStatus.FAILED, 1, 'Request failed with status code 400'],
      [SyncStatus.FAILED, 1, 'Request failed with status code 400']
    ]);
    const [local] = await localSessions();
    expect(local).toMatchObject({ syncStatus: SyncStatus.PENDING, payload: { status: PatrolStatus.COMPLETED } });
    expect(local.payload.waypoints).toHaveLength(3);
  });

  test('a lost connection during upload keeps the items PENDING for an automatic retry', async () => {
    await completeOfflinePatrol();
    post.mockRejectedValue(networkError());

    goOnline();
    await vi.waitFor(async () => expect((await queue()).every(item => item.attempts === 1)).toBe(true));

    expect((await queue()).map(item => item.status)).toEqual([SyncStatus.PENDING, SyncStatus.PENDING]);
    expect((await localSessions())[0].payload.waypoints).toHaveLength(3);
  });
});
