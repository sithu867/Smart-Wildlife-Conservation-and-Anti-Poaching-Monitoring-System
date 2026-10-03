import { z } from 'zod';
import { LocationSource, PatrolStatus } from '../../types/enums.js';

export const startPatrolSchema = z.object({
  assignmentId: z.string().optional(),
  patrolRouteId: z.string().optional(),
  clientSessionId: z.string().optional(),
});

export const addWaypointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timestamp: z.string().or(z.number()).transform(val => new Date(val)),
  source: z.nativeEnum(LocationSource),
  accuracy: z.number().optional(),
  note: z.string().max(500).optional(),
});

export const completePatrolSchema = z.object({
  endTime: z.string().or(z.number()).optional().transform(val => val ? new Date(val) : new Date()),
  clientSessionId: z.string().optional(),
});

export const syncPatrolSchema = z.object({
  clientSessionId: z.string(),
  patrolAssignmentId: z.string().optional(),
  patrolRouteId: z.string().optional(),
  startTime: z.string().or(z.number()).transform(val => new Date(val)),
  endTime: z.string().or(z.number()).nullable().optional().transform(val => val ? new Date(val) : null),
  status: z.nativeEnum(PatrolStatus),
  waypoints: z.array(addWaypointSchema).default([]),
  totalDistanceKm: z.number().optional().default(0),
  durationSeconds: z.number().optional().default(0),
});
