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
  const park = await prisma.park.upsert({ where: { code: 'SERENGETI-NORTH' }, update: {}, create: { name: 'Serengeti Northern Sector', code: 'SERENGETI-NORTH', description: 'Northern conservation sector guarding wildlife corridors.' } });
  const geometry = { type: 'LineString', coordinates: [[34.8214, -2.1523], [34.8320, -2.1480], [34.8450, -2.1410], [34.8580, -2.1350], [34.8700, -2.1300]] };
  const existingRoute = await prisma.patrolRoute.findFirst({ where: { parkId: park.id, name: 'Northern Boundary Patrol' } });
  const route = existingRoute ?? await prisma.patrolRoute.create({ data: { name: 'Northern Boundary Patrol', parkId: park.id, description: '12km boundary patrol along the northern river sector to prevent poaching.', distanceKm: 12.5, estimatedDurationHours: 3.5, geometry } });
  const existing = await prisma.patrolAssignment.findFirst({ where: { rangerId, status: { in: [PatrolStatus.ASSIGNED as any, PatrolStatus.ACTIVE as any] } }, include: { patrolRoute: { include: { park: true } } } });
  if (existing) return existing;
  return prisma.patrolAssignment.create({ data: { rangerId, rangerName, patrolRouteId: route.id, status: PatrolStatus.ASSIGNED as any, notes: 'Scheduled morning anti-poaching patrol.' }, include: { patrolRoute: { include: { park: true } } } });
}

export class PatrolService {
  async getAssignedPatrol(rangerId: string, rangerName = 'Ranger John') {
    const assignment = await ensureSeedData(rangerId, rangerName);
    const activeSession = await prisma.patrolSession.findFirst({ where: { rangerId, status: PatrolStatus.ACTIVE as any }, include: sessionInclude });
    return { assignment: { _id: assignment.id, ...assignment, id: undefined, patrolRoute: routeShape(assignment.patrolRoute) }, activeSession: sessionShape(activeSession) };
  }

  async getPatrolRoute(routeId: string) {
    const route = await prisma.patrolRoute.findUnique({ where: { id: routeId }, include: routeInclude });
    if (!route) throw new Error('Patrol route not found');
    return routeShape(route);
  }

  async startPatrol(rangerId: string, rangerName = 'Ranger John', assignmentId?: string, clientSessionId?: string) {
    let assignment = assignmentId ? await prisma.patrolAssignment.findUnique({ where: { id: assignmentId }, include: { patrolRoute: true } }) : await prisma.patrolAssignment.findFirst({ where: { rangerId, status: PatrolStatus.ASSIGNED as any }, include: { patrolRoute: true } });
    if (!assignment) assignment = await ensureSeedData(rangerId, rangerName) as any;
    if (!assignment) throw new Error('No valid patrol assignment found for ranger.');
    if (assignment.rangerId !== rangerId) throw new Error('Unauthorized: Patrol assignment does not belong to this ranger.');
    const existing = await prisma.patrolSession.findFirst({ where: { rangerId, status: PatrolStatus.ACTIVE as any }, include: sessionInclude });
    if (existing) { if (clientSessionId && existing.clientSessionId === clientSessionId) return sessionShape(existing); throw new Error('A patrol session is already active for this ranger.'); }
    const session = await prisma.patrolSession.create({ data: { clientSessionId, rangerId, rangerName, patrolAssignmentId: assignment.id, patrolRouteId: assignment.patrolRouteId, startTime: new Date(), status: PatrolStatus.ACTIVE as any, syncStatus: SyncStatus.SYNCED as any }, include: sessionInclude });
    await prisma.patrolAssignment.update({ where: { id: assignment.id }, data: { status: PatrolStatus.ACTIVE as any } });
    return sessionShape(session);
  }

  async addWaypoint(rangerId: string, sessionId: string, waypointData: { latitude: number; longitude: number; timestamp: Date; source: LocationSource; accuracy?: number; note?: string }) {
    if (waypointData.latitude < -90 || waypointData.latitude > 90) throw new Error('Invalid latitude: must be between -90 and 90 degrees.');
    if (waypointData.longitude < -180 || waypointData.longitude > 180) throw new Error('Invalid longitude: must be between -180 and 180 degrees.');
    const session = await prisma.patrolSession.findUnique({ where: { id: sessionId }, include: { waypoints: true } });
    if (!session) throw new Error('Patrol session not found.');
    if (session.rangerId !== rangerId) throw new Error('Unauthorized: Patrol session does not belong to this ranger.');
    if (session.status !== PatrolStatus.ACTIVE) throw new Error('Cannot add waypoints to a patrol session that is not ACTIVE.');
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
    if (session.status === PatrolStatus.COMPLETED) throw new Error('Patrol session is already COMPLETED.');
    const updated = await prisma.$transaction(async (tx: any) => {
      const result = await tx.patrolSession.update({ where: { id: sessionId }, data: { status: PatrolStatus.COMPLETED as any, endTime, durationSeconds: Math.max(0, Math.round((endTime.getTime() - session.startTime.getTime()) / 1000)), totalDistanceKm: calculateTotalWaypointsDistanceKm(session.waypoints as IWaypoint[]), syncStatus: SyncStatus.SYNCED as any }, include: sessionInclude });
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
    const assignment = payload.patrolAssignmentId ? await prisma.patrolAssignment.findUnique({ where: { id: payload.patrolAssignmentId } }) : await ensureSeedData(rangerId, rangerName);
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
