import { http } from '../../../shared/api/http';
import { offlineDb, type OfflineRecord } from '../../../offline/db';
import { syncService, type SyncQueueItem } from '../../../offline/syncService';
import { SyncStatus, PatrolStatus } from '../../../shared/types/enums';
import type { PatrolAssignment, PatrolSession, PatrolRoute, Waypoint } from '../types/patrol';

async function findLocalRecordByRemoteId(table: typeof offlineDb.patrolSessions, remoteId: string): Promise<OfflineRecord | undefined> {
  try {
    return await table.filter(item => item.remoteId === remoteId || (item.payload as PatrolSession)?._id === remoteId || (item.payload as PatrolSession)?.clientSessionId === remoteId).first();
  } catch (error) {
    console.warn('Error querying local store by remoteId:', error);
    return undefined;
  }
}

export function calculateHaversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateTotalWaypointsDistanceKm(waypoints: Waypoint[]): number {
  if (!waypoints || waypoints.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    total += calculateHaversineDistanceKm(
      waypoints[i - 1].latitude,
      waypoints[i - 1].longitude,
      waypoints[i].latitude,
      waypoints[i].longitude
    );
  }
  return Math.round(total * 1000) / 1000;
}

const DEFAULT_SEED_ROUTE: PatrolRoute = {
  _id: 'route-seed-north-01',
  name: 'Northern Boundary Patrol',
  park: {
    _id: 'park-seed-serengeti-01',
    name: 'Serengeti Northern Sector',
    code: 'SERENGETI-NORTH',
    description: 'Northern conservation sector guarding wildlife corridors.'
  },
  description: '12km boundary patrol along the northern river sector to prevent poaching.',
  distanceKm: 12.5,
  estimatedDurationHours: 3.5,
  geometry: {
    type: 'LineString',
    coordinates: [
      [34.8214, -2.1523],
      [34.8320, -2.1480],
      [34.8450, -2.1410],
      [34.8580, -2.1350],
      [34.8700, -2.1300]
    ]
  }
};

const DEFAULT_SEED_ASSIGNMENT: PatrolAssignment = {
  _id: 'assign-seed-01',
  rangerId: 'R-101',
  rangerName: 'Ranger John',
  patrolRoute: DEFAULT_SEED_ROUTE,
  assignedDate: new Date().toISOString(),
  status: PatrolStatus.ASSIGNED,
  notes: 'Scheduled morning anti-poaching patrol.'
};

export const patrolApi = {
  async getMyAssignment(): Promise<{ assignment: PatrolAssignment | null; activeSession: PatrolSession | null }> {
    try {
      const response = await http.get('/patrols/my-assignment');
      if (response.data?.success) {
        const { assignment, activeSession } = response.data.data;
        if (activeSession) {
          await offlineDb.patrolSessions.put({
            remoteId: activeSession._id,
            syncStatus: SyncStatus.SYNCED,
            createdAt: activeSession.startTime,
            updatedAt: new Date().toISOString(),
            payload: activeSession
          });
        }
        return { assignment, activeSession };
      }
    } catch (error) {
      console.warn('Network request failed, retrieving cached assignment from local storage:', error);
    }

    // Fallback to offline Dexie storage
    const cachedSessions = await offlineDb.patrolSessions.toArray();
    const activeCached = cachedSessions.find(s => (s.payload as PatrolSession)?.status === PatrolStatus.ACTIVE);

    return {
      assignment: DEFAULT_SEED_ASSIGNMENT,
      activeSession: activeCached ? (activeCached.payload as PatrolSession) : null
    };
  },

  async getRouteById(routeId: string): Promise<PatrolRoute> {
    try {
      const response = await http.get(`/patrols/routes/${routeId}`);
      return response.data.data;
    } catch (error) {
      console.warn('Network failed for route details, returning offline fallback route:', error);
      return DEFAULT_SEED_ROUTE;
    }
  },

  async startPatrol(assignmentId?: string): Promise<PatrolSession> {
    const clientSessionId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    try {
      const response = await http.post('/patrols/sessions', { assignmentId, clientSessionId });
      const session: PatrolSession = response.data.data;

      await offlineDb.patrolSessions.put({
        remoteId: session._id,
        syncStatus: SyncStatus.SYNCED,
        createdAt: session.startTime,
        updatedAt: new Date().toISOString(),
        payload: session
      });

      return session;
    } catch (error) {
      console.warn('Starting patrol offline due to network error:', error);

      // Create local offline active patrol session
      const offlineSession: PatrolSession = {
        _id: clientSessionId,
        clientSessionId,
        rangerId: 'R-101',
        rangerName: 'Ranger John',
        patrolAssignment: assignmentId || DEFAULT_SEED_ASSIGNMENT._id,
        patrolRoute: DEFAULT_SEED_ROUTE,
        startTime: new Date().toISOString(),
        endTime: null,
        status: PatrolStatus.ACTIVE,
        syncStatus: SyncStatus.PENDING,
        waypoints: [],
        totalDistanceKm: 0,
        durationSeconds: 0
      };

      try {
        const id = await offlineDb.patrolSessions.put({
          remoteId: clientSessionId,
          syncStatus: SyncStatus.PENDING,
          createdAt: offlineSession.startTime,
          updatedAt: new Date().toISOString(),
          payload: offlineSession
        });

        await syncService.enqueue({
          entity: 'PATROL_SESSION',
          operation: 'CREATE',
          recordId: id,
          payload: offlineSession
        });
      } catch (dbErr) {
        console.error('Local storage failure on startPatrol:', dbErr);
        throw new Error('Unable to save patrol data locally. Please check device storage before proceeding.');
      }

      return offlineSession;
    }
  },

  async addWaypoint(sessionId: string, waypoint: Omit<Waypoint, '_id'>): Promise<PatrolSession> {
    // Validate coordinates
    if (waypoint.latitude < -90 || waypoint.latitude > 90) {
      throw new Error('Invalid latitude: must be between -90 and 90 degrees.');
    }
    if (waypoint.longitude < -180 || waypoint.longitude > 180) {
      throw new Error('Invalid longitude: must be between -180 and 180 degrees.');
    }

    try {
      const response = await http.post(`/patrols/sessions/${sessionId}/waypoints`, waypoint);
      const session: PatrolSession = response.data.data;

      await offlineDb.waypoints.add({
        remoteId: sessionId,
        syncStatus: SyncStatus.SYNCED,
        createdAt: waypoint.timestamp,
        updatedAt: new Date().toISOString(),
        payload: waypoint
      });

      const local = await findLocalRecordByRemoteId(offlineDb.patrolSessions, sessionId);
      if (local && local.id) {
        await offlineDb.patrolSessions.update(local.id, {
          syncStatus: SyncStatus.SYNCED,
          updatedAt: new Date().toISOString(),
          payload: session
        });
      }

      return session;
    } catch (error) {
      console.warn('Network failed for addWaypoint, appending offline waypoint locally:', error);

      const local = await findLocalRecordByRemoteId(offlineDb.patrolSessions, sessionId);
      if (!local || !local.id) {
        throw new Error('Active patrol session not found in local storage.');
      }

      const session = local.payload as PatrolSession;
      if (session.status === PatrolStatus.COMPLETED) {
        throw new Error('Completed patrol cannot accept new waypoints.');
      }

      const updatedWaypoints = [...(session.waypoints || []), waypoint];
      const updatedDistance = calculateTotalWaypointsDistanceKm(updatedWaypoints);
      const updatedDuration = Math.round((new Date().getTime() - new Date(session.startTime).getTime()) / 1000);

      const updatedSession: PatrolSession = {
        ...session,
        waypoints: updatedWaypoints,
        totalDistanceKm: updatedDistance,
        durationSeconds: updatedDuration,
        syncStatus: SyncStatus.PENDING
      };

      try {
        await offlineDb.waypoints.add({
          remoteId: sessionId,
          syncStatus: SyncStatus.PENDING,
          createdAt: waypoint.timestamp,
          updatedAt: new Date().toISOString(),
          payload: waypoint
        });

        await offlineDb.patrolSessions.update(local.id, {
          syncStatus: SyncStatus.PENDING,
          updatedAt: new Date().toISOString(),
          payload: updatedSession
        });

        await syncService.enqueue({
          entity: 'PATROL_SESSION',
          operation: 'UPDATE',
          recordId: local.id,
          payload: updatedSession
        });
      } catch (dbErr) {
        console.error('Local storage error adding waypoint:', dbErr);
        throw new Error('Unable to save waypoint locally. Device storage error.');
      }

      return updatedSession;
    }
  },

  async completePatrol(sessionId: string, endTime?: string): Promise<PatrolSession> {
    const finalEndTime = endTime || new Date().toISOString();

    try {
      const response = await http.post(`/patrols/sessions/${sessionId}/complete`, { endTime: finalEndTime });
      const session: PatrolSession = response.data.data;

      const local = await findLocalRecordByRemoteId(offlineDb.patrolSessions, sessionId);
      if (local && local.id) {
        await offlineDb.patrolSessions.update(local.id, {
          syncStatus: SyncStatus.SYNCED,
          updatedAt: new Date().toISOString(),
          payload: session
        });
      }

      return session;
    } catch (error) {
      console.warn('Network failed on completePatrol, completing locally with PENDING sync:', error);

      const local = await findLocalRecordByRemoteId(offlineDb.patrolSessions, sessionId);
      if (!local || !local.id) {
        throw new Error('Active patrol session not found in local storage.');
      }

      const session = local.payload as PatrolSession;
      const duration = Math.max(0, Math.round((new Date(finalEndTime).getTime() - new Date(session.startTime).getTime()) / 1000));
      const distance = calculateTotalWaypointsDistanceKm(session.waypoints || []);

      const completedSession: PatrolSession = {
        ...session,
        status: PatrolStatus.COMPLETED,
        endTime: finalEndTime,
        durationSeconds: duration,
        totalDistanceKm: distance,
        syncStatus: SyncStatus.PENDING
      };

      try {
        await offlineDb.patrolSessions.update(local.id, {
          syncStatus: SyncStatus.PENDING,
          updatedAt: new Date().toISOString(),
          payload: completedSession
        });

        await syncService.enqueue({
          entity: 'PATROL_SESSION',
          operation: 'UPDATE',
          recordId: local.id,
          payload: completedSession
        });
      } catch (dbErr) {
        console.error('Local storage failure completing patrol:', dbErr);
        throw new Error('Unable to save completion status locally. Please do not close app.');
      }

      return completedSession;
    }
  },

  async getSessionById(sessionId: string): Promise<PatrolSession> {
    try {
      const response = await http.get(`/patrols/sessions/${sessionId}`);
      return response.data.data;
    } catch (error) {
      console.warn('Unable to fetch session from API, attempting local retrieval:', error);
      const local = await findLocalRecordByRemoteId(offlineDb.patrolSessions, sessionId);
      if (local && local.payload) {
        return local.payload as PatrolSession;
      }
      throw new Error('Patrol session not found in local or central storage.');
    }
  },

  async syncSessionPayload(payload: unknown): Promise<PatrolSession> {
    const session = payload as PatrolSession;
    const response = await http.post('/patrols/sessions/sync', {
      clientSessionId: session.clientSessionId || session._id,
      patrolAssignmentId: typeof session.patrolAssignment === 'object' ? session.patrolAssignment._id : session.patrolAssignment,
      patrolRouteId: session.patrolRoute._id,
      startTime: session.startTime,
      endTime: session.endTime,
      status: session.status,
      waypoints: session.waypoints || [],
      totalDistanceKm: session.totalDistanceKm,
      durationSeconds: session.durationSeconds
    });

    const syncedSession: PatrolSession = response.data.data;

    // Update local record to SYNCED
    const local = await findLocalRecordByRemoteId(offlineDb.patrolSessions, session._id);
    if (local && local.id) {
      await offlineDb.patrolSessions.update(local.id, {
        syncStatus: SyncStatus.SYNCED,
        updatedAt: new Date().toISOString(),
        payload: syncedSession
      });
    }

    return syncedSession;
  }
};

// Register Patrol Session Sync Transport with SyncService
syncService.registerTransport('PATROL_SESSION', async item => {
  if (item.payload) {
    await patrolApi.syncSessionPayload(item.payload);
  }
});
