import { http } from '../../../shared/api/http';
import { offlineDb, type OfflineRecord } from '../../../offline/db';
import { syncService } from '../../../offline/syncService';
import { SyncStatus, PatrolStatus, LocationSource } from '../../../shared/types/enums';
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

const DEFAULT_SEED_ROUTES: PatrolRoute[] = [
  {
    _id: 'route-seed-yala-01',
    name: 'Yala Block I Coastal & River Corridor',
    park: {
      _id: 'park-seed-yala-01',
      name: 'Yala National Park (Ruhuna)',
      code: 'YALA-NP',
      description: 'Southern Sri Lanka conservation park guarding Asian elephant and leopard habitats.'
    },
    description: '12.5km coastal sector sweep guarding Asian elephant corridors and river crossings.',
    distanceKm: 12.5,
    estimatedDurationHours: 3.5,
    geometry: {
      type: 'LineString',
      coordinates: [
        [81.5100, 6.3750],
        [81.5220, 6.3820],
        [81.5350, 6.3900],
        [81.5480, 6.3980],
        [81.5600, 6.4060]
      ]
    }
  },
  {
    _id: 'route-seed-wilpattu-02',
    name: 'Wilpattu Willu Basin Sweep',
    park: {
      _id: 'park-seed-wilpattu-02',
      name: 'Wilpattu National Park',
      code: 'WILPATTU-NP',
      description: 'North Western conservation zone guarding sloth bear and elephant watering holes.'
    },
    description: '8.2km natural lake basin sweep guarding sloth bear and leopard habitats.',
    distanceKm: 8.2,
    estimatedDurationHours: 2.5,
    geometry: {
      type: 'LineString',
      coordinates: [
        [80.0500, 8.4500],
        [80.0620, 8.4580],
        [80.0750, 8.4660],
        [80.0880, 8.4740]
      ]
    }
  },
  {
    _id: 'route-seed-udawalawe-03',
    name: 'Udawalawe Reservoir Elephant Patrol',
    park: {
      _id: 'park-seed-udawalawe-03',
      name: 'Udawalawe National Park',
      code: 'UDAWALAWE-NP',
      description: 'Sabaragamuwa sanctuary protecting high-density Sri Lankan elephant populations.'
    },
    description: '15.0km reservoir perimeter check guarding elephant sanctuary boundary fence.',
    distanceKm: 15.0,
    estimatedDurationHours: 4.0,
    geometry: {
      type: 'LineString',
      coordinates: [
        [80.8800, 6.4750],
        [80.8950, 6.4820],
        [80.9100, 6.4900],
        [80.9250, 6.4980]
      ]
    }
  }
];

const DEFAULT_SEED_ASSIGNMENTS: PatrolAssignment[] = [
  {
    _id: 'assign-seed-01',
    rangerId: 'R-101',
    rangerName: 'Ranger John',
    patrolRoute: DEFAULT_SEED_ROUTES[0],
    assignedDate: new Date().toISOString(),
    status: PatrolStatus.ASSIGNED,
    notes: 'Scheduled morning anti-poaching sweep in Yala Block I.'
  },
  {
    _id: 'assign-seed-02',
    rangerId: 'R-101',
    rangerName: 'Ranger John',
    patrolRoute: DEFAULT_SEED_ROUTES[1],
    assignedDate: new Date().toISOString(),
    status: PatrolStatus.ASSIGNED,
    notes: 'Willu lake basin wildlife monitoring sweep.'
  },
  {
    _id: 'assign-seed-03',
    rangerId: 'R-101',
    rangerName: 'Ranger John',
    patrolRoute: DEFAULT_SEED_ROUTES[2],
    assignedDate: new Date().toISOString(),
    status: PatrolStatus.ASSIGNED,
    notes: 'High-priority perimeter defense for Udawalawe Elephant Sanctuary.'
  }
];

const DEFAULT_SEED_HISTORY: PatrolSession[] = [
  {
    _id: 'sess-demo-yala-01',
    clientSessionId: 'sess-demo-yala-01',
    rangerId: 'R-101',
    rangerName: 'Ranger John',
    patrolAssignment: 'assign-seed-01',
    patrolRoute: DEFAULT_SEED_ROUTES[0],
    startTime: new Date(Date.now() - 3600 * 5 * 1000).toISOString(),
    endTime: new Date(Date.now() - 3600 * 1.5 * 1000).toISOString(),
    status: PatrolStatus.COMPLETED,
    syncStatus: SyncStatus.SYNCED,
    totalDistanceKm: 12.5,
    durationSeconds: 12600,
    waypoints: [
      {
        _id: 'wp-demo-1',
        latitude: 6.3750,
        longitude: 81.5100,
        timestamp: new Date(Date.now() - 3600 * 5 * 1000).toISOString(),
        source: LocationSource.GPS,
        accuracy: 5
      },
      {
        _id: 'wp-demo-2',
        latitude: 6.3820,
        longitude: 81.5220,
        timestamp: new Date(Date.now() - 3600 * 4 * 1000).toISOString(),
        source: LocationSource.MANUAL,
        accuracy: 8,
        note: 'Spotted herd of 6 Asian Elephants near watering hole.'
      },
      {
        _id: 'wp-demo-3',
        latitude: 6.3900,
        longitude: 81.5350,
        timestamp: new Date(Date.now() - 3600 * 3 * 1000).toISOString(),
        source: LocationSource.GPS,
        accuracy: 4
      },
      {
        _id: 'wp-demo-4',
        latitude: 6.3980,
        longitude: 81.5480,
        timestamp: new Date(Date.now() - 3600 * 2 * 1000).toISOString(),
        source: LocationSource.MANUAL,
        accuracy: 10,
        note: 'Unlawful wire snare identified and safely disarmed near perimeter fence.'
      },
      {
        _id: 'wp-demo-5',
        latitude: 6.4060,
        longitude: 81.5600,
        timestamp: new Date(Date.now() - 3600 * 1.5 * 1000).toISOString(),
        source: LocationSource.GPS,
        accuracy: 6
      }
    ]
  },
  {
    _id: 'sess-demo-wilpattu-02',
    clientSessionId: 'sess-demo-wilpattu-02',
    rangerId: 'R-101',
    rangerName: 'Ranger John',
    patrolAssignment: 'assign-seed-02',
    patrolRoute: DEFAULT_SEED_ROUTES[1],
    startTime: new Date(Date.now() - 86400 * 1000).toISOString(),
    endTime: new Date(Date.now() - 86400 * 1000 + 9000 * 1000).toISOString(),
    status: PatrolStatus.COMPLETED,
    syncStatus: SyncStatus.SYNCED,
    totalDistanceKm: 8.2,
    durationSeconds: 9000,
    waypoints: [
      {
        _id: 'wp-wilp-1',
        latitude: 8.4500,
        longitude: 80.0500,
        timestamp: new Date(Date.now() - 86400 * 1000).toISOString(),
        source: LocationSource.GPS,
        accuracy: 4
      },
      {
        _id: 'wp-wilp-2',
        latitude: 8.4580,
        longitude: 80.0620,
        timestamp: new Date(Date.now() - 86400 * 1000 + 3000 * 1000).toISOString(),
        source: LocationSource.MANUAL,
        accuracy: 6,
        note: 'Fresh sloth bear footprints recorded near Kali Villu lake.'
      },
      {
        _id: 'wp-wilp-3',
        latitude: 8.4740,
        longitude: 80.0880,
        timestamp: new Date(Date.now() - 86400 * 1000 + 9000 * 1000).toISOString(),
        source: LocationSource.GPS,
        accuracy: 5
      }
    ]
  }
];


export const patrolApi = {
  async getMyAssignment(): Promise<{ assignment: PatrolAssignment | null; assignments: PatrolAssignment[]; activeSession: PatrolSession | null }> {
    try {
      const response = await http.get('/patrols/my-assignment');
      if (response.data?.success) {
        const { assignment, assignments, activeSession } = response.data.data;
        if (activeSession) {
          await offlineDb.patrolSessions.put({
            remoteId: activeSession._id,
            syncStatus: SyncStatus.SYNCED,
            createdAt: activeSession.startTime,
            updatedAt: new Date().toISOString(),
            payload: activeSession
          });
        }
        return {
          assignment: assignment || DEFAULT_SEED_ASSIGNMENTS[0],
          assignments: assignments && assignments.length > 0 ? assignments : DEFAULT_SEED_ASSIGNMENTS,
          activeSession
        };
      }
    } catch (error) {
      console.warn('Network request failed, retrieving cached assignment from local storage:', error);
    }

    // Fallback to offline Dexie storage
    const cachedSessions = await offlineDb.patrolSessions.toArray();
    const activeCached = cachedSessions.find(
      s => (s.payload as PatrolSession)?.status === PatrolStatus.ACTIVE || (s.payload as PatrolSession)?.status === PatrolStatus.PAUSED
    );

    return {
      assignment: DEFAULT_SEED_ASSIGNMENTS[0],
      assignments: DEFAULT_SEED_ASSIGNMENTS,
      activeSession: activeCached ? (activeCached.payload as PatrolSession) : null
    };
  },

  async getRouteById(routeId: string): Promise<PatrolRoute> {
    try {
      const response = await http.get(`/patrols/routes/${routeId}`);
      return response.data.data;
    } catch (error) {
      console.warn('Network failed for route details, returning offline fallback route:', error);
      const matched = DEFAULT_SEED_ROUTES.find(r => r._id === routeId);
      return matched || DEFAULT_SEED_ROUTES[0];
    }
  },

  async startPatrol(assignmentId?: string): Promise<PatrolSession> {
    const clientSessionId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const selectedAssignment = DEFAULT_SEED_ASSIGNMENTS.find(a => a._id === assignmentId) || DEFAULT_SEED_ASSIGNMENTS[0];

    try {
      const response = await http.post('/patrols/sessions', { assignmentId: selectedAssignment._id, clientSessionId });
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
        patrolAssignment: selectedAssignment._id,
        patrolRoute: selectedAssignment.patrolRoute,
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
      if (session.status === PatrolStatus.COMPLETED || session.status === PatrolStatus.CANCELLED) {
        throw new Error('Completed or cancelled patrol cannot accept new waypoints.');
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

  async pausePatrol(sessionId: string): Promise<PatrolSession> {
    try {
      const response = await http.post(`/patrols/sessions/${sessionId}/pause`);
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
      console.warn('Network failed on pausePatrol, pausing locally:', error);
      const local = await findLocalRecordByRemoteId(offlineDb.patrolSessions, sessionId);
      if (!local || !local.id) throw new Error('Active patrol session not found in local storage.');

      const session = local.payload as PatrolSession;
      const pausedSession: PatrolSession = { ...session, status: PatrolStatus.PAUSED, syncStatus: SyncStatus.PENDING };
      await offlineDb.patrolSessions.update(local.id, { syncStatus: SyncStatus.PENDING, updatedAt: new Date().toISOString(), payload: pausedSession });
      return pausedSession;
    }
  },

  async resumePatrol(sessionId: string): Promise<PatrolSession> {
    try {
      const response = await http.post(`/patrols/sessions/${sessionId}/resume`);
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
      console.warn('Network failed on resumePatrol, resuming locally:', error);
      const local = await findLocalRecordByRemoteId(offlineDb.patrolSessions, sessionId);
      if (!local || !local.id) throw new Error('Active patrol session not found in local storage.');

      const session = local.payload as PatrolSession;
      const resumedSession: PatrolSession = { ...session, status: PatrolStatus.ACTIVE, syncStatus: SyncStatus.PENDING };
      await offlineDb.patrolSessions.update(local.id, { syncStatus: SyncStatus.PENDING, updatedAt: new Date().toISOString(), payload: resumedSession });
      return resumedSession;
    }
  },

  async cancelPatrol(sessionId: string, reason?: string): Promise<PatrolSession> {
    try {
      const response = await http.post(`/patrols/sessions/${sessionId}/cancel`, { reason });
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
      console.warn('Network failed on cancelPatrol, cancelling locally:', error);
      const local = await findLocalRecordByRemoteId(offlineDb.patrolSessions, sessionId);
      if (!local || !local.id) throw new Error('Active patrol session not found in local storage.');

      const session = local.payload as PatrolSession;
      const cancelledSession: PatrolSession = {
        ...session,
        status: PatrolStatus.CANCELLED,
        endTime: new Date().toISOString(),
        syncStatus: SyncStatus.PENDING
      };
      await offlineDb.patrolSessions.update(local.id, { syncStatus: SyncStatus.PENDING, updatedAt: new Date().toISOString(), payload: cancelledSession });
      return cancelledSession;
    }
  },

  async completePatrol(sessionId: string, endTime?: string): Promise<PatrolSession> {
    const finalEndTime = endTime || new Date().toISOString();

    try {
      const response = await http.post(`/patrols/sessions/${sessionId}/complete`, { endTime: finalEndTime });
      const session: PatrolSession = response.data.data;

      // Update local storage and purge any stale active markers
      const cached = await offlineDb.patrolSessions.toArray();
      for (const item of cached) {
        const payload = item.payload as PatrolSession;
        if (payload && (item.remoteId === sessionId || payload._id === sessionId || payload.clientSessionId === sessionId)) {
          await offlineDb.patrolSessions.update(item.id!, {
            syncStatus: SyncStatus.SYNCED,
            updatedAt: new Date().toISOString(),
            payload: session
          });
        } else if (payload && (payload.status === PatrolStatus.ACTIVE || payload.status === PatrolStatus.PAUSED)) {
          await offlineDb.patrolSessions.update(item.id!, {
            payload: { ...payload, status: PatrolStatus.COMPLETED }
          });
        }
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

  async getPatrolHistory(): Promise<PatrolSession[]> {
    try {
      const response = await http.get('/patrols/sessions/history');
      if (response.data?.success) {
        const remoteSessions: PatrolSession[] = response.data.data;
        for (const sess of remoteSessions) {
          const local = await findLocalRecordByRemoteId(offlineDb.patrolSessions, sess._id);
          if (!local) {
            await offlineDb.patrolSessions.put({
              remoteId: sess._id,
              syncStatus: SyncStatus.SYNCED,
              createdAt: sess.startTime,
              updatedAt: new Date().toISOString(),
              payload: sess
            });
          }
        }
        return remoteSessions;
      }
    } catch (error) {
      console.warn('Network request failed for patrol history, retrieving from local storage:', error);
    }

    const cached = await offlineDb.patrolSessions.toArray();
    if (cached.length === 0) {
      for (const sess of DEFAULT_SEED_HISTORY) {
        await offlineDb.patrolSessions.put({
          remoteId: sess._id,
          syncStatus: SyncStatus.SYNCED,
          createdAt: sess.startTime,
          updatedAt: new Date().toISOString(),
          payload: sess
        });
      }
      return DEFAULT_SEED_HISTORY;
    }
    return cached
      .map(c => c.payload as PatrolSession)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
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
