import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { LocationSource, PatrolStatus, SyncStatus } from '../../../shared/types/enums';
import type { GeoError, GeoLocation } from '../../../shared/geolocation/geolocation';
import type { PatrolAssignment, PatrolSession } from '../types/patrol';
import { usePatrol } from './usePatrol';
import { patrolApi } from '../api/patrolApi';
import { geolocationService } from '../../../shared/geolocation/geolocation';

vi.mock('../api/patrolApi', () => ({
  patrolApi: {
    getMyAssignment: vi.fn(),
    getSessionById: vi.fn(),
    startPatrol: vi.fn(),
    pausePatrol: vi.fn(),
    resumePatrol: vi.fn(),
    cancelPatrol: vi.fn(),
    addWaypoint: vi.fn(),
    completePatrol: vi.fn()
  }
}));
vi.mock('../../../shared/geolocation/geolocation', () => ({
  geolocationService: { startTracking: vi.fn(), stopTracking: vi.fn() }
}));

// UC-A usePatrol hook: loading, patrol lifecycle actions, GPS tracking and cleanup.
const api = vi.mocked(patrolApi);
const gpsService = vi.mocked(geolocationService);
const route = { _id: 'route-1', name: 'Udawalawe Reservoir Elephant Patrol', park: 'park-1', description: '', distanceKm: 15, estimatedDurationHours: 4, geometry: { type: 'LineString', coordinates: [] } };
const assignment: PatrolAssignment = { _id: 'assign-1', rangerId: 'R-101', rangerName: 'Ranger John', patrolRoute: route, assignedDate: '2026-10-01', status: PatrolStatus.ASSIGNED };
const session = (overrides: Partial<PatrolSession> = {}): PatrolSession => ({
  _id: 'sess-1',
  rangerId: 'R-101',
  rangerName: 'Ranger John',
  patrolAssignment: 'assign-1',
  patrolRoute: route,
  startTime: new Date().toISOString(),
  status: PatrolStatus.ACTIVE,
  syncStatus: SyncStatus.SYNCED,
  waypoints: [],
  totalDistanceKm: 0,
  durationSeconds: 0,
  ...overrides
});
const fix = (latitude: number, longitude: number): GeoLocation => ({ latitude, longitude, accuracy: 6, timestamp: Date.parse('2026-10-01T06:30:00.000Z') });

let gps: { onLocation: (location: GeoLocation) => void; onError: (error: GeoError) => void };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  api.getMyAssignment.mockResolvedValue({ assignment, assignments: [assignment], activeSession: null });
  gpsService.startTracking.mockImplementation((onLocation, onError) => {
    gps = { onLocation, onError };
    return 11;
  });
});
afterEach(() => {
  // Unmount before restoring mocks so no pending hook effect runs against restored mocks.
  cleanup();
  vi.restoreAllMocks();
});

async function renderLoaded(activeSession: PatrolSession | null = null) {
  api.getMyAssignment.mockResolvedValue({ assignment, assignments: [assignment], activeSession });
  const hook = renderHook(() => usePatrol());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe('loading', () => {
  test('starts loading, then exposes the assignment without a session', async () => {
    const { result } = renderHook(() => usePatrol());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current).toMatchObject({ assignment, assignments: [assignment], session: null, error: null, gpsState: 'idle' });
    expect(gpsService.startTracking).not.toHaveBeenCalled();
  });

  test('loads a specific session when a session id is given', async () => {
    api.getSessionById.mockResolvedValue(session({ status: PatrolStatus.COMPLETED }));

    const { result } = renderHook(() => usePatrol('sess-1'));

    await waitFor(() => expect(result.current.session?.status).toBe(PatrolStatus.COMPLETED));
    expect(api.getSessionById).toHaveBeenCalledWith('sess-1');
    expect(api.getMyAssignment).not.toHaveBeenCalled();
  });

  test('represents a load failure as an error message', async () => {
    api.getMyAssignment.mockRejectedValue(new Error('Server unreachable'));

    const { result } = renderHook(() => usePatrol());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Server unreachable');
  });

  test('reloads when a background sync completes or connectivity returns', async () => {
    await renderLoaded();

    act(() => window.dispatchEvent(new Event('sync-completed')));
    act(() => window.dispatchEvent(new Event('online')));

    await waitFor(() => expect(api.getMyAssignment).toHaveBeenCalledTimes(3));
  });

  test('selectAssignment switches only to a known assignment', async () => {
    const other = { ...assignment, _id: 'assign-2' };
    api.getMyAssignment.mockResolvedValue({ assignment, assignments: [assignment, other], activeSession: null });
    const { result } = renderHook(() => usePatrol());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.selectAssignment('assign-2'));
    expect(result.current.assignment?._id).toBe('assign-2');
    act(() => result.current.selectAssignment('missing'));
    expect(result.current.assignment?._id).toBe('assign-2');
  });
});

describe('starting a patrol', () => {
  test('starts the selected assignment and begins GPS tracking', async () => {
    const { result } = await renderLoaded();
    api.startPatrol.mockResolvedValue(session());

    await act(() => result.current.startPatrol());

    expect(api.startPatrol).toHaveBeenCalledWith('assign-1');
    expect(result.current.session?._id).toBe('sess-1');
    expect(result.current.gpsState).toBe('tracking');
    expect(gpsService.startTracking).toHaveBeenCalledTimes(1);
  });

  test('a patrol started offline is exposed as pending synchronisation', async () => {
    const { result } = await renderLoaded();
    api.startPatrol.mockResolvedValue(session({ _id: 'sess-local', syncStatus: SyncStatus.PENDING }));

    await act(() => result.current.startPatrol('assign-1'));

    expect(result.current.session).toMatchObject({ _id: 'sess-local', syncStatus: SyncStatus.PENDING, status: PatrolStatus.ACTIVE });
  });

  test('a start failure is reported and rethrown', async () => {
    const { result } = await renderLoaded();
    api.startPatrol.mockRejectedValue(new Error('Unable to save patrol data locally.'));

    await act(() => expect(result.current.startPatrol()).rejects.toThrow('Unable to save patrol data locally.'));

    expect(result.current.error).toBe('Unable to save patrol data locally.');
    expect(result.current.session).toBeNull();
  });
});

describe('GPS tracking', () => {
  test('a GPS fix updates the position and auto-records a GPS waypoint', async () => {
    const { result } = await renderLoaded(session());
    api.addWaypoint.mockResolvedValue(session({ waypoints: [{ ...fix(6.475, 80.88), timestamp: '2026-10-01T06:30:00.000Z', source: LocationSource.GPS }] }));

    await act(async () => gps.onLocation(fix(6.475, 80.88)));

    expect(result.current.currentLocation).toEqual(fix(6.475, 80.88));
    expect(api.addWaypoint).toHaveBeenCalledWith('sess-1', {
      latitude: 6.475,
      longitude: 80.88,
      timestamp: '2026-10-01T06:30:00.000Z',
      source: LocationSource.GPS,
      accuracy: 6
    });
    expect(result.current.session?.waypoints).toHaveLength(1);
  });

  test('records at most one automatic waypoint every 10 seconds', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    await renderLoaded(session());
    api.addWaypoint.mockResolvedValue(session());

    await act(async () => gps.onLocation(fix(1, 1)));
    await act(async () => gps.onLocation(fix(1.001, 1)));
    expect(api.addWaypoint).toHaveBeenCalledTimes(1);

    clock.mockReturnValue(now + 10_000);
    await act(async () => gps.onLocation(fix(1.002, 1)));
    expect(api.addWaypoint).toHaveBeenCalledTimes(2);
  });

  test('ignores an invalid GPS fix', async () => {
    const { result } = await renderLoaded(session());

    await act(async () => gps.onLocation(fix(120, 80.88)));

    expect(result.current.currentLocation).toBeNull();
    expect(api.addWaypoint).not.toHaveBeenCalled();
  });

  test('a failed automatic waypoint does not stop tracking', async () => {
    const { result } = await renderLoaded(session());
    api.addWaypoint.mockRejectedValue(new Error('storage error'));

    await act(async () => gps.onLocation(fix(1, 1)));

    expect(result.current.gpsState).toBe('tracking');
    expect(result.current.error).toBeNull();
  });

  test.each([
    [{ code: 1, message: 'denied' }, 'denied', 'Location permission denied by user. Manual waypoints are still enabled.'],
    [{ code: 2, message: 'no fix' }, 'unavailable', 'GPS signal lost or position unavailable. Patrol continues.'],
    [{ code: 0, message: 'Geolocation unavailable' }, 'error', 'Geolocation unavailable'],
    [{ code: 3, message: '' }, 'error', 'GPS location error. Patrol continues.']
  ])('GPS error %o sets state %s', async (gpsError, state, message) => {
    const { result } = await renderLoaded(session());

    act(() => gps.onError(gpsError));

    expect(result.current.gpsState).toBe(state);
    expect(result.current.gpsErrorMsg).toBe(message);
    expect(result.current.session?.status).toBe(PatrolStatus.ACTIVE);
  });

  test('a fix after a GPS error restores the tracking state', async () => {
    const { result } = await renderLoaded(session());
    api.addWaypoint.mockResolvedValue(session());
    act(() => gps.onError({ code: 2, message: 'no fix' }));

    await act(async () => gps.onLocation(fix(1, 1)));

    expect(result.current.gpsState).toBe('tracking');
    expect(result.current.gpsErrorMsg).toBeNull();
  });

  test('stops the GPS watch when the hook unmounts and removes its listeners', async () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const { unmount } = await renderLoaded(session());

    unmount();

    expect(gpsService.stopTracking).toHaveBeenCalledWith(11);
    expect(removeListener.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining(['online', 'sync-completed']));
  });

  test('shows the elapsed patrol time', async () => {
    const { result } = await renderLoaded(session({ startTime: new Date(Date.now() - 3661 * 1000).toISOString() }));

    expect(result.current.formattedElapsedTime).toBe('01:01:01');
  });
});

describe('manual waypoints', () => {
  test('records manually entered coordinates with a note', async () => {
    const { result } = await renderLoaded(session());
    api.addWaypoint.mockResolvedValue(session({ waypoints: [] }));

    await act(() => result.current.addManualWaypoint('Snare found', 6.48, 80.895));

    expect(api.addWaypoint).toHaveBeenCalledWith('sess-1', expect.objectContaining({ latitude: 6.48, longitude: 80.895, source: LocationSource.MANUAL, note: 'Snare found' }));
  });

  test('uses the current GPS position when no coordinates are entered', async () => {
    const { result } = await renderLoaded(session());
    api.addWaypoint.mockResolvedValue(session());
    await act(async () => gps.onLocation(fix(6.49, 80.91)));
    api.addWaypoint.mockClear();

    await act(() => result.current.addManualWaypoint('Fence intact'));

    expect(api.addWaypoint).toHaveBeenCalledWith('sess-1', expect.objectContaining({ latitude: 6.49, longitude: 80.91, accuracy: 6, source: LocationSource.MANUAL }));
  });

  test('without GPS or entered coordinates the waypoint is refused', async () => {
    const { result } = await renderLoaded(session());

    await expect(result.current.addManualWaypoint('note')).rejects.toThrow(
      'GPS coordinates unavailable. Please grant location permission or enter valid coordinates.'
    );
    expect(api.addWaypoint).not.toHaveBeenCalled();
  });

  test('requires an active patrol', async () => {
    const { result } = await renderLoaded(session({ status: PatrolStatus.PAUSED }));

    await expect(result.current.addManualWaypoint('note', 1, 1)).rejects.toThrow('Patrol must be active to record manual waypoint.');
  });

  test('a failed manual waypoint is reported', async () => {
    const { result } = await renderLoaded(session());
    api.addWaypoint.mockRejectedValue(new Error('Unable to save waypoint locally. Device storage error.'));

    await act(() => expect(result.current.addManualWaypoint('note', 1, 1)).rejects.toThrow('Device storage error.'));

    expect(result.current.error).toBe('Unable to save waypoint locally. Device storage error.');
  });
});

describe('pause, resume, cancel and complete', () => {
  test('pausing stops GPS tracking and resuming restarts it', async () => {
    const { result } = await renderLoaded(session());
    api.pausePatrol.mockResolvedValue(session({ status: PatrolStatus.PAUSED }));
    api.resumePatrol.mockResolvedValue(session({ status: PatrolStatus.ACTIVE }));

    await act(() => result.current.pausePatrol());
    expect(result.current.session?.status).toBe(PatrolStatus.PAUSED);
    expect(result.current.gpsState).toBe('idle');
    expect(gpsService.stopTracking).toHaveBeenCalledWith(11);

    await act(() => result.current.resumePatrol());
    expect(result.current.session?.status).toBe(PatrolStatus.ACTIVE);
    expect(gpsService.startTracking).toHaveBeenCalledTimes(2);
  });

  test('completing stops tracking and stores the completed session', async () => {
    const { result } = await renderLoaded(session());
    api.completePatrol.mockResolvedValue(session({ status: PatrolStatus.COMPLETED, syncStatus: SyncStatus.PENDING }));

    await act(() => result.current.completePatrol());

    expect(api.completePatrol).toHaveBeenCalledWith('sess-1');
    expect(gpsService.stopTracking).toHaveBeenCalledWith(11);
    expect(result.current.session).toMatchObject({ status: PatrolStatus.COMPLETED, syncStatus: SyncStatus.PENDING });
    expect(result.current.gpsState).toBe('idle');
  });

  test('cancelling passes the reason and stores the cancelled session', async () => {
    const { result } = await renderLoaded(session({ status: PatrolStatus.PAUSED }));
    api.cancelPatrol.mockResolvedValue(session({ status: PatrolStatus.CANCELLED }));

    await act(() => result.current.cancelPatrol('Storm'));

    expect(api.cancelPatrol).toHaveBeenCalledWith('sess-1', 'Storm');
    expect(result.current.session?.status).toBe(PatrolStatus.CANCELLED);
  });

  test.each([
    ['pausePatrol', 'pausePatrol', 'Unable to pause'],
    ['resumePatrol', 'resumePatrol', 'Unable to resume'],
    ['cancelPatrol', 'cancelPatrol', 'Unable to cancel'],
    ['completePatrol', 'completePatrol', 'Unable to complete']
  ] as const)('%s reports an API failure', async (action, apiMethod, message) => {
    const { result } = await renderLoaded(session({ status: action === 'resumePatrol' ? PatrolStatus.PAUSED : PatrolStatus.ACTIVE }));
    api[apiMethod].mockRejectedValue(new Error(message));

    await act(() => expect(result.current[action]()).rejects.toThrow(message));

    expect(result.current.error).toBe(message);
  });

  test.each([
    ['pausePatrol', 'No active patrol session to pause.'],
    ['resumePatrol', 'No paused patrol session to resume.'],
    ['cancelPatrol', 'No active patrol session to cancel.'],
    ['completePatrol', 'No active or paused patrol session to complete.']
  ] as const)('%s is refused without an in-progress patrol', async (action, message) => {
    const { result } = await renderLoaded(session({ status: PatrolStatus.COMPLETED }));

    await expect(result.current[action]()).rejects.toThrow(message);
  });
});
