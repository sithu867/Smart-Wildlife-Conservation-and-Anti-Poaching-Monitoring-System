/**
 * UC-B TypeScript shapes of the incident tables (see prisma/schema.prisma for the database definition).
 */
import type { IncidentDeletionReason, IncidentStatus, IncidentType, LocationSource, SyncStatus } from '../../types/enums.js';

/** One photo attached to a report. Photos removed during an edit are kept with removedAt set (audit). */
export interface IIncidentEvidence {
  id?: string;
  /** Public id used by the client to remove this photo */
  evidenceId: string;
  /** Base64 data URL of the JPEG/PNG/WebP image */
  imageUrl: string;
  capturedAt: Date;
  fileSize?: number;
  mimeType?: string;
  removedAt?: Date | null;
}

/** A conservation incident reported by a ranger (snare, carcass, illegal campsite, species tracks, other). */
export interface IConservationIncident {
  id: string;
  /** Id generated on the device; makes offline syncs and retries create the report only once */
  clientIncidentId?: string | null;
  incidentType: IncidentType;
  /** Required name of the threat when incidentType is OTHER */
  otherTypeDescription?: string | null;
  description: string;
  /** Where it was found; placeName ("Pannipitiya, Sri Lanka") is filled in from OpenStreetMap */
  location: { latitude: number; longitude: number; timestamp: Date; source: LocationSource; accuracy?: number; placeName?: string | null };
  /** Ranger id and name of the reporter */
  reportedBy: string;
  rangerName: string;
  /** When the ranger reported it (device time for offline reports) */
  reportedAt: Date;
  /** The patrol it was found on; the report locks when that patrol is completed */
  patrolSessionId?: string | null;
  patrolSession?: unknown;
  evidence: IIncidentEvidence[];
  /** Manager workflow: REPORTED -> INVESTIGATING -> RESOLVED (rangers can only edit while REPORTED) */
  status: IncidentStatus;
  syncStatus: SyncStatus;
  /** Number of ranger edits and when the last one happened */
  editCount: number;
  lastEditedAt?: Date | null;
  /** Withdrawal (soft delete): set when the ranger deletes the report; the row is kept for audit */
  deletedAt?: Date | null;
  deletedBy?: string | null;
  deletionReason?: IncidentDeletionReason | null;
  deletionNote?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Audit trail row: one per edit, delete or restore, with the before/after values. */
export interface IIncidentRevision {
  id: string;
  incidentId: string;
  /** Client id of the action; unique per report so a retried action is recorded once */
  clientEditId: string;
  /** EDIT | DELETE | RESTORE */
  action: string;
  editedBy: string;
  editedByName: string;
  /** When the ranger did it (device time) */
  editedAt: Date;
  /** When the server received it */
  receivedAt: Date;
  /** { field: { from, to } } for edits, { deletion: { reason, note } } for deletes */
  changes: Record<string, unknown>;
}
