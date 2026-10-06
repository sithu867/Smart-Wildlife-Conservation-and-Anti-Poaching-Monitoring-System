import type { LocationSource, PatrolStatus, SyncStatus } from '../../types/enums.js';

export interface IPark { id: string; name: string; code: string; description?: string | null; createdAt: Date; updatedAt: Date; }
export interface IPatrolRoute { id: string; name: string; parkId: string; park?: IPark; description: string; distanceKm: number; estimatedDurationHours: number; geometry: { type: string; coordinates: number[][] }; createdAt: Date; updatedAt: Date; }
export interface IPatrolAssignment { id: string; rangerId: string; rangerName: string; patrolRouteId: string; patrolRoute?: IPatrolRoute; assignedDate: Date; status: PatrolStatus; notes?: string | null; createdAt: Date; updatedAt: Date; }
export interface IWaypoint { id?: string; latitude: number; longitude: number; timestamp: Date; source: LocationSource; accuracy?: number; note?: string; }
export interface IPatrolSession { id: string; clientSessionId?: string | null; rangerId: string; rangerName: string; patrolAssignmentId: string; patrolRouteId: string; patrolAssignment?: IPatrolAssignment; patrolRoute?: IPatrolRoute; startTime: Date; endTime?: Date | null; status: PatrolStatus; syncStatus: SyncStatus; waypoints: IWaypoint[]; totalDistanceKm: number; durationSeconds: number; createdAt: Date; updatedAt: Date; }
