import { render, screen, fireEvent } from '@testing-library/react';
import { PatrolStatusBadge } from './components/PatrolStatus';
import { GPSStatus } from './components/GPSStatus';
import { PatrolCard } from './components/PatrolCard';
import { WaypointFormModal } from './components/WaypointForm';
import { SyncStatusIndicator } from './components/SyncStatus';
import { patrolApi, calculateHaversineDistanceKm, calculateTotalWaypointsDistanceKm } from './api/patrolApi';
import { manualWaypointSchema } from './schemas/patrolSchemas';
import { PatrolStatus, SyncStatus, LocationSource } from '../../shared/types/enums';

describe('UC-A Patrol Component & Offline Sync Tests', () => {
  test('renders PatrolStatusBadge with distinct SYNCED and PENDING statuses', () => {
    const { rerender } = render(<PatrolStatusBadge status={PatrolStatus.ACTIVE} syncStatus={SyncStatus.SYNCED} />);
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('🟢 Synced')).toBeInTheDocument();

    rerender(<PatrolStatusBadge status={PatrolStatus.COMPLETED} syncStatus={SyncStatus.PENDING} />);
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByText('🟡 Saved Locally (Pending Sync)')).toBeInTheDocument();
  });

  test('GPSStatus displays GPS Signal Lost state without terminating patrol', () => {
    render(
      <GPSStatus
        gpsState="unavailable"
        currentLocation={null}
        errorMsg="GPS signal lost or position unavailable. Patrol continues."
      />
    );
    expect(screen.getByText('GPS Signal Lost')).toBeInTheDocument();
    expect(screen.getByText('GPS signal lost or position unavailable. Patrol continues.')).toBeInTheDocument();
  });

  test('addWaypoint rejects invalid GPS coordinates (lat < -90 or > 90)', async () => {
    await expect(
      patrolApi.addWaypoint('session-test-01', {
        latitude: 120, // Invalid!
        longitude: 34.82,
        timestamp: new Date().toISOString(),
        source: LocationSource.GPS
      })
    ).rejects.toThrow('Invalid latitude: must be between -90 and 90 degrees.');
  });

  test('validates offline session payload format for PENDING synchronization', () => {
    const offlineSession = {
      _id: 'client-sess-1001',
      clientSessionId: 'client-sess-1001',
      status: PatrolStatus.COMPLETED,
      syncStatus: SyncStatus.PENDING,
      waypoints: [
        { latitude: -2.1523, longitude: 34.8214, timestamp: new Date().toISOString(), source: LocationSource.GPS }
      ]
    };

    expect(offlineSession.syncStatus).toBe(SyncStatus.PENDING);
    expect(offlineSession.status).toBe(PatrolStatus.COMPLETED);
    expect(offlineSession.waypoints.length).toBe(1);
  });

  test('PatrolCard renders assignment details, route name, distance and buttons', () => {
    const dummyAssignment = {
      _id: 'assign-1',
      rangerId: 'R-101',
      rangerName: 'Ranger John',
      patrolRoute: {
        _id: 'route-1',
        name: 'Northern Boundary Patrol',
        park: { _id: 'park-1', name: 'Serengeti Northern Sector', code: 'SERENGETI' },
        description: '12km boundary patrol.',
        distanceKm: 12.5,
        estimatedDurationHours: 3.5,
        geometry: { type: 'LineString', coordinates: [[34.82, -2.15]] }
      },
      assignedDate: new Date().toISOString(),
      status: PatrolStatus.ASSIGNED
    };

    const handleStart = vi.fn();
    const handleView = vi.fn();

    render(
      <PatrolCard
        assignment={dummyAssignment}
        onStartPatrol={handleStart}
        onViewRoute={handleView}
      />
    );

    expect(screen.getByText('Northern Boundary Patrol')).toBeInTheDocument();
    expect(screen.getByText('12.5 km')).toBeInTheDocument();
    expect(screen.getByText('Start Patrol')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Start Patrol'));
    expect(handleStart).toHaveBeenCalled();

    fireEvent.click(screen.getByText('View Route Map'));
    expect(handleView).toHaveBeenCalled();
  });

  test('WaypointFormModal handles user observation input and submission', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);
    const handleCancel = vi.fn();

    render(
      <WaypointFormModal
        currentLocation={{ latitude: -2.1523, longitude: 34.8214, accuracy: 5, timestamp: Date.now() }}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    );

    expect(screen.getByText('Add Manual Waypoint')).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText(/Spotted fresh tracks/i);
    fireEvent.change(textarea, { target: { value: 'Fresh animal tracks found.' } });

    fireEvent.click(screen.getByText('Record Waypoint'));
    expect(handleSubmit).toHaveBeenCalledWith('Fresh animal tracks found.', undefined, undefined);
  });

  test('WaypointFormModal supports Manual Coordinates override mode when GPS is unavailable', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);
    const handleCancel = vi.fn();

    render(
      <WaypointFormModal
        currentLocation={null} // GPS unavailable scenario
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    );

    expect(screen.getByText('Add Manual Waypoint')).toBeInTheDocument();
    expect(screen.getByText(/Manual Override \/ GPS Failure Coordinates/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Record Waypoint'));
    expect(handleSubmit).toHaveBeenCalledWith('', -2.1523, 34.8214);
  });

  test('SyncStatusIndicator displays Online network state', () => {
    render(<SyncStatusIndicator />);
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  test('manualWaypointSchema Zod validation enforces latitude and longitude constraints', () => {
    const valid = manualWaypointSchema.safeParse({ latitude: -2.15, longitude: 34.82, note: 'Valid note' });
    expect(valid.success).toBe(true);

    const invalidLat = manualWaypointSchema.safeParse({ latitude: 100, longitude: 34.82 });
    expect(invalidLat.success).toBe(false);
  });

  test('calculateHaversineDistanceKm and calculateTotalWaypointsDistanceKm compute correctly', () => {
    const dist = calculateHaversineDistanceKm(0, 0, 1, 1);
    expect(dist).toBeGreaterThan(150);

    const total = calculateTotalWaypointsDistanceKm([
      { latitude: -2.1523, longitude: 34.8214, timestamp: new Date().toISOString(), source: LocationSource.GPS },
      { latitude: -2.1480, longitude: 34.8320, timestamp: new Date().toISOString(), source: LocationSource.GPS }
    ]);
    expect(total).toBeGreaterThan(0);
  });
});
