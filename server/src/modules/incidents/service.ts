import { prisma } from '../../config/prisma.js';
import { IncidentStatus, IncidentType, PatrolStatus, SyncStatus, LocationSource } from '../../types/enums.js';
import { AppError } from '../shared/appError.js';
import { calculateHaversineDistanceKm } from '../patrols/service.js';
import { MAX_EVIDENCE_PER_INCIDENT, type CreateIncidentInput, type EvidenceInput, type UpdateIncidentInput } from './validation.js';

/** Incidents not linked to a patrol can be edited for this long after being reported. */
export const STANDALONE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Tolerated difference between the device clock and the server clock. */
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;
/** A corrected location must stay within this distance of the linked patrol's track. */
export const MAX_LOCATION_DISTANCE_FROM_PATROL_KM = 5;

export type EditLockReason = 'UNDER_INVESTIGATION' | 'INCIDENT_RESOLVED' | 'PATROL_COMPLETED' | 'PATROL_CANCELLED' | 'EDIT_WINDOW_EXPIRED';

const EDIT_LOCK_MESSAGES: Record<EditLockReason, string> = {
  UNDER_INVESTIGATION: 'This report is locked because a manager is already investigating it.',
  INCIDENT_RESOLVED: 'This report is locked because the incident has been resolved.',
  PATROL_COMPLETED: 'This report is locked because its patrol has been completed.',
  PATROL_CANCELLED: 'This report is locked because its patrol has been cancelled.',
  EDIT_WINDOW_EXPIRED: 'This report can no longer be edited. Reports without a patrol can only be edited within 24 hours.'
};

const OPEN_PATROL_STATUSES: string[] = [PatrolStatus.ACTIVE, PatrolStatus.PAUSED];

const incidentInclude = {
  patrolSession: true,
  evidence: { where: { removedAt: null }, orderBy: { capturedAt: 'asc' as const } }
} as const;

/**
 * Works out whether the incident may be edited at time `at`.
 * Patrol-linked reports are editable while the patrol is open, or for an edit made before the patrol ended
 * (offline edits sync later). Standalone reports are editable for 24 hours.
 */
export function getEditLockReason(incident: any, at: Date): EditLockReason | null {
  if (incident.status === IncidentStatus.INVESTIGATING) return 'UNDER_INVESTIGATION';
  if (incident.status === IncidentStatus.RESOLVED) return 'INCIDENT_RESOLVED';

  const session = incident.patrolSession;
  if (session) {
    if (OPEN_PATROL_STATUSES.includes(session.status)) return null;
    const endedAt: Date | null = session.endTime ? new Date(session.endTime) : null;
    if (endedAt && at.getTime() <= endedAt.getTime()) return null;
    return session.status === PatrolStatus.CANCELLED ? 'PATROL_CANCELLED' : 'PATROL_COMPLETED';
  }

  const reportedAt = new Date(incident.reportedAt).getTime();
  return at.getTime() - reportedAt > STANDALONE_EDIT_WINDOW_MS ? 'EDIT_WINDOW_EXPIRED' : null;
}

function shapeIncident(incident: any, now = new Date()): any {
  if (!incident) return incident;
  const { id, patrolSession, evidence, revisions: _revisions, ...rest } = incident;
  const editLockedReason = getEditLockReason(incident, now);
  return { _id: id, ...rest, patrolSession, evidence, canEdit: editLockedReason === null, editLockedReason };
}

function newEvidenceId(idx: number): string {
  return `evid-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
}

function toEvidenceRow(ev: EvidenceInput, idx: number, fallbackCapturedAt: Date) {
  return {
    evidenceId: newEvidenceId(idx),
    imageUrl: ev.imageUrl,
    capturedAt: ev.capturedAt ? new Date(ev.capturedAt) : fallbackCapturedAt,
    fileSize: ev.fileSize,
    mimeType: ev.mimeType || 'image/jpeg'
  };
}

/** Distance (km) from a point to the nearest recorded waypoint or route vertex of a patrol session. */
function distanceToPatrolTrackKm(session: any, latitude: number, longitude: number): number | null {
  const points: Array<{ latitude: number; longitude: number }> = (session.waypoints ?? []).map((w: any) => ({
    latitude: w.latitude,
    longitude: w.longitude
  }));
  const routeCoords: unknown = session.patrolRoute?.geometry?.coordinates;
  if (Array.isArray(routeCoords)) {
    for (const coord of routeCoords) {
      if (Array.isArray(coord) && coord.length >= 2) points.push({ latitude: Number(coord[1]), longitude: Number(coord[0]) });
    }
  }
  if (points.length === 0) return null;
  return Math.min(...points.map(p => calculateHaversineDistanceKm(p.latitude, p.longitude, latitude, longitude)));
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

export class IncidentService {
  async createIncident(rangerId: string, rangerName: string, input: CreateIncidentInput): Promise<any> {
    const reportedAt = new Date();
    let patrolSessionId: string | undefined;
    if (input.patrolSessionId) {
      const session = await prisma.patrolSession.findUnique({ where: { id: input.patrolSessionId } });
      if (session && session.rangerId !== rangerId) throw new AppError(403, 'FORBIDDEN', 'Unauthorized: Attached patrol session does not belong to this ranger.');
      if (session) patrolSessionId = session.id;
    }
    if (input.clientIncidentId) {
      const existing = await prisma.conservationIncident.findFirst({ where: { clientIncidentId: input.clientIncidentId, reportedBy: rangerId }, include: incidentInclude });
      if (existing) return shapeIncident(existing);
    }
    const incident = await prisma.conservationIncident.create({ data: { clientIncidentId: input.clientIncidentId, incidentType: input.incidentType as any, otherTypeDescription: input.incidentType === IncidentType.OTHER ? input.otherTypeDescription : undefined, description: input.description, location: { latitude: input.latitude, longitude: input.longitude, timestamp: reportedAt.toISOString(), source: input.locationSource || LocationSource.GPS }, reportedBy: rangerId, rangerName, reportedAt, patrolSessionId, status: IncidentStatus.REPORTED as any, syncStatus: SyncStatus.SYNCED as any, evidence: { create: input.evidence.map((ev, idx) => toEvidenceRow(ev, idx, reportedAt)) } }, include: incidentInclude });
    return shapeIncident(incident);
  }

  async getRangerIncidents(rangerId: string): Promise<any[]> {
    const incidents = await prisma.conservationIncident.findMany({ where: { reportedBy: rangerId }, include: incidentInclude, orderBy: { reportedAt: 'desc' } });
    const now = new Date();
    return incidents.map(incident => shapeIncident(incident, now));
  }

  async getIncidentById(rangerId: string, incidentId: string): Promise<any> {
    const incident = await prisma.conservationIncident.findUnique({ where: { id: incidentId }, include: incidentInclude });
    if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Conservation incident not found.');
    if (incident.reportedBy !== rangerId) throw new AppError(403, 'FORBIDDEN', 'Unauthorized: Incident report does not belong to this ranger.');
    return shapeIncident(incident);
  }

  async updateIncident(rangerId: string, rangerName: string, incidentId: string, input: UpdateIncidentInput): Promise<any> {
    const now = new Date();
    const editedAt = new Date(input.editedAt);

    const existing: any = await prisma.conservationIncident.findUnique({
      where: { id: incidentId },
      include: {
        patrolSession: { include: { waypoints: true, patrolRoute: true } },
        evidence: { where: { removedAt: null } }
      }
    });
    if (!existing) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Conservation incident not found.');
    if (existing.reportedBy !== rangerId) throw new AppError(403, 'FORBIDDEN', 'Unauthorized: Incident report does not belong to this ranger.');

    // 1. Idempotency: an edit that was already applied (e.g. an offline retry) returns the current report
    const alreadyApplied = await prisma.incidentRevision.findUnique({ where: { incidentId_clientEditId: { incidentId, clientEditId: input.clientEditId } } });
    if (alreadyApplied) return this.getIncidentById(rangerId, incidentId);

    // 2. editedAt sanity: not before the report existed, not in the future
    if (editedAt.getTime() > now.getTime() + CLOCK_SKEW_TOLERANCE_MS) {
      throw new AppError(400, 'INVALID_EDIT_TIME', 'editedAt cannot be in the future. Check the device clock.');
    }
    if (editedAt.getTime() < new Date(existing.reportedAt).getTime() - CLOCK_SKEW_TOLERANCE_MS) {
      throw new AppError(400, 'INVALID_EDIT_TIME', 'editedAt cannot be earlier than the time the incident was reported.');
    }

    // 3. Edit lock (status + patrol state / 24h window), evaluated at the time the edit was made
    const lockReason = getEditLockReason(existing, editedAt);
    if (lockReason) throw new AppError(409, 'INCIDENT_LOCKED', EDIT_LOCK_MESSAGES[lockReason], { reason: lockReason });

    // 4. Optimistic concurrency: the client must have edited the latest version
    if (new Date(input.expectedUpdatedAt).getTime() !== new Date(existing.updatedAt).getTime()) {
      throw new AppError(409, 'EDIT_CONFLICT', 'This report was changed on another device. Load the latest version and try again.', {
        currentUpdatedAt: new Date(existing.updatedAt).toISOString()
      });
    }

    // 5. Build the change set and validate the merged result
    const changes: Record<string, unknown> = {};
    const data: Record<string, unknown> = {};

    const finalType: IncidentType = input.incidentType ?? existing.incidentType;
    if (input.incidentType !== undefined && input.incidentType !== existing.incidentType) {
      changes.incidentType = { from: existing.incidentType, to: input.incidentType };
      data.incidentType = input.incidentType;
    }

    const existingOther: string | null = existing.otherTypeDescription ?? null;
    const finalOther: string | null =
      finalType === IncidentType.OTHER ? (input.otherTypeDescription !== undefined ? input.otherTypeDescription : existingOther) : null;
    if (finalType === IncidentType.OTHER && (finalOther ?? '').trim().length < 3) {
      throw new AppError(400, 'OTHER_DESCRIPTION_REQUIRED', 'Please describe the "Other" threat (at least 3 characters).');
    }
    if (finalOther !== existingOther) {
      changes.otherTypeDescription = { from: existingOther, to: finalOther };
      data.otherTypeDescription = finalOther;
    }

    if (input.description !== undefined && input.description !== existing.description) {
      changes.description = { from: existing.description, to: input.description };
      data.description = input.description;
    }

    // Patrol link: an unlinked report may be attached to the ranger's own open patrol; links are never moved or removed
    let patrolForLocationCheck: any = existing.patrolSession;
    if (input.patrolSessionId !== undefined && input.patrolSessionId !== existing.patrolSessionId) {
      if (existing.patrolSessionId) {
        throw new AppError(400, 'PATROL_LINK_IMMUTABLE', 'This report is already linked to a patrol and cannot be moved to another one.');
      }
      const session: any = await prisma.patrolSession.findUnique({ where: { id: input.patrolSessionId }, include: { waypoints: true, patrolRoute: true } });
      if (!session) throw new AppError(404, 'PATROL_SESSION_NOT_FOUND', 'Patrol session not found.');
      if (session.rangerId !== rangerId) throw new AppError(403, 'FORBIDDEN', 'Unauthorized: Patrol session does not belong to this ranger.');
      if (!OPEN_PATROL_STATUSES.includes(session.status)) {
        throw new AppError(409, 'PATROL_NOT_ACTIVE', 'Reports can only be linked to an active or paused patrol.');
      }
      if (new Date(existing.reportedAt).getTime() < new Date(session.startTime).getTime() - CLOCK_SKEW_TOLERANCE_MS) {
        throw new AppError(400, 'INCIDENT_BEFORE_PATROL', 'This report was made before the patrol started, so it cannot be linked to it.');
      }
      changes.patrolSessionId = { from: null, to: session.id };
      data.patrolSessionId = session.id;
      patrolForLocationCheck = session;
    }

    if (input.location) {
      const from = existing.location as { latitude: number; longitude: number; source: string };
      const to = input.location;
      if (from.latitude !== to.latitude || from.longitude !== to.longitude || from.source !== to.source) {
        if (patrolForLocationCheck) {
          const distanceKm = distanceToPatrolTrackKm(patrolForLocationCheck, to.latitude, to.longitude);
          if (distanceKm !== null && distanceKm > MAX_LOCATION_DISTANCE_FROM_PATROL_KM) {
            throw new AppError(
              400,
              'LOCATION_TOO_FAR_FROM_PATROL',
              `The new location is ${distanceKm.toFixed(1)} km from the patrol route. It must be within ${MAX_LOCATION_DISTANCE_FROM_PATROL_KM} km.`
            );
          }
        }
        changes.location = { from: { latitude: from.latitude, longitude: from.longitude, source: from.source }, to };
        data.location = { latitude: to.latitude, longitude: to.longitude, timestamp: editedAt.toISOString(), source: to.source };
      }
    }

    const activeEvidenceIds = new Set<string>(existing.evidence.map((ev: any) => ev.evidenceId));
    const removeIds = [...new Set(input.removeEvidenceIds ?? [])];
    const unknownIds = removeIds.filter(id => !activeEvidenceIds.has(id));
    if (unknownIds.length > 0) {
      throw new AppError(400, 'EVIDENCE_NOT_FOUND', 'One or more photos to remove do not belong to this report.', { evidenceIds: unknownIds });
    }
    const addEvidence = input.addEvidence ?? [];
    const finalEvidenceCount = activeEvidenceIds.size - removeIds.length + addEvidence.length;
    if (finalEvidenceCount < 1) throw new AppError(400, 'EVIDENCE_REQUIRED', 'At least one photo must remain on the report.');
    if (finalEvidenceCount > MAX_EVIDENCE_PER_INCIDENT) {
      throw new AppError(400, 'TOO_MANY_EVIDENCE', `A report can have at most ${MAX_EVIDENCE_PER_INCIDENT} photos.`);
    }
    const newEvidenceRows = addEvidence.map((ev, idx) => ({ ...toEvidenceRow(ev, idx, editedAt), incidentId }));
    if (removeIds.length > 0 || newEvidenceRows.length > 0) {
      changes.evidence = { added: newEvidenceRows.map(row => row.evidenceId), removed: removeIds };
    }

    if (Object.keys(changes).length === 0) throw new AppError(400, 'NO_CHANGES', 'No changes to save.');

    // 6. Apply atomically: conditional update (guards against a concurrent edit), evidence changes, audit row
    try {
      await prisma.$transaction(async (tx: any) => {
        const result = await tx.conservationIncident.updateMany({
          where: { id: incidentId, updatedAt: existing.updatedAt },
          data: { ...data, editCount: { increment: 1 }, lastEditedAt: now, updatedAt: now }
        });
        if (result.count === 0) {
          throw new AppError(409, 'EDIT_CONFLICT', 'This report was changed on another device. Load the latest version and try again.');
        }
        if (removeIds.length > 0) {
          await tx.incidentEvidence.updateMany({ where: { incidentId, evidenceId: { in: removeIds }, removedAt: null }, data: { removedAt: now } });
        }
        if (newEvidenceRows.length > 0) {
          await tx.incidentEvidence.createMany({ data: newEvidenceRows });
        }
        await tx.incidentRevision.create({
          data: { incidentId, clientEditId: input.clientEditId, editedBy: rangerId, editedByName: rangerName, editedAt, changes: changes as any }
        });
      });
    } catch (error) {
      // Two identical retries raced: the other one already applied this edit
      if (isUniqueConstraintError(error)) return this.getIncidentById(rangerId, incidentId);
      throw error;
    }

    return this.getIncidentById(rangerId, incidentId);
  }
}

export const incidentService = new IncidentService();
