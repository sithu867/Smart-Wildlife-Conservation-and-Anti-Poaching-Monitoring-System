/**
 * UC-B "Report & Manage Conservation Incidents" - business rules for the incident CRUD.
 *
 *  - CREATE  createIncident      validates time + patrol link, looks up the place name, stores report + photos
 *  - READ    getRangerIncidents / getIncidentById (owner only, withdrawn reports hidden)
 *  - UPDATE  updateIncident      only while editable, conflict-safe, every change written to IncidentRevision
 *  - DELETE  deleteIncident      withdraw = soft delete with a reason (row, photos and history are kept)
 *  - UNDO    restoreIncident     brings a withdrawn report back while still editable
 *
 * Edit/delete lock rule (shared by all write operations - see getEditLockReason):
 *  - a report linked to a patrol can change only while that patrol is ACTIVE/PAUSED;
 *  - a report without a patrol can change for 24 hours;
 *  - once a manager is investigating or has resolved it, it never changes.
 * Offline-friendly: writes carry the device time of the action plus a client id, so a retried or late sync
 * is applied exactly once and judged by when the ranger actually did it.
 */
import { prisma } from '../../config/prisma.js';
import { IncidentStatus, IncidentType, PatrolStatus, SyncStatus, LocationSource } from '../../types/enums.js';
import { AppError } from '../shared/appError.js';
import { calculateHaversineDistanceKm } from '../patrols/service.js';
import { invalidParkScope, validateOptionalPark } from '../shared/parkScope.js';
import { lookupPlaceName, placeNameBackfill } from './placeNames.js';
import {
  MAX_EVIDENCE_PER_INCIDENT,
  type CreateIncidentInput,
  type DeleteIncidentInput,
  type EvidenceInput,
  type RestoreIncidentInput,
  type UpdateIncidentInput
} from './validation.js';

/** Incidents not linked to a patrol can be edited for this long after being reported. */
export const STANDALONE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Tolerated difference between the device clock and the server clock. */
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;
/** A corrected location must stay within this distance of the linked patrol's track. */
export const MAX_LOCATION_DISTANCE_FROM_PATROL_KM = 5;

/** Why a report can no longer be edited/deleted (returned to the client as editLockedReason). */
export type EditLockReason = 'UNDER_INVESTIGATION' | 'INCIDENT_RESOLVED' | 'PATROL_COMPLETED' | 'PATROL_CANCELLED' | 'EDIT_WINDOW_EXPIRED';

/** User-facing text for each lock reason, sent with 409 INCIDENT_LOCKED. */
const EDIT_LOCK_MESSAGES: Record<EditLockReason, string> = {
  UNDER_INVESTIGATION: 'This report is locked because a manager is already investigating it.',
  INCIDENT_RESOLVED: 'This report is locked because the incident has been resolved.',
  PATROL_COMPLETED: 'This report is locked because its patrol has been completed.',
  PATROL_CANCELLED: 'This report is locked because its patrol has been cancelled.',
  EDIT_WINDOW_EXPIRED: 'This report can no longer be edited. Reports without a patrol can only be edited within 24 hours.'
};

/** Patrol states in which linked reports are still editable. */
const OPEN_PATROL_STATUSES: string[] = [PatrolStatus.ACTIVE, PatrolStatus.PAUSED];

/** What every read returns with a report: its patrol, and only the photos that have not been removed. */
const incidentInclude = {
  patrolSession: true,
  evidence: { where: { removedAt: null }, orderBy: { capturedAt: 'asc' as const } }
} as const;
    }
  }
  if (points.length === 0) return null;
  return Math.min(...points.map(p => calculateHaversineDistanceKm(p.latitude, p.longitude, latitude, longitude)));
}

/** Prisma P2002: a unique index was hit - here it means an identical retry already wrote its audit row. */
function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

/** All incident create/read/update/delete logic. Controllers call these methods; nothing else writes incidents. */
export class IncidentService {
  /**
   * Decides which patrol a new report belongs to:
   * 1. the session the client named (by server id, or by clientSessionId for patrols started offline);
   *    the report must not be older than that patrol;
   * 2. otherwise the ranger's patrol that was running at `reportedAt` (still open, or since ended for an
   *    offline report synced later), so reports made from the Incidents screen during a patrol are part of it.
   */
  private async resolvePatrolSessionId(rangerId: string, requestedId: string | undefined, reportedAt: Date): Promise<string | undefined> {
    if (requestedId) {
      const session = await prisma.patrolSession.findFirst({
        where: { OR: [{ id: requestedId }, { clientSessionId: requestedId, rangerId }] }
      });
      if (session && session.rangerId !== rangerId) {
        throw new AppError(403, 'FORBIDDEN', 'Unauthorized: Attached patrol session does not belong to this ranger.');
      }
      if (session) {
        if (reportedAt.getTime() < session.startTime.getTime() - CLOCK_SKEW_TOLERANCE_MS) {
          throw new AppError(400, 'REPORT_BEFORE_PATROL', 'The report time is before the patrol started. Check the device clock.');
        }
        return session.id;
      }
    }

    const coveringSession = await prisma.patrolSession.findFirst({
      where: {
        rangerId,
        startTime: { lte: new Date(reportedAt.getTime() + CLOCK_SKEW_TOLERANCE_MS) },
        OR: [{ endTime: null }, { endTime: { gte: reportedAt } }],
        status: { not: PatrolStatus.ASSIGNED as any }
      },
      orderBy: { startTime: 'desc' }
    });
    return coveringSession?.id;
  }

  /** The device's report time for offline reports (validated), otherwise the server's clock. */
  private resolveReportedAt(requested: string | undefined, now: Date): Date {
    if (!requested) return now;
    const reportedAt = new Date(requested);
    if (reportedAt.getTime() > now.getTime() + CLOCK_SKEW_TOLERANCE_MS) {
      throw new AppError(400, 'INVALID_REPORT_TIME', 'The report time cannot be in the future. Check the device clock.');
    }
    return reportedAt;
  }

  /**
   * CREATE - stores a new report with its photos.
   * Also the endpoint offline reports sync to: the same clientIncidentId returns the existing report (never a
   * duplicate, and never brings back a withdrawn one), and the device's reportedAt keeps the real report time.
   */
  async createIncident(rangerId: string, rangerName: string, input: CreateIncidentInput): Promise<any> {
    const reportedAt = this.resolveReportedAt(input.reportedAt, new Date());
    const patrolSessionId = await this.resolvePatrolSessionId(rangerId, input.patrolSessionId, reportedAt);
    if (input.clientIncidentId) {
      const existing = await prisma.conservationIncident.findFirst({ where: { clientIncidentId: input.clientIncidentId, reportedBy: rangerId }, include: incidentInclude });
      if (existing) return shapeIncident(existing);
    }
    // "Pannipitiya, Sri Lanka"; left out when the lookup service is unavailable and filled in later
    const placeName = await lookupPlaceName({ latitude: input.latitude, longitude: input.longitude });
    const incident = await prisma.conservationIncident.create({
      data: {
        clientIncidentId: input.clientIncidentId,
        parkId,
        incidentType: input.incidentType as any,
        otherTypeDescription: input.incidentType === IncidentType.OTHER ? input.otherTypeDescription : undefined,
        description: input.description,
        location: {
          latitude: input.latitude,
          longitude: input.longitude,
          timestamp: reportedAt.toISOString(),
          source: input.locationSource || LocationSource.GPS,
          ...(placeName !== undefined ? { placeName } : {})
        },
        reportedBy: rangerId,
        rangerName,
        reportedAt,
        patrolSessionId,
        status: IncidentStatus.REPORTED as any,
        syncStatus: SyncStatus.SYNCED as any,
        evidence: { create: input.evidence.map((ev, idx) => toEvidenceRow(ev, idx, reportedAt)) }
      },
      include: incidentInclude
    });
    return shapeIncident(incident);
  }

  /** READ - the ranger's own reports, newest first, excluding withdrawn ones. */
  async getRangerIncidents(rangerId: string): Promise<any[]> {
    const incidents = await prisma.conservationIncident.findMany({
      where: { reportedBy: rangerId, deletedAt: null },
      include: incidentInclude,
      orderBy: { reportedAt: 'desc' }
    });
    // Reports still missing a place name get one in the background (shown on a later refresh)
    placeNameBackfill.schedule(incidents);
    const now = new Date();
    return incidents.map((incident) => shapeIncident(incident, now));
  }

  /** READ - one report: 404 if it does not exist, 403 if it is another ranger's, 410 if withdrawn. */
  async getIncidentById(rangerId: string, incidentId: string): Promise<any> {
    const incident = await prisma.conservationIncident.findUnique({ where: { id: incidentId }, include: incidentInclude });
    if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Conservation incident not found.');
    if (incident.reportedBy !== rangerId) throw new AppError(403, 'FORBIDDEN', 'Unauthorized: Incident report does not belong to this ranger.');
    if (incident.deletedAt) throw withdrawnError();
    return shapeIncident(incident, new Date());
  }
    const incident = await prisma.conservationIncident.findUnique({ where: { id: incidentId }, include: incidentInclude });
    if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Conservation incident not found.');
    if (incident.reportedBy !== rangerId) throw new AppError(403, 'FORBIDDEN', 'Unauthorized: Incident report does not belong to this ranger.');
    if (incident.deletedAt) throw withdrawnError();
    return shapeIncident(incident);
  }

  /**
   * UPDATE - applies the changed fields of a report. Steps are numbered below:
   * ownership -> already applied? -> time check -> lock check -> version check -> validate merged result -> save.
   */
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
    if (existing.deletedAt) throw withdrawnError();

    // 1. Idempotency: an edit that was already applied (e.g. an offline retry) returns the current report
    const alreadyApplied = await prisma.incidentRevision.findUnique({ where: { incidentId_clientEditId: { incidentId, clientEditId: input.clientEditId } } });
    if (alreadyApplied) return this.getIncidentById(rangerId, incidentId);

    // 2. editedAt sanity: not before the report existed, not in the future
    assertValidClientTime('editedAt', editedAt, new Date(existing.reportedAt), now);

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

    // "Other" must always have a name; switching to another type clears it
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

    // Location correction: must stay near the patrol track; the place name is looked up again
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
        const placeName = await lookupPlaceName(to);
        data.location = {
          latitude: to.latitude,
          longitude: to.longitude,
          timestamp: editedAt.toISOString(),
          source: to.source,
          ...(placeName !== undefined ? { placeName } : {})
        };
      }
    }

    // Photos: only this report's photos can be removed, and 1-5 must remain afterwards
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

  /** Loads a report (including withdrawn ones) and checks ownership. */
  private async loadOwnedIncident(rangerId: string, incidentId: string): Promise<any> {
    const incident = await prisma.conservationIncident.findUnique({ where: { id: incidentId }, include: incidentInclude });
    if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Conservation incident not found.');
    if (incident.reportedBy !== rangerId) throw new AppError(403, 'FORBIDDEN', 'Unauthorized: Incident report does not belong to this ranger.');
    return incident;
  }

  /**
   * Withdraws (soft-deletes) a report: hidden from the ranger, patrol and analytics, but kept with its photos and history.
   * Same lock rules as editing, judged at the time the ranger deleted it.
   */
  async deleteIncident(rangerId: string, incidentId: string, input: DeleteIncidentInput): Promise<any> {
    const now = new Date();
    const deletedAt = new Date(input.deletedAt);
    const existing = await this.loadOwnedIncident(rangerId, incidentId);

    // 1. Retried delete (e.g. offline sync) -> already applied
    const alreadyApplied = await prisma.incidentRevision.findUnique({ where: { incidentId_clientEditId: { incidentId, clientEditId: input.clientDeleteId } } });
    if (alreadyApplied) return shapeIncident(await this.loadOwnedIncident(rangerId, incidentId), now);
    if (existing.deletedAt) throw withdrawnError();

    // 2. The device time of the delete must be plausible
    assertValidClientTime('deletedAt', deletedAt, new Date(existing.reportedAt), now);

    // 3. Same lock rules as editing (patrol still open / within 24 h / not under investigation)
    const lockReason = getEditLockReason(existing, deletedAt);
    if (lockReason) throw new AppError(409, 'INCIDENT_LOCKED', EDIT_LOCK_MESSAGES[lockReason], { reason: lockReason });

    // 4. The ranger must have seen the latest version before deleting it
    if (new Date(input.expectedUpdatedAt).getTime() !== new Date(existing.updatedAt).getTime()) {
      throw new AppError(409, 'EDIT_CONFLICT', 'This report was changed on another device. Review the latest version before deleting it.', {
        currentUpdatedAt: new Date(existing.updatedAt).toISOString()
      });
    }

    // 5. Mark as withdrawn and record a DELETE revision, in one transaction
    const note = input.note ? input.note : null;
    try {
      await prisma.$transaction(async (tx: any) => {
        const result = await tx.conservationIncident.updateMany({
          where: { id: incidentId, updatedAt: existing.updatedAt, deletedAt: null },
          data: { deletedAt, deletedBy: rangerId, deletionReason: input.reason, deletionNote: note, updatedAt: now }
        });
        if (result.count === 0) {
          throw new AppError(409, 'EDIT_CONFLICT', 'This report was changed on another device. Review the latest version before deleting it.');
        }
        await tx.incidentRevision.create({
          data: {
            incidentId,
            clientEditId: input.clientDeleteId,
            action: 'DELETE',
            editedBy: rangerId,
            editedByName: existing.rangerName,
            editedAt: deletedAt,
            changes: { deletion: { reason: input.reason, note } }
          }
        });
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
    }

    return shapeIncident(await this.loadOwnedIncident(rangerId, incidentId), now);
  }

  /** Undo of a withdrawal, allowed while the report is still within its edit window. */
  async restoreIncident(rangerId: string, incidentId: string, input: RestoreIncidentInput): Promise<any> {
    const now = new Date();
    const restoredAt = new Date(input.restoredAt);
    const existing = await this.loadOwnedIncident(rangerId, incidentId);

    // Retried undo -> already applied; restoring a report that is not withdrawn is a 409
    const alreadyApplied = await prisma.incidentRevision.findUnique({ where: { incidentId_clientEditId: { incidentId, clientEditId: input.clientRestoreId } } });
    if (alreadyApplied) return this.getIncidentById(rangerId, incidentId);
    if (!existing.deletedAt) throw new AppError(409, 'INCIDENT_NOT_DELETED', 'This report is not deleted.');

    assertValidClientTime('restoredAt', restoredAt, new Date(existing.reportedAt), now);

    // Undo is only possible while the report would still be editable
    const lockReason = getEditLockReason(existing, restoredAt);
    if (lockReason) {
      throw new AppError(409, 'INCIDENT_LOCKED', `${EDIT_LOCK_MESSAGES[lockReason]} The deleted report can no longer be restored.`, { reason: lockReason });
    }

    try {
      await prisma.$transaction(async (tx: any) => {
        const result = await tx.conservationIncident.updateMany({
          // Clear the withdrawal fields; the RESTORE revision keeps what the deletion reason was
          where: { id: incidentId, deletedAt: existing.deletedAt },
          data: { deletedAt: null, deletedBy: null, deletionReason: null, deletionNote: null, updatedAt: now }
        });
        if (result.count === 0) throw new AppError(409, 'EDIT_CONFLICT', 'This report was changed on another device.');
        await tx.incidentRevision.create({
          data: {
            incidentId,
            clientEditId: input.clientRestoreId,
            action: 'RESTORE',
            editedBy: rangerId,
            editedByName: existing.rangerName,
            editedAt: restoredAt,
            changes: { restoredDeletion: { reason: existing.deletionReason, note: existing.deletionNote, deletedAt: existing.deletedAt } }
          }
        });
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
    }

    return this.getIncidentById(rangerId, incidentId);
  }
}

/** Shared instance used by the controller. */
export const incidentService = new IncidentService();
