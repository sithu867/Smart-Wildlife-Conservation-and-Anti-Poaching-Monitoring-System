import mongoose from 'mongoose';
import {
  ParkModel,
  PatrolRouteModel,
  PatrolAssignmentModel,
  PatrolSessionModel,
  type IPatrolAssignment,
  type IPatrolSession,
  type IWaypoint
} from './models.js';
import { PatrolStatus, SyncStatus, LocationSource } from '../../types/enums.js';

export function calculateHaversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
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

export function calculateTotalWaypointsDistanceKm(waypoints: IWaypoint[]): number {
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

const MOCK_PARK = {
  _id: '67a000000000000000000001',
  name: 'Serengeti Northern Sector',
  code: 'SERENGETI-NORTH',
  description: 'Northern conservation sector guarding wildlife corridors.'
};

const MOCK_ROUTE = {
  _id: '67a000000000000000000002',
  name: 'Northern Boundary Patrol',
  park: MOCK_PARK,
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

const memorySessionsStore = new Map<string, any>();

async function ensureSeedData(rangerId: string, rangerName: string = 'Ranger John') {
  if (mongoose.connection.readyState !== 1) {
    return {
      _id: '67a000000000000000000003',
      rangerId,
      rangerName,
      patrolRoute: MOCK_ROUTE,
      assignedDate: new Date(),
      status: PatrolStatus.ASSIGNED,
      notes: 'Scheduled morning anti-poaching patrol.'
    } as any;
  }

  let park = await ParkModel.findOne({ code: 'SERENGETI-NORTH' });
  if (!park) {
    park = await ParkModel.create({
      name: 'Serengeti Northern Sector',
      code: 'SERENGETI-NORTH',
      description: 'Northern conservation sector guarding wildlife corridors.'
    });
  }

  let route = await PatrolRouteModel.findOne({ park: park._id, name: 'Northern Boundary Patrol' });
  if (!route) {
    route = await PatrolRouteModel.create({
      name: 'Northern Boundary Patrol',
      park: park._id,
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
    });
  }

  let assignment = await PatrolAssignmentModel.findOne({
    rangerId,
    status: { $in: [PatrolStatus.ASSIGNED, PatrolStatus.ACTIVE] }
  }).populate({
    path: 'patrolRoute',
    populate: { path: 'park' }
  });

  if (!assignment) {
    const createdAssignment = await PatrolAssignmentModel.create({
      rangerId,
      rangerName,
      patrolRoute: route._id,
      status: PatrolStatus.ASSIGNED,
      notes: 'Scheduled morning anti-poaching patrol.'
    });
    assignment = await PatrolAssignmentModel.findById(createdAssignment._id).populate({
      path: 'patrolRoute',
      populate: { path: 'park' }
    });
  }

  return assignment;
}

export class PatrolService {
  async getAssignedPatrol(rangerId: string, rangerName: string = 'Ranger John') {
    if (mongoose.connection.readyState !== 1) {
      const activeSession = Array.from(memorySessionsStore.values()).find(
        s => s.rangerId === rangerId && s.status === PatrolStatus.ACTIVE
      );
      const assignment = {
        _id: '67a000000000000000000003',
        rangerId,
        rangerName,
        patrolRoute: MOCK_ROUTE,
        assignedDate: new Date(),
        status: activeSession ? PatrolStatus.ACTIVE : PatrolStatus.ASSIGNED,
        notes: 'Scheduled morning anti-poaching patrol.'
      };
      return { assignment, activeSession: activeSession || null };
    }

    let assignment = await PatrolAssignmentModel.findOne({
      rangerId,
      status: { $in: [PatrolStatus.ASSIGNED, PatrolStatus.ACTIVE] }
    }).populate({
      path: 'patrolRoute',
      populate: { path: 'park' }
    });

    if (!assignment) {
      assignment = await ensureSeedData(rangerId, rangerName);
    }

    const activeSession = await PatrolSessionModel.findOne({
      rangerId,
      status: PatrolStatus.ACTIVE
    });

    return {
      assignment,
      activeSession
    };
  }

  async getPatrolRoute(routeId: string) {
    if (mongoose.connection.readyState !== 1) {
      return MOCK_ROUTE as any;
    }

    const route = await PatrolRouteModel.findById(routeId).populate('park');
    if (!route) {
      throw new Error('Patrol route not found');
    }
    return route;
  }

  async startPatrol(rangerId: string, rangerName: string = 'Ranger John', assignmentId?: string, clientSessionId?: string) {
    if (mongoose.connection.readyState !== 1) {
      const existingActive = Array.from(memorySessionsStore.values()).find(
        s => s.rangerId === rangerId && s.status === PatrolStatus.ACTIVE
      );
      if (existingActive) {
        if (clientSessionId && existingActive.clientSessionId === clientSessionId) {
          return existingActive;
        }
        throw new Error('A patrol session is already active for this ranger.');
      }

      const id = `67a${Date.now().toString(16).padStart(21, '0')}`;
      const session = {
        _id: id,
        clientSessionId,
        rangerId,
        rangerName,
        patrolAssignment: assignmentId || '67a000000000000000000003',
        patrolRoute: MOCK_ROUTE,
        startTime: new Date(),
        status: PatrolStatus.ACTIVE,
        syncStatus: SyncStatus.SYNCED,
        waypoints: [],
        totalDistanceKm: 0,
        durationSeconds: 0
      };
      memorySessionsStore.set(id, session);
      return session;
    }

    let assignment: IPatrolAssignment | null = null;
    if (assignmentId) {
      assignment = await PatrolAssignmentModel.findById(assignmentId);
    } else {
      assignment = await PatrolAssignmentModel.findOne({
        rangerId,
        status: PatrolStatus.ASSIGNED
      });
    }

    if (!assignment) {
      const seedRes = await ensureSeedData(rangerId, rangerName);
      assignment = seedRes;
    }

    if (!assignment) {
      throw new Error('No valid patrol assignment found for ranger.');
    }

    if (assignment.rangerId !== rangerId) {
      throw new Error('Unauthorized: Patrol assignment does not belong to this ranger.');
    }

    const existingActive = await PatrolSessionModel.findOne({
      rangerId,
      status: PatrolStatus.ACTIVE
    });

    if (existingActive) {
      if (clientSessionId && existingActive.clientSessionId === clientSessionId) {
        return existingActive;
      }
      throw new Error('A patrol session is already active for this ranger.');
    }

    const session = await PatrolSessionModel.create({
      clientSessionId,
      rangerId,
      rangerName,
      patrolAssignment: assignment._id,
      patrolRoute: assignment.patrolRoute,
      startTime: new Date(),
      status: PatrolStatus.ACTIVE,
      syncStatus: SyncStatus.SYNCED,
      waypoints: [],
      totalDistanceKm: 0,
      durationSeconds: 0
    });

    assignment.status = PatrolStatus.ACTIVE;
    await assignment.save();

    return session;
  }

  async addWaypoint(
    rangerId: string,
    sessionId: string,
    waypointData: {
      latitude: number;
      longitude: number;
      timestamp: Date;
      source: LocationSource;
      accuracy?: number;
      note?: string;
    }
  ) {
    if (waypointData.latitude < -90 || waypointData.latitude > 90) {
      throw new Error('Invalid latitude: must be between -90 and 90 degrees.');
    }
    if (waypointData.longitude < -180 || waypointData.longitude > 180) {
      throw new Error('Invalid longitude: must be between -180 and 180 degrees.');
    }

    if (mongoose.connection.readyState !== 1) {
      const session = memorySessionsStore.get(sessionId);
      if (!session) throw new Error('Patrol session not found.');
      if (session.rangerId !== rangerId) throw new Error('Unauthorized: Patrol session does not belong to this ranger.');
      if (session.status !== PatrolStatus.ACTIVE) throw new Error('Cannot add waypoints to a patrol session that is not ACTIVE.');

      const newWaypoint: IWaypoint = {
        latitude: waypointData.latitude,
        longitude: waypointData.longitude,
        timestamp: waypointData.timestamp || new Date(),
        source: waypointData.source,
        accuracy: waypointData.accuracy,
        note: waypointData.note
      };

      session.waypoints.push(newWaypoint);
      session.totalDistanceKm = calculateTotalWaypointsDistanceKm(session.waypoints);
      session.durationSeconds = Math.round((new Date().getTime() - new Date(session.startTime).getTime()) / 1000);
      return session;
    }

    const session = await PatrolSessionModel.findById(sessionId);
    if (!session) {
      throw new Error('Patrol session not found.');
    }

    if (session.rangerId !== rangerId) {
      throw new Error('Unauthorized: Patrol session does not belong to this ranger.');
    }

    if (session.status !== PatrolStatus.ACTIVE) {
      throw new Error('Cannot add waypoints to a patrol session that is not ACTIVE.');
    }

    const newWaypoint: IWaypoint = {
      latitude: waypointData.latitude,
      longitude: waypointData.longitude,
      timestamp: waypointData.timestamp || new Date(),
      source: waypointData.source,
      accuracy: waypointData.accuracy,
      note: waypointData.note
    };

    session.waypoints.push(newWaypoint);
    session.totalDistanceKm = calculateTotalWaypointsDistanceKm(session.waypoints);
    session.durationSeconds = Math.round((new Date().getTime() - session.startTime.getTime()) / 1000);
    await session.save();

    return session;
  }

  async completePatrol(rangerId: string, sessionId: string, endTime?: Date) {
    if (mongoose.connection.readyState !== 1) {
      const session = memorySessionsStore.get(sessionId);
      if (!session) throw new Error('Patrol session not found.');
      if (session.rangerId !== rangerId) throw new Error('Unauthorized: Patrol session does not belong to this ranger.');
      if (session.status === PatrolStatus.COMPLETED) throw new Error('Patrol session is already COMPLETED.');

      const finalEndTime = endTime || new Date();
      session.status = PatrolStatus.COMPLETED;
      session.endTime = finalEndTime;
      session.durationSeconds = Math.max(0, Math.round((finalEndTime.getTime() - new Date(session.startTime).getTime()) / 1000));
      session.totalDistanceKm = calculateTotalWaypointsDistanceKm(session.waypoints);
      session.syncStatus = SyncStatus.SYNCED;
      return session;
    }

    const session = await PatrolSessionModel.findById(sessionId);
    if (!session) {
      throw new Error('Patrol session not found.');
    }

    if (session.rangerId !== rangerId) {
      throw new Error('Unauthorized: Patrol session does not belong to this ranger.');
    }

    if (session.status === PatrolStatus.COMPLETED) {
      throw new Error('Patrol session is already COMPLETED.');
    }

    const finalEndTime = endTime || new Date();
    session.status = PatrolStatus.COMPLETED;
    session.endTime = finalEndTime;
    session.durationSeconds = Math.max(0, Math.round((finalEndTime.getTime() - session.startTime.getTime()) / 1000));
    session.totalDistanceKm = calculateTotalWaypointsDistanceKm(session.waypoints);
    session.syncStatus = SyncStatus.SYNCED;

    await session.save();

    if (session.patrolAssignment) {
      await PatrolAssignmentModel.findByIdAndUpdate(session.patrolAssignment, {
        status: PatrolStatus.COMPLETED
      });
    }

    return session;
  }

  async getPatrolSession(rangerId: string, sessionId: string) {
    if (mongoose.connection.readyState !== 1) {
      const session = memorySessionsStore.get(sessionId);
      if (!session) throw new Error('Patrol session not found.');
      if (session.rangerId !== rangerId) throw new Error('Unauthorized: Patrol session does not belong to this ranger.');
      return session;
    }

    const session = await PatrolSessionModel.findById(sessionId)
      .populate({
        path: 'patrolRoute',
        populate: { path: 'park' }
      })
      .populate('patrolAssignment');

    if (!session) {
      throw new Error('Patrol session not found.');
    }

    if (session.rangerId !== rangerId) {
      throw new Error('Unauthorized: Patrol session does not belong to this ranger.');
    }

    return session;
  }

  async getPatrolHistory(rangerId: string) {
    if (mongoose.connection.readyState !== 1) {
      const sessions = Array.from(memorySessionsStore.values()).filter(
        s => s.rangerId === rangerId
      );
      return sessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    }

    const sessions = await PatrolSessionModel.find({ rangerId })
      .populate({
        path: 'patrolRoute',
        populate: { path: 'park' }
      })
      .sort({ startTime: -1 });

    return sessions;
  }

  async syncPatrolSession(
    rangerId: string,
    rangerName: string = 'Ranger John',
    payload: {
      clientSessionId: string;
      patrolAssignmentId?: string;
      patrolRouteId?: string;
      startTime: Date;
      endTime?: Date | null;
      status: PatrolStatus;
      waypoints: IWaypoint[];
      totalDistanceKm?: number;
      durationSeconds?: number;
    }
  ) {
    if (mongoose.connection.readyState !== 1) {
      let existing = Array.from(memorySessionsStore.values()).find(
        s => s.clientSessionId === payload.clientSessionId && s.rangerId === rangerId
      );

      if (existing) {
        existing.waypoints = payload.waypoints || existing.waypoints;
        existing.status = payload.status || existing.status;
        existing.endTime = payload.endTime || existing.endTime;
        existing.durationSeconds = payload.durationSeconds ?? existing.durationSeconds;
        existing.totalDistanceKm = calculateTotalWaypointsDistanceKm(existing.waypoints);
        existing.syncStatus = SyncStatus.SYNCED;
        return existing;
      }

      const id = `67a${Date.now().toString(16).padStart(21, '0')}`;
      const session = {
        _id: id,
        clientSessionId: payload.clientSessionId,
        rangerId,
        rangerName,
        patrolAssignment: '67a000000000000000000003',
        patrolRoute: MOCK_ROUTE,
        startTime: payload.startTime,
        endTime: payload.endTime || null,
        status: payload.status,
        syncStatus: SyncStatus.SYNCED,
        waypoints: payload.waypoints || [],
        totalDistanceKm: calculateTotalWaypointsDistanceKm(payload.waypoints || []),
        durationSeconds: payload.durationSeconds || 0
      };
      memorySessionsStore.set(id, session);
      return session;
    }

    let session = await PatrolSessionModel.findOne({
      clientSessionId: payload.clientSessionId,
      rangerId
    });

    if (session) {
      session.waypoints = payload.waypoints || session.waypoints;
      session.status = payload.status || session.status;
      session.endTime = payload.endTime || session.endTime;
      session.durationSeconds = payload.durationSeconds ?? session.durationSeconds;
      session.totalDistanceKm = calculateTotalWaypointsDistanceKm(session.waypoints);
      session.syncStatus = SyncStatus.SYNCED;
      await session.save();

      if (session.patrolAssignment && session.status === PatrolStatus.COMPLETED) {
        await PatrolAssignmentModel.findByIdAndUpdate(session.patrolAssignment, {
          status: PatrolStatus.COMPLETED
        });
      }
      return session;
    }

    let assignment = await ensureSeedData(rangerId, rangerName);
    if (!assignment) {
      throw new Error('Failed to resolve assignment for sync.');
    }

    const calculatedDist = calculateTotalWaypointsDistanceKm(payload.waypoints || []);
    const calculatedDuration = payload.endTime
      ? Math.max(0, Math.round((new Date(payload.endTime).getTime() - new Date(payload.startTime).getTime()) / 1000))
      : payload.durationSeconds || 0;

    session = await PatrolSessionModel.create({
      clientSessionId: payload.clientSessionId,
      rangerId,
      rangerName,
      patrolAssignment: assignment._id,
      patrolRoute: assignment.patrolRoute,
      startTime: payload.startTime,
      endTime: payload.endTime || null,
      status: payload.status,
      syncStatus: SyncStatus.SYNCED,
      waypoints: payload.waypoints || [],
      totalDistanceKm: calculatedDist,
      durationSeconds: calculatedDuration
    });

    if (payload.status === PatrolStatus.COMPLETED) {
      await PatrolAssignmentModel.findByIdAndUpdate(assignment._id, {
        status: PatrolStatus.COMPLETED
      });
    } else {
      await PatrolAssignmentModel.findByIdAndUpdate(assignment._id, {
        status: PatrolStatus.ACTIVE
      });
    }

    return session;
  }
}

export const patrolService = new PatrolService();
