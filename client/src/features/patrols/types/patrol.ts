import { PatrolStatus, SyncStatus, LocationSource } from '../../../shared/types/enums';

export interface Park {
  _id: string;
  name: string;
  code: string;
  description?: string;
}

export interface PatrolRoute {
  _id: string;
  name: string;
  park: Park | string;
  description: string;
  distanceKm: number;
  estimatedDurationHours: number;
  geometry: {
    type: string;
    coordinates: number[][]; // [lon, lat] pairs
  };
}

export interface PatrolAssignment {
  _id: string;
  rangerId: string;
  rangerName: string;
  patrolRoute: PatrolRoute;
  assignedDate: string;
  status: PatrolStatus;
  notes?: string;
}

export interface Waypoint {
  _id?: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  source: LocationSource;
  accuracy?: number;
  note?: string;
}

export interface PatrolSession {
  _id: string;
  clientSessionId?: string;
  rangerId: string;
  rangerName: string;
  patrolAssignment: string | PatrolAssignment;
  patrolRoute: PatrolRoute;
  startTime: string;
  endTime?: string | null;
  status: PatrolStatus;
  syncStatus: SyncStatus;
  waypoints: Waypoint[];
  totalDistanceKm: number;
  durationSeconds: number;
}
