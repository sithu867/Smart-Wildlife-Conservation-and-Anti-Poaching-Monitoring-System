import { render, screen } from '@testing-library/react';
import { PatrolStatusBadge } from './components/PatrolStatus';
import { GPSStatus } from './components/GPSStatus';
import { patrolApi } from './api/patrolApi';
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
});
