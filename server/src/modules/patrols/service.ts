import { prisma } from '../../config/prisma.js';
import { PatrolStatus, SyncStatus, LocationSource } from '../../types/enums.js';
import type { IWaypoint } from './models.js';

export function calculateHaversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculateTotalWaypointsDistanceKm(waypoints: IWaypoint[]): number {
  let total = 0;
  for (let i = 1; i < (waypoints?.length ?? 0); i++) total += calculateHaversineDistanceKm(waypoints[i - 1].latitude, waypoints[i - 1].longitude, waypoints[i].latitude, waypoints[i].longitude);
  return Math.round(total * 1000) / 1000;
}

const routeInclude = { park: true } as const;
const sessionInclude = { patrolRoute: { include: { park: true } }, patrolAssignment: true, waypoints: { orderBy: { timestamp: 'asc' as const } } } as const;
function routeShape(route: any): any { return route ? { _id: route.id, ...route, id: undefined, park: route.park ? { _id: route.park.id, ...route.park, id: undefined } : undefined } : route; }
function sessionShape(session: any): any {
  if (!session) return session;
  const { id, patrolRoute, patrolAssignment, waypoints, ...rest } = session;
  return { _id: id, ...rest, patrolRoute: routeShape(patrolRoute), patrolAssignment: patrolAssignment ? { _id: patrolAssignment.id, ...patrolAssignment, id: undefined } : patrolAssignment, waypoints };
}

async function ensureSeedData(rangerId: string, rangerName = 'Ranger John') {
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "PatrolStatus" ADD VALUE IF NOT EXISTS 'PAUSED';`);
    await prisma.$executeRawUnsafe(`ALTER TYPE "PatrolStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';`);
  } catch (e) {
    // Ignore if enum value already exists or not postgresql
  }

  const park = await prisma.park.upsert({
    where: { code: 'SERENGETI-NORTH' },
    update: {},
    create: {
      name: 'Serengeti Northern Sector',
      code: 'SERENGETI-NORTH',
      description: 'Northern conservation sector guarding wildlife corridors.'
    }
  });

  const routesData = [
    {
      name: 'Northern Boundary Patrol',
      description: '12km boundary patrol along the northern river sector to prevent poaching.',
      distanceKm: 12.5,
      estimatedDurationHours: 3.5,
      geometry: { type: 'LineString', coordinates: [[34.8214, -2.1523], [34.8320, -2.1480], [34.8450, -2.1410], [34.8580, -2.1350], [34.8700, -2.1300]] }
    },
    {
      name: 'Mara River Savanna Corridor',
      description: '8.2km reconnaissance patrol along Mara river wildlife crossing points.',
      distanceKm: 8.2,
      estimatedDurationHours: 2.5,
      geometry: { type: 'LineString', coordinates: [[34.8100, -2.1600], [34.8250, -2.1550], [34.8400, -2.1500], [34.8550, -2.1450]] }
    },
    {
      name: 'Rhino Sanctuary Perimeter Sweep',
      description: '15km high-priority sweep protecting endangered rhino sanctuary perimeter.',
      distanceKm: 15.0,
      estimatedDurationHours: 4.0,
      geometry: { type: 'LineString', coordinates: [[34.8300, -2.1700], [34.8420, -2.1620], [34.8550, -2.1580], [34.8680, -2.1510]] }
    }
  ];

  const createdRoutes = [];
  for (const r of routesData) {
    const existing = await prisma.patrolRoute.findFirst({ where: { parkId: park.id, name: r.name } });
    const route = existing ?? await prisma.patrolRoute.create({ data: { parkId: park.id, ...r } });
    createdRoutes.push(route);
  }

  const existingAssignments = await prisma.patrolAssignment.findMany({
    where: { rangerId, status: { in: [PatrolStatus.ASSIGNED as any, PatrolStatus.ACTIVE as any] } },
    include: { patrolRoute: { include: { park: true } } }
  });

  if (existingAssignments.length > 0) return existingAssignments;

  const newAssignments = [];
  for (const route of createdRoutes) {
    const assignment = await prisma.patrolAssignment.create({
      data: {
        rangerId,
        rangerName,
        patrolRouteId: route.id,
        status: PatrolStatus.ASSIGNED as any,
        notes: `Scheduled anti-poaching patrol for ${route.name}.`
      },
      include: { patrolRoute: { include: { park: true } } }
    });
    newAssignments.push(assignment);
  }

  return newAssignments;
}

export class PatrolService {
  async getAssignedPatrol(rangerId: string, rangerName = 'Ranger John') {
    const assignmentsList = await ensureSeedData(rangerId, rangerName);
    const activeSession = await prisma.patrolSession.findFirst({
      where: { rangerId, status: { in: [PatrolStatus.ACTIVE as any, PatrolStatus.PAUSED as any] } },
      include: sessionInclude
    });

    const formattedAssignments = (Array.isArray(assignmentsList) ? assignmentsList : [assignmentsList]).map(a => ({
      _id: a.id,
      ...a,
      id: undefined,
      patrolRoute: routeShape(a.patrolRoute)
    }));

    return {
      assignment: formattedAssignments[0] || null,
      assignments: formattedAssignments,
      activeSession: sessionShape(activeSession)
    };
  }

  async getPatrolRoute(routeId: string) {
    const route = await prisma.patrolRoute.findUnique({ where: { id: routeId }, include: routeInclude });
    if (!route) throw new Error('Patrol route not found');
    return routeShape(route);
  }

  async startPatrol(rangerId: string, rangerName = 'Ranger John', assignmentId?: string, clientSessionId?: string) {
    let assignment = assignmentId
      ? await prisma.patrolAssignment.findUnique({ where: { id: assignmentId }, include: { patrolRoute: true } })
      : await prisma.patrolAssignment.findFirst({ where: { rangerId, status: PatrolStatus.ASSIGNED as any }, include: { patrolRoute: true } });

    if (!assignment || assignment.rangerId !== rangerId) {
      const seeded = await ensureSeedData(rangerId, rangerName);
      const matched = assignmentId ? seeded.find(a => a.id === assignmentId || a.patrolRouteId === assignment?.patrolRouteId) : null;
      assignment = matched || seeded[0];
    }

    if (!assignment) throw new Error('No valid patrol assignment found for ranger.');

    const existing = await prisma.patrolSession.findFirst({
      where: { rangerId, status: { in: [PatrolStatus.ACTIVE as any, PatrolStatus.PAUSED as any] } },
      include: sessionInclude
    });

    if (existing) {
      if (clientSessionId && existing.clientSessionId === clientSessionId) return sessionShape(existing);
      throw new Error('A patrol session is already active or paused for this ranger.');
    }

    const session = await prisma.patrolSession.create({
      data: {
        clientSessionId,
        rangerId,
        rangerName,
        patrolAssignmentId: assignment.id,
        patrolRouteId: assignment.patrolRouteId,
        startTime: new Date(),
        status: PatrolStatus.ACTIVE as any,
        syncStatus: SyncStatus.SYNCED as any
      },
      include: sessionInclude
    });

    await prisma.patrolAssignment.update({ where: { id: assignment.id }, data: { status: PatrolStatus.ACTIVE as any } });
    return sessionShape(session);
  }

  async pausePatrol(rangerId: string, sessionId: string) {
    const session = await prisma.patrolSession.findUnique({ where: { id: sessionId }, include: sessionInclude });
    if (!session) throw new Error('Patrol session not found.');
    if (session.rangerId !== rangerId) throw new Error('Unauthorized: Patrol session does not belong to this ranger.');
    if (session.status !== (PatrolStatus.ACTIVE as any)) throw new Error('Only ACTIVE patrol sessions can be paused.');

    const updated = await prisma.patrolSession.update({
      where: { id: sessionId },
      data: { status: PatrolStatus.PAUSED as any },
      include: sessionInclude
    });
    return sessionShape(updated);
  }

  async resumePatrol(rangerId: string, sessionId: string) {
    const session = await prisma.patrolSession.findUnique({ where: { id: sessionId }, include: sessionInclude });
    if (!session) throw new Error('Patrol session not found.');
    if (session.rangerId !== rangerId) throw new Error('Unauthorized: Patrol session does not belong to this ranger.');
    if (session.status !== (PatrolStatus.PAUSED as any)) throw new Error('Only PAUSED patrol sessions can be resumed.');

    const updated = await prisma.patrolSession.update({
      where: { id: sessionId },
      data: { status: PatrolStatus.ACTIVE as any },
      include: sessionInclude
    });
    return sessionShape(updated);
  }

  async cancelPatrol(rangerId: string, sessionId: string) {
    const session = await prisma.patrolSession.findUnique({ where: { id: sessionId }, include: sessionInclude });
    if (!session) throw new Error('Patrol session not found.');
    if (session.rangerId !== rangerId) throw new Error('Unauthorized: Patrol session does not belong to this ranger.');
    if (session.status === (PatrolStatus.COMPLETED as any)) throw new Error('Completed patrol session cannot be cancelled.');

    const updated = await prisma.$transaction(async (tx: any) => {
      const result = await tx.patrolSession.update({
        where: { id: sessionId },
        data: {
          status: PatrolStatus.CANCELLED as any,
          endTime: new Date(),
          durationSeconds: Math.max(0, Math.round((Date.now() - session.startTime.getTime()) / 1000))
        },
        include: sessionInclude
      });
      await tx.patrolAssignment.update({
        where: { id: session.patrolAssignmentId },
        data: { status: PatrolStatus.ASSIGNED as any }
      });
      return result;
    });

    return sessionShape(updated);
  }

  async addWaypoint(rangerId: string, sessionId: string, waypointData: { latitude: number; longitude: number; timestamp: Date; source: LocationSource; accuracy?: number; note?: string }) {
    if (waypointData.latitude < -90 || waypointData.latitude > 90) throw new Error('Invalid latitude: must be between -90 and 90 degrees.');
    if (waypointData.longitude < -180 || waypointData.longitude > 180) throw new Error('Invalid longitude: must be between -180 and 180 degrees.');
    const session = await prisma.patrolSession.findUnique({ where: { id: sessionId }, include: { waypoints: true } });
    if (!session) throw new Error('Patrol session not found.');
    if (session.rangerId !== rangerId) throw new Error('Unauthorized: Patrol session does not belong to this ranger.');
    if (session.status !== (PatrolStatus.ACTIVE as any)) throw new Error('Cannot add waypoints to a patrol session that is not ACTIVE.');
    const waypoints = [...session.waypoints, waypointData] as IWaypoint[];
    const updated = await prisma.$transaction(async (tx: any) => {
      await tx.waypoint.create({ data: { patrolSessionId: sessionId, latitude: waypointData.latitude, longitude: waypointData.longitude, timestamp: waypointData.timestamp || new Date(), source: waypointData.source as any, accuracy: waypointData.accuracy, note: waypointData.note } });
      return tx.patrolSession.update({ where: { id: sessionId }, data: { totalDistanceKm: calculateTotalWaypointsDistanceKm(waypoints), durationSeconds: Math.round((Date.now() - session.startTime.getTime()) / 1000) }, include: sessionInclude });
    });
    return sessionShape(updated);
  }

  async completePatrol(rangerId: string, sessionId: string, endTime = new Date()) {
    const session = await prisma.patrolSession.findUnique({ where: { id: sessionId }, include: { waypoints: true } });
    if (!session) throw new Error('Patrol session not found.');
    if (session.rangerId !== rangerId) throw new Error('Unauthorized: Patrol session does not belong to this ranger.');
    if (session.status === (PatrolStatus.COMPLETED as any)) throw new Error('Patrol session is already COMPLETED.');
    const updated = await prisma.$transaction(async (tx: any) => {
      const result = await tx.patrolSession.update({ where: { id: sessionId }, data: { status: PatrolStatus.COMPLETED as any, endTime, durationSeconds: Math.max(0, Math.round((endTime.getTime() - session.startTime.getTime()) / 1000)), totalDistanceKm: calculateTotalWaypointsDistanceKm(session.waypoints as IWaypoint[]), syncStatus: SyncStatus.SYNCED as any }, include: sessionInclude });
      await tx.patrolSession.updateMany({
        where: { rangerId, status: { in: [PatrolStatus.ACTIVE as any, PatrolStatus.PAUSED as any] } },
        data: { status: PatrolStatus.COMPLETED as any, endTime }
      });
      await tx.patrolAssignment.update({ where: { id: session.patrolAssignmentId }, data: { status: PatrolStatus.COMPLETED as any } });
      return result;
    });
    return sessionShape(updated);
  }

  async getPatrolSession(rangerId: string, sessionId: string) {
    const session = await prisma.patrolSession.findUnique({ where: { id: sessionId }, include: sessionInclude });
    if (!session) throw new Error('Patrol session not found.');
    if (session.rangerId !== rangerId) throw new Error('Unauthorized: Patrol session does not belong to this ranger.');
    return sessionShape(session);
  }

  async getPatrolHistory(rangerId: string) {
    const sessions = await prisma.patrolSession.findMany({ where: { rangerId }, include: sessionInclude, orderBy: { startTime: 'desc' } });
    return sessions.map(sessionShape);
  }

  async syncPatrolSession(rangerId: string, rangerName: string, payload: { clientSessionId: string; patrolAssignmentId?: string; patrolRouteId?: string; startTime: Date; endTime?: Date | null; status: PatrolStatus; waypoints: IWaypoint[]; totalDistanceKm?: number; durationSeconds?: number }) {
    const existing = await prisma.patrolSession.findFirst({ where: { clientSessionId: payload.clientSessionId, rangerId }, include: sessionInclude });
    const assignment = payload.patrolAssignmentId ? await prisma.patrolAssignment.findUnique({ where: { id: payload.patrolAssignmentId } }) : ((await ensureSeedData(rangerId, rangerName)) as any)[0];
    if (!assignment) throw new Error('Failed to resolve assignment for sync.');
    if (existing) {
      await prisma.waypoint.deleteMany({ where: { patrolSessionId: existing.id } });
      const updated = await prisma.patrolSession.update({ where: { id: existing.id }, data: { status: payload.status as any, endTime: payload.endTime ?? null, durationSeconds: payload.durationSeconds ?? existing.durationSeconds, totalDistanceKm: calculateTotalWaypointsDistanceKm(payload.waypoints), syncStatus: SyncStatus.SYNCED as any, waypoints: { create: payload.waypoints.map(point => ({ latitude: point.latitude, longitude: point.longitude, timestamp: point.timestamp, source: point.source as any, accuracy: point.accuracy, note: point.note })) } }, include: sessionInclude });
      return sessionShape(updated);
    }
    const calculatedDuration = payload.endTime ? Math.max(0, Math.round((payload.endTime.getTime() - payload.startTime.getTime()) / 1000)) : payload.durationSeconds ?? 0;
    const session = await prisma.patrolSession.create({ data: { clientSessionId: payload.clientSessionId, rangerId, rangerName, patrolAssignmentId: assignment.id, patrolRouteId: payload.patrolRouteId ?? assignment.patrolRouteId, startTime: payload.startTime, endTime: payload.endTime ?? null, status: payload.status as any, syncStatus: SyncStatus.SYNCED as any, totalDistanceKm: calculateTotalWaypointsDistanceKm(payload.waypoints), durationSeconds: calculatedDuration, waypoints: { create: payload.waypoints.map(point => ({ latitude: point.latitude, longitude: point.longitude, timestamp: point.timestamp, source: point.source as any, accuracy: point.accuracy, note: point.note })) } }, include: sessionInclude });
    await prisma.patrolAssignment.update({ where: { id: assignment.id }, data: { status: payload.status === PatrolStatus.COMPLETED ? PatrolStatus.COMPLETED as any : PatrolStatus.ACTIVE as any } });
    return sessionShape(session);
  }
}

export const patrolService = new PatrolService();
