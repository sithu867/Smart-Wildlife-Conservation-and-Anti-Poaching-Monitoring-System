import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { LocationSource, PatrolStatus, SyncStatus } from '../../../shared/types/enums';
import type { GeoError, GeoLocation } from '../../../shared/geolocation/geolocation';
import type { PatrolAssignment, PatrolRoute, PatrolSession, Waypoint } from '../types/patrol';
import { patrolApi } from '../api/patrolApi';
import { geolocationService } from '../../../shared/geolocation/geolocation';
import { AssignedPatrolPage } from './AssignedPatrolPage';
import { PatrolRoutePage } from './PatrolRoutePage';
import { ActivePatrolPage } from './ActivePatrolPage';
import { PatrolCompletionPage } from './PatrolCompletionPage';

vi.mock('../api/patrolApi', () => ({
  patrolApi: {
    getMyAssignment: vi.fn(),
    getRouteById: vi.fn(),
    getSessionById: vi.fn(),
    getPatrolHistory: vi.fn(),
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
// The Leaflet map is covered by PatrolComponents.test.tsx; pages only pass it their data.
vi.mock('../components/PatrolMap', () => ({
  PatrolMap: ({ waypoints = [] }: { waypoints?: Waypoint[] }) => <div data-testid="patrol-map">{waypoints.length} mapped waypoints</div>
}));

// UC-A patrol pages driven through the real usePatrol hook, with the patrol API mocked.
const api = vi.mocked(patrolApi);
const route: PatrolRoute = {
  _id: 'route-1',
  name: 'Udawalawe Reservoir Elephant Patrol',
  park: { _id: 'park-1', name: 'Yala National Park (Ruhuna)', code: 'YALA-NP' },
  description: 'Reservoir perimeter check',
  distanceKm: 15,
  estimatedDurationHours: 4,
  geometry: { type: 'LineString', coordinates: [[80.88, 6.475], [80.925, 6.498]] }
};
const assignment: PatrolAssignment = { _id: 'assign-1', rangerId: 'R-101', rangerName: 'Ranger John', patrolRoute: route, assignedDate: '2026-10-01', status: PatrolStatus.ASSIGNED };
const wp = (source: LocationSource, note?: string): Waypoint => ({ latitude: 6.475, longitude: 80.88, timestamp: '2026-10-01T06:30:00.000Z', source, note });
const session = (overrides: Partial<PatrolSession> = {}): PatrolSession => ({
  _id: 'sess-1',
  rangerId: 'R-101',
  rangerName: 'Ranger John',
  patrolAssignment: 'assign-1',
  patrolRoute: route,
  startTime: new Date().toISOString(),
  endTime: null,
  status: PatrolStatus.ACTIVE,
  syncStatus: SyncStatus.SYNCED,
  waypoints: [wp(LocationSource.GPS), wp(LocationSource.MANUAL, 'Snare removed')],
  totalDistanceKm: 1.831,
  durationSeconds: 0,
  ...overrides
});

let gps: { onLocation: (location: GeoLocation) => void; onError: (error: GeoError) => void };

function CurrentLocation() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/ranger/patrol" element={<AssignedPatrolPage />} />
        <Route path="/ranger/patrol/route/:routeId" element={<PatrolRoutePage />} />
        <Route path="/ranger/patrol/active/:sessionId" element={<ActivePatrolPage />} />
        <Route path="/ranger/patrol/summary/:sessionId" element={<PatrolCompletionPage />} />
        <Route path="*" element={null} />
      </Routes>
      <CurrentLocation />
    </MemoryRouter>
  );
}
const currentPath = () => screen.getByTestId('location').textContent;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  api.getMyAssignment.mockResolvedValue({ assignment, assignments: [assignment], activeSession: null });
  api.getPatrolHistory.mockResolvedValue([]);
  api.getRouteById.mockResolvedValue(route);
  api.getSessionById.mockResolvedValue(session());
  vi.mocked(geolocationService.startTracking).mockImplementation((onLocation, onError) => {
    gps = { onLocation, onError };
    return 3;
  });
});
afterEach(() => {
  // Unmount before restoring mocks so no effect of a page reached by navigation runs against restored mocks.
  cleanup();
  vi.restoreAllMocks();
});

describe('AssignedPatrolPage', () => {
  test('shows loading, then the assigned route ready to start', async () => {
    renderAt('/ranger/patrol');
    expect(screen.getByText('Retrieving assigned patrol routes...')).toBeInTheDocument();

    expect(await screen.findByText('Udawalawe Reservoir Elephant Patrol')).toBeInTheDocument();
    expect(screen.getByText('1 Routes Assigned')).toBeInTheDocument();
    expect(screen.getByText('15 km')).toBeInTheDocument();
  });

  test('Start Patrol starts the assignment and opens live tracking', async () => {
    api.startPatrol.mockResolvedValue(session({ _id: 'sess-new' }));
    renderAt('/ranger/patrol');

    await userEvent.click(await screen.findByRole('button', { name: 'Start Patrol' }));

    expect(api.startPatrol).toHaveBeenCalledWith('assign-1');
    await waitFor(() => expect(currentPath()).toBe('/ranger/patrol/active/sess-new'));
  });

  test('a failed start is reported and the ranger stays on the page', async () => {
    api.startPatrol.mockRejectedValue(new Error('Unable to save patrol data locally. Please check device storage before proceeding.'));
    renderAt('/ranger/patrol');

    await userEvent.click(await screen.findByRole('button', { name: 'Start Patrol' }));

    expect(await screen.findByText('Unable to save patrol data locally. Please check device storage before proceeding.')).toBeInTheDocument();
    expect(currentPath()).toBe('/ranger/patrol');
  });

  test('a paused patrol is announced and Resume Patrol resumes it before opening tracking', async () => {
    api.getMyAssignment.mockResolvedValue({ assignment, assignments: [assignment], activeSession: session({ status: PatrolStatus.PAUSED }) });
    api.resumePatrol.mockResolvedValue(session());
    renderAt('/ranger/patrol');

    expect(await screen.findByText('Patrol Session Paused')).toBeInTheDocument();
    expect(screen.getByText(/2 waypoints recorded/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resume Patrol' }));

    expect(api.resumePatrol).toHaveBeenCalledWith('sess-1');
    await waitFor(() => expect(currentPath()).toBe('/ranger/patrol/active/sess-1'));
  });

  test('an active patrol opens tracking directly without another start', async () => {
    api.getMyAssignment.mockResolvedValue({ assignment, assignments: [assignment], activeSession: session() });
    renderAt('/ranger/patrol');

    await userEvent.click(await screen.findByRole('button', { name: 'Open Tracking Screen →' }));

    expect(currentPath()).toBe('/ranger/patrol/active/sess-1');
    expect(api.startPatrol).not.toHaveBeenCalled();
  });

  test('another route cannot be started while a patrol is in progress', async () => {
    const otherRoute = { ...route, _id: 'route-2', name: 'Northern Fence Patrol' };
    const other = { ...assignment, _id: 'assign-2', patrolRoute: otherRoute };
    api.getMyAssignment.mockResolvedValue({ assignment, assignments: [assignment, other], activeSession: session() });
    renderAt('/ranger/patrol');

    expect(await screen.findByRole('button', { name: 'Finish Active Patrol First' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Resume Active Patrol →' })).toBeInTheDocument();
  });

  test('a ranger without assignments sees the no-assignment message', async () => {
    api.getMyAssignment.mockResolvedValue({ assignment: null, assignments: [], activeSession: null });
    renderAt('/ranger/patrol');

    expect(await screen.findByText('No Active Patrol Assignment')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start Patrol' })).not.toBeInTheDocument();
  });

  test('a load failure shows the error', async () => {
    api.getMyAssignment.mockRejectedValue(new Error('Server unreachable'));
    renderAt('/ranger/patrol');

    expect(await screen.findByText('Error Loading Assignment')).toBeInTheDocument();
    expect(screen.getByText('Server unreachable')).toBeInTheDocument();
  });

  test('history lists finished patrols with their sync state and opens a summary', async () => {
    api.getPatrolHistory.mockResolvedValue([
      session({ _id: 'synced', status: PatrolStatus.COMPLETED, endTime: '2026-10-01T08:00:00.000Z', durationSeconds: 125 }),
      session({ _id: 'pending', status: PatrolStatus.COMPLETED, syncStatus: SyncStatus.PENDING }),
      session({ _id: 'cancelled', status: PatrolStatus.CANCELLED }),
      session({ _id: 'still-active', status: PatrolStatus.ACTIVE })
    ]);
    renderAt('/ranger/patrol');

    expect(await screen.findByText('3 Recorded')).toBeInTheDocument();
    expect(screen.getByText('🟢 SYNCED')).toBeInTheDocument();
    expect(screen.getByText('🟡 PENDING SYNC')).toBeInTheDocument();
    expect(screen.getByText('🛑 CANCELLED')).toBeInTheDocument();
    expect(screen.getByText('2m 5s')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'View Details & Map Summary →' })[0]);

    expect(currentPath()).toBe('/ranger/patrol/summary/synced');
  });

  test('an empty history explains how patrols appear', async () => {
    renderAt('/ranger/patrol');

    expect(await screen.findByText(/No completed or cancelled ranger patrols logged yet/)).toBeInTheDocument();
  });
});

describe('PatrolRoutePage', () => {
  test('shows the route details and map, and starts a patrol from the route', async () => {
    api.startPatrol.mockResolvedValue(session({ _id: 'sess-route' }));
    renderAt('/ranger/patrol/route/route-1');
    expect(screen.getByText('Loading route geometry...')).toBeInTheDocument();

    expect(await screen.findByRole('heading', { name: 'Udawalawe Reservoir Elephant Patrol' })).toBeInTheDocument();
    expect(api.getRouteById).toHaveBeenCalledWith('route-1');
    expect(screen.getByText('4 hours')).toBeInTheDocument();
    expect(screen.getByTestId('patrol-map')).toBeInTheDocument();
    await waitFor(() => expect(api.getMyAssignment).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: /Start Patrol/ }));

    expect(api.startPatrol).toHaveBeenCalledWith('assign-1');
    await waitFor(() => expect(currentPath()).toBe('/ranger/patrol/active/sess-route'));
  });

  test('a patrol in progress on this route is resumed instead of started', async () => {
    api.getMyAssignment.mockResolvedValue({ assignment, assignments: [assignment], activeSession: session() });
    renderAt('/ranger/patrol/route/route-1');

    await userEvent.click(await screen.findByRole('button', { name: /Resume Active Patrol/ }));

    expect(currentPath()).toBe('/ranger/patrol/active/sess-1');
    expect(api.startPatrol).not.toHaveBeenCalled();
  });

  test('a route that cannot be loaded shows an error with a way back', async () => {
    api.getRouteById.mockRejectedValue(new Error('Route unavailable'));
    renderAt('/ranger/patrol/route/missing');

    expect(await screen.findByText('Route Map Error')).toBeInTheDocument();
    expect(screen.getByText('Route unavailable')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back to My Patrol' }));
    expect(currentPath()).toBe('/ranger/patrol');
  });

  test('a failed start keeps the ranger on the route page', async () => {
    api.startPatrol.mockRejectedValue(new Error('storage full'));
    renderAt('/ranger/patrol/route/route-1');

    await userEvent.click(await screen.findByRole('button', { name: /Start Patrol/ }));

    await waitFor(() => expect(api.startPatrol).toHaveBeenCalled());
    expect(currentPath()).toBe('/ranger/patrol/route/route-1');
  });
});

describe('ActivePatrolPage', () => {
  test('shows the live patrol metrics and the GPS fix', async () => {
    renderAt('/ranger/patrol/active/sess-1');
    expect(screen.getByText('Initializing field tracking session...')).toBeInTheDocument();

    expect(await screen.findByText('ACTIVE PATROL')).toBeInTheDocument();
    expect(api.getSessionById).toHaveBeenCalledWith('sess-1');
    expect(screen.getByText('1.831 km')).toBeInTheDocument();
    expect(screen.getByTestId('patrol-map')).toHaveTextContent('2 mapped waypoints');
    api.addWaypoint.mockResolvedValue(session());
    // GPS tracking starts in an effect after the first render; wait for it so `gps` is this page's callback.
    await screen.findByText('GPS Active');
    await act(async () => gps.onLocation({ latitude: 6.48, longitude: 80.9, accuracy: 4, timestamp: Date.now() }));
    expect(screen.getByText('GPS Active')).toBeInTheDocument();
    expect(screen.getByText('Lat: 6.48000°')).toBeInTheDocument();
  });

  test('a denied GPS permission is shown while the patrol continues', async () => {
    renderAt('/ranger/patrol/active/sess-1');
    await screen.findByText('ACTIVE PATROL');
    await screen.findByText('GPS Active');

    act(() => gps.onError({ code: 1, message: 'denied' }));

    expect(screen.getByText('GPS Access Denied')).toBeInTheDocument();
    expect(screen.getByText('Location permission denied by user. Manual waypoints are still enabled.')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE PATROL')).toBeInTheDocument();
  });

  test('the ranger can record a manual waypoint with coordinates and a note', async () => {
    api.addWaypoint.mockResolvedValue(session({ waypoints: [...session().waypoints, wp(LocationSource.MANUAL, 'Fence cut')] }));
    renderAt('/ranger/patrol/active/sess-1');

    await userEvent.click(await screen.findByRole('button', { name: /Manual Waypoint/ }));
    const [lat, lng] = screen.getAllByRole('spinbutton');
    await userEvent.clear(lat);
    await userEvent.type(lat, '6.49');
    await userEvent.clear(lng);
    await userEvent.type(lng, '80.91');
    await userEvent.type(screen.getByPlaceholderText(/Spotted fresh tracks/), 'Fence cut');
    await userEvent.click(screen.getByRole('button', { name: 'Record Waypoint' }));

    expect(api.addWaypoint).toHaveBeenCalledWith('sess-1', expect.objectContaining({ latitude: 6.49, longitude: 80.91, source: LocationSource.MANUAL, note: 'Fence cut' }));
    await waitFor(() => expect(screen.queryByText('Add Manual Waypoint')).not.toBeInTheDocument());
    expect(screen.getByTestId('patrol-map')).toHaveTextContent('3 mapped waypoints');
  });

  test('pausing shows the paused state and disables manual waypoints', async () => {
    api.pausePatrol.mockResolvedValue(session({ status: PatrolStatus.PAUSED }));
    renderAt('/ranger/patrol/active/sess-1');

    await userEvent.click(await screen.findByRole('button', { name: /Pause Patrol/ }));

    expect(api.pausePatrol).toHaveBeenCalledWith('sess-1');
    expect(await screen.findByText('PAUSED PATROL')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Manual Waypoint/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Resume GPS Tracking/ })).toBeInTheDocument();
  });

  test('ending the patrol asks for confirmation, completes it and opens the summary', async () => {
    api.completePatrol.mockResolvedValue(session({ status: PatrolStatus.COMPLETED }));
    renderAt('/ranger/patrol/active/sess-1');

    await userEvent.click(await screen.findByRole('button', { name: /End Patrol/ }));
    expect(screen.getByText(/finalize your recorded waypoints \(2\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm End' }));

    expect(api.completePatrol).toHaveBeenCalledWith('sess-1');
    await waitFor(() => expect(currentPath()).toBe('/ranger/patrol/summary/sess-1'));
  });

  test('a completion failure is reported and the ranger is not sent to the summary', async () => {
    api.completePatrol.mockRejectedValue(new Error('Unable to save completion status locally. Please do not close app.'));
    renderAt('/ranger/patrol/active/sess-1');

    await userEvent.click(await screen.findByRole('button', { name: /End Patrol/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm End' }));

    expect(await screen.findByText('Unable to save completion status locally. Please do not close app.')).toBeInTheDocument();
    expect(currentPath()).toBe('/ranger/patrol/active/sess-1');
  });

  test('cancelling with a reason cancels the patrol and returns to the patrol list', async () => {
    api.cancelPatrol.mockResolvedValue(session({ status: PatrolStatus.CANCELLED }));
    renderAt('/ranger/patrol/active/sess-1');

    await userEvent.click(await screen.findByRole('button', { name: /Cancel Patrol/ }));
    await userEvent.type(screen.getByPlaceholderText(/Extreme weather/), 'Storm');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Cancel' }));

    expect(api.cancelPatrol).toHaveBeenCalledWith('sess-1', 'Storm');
    await waitFor(() => expect(currentPath()).toBe('/ranger/patrol'));
  });

  test('Go Back closes the cancel dialog without cancelling', async () => {
    renderAt('/ranger/patrol/active/sess-1');

    await userEvent.click(await screen.findByRole('button', { name: /Cancel Patrol/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Go Back' }));

    expect(screen.queryByText('Cancel Patrol Session?')).not.toBeInTheDocument();
    expect(api.cancelPatrol).not.toHaveBeenCalled();
  });

  test('Report Threat opens incident reporting linked to this patrol', async () => {
    renderAt('/ranger/patrol/active/sess-1');

    await userEvent.click(await screen.findByRole('button', { name: /Report Threat/ }));

    expect(currentPath()).toBe('/ranger/incidents/new?sessionId=sess-1');
  });

  test('losing connectivity is shown on the tracking screen', async () => {
    renderAt('/ranger/patrol/active/sess-1');
    await screen.findByText('ACTIVE PATROL');
    // The connectivity listener is added by an effect of the same render that starts GPS tracking.
    await screen.findByText('GPS Active');

    act(() => window.dispatchEvent(new Event('offline')));

    expect(screen.getByText('Offline Mode')).toBeInTheDocument();
  });

  test('an unknown session shows an error with a way back', async () => {
    api.getSessionById.mockRejectedValue(new Error('Patrol session not found in local or central storage.'));
    renderAt('/ranger/patrol/active/missing');

    expect(await screen.findByText('Patrol Session Error')).toBeInTheDocument();
    expect(screen.getByText('Patrol session not found in local or central storage.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back to My Patrol' }));
    expect(currentPath()).toBe('/ranger/patrol');
  });
});

describe('PatrolCompletionPage', () => {
  const completed = (overrides: Partial<PatrolSession> = {}) =>
    session({
      status: PatrolStatus.COMPLETED,
      startTime: '2026-10-01T06:00:00.000Z',
      endTime: '2026-10-01T07:30:05.000Z',
      durationSeconds: 5405,
      totalDistanceKm: 3.712,
      waypoints: [wp(LocationSource.GPS), wp(LocationSource.MANUAL, 'Snare removed'), wp(LocationSource.GPS)],
      ...overrides
    });

  test('a synced patrol shows its completed summary', async () => {
    api.getSessionById.mockResolvedValue(completed());
    renderAt('/ranger/patrol/summary/sess-1');
    expect(screen.getByText('Generating patrol completion summary...')).toBeInTheDocument();

    expect(await screen.findByText('Patrol Completed')).toBeInTheDocument();
    expect(screen.getByText('🟢 SYNCED')).toBeInTheDocument();
    expect(screen.getByText('01:30:05')).toBeInTheDocument();
    expect(screen.getByText('3.712 km')).toBeInTheDocument();
    expect(screen.getByText('3 total (2 GPS, 1 Manual)')).toBeInTheDocument();
    expect(screen.getByText('Yala National Park (Ruhuna)')).toBeInTheDocument();
    expect(screen.queryByText('Pending Synchronization')).not.toBeInTheDocument();
  });

  test('a patrol completed offline is shown as saved locally and pending synchronisation', async () => {
    api.getSessionById.mockResolvedValue(completed({ syncStatus: SyncStatus.PENDING, endTime: null }));
    renderAt('/ranger/patrol/summary/sess-1');

    expect(await screen.findByText('Patrol Saved Locally')).toBeInTheDocument();
    expect(screen.getByText('Pending Synchronization')).toBeInTheDocument();
    expect(screen.getByText('🟡 PENDING SYNC')).toBeInTheDocument();
    expect(screen.getByText('Just now')).toBeInTheDocument();
  });

  test('Return to My Patrol goes back to the patrol list', async () => {
    api.getSessionById.mockResolvedValue(completed());
    renderAt('/ranger/patrol/summary/sess-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Return to My Patrol' }));

    expect(currentPath()).toBe('/ranger/patrol');
  });

  test('a summary that cannot be loaded shows an error', async () => {
    api.getSessionById.mockRejectedValue(new Error('Patrol session not found in local or central storage.'));
    renderAt('/ranger/patrol/summary/missing');

    expect(await screen.findByText('Summary Error')).toBeInTheDocument();
    expect(screen.getByText('Patrol session not found in local or central storage.')).toBeInTheDocument();
  });
});
