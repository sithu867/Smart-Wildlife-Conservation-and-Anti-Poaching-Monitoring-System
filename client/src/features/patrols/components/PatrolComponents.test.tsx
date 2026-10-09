import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { LocationSource, PatrolStatus, SyncStatus } from '../../../shared/types/enums';
import type { PatrolAssignment, PatrolRoute, PatrolSession, Waypoint } from '../types/patrol';
import { GPSStatus } from './GPSStatus';
import { PatrolCard } from './PatrolCard';
import { PatrolMap } from './PatrolMap';
import { PatrolStatusBadge } from './PatrolStatus';
import { SyncStatusIndicator } from './SyncStatus';
import { WaypointFormModal } from './WaypointForm';

const fitBounds = vi.fn();
// Leaflet rendering is replaced; each element exposes the props PatrolMap controls.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, center }: { children: ReactNode; center: [number, number] }) => (
    <div data-testid="map" data-center={JSON.stringify(center)}>{children}</div>
  ),
  TileLayer: () => null,
  Polyline: ({ positions, pathOptions }: { positions: unknown; pathOptions: { color: string } }) => (
    <div data-testid="polyline" data-color={pathOptions.color} data-positions={JSON.stringify(positions)} />
  ),
  Marker: ({ position, icon, children }: { position: unknown; icon: { options: { html: string } }; children: ReactNode }) => (
    <div data-testid="marker" data-position={JSON.stringify(position)} data-icon={icon.options.html.trim().split('\n').at(-2)?.trim()}>
      {children}
    </div>
  ),
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useMap: () => ({ fitBounds })
}));

// UC-A patrol components: status display, assignment card, manual waypoint form and route map.
const route: PatrolRoute = {
  _id: 'route-1',
  name: 'Udawalawe Reservoir Elephant Patrol',
  park: { _id: 'park-1', name: 'Yala National Park (Ruhuna)', code: 'YALA-NP' },
  description: 'Reservoir perimeter check',
  distanceKm: 15,
  estimatedDurationHours: 4,
  geometry: { type: 'LineString', coordinates: [[80.88, 6.475], [80.895, 6.482], [80.925, 6.498]] }
};
const assignment: PatrolAssignment = { _id: 'assign-1', rangerId: 'R-101', rangerName: 'Ranger John', patrolRoute: route, assignedDate: '2026-10-01', status: PatrolStatus.ASSIGNED, notes: 'Check the north fence' };
const wp = (latitude: number, longitude: number, source: LocationSource, note?: string): Waypoint => ({ latitude, longitude, source, note, timestamp: '2026-10-01T06:30:00.000Z' });
const markers = () => screen.queryAllByTestId('marker');
const polylines = () => screen.queryAllByTestId('polyline');

describe('GPSStatus', () => {
  test('tracking shows the coordinates and accuracy of the current fix', () => {
    render(<GPSStatus gpsState="tracking" currentLocation={{ latitude: 6.4751234, longitude: 80.8812345, accuracy: 6.6, timestamp: 0 }} />);

    expect(screen.getByText('GPS Active')).toBeInTheDocument();
    expect(screen.getByText('±7m')).toBeInTheDocument();
    expect(screen.getByText('Lat: 6.47512°')).toBeInTheDocument();
    expect(screen.getByText('Lng: 80.88123°')).toBeInTheDocument();
  });

  test.each([
    ['denied', 'GPS Access Denied', 'Location permission denied by user. Manual waypoints are still enabled.'],
    ['error', 'GPS Error', 'Geolocation unavailable']
  ] as const)('%s state shows its label and the problem', (gpsState, label, message) => {
    render(<GPSStatus gpsState={gpsState} currentLocation={null} errorMsg={message} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  test('idle state waits for a fix', () => {
    render(<GPSStatus gpsState="idle" currentLocation={null} />);

    expect(screen.getByText('GPS Idle')).toBeInTheDocument();
    expect(screen.getByText('Waiting for GPS signal fix...')).toBeInTheDocument();
  });
});

describe('PatrolStatusBadge and SyncStatusIndicator', () => {
  test.each([
    [SyncStatus.SYNCING, '🔄 Syncing...'],
    [SyncStatus.FAILED, '🟠 Sync Failed (Retrying)'],
    [SyncStatus.LOCAL, '🟡 Saved Locally (Pending Sync)']
  ])('sync status %s is shown as "%s"', (syncStatus, text) => {
    render(<PatrolStatusBadge status={PatrolStatus.ACTIVE} syncStatus={syncStatus} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  test('without a sync status only the patrol status is shown', () => {
    const { container } = render(<PatrolStatusBadge status={PatrolStatus.ASSIGNED} />);
    expect(container.textContent).toBe('ASSIGNED');
  });

  test('the connectivity indicator follows offline and online events', () => {
    render(<SyncStatusIndicator />);

    act(() => window.dispatchEvent(new Event('offline')));
    expect(screen.getByText('Offline Mode')).toBeInTheDocument();
    act(() => window.dispatchEvent(new Event('online')));
    expect(screen.getByText('Online')).toBeInTheDocument();
  });
});

describe('PatrolCard', () => {
  const handlers = () => ({ onStartPatrol: vi.fn(), onViewRoute: vi.fn(), onContinuePatrol: vi.fn() });
  const activeSession = { _id: 'sess-1', status: PatrolStatus.PAUSED } as PatrolSession;

  test('an assigned route offers Start Patrol and View Route Map', async () => {
    const actions = handlers();
    render(<PatrolCard assignment={assignment} {...actions} />);

    expect(screen.getByText('Yala National Park (Ruhuna)')).toBeInTheDocument();
    expect(screen.getByText('Note: Check the north fence')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Start Patrol' }));
    await userEvent.click(screen.getByRole('button', { name: 'View Route Map' }));

    expect(actions.onStartPatrol).toHaveBeenCalledTimes(1);
    expect(actions.onViewRoute).toHaveBeenCalledTimes(1);
  });

  test('an in-progress patrol shows its status and offers to continue', async () => {
    const actions = handlers();
    render(<PatrolCard assignment={assignment} activeSession={activeSession} {...actions} />);

    expect(screen.getByText(PatrolStatus.PAUSED)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resume Active Patrol →' }));

    expect(actions.onContinuePatrol).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Start Patrol' })).not.toBeInTheDocument();
  });

  test('another patrol in progress blocks starting this one', () => {
    render(<PatrolCard assignment={assignment} isAnotherPatrolActive {...handlers()} />);

    expect(screen.getByRole('button', { name: 'Finish Active Patrol First' })).toBeDisabled();
  });

  test('a route without park details falls back to the default park name', () => {
    render(<PatrolCard assignment={{ ...assignment, patrolRoute: { ...route, park: 'park-1' } }} {...handlers()} />);

    expect(screen.getByText('Yala National Park')).toBeInTheDocument();
  });
});

describe('WaypointFormModal', () => {
  const location = { latitude: 6.475, longitude: 80.88, accuracy: 5, timestamp: 0 };

  test('GPS mode records the current fix with the observation note', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<WaypointFormModal currentLocation={location} onSubmit={onSubmit} onCancel={vi.fn()} />);

    expect(screen.getByText('Lat: 6.47500°')).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText(/Spotted fresh tracks/), 'Fence cut');
    await userEvent.click(screen.getByRole('button', { name: 'Record Waypoint' }));

    expect(onSubmit).toHaveBeenCalledWith('Fence cut', undefined, undefined);
  });

  test('without GPS the form opens in manual mode with the GPS warning available', async () => {
    render(<WaypointFormModal currentLocation={null} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText('Manual Override / GPS Failure Coordinates')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Current GPS Fix/ }));
    expect(screen.getByText(/GPS signal is unavailable/)).toBeInTheDocument();
  });

  test.each([
    ['95', '80.88', 'Latitude must be between -90 and 90'],
    ['6.475', '-181', 'Longitude must be between -180 and 180']
  ])('rejects manual coordinates (%s, %s) with a validation message', async (lat, lng, message) => {
    const onSubmit = vi.fn();
    render(<WaypointFormModal currentLocation={null} onSubmit={onSubmit} onCancel={vi.fn()} />);
    const [latInput, lngInput] = screen.getAllByRole('spinbutton');

    await userEvent.clear(latInput);
    await userEvent.type(latInput, lat);
    await userEvent.clear(lngInput);
    await userEvent.type(lngInput, lng);
    await userEvent.click(screen.getByRole('button', { name: 'Record Waypoint' }));

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('a blank manual coordinate is rejected', async () => {
    const onSubmit = vi.fn();
    render(<WaypointFormModal currentLocation={null} onSubmit={onSubmit} onCancel={vi.fn()} />);

    await userEvent.clear(screen.getAllByRole('spinbutton')[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Record Waypoint' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Record Waypoint' })).toBeEnabled();
  });

  test('a failed save shows the error and lets the ranger retry', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('Unable to save waypoint locally. Device storage error.')).mockResolvedValueOnce(undefined);
    render(<WaypointFormModal currentLocation={location} onSubmit={onSubmit} onCancel={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Record Waypoint' }));
    expect(screen.getByText('Unable to save waypoint locally. Device storage error.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Record Waypoint' }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  test('Cancel closes the form without recording', async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(<WaypointFormModal currentLocation={location} onSubmit={onSubmit} onCancel={onCancel} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('PatrolMap', () => {
  beforeEach(() => fitBounds.mockClear());

  test('draws the assigned route in [lat, lng] order with start and end markers', () => {
    render(<PatrolMap route={route} />);

    const expectedPath = JSON.stringify([[6.475, 80.88], [6.482, 80.895], [6.498, 80.925]]);
    expect(polylines().map(line => line.dataset.positions)).toEqual([expectedPath, expectedPath]);
    expect(markers().map(marker => [marker.dataset.icon, marker.dataset.position])).toEqual([
      ['🟢', '[6.475,80.88]'],
      ['🏁', '[6.498,80.925]']
    ]);
    expect(screen.getByText('Target Finish Line (15 km)')).toBeInTheDocument();
    expect(screen.getByTestId('map').dataset.center).toBe('[6.475,80.88]');
  });

  test('marks GPS and manual waypoints differently, shows notes and draws the recorded track', () => {
    render(<PatrolMap waypoints={[wp(6.4, 80.9, LocationSource.GPS), wp(6.41, 80.91, LocationSource.MANUAL, 'Snare removed')]} />);

    expect(markers().map(marker => marker.dataset.icon)).toEqual(['📍', '✍️']);
    expect(screen.getByText('📍 GPS Auto Waypoint #1')).toBeInTheDocument();
    expect(within(markers()[1]).getByText('"Snare removed"')).toBeInTheDocument();
    expect(polylines()).toHaveLength(1);
    expect(polylines()[0].dataset.positions).toBe('[[6.4,80.9],[6.41,80.91]]');
    // The map centres on the latest waypoint.
    expect(screen.getByTestId('map').dataset.center).toBe('[6.41,80.91]');
  });

  test('ignores waypoints with invalid coordinates and draws no track for a single point', () => {
    render(<PatrolMap waypoints={[wp(Number.NaN, 80.9, LocationSource.GPS), wp(6.4, 80.9, LocationSource.GPS)]} />);

    expect(markers()).toHaveLength(1);
    expect(polylines()).toHaveLength(0);
  });

  test('shows and centres on the ranger current location, fitting all points in view', () => {
    render(<PatrolMap route={route} waypoints={[wp(6.4, 80.9, LocationSource.GPS)]} currentLocation={{ latitude: 6.45, longitude: 80.95, timestamp: 0 }} />);

    expect(markers().at(-1)?.dataset.icon).toBe('🎯');
    expect(screen.getByTestId('map').dataset.center).toBe('[6.45,80.95]');
    expect(fitBounds).toHaveBeenCalledTimes(1);
    expect(fitBounds.mock.calls[0][0].getSouthWest()).toMatchObject({ lat: 6.4, lng: 80.88 });
    expect(fitBounds.mock.calls[0][0].getNorthEast()).toMatchObject({ lat: 6.498, lng: 80.95 });
  });

  test('with no route or waypoints it shows the default park view without markers', () => {
    render(<PatrolMap />);

    expect(screen.getByTestId('map').dataset.center).toBe('[6.375,81.51]');
    expect(markers()).toHaveLength(0);
    expect(fitBounds).not.toHaveBeenCalled();
  });
});
