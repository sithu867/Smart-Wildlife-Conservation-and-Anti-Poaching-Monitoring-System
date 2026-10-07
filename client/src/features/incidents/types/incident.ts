import { IncidentType, IncidentStatus, SyncStatus, LocationSource, PatrolStatus, IncidentDeletionReason } from '../../../shared/types/enums';

export { IncidentType, IncidentStatus, SyncStatus, LocationSource, IncidentDeletionReason };

/** Why the server will not accept edits to a report (mirrors the server's EditLockReason). */
export type EditLockReason =
  | 'UNDER_INVESTIGATION'
  | 'INCIDENT_RESOLVED'
  | 'PATROL_COMPLETED'
  | 'PATROL_CANCELLED'
  | 'EDIT_WINDOW_EXPIRED';

export interface IncidentEvidence {
  evidenceId?: string;
  imageUrl: string;
  capturedAt?: string;
  fileSize?: number;
  mimeType?: string;
}

export interface IncidentPatrolSession {
  _id?: string;
  id?: string;
  status?: PatrolStatus;
  startTime?: string;
  endTime?: string | null;
  patrolRoute?: { name: string };
}

export interface ConservationIncident {
  _id: string;
  clientIncidentId?: string;
  incidentType: IncidentType;
  otherTypeDescription?: string | null;
  description: string;
  location: {
    latitude: number;
    longitude: number;
    timestamp: string;
    source: LocationSource;
    accuracy?: number;
    /** Server-resolved name, e.g. "Pannipitiya, Sri Lanka". Absent until resolved; null when the spot has no named place. */
    placeName?: string | null;
  };
  reportedBy: string;
  rangerName: string;
  reportedAt: string;
  patrolSessionId?: string | null;
  patrolSession?: string | IncidentPatrolSession | null;
  evidence: IncidentEvidence[];
  status: IncidentStatus;
  syncStatus: SyncStatus;
  /** Server-computed: whether the reporting ranger may still edit this report */
  canEdit?: boolean;
  editLockedReason?: EditLockReason | null;
  /** Server-computed: may be withdrawn (same lock rules as editing) */
  canDelete?: boolean;
  /** Server-computed: a withdrawn report that can still be restored (Undo) */
  canRestore?: boolean;
  editCount?: number;
  lastEditedAt?: string | null;
  deletedAt?: string | null;
  deletionReason?: IncidentDeletionReason | null;
  deletionNote?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateIncidentPayload {
  clientIncidentId?: string;
  /** Device time of the report; only sent to the server when an offline report is synced */
  reportedAt?: string;
  incidentType: IncidentType;
  otherTypeDescription?: string;
  description: string;
  latitude: number;
  longitude: number;
  locationSource?: LocationSource;
  patrolSessionId?: string;
  evidence: {
    imageUrl: string;
    capturedAt?: string;
    fileSize?: number;
    mimeType?: string;
  }[];
}

/** Body of PATCH /incidents/:id. Only changed fields are sent, plus the concurrency/idempotency metadata. */
export interface UpdateIncidentPayload {
  expectedUpdatedAt: string;
  editedAt: string;
  clientEditId: string;
  incidentType?: IncidentType;
  otherTypeDescription?: string;
  description?: string;
  location?: { latitude: number; longitude: number; source: LocationSource };
  addEvidence?: { imageUrl: string; capturedAt?: string; fileSize?: number; mimeType?: string }[];
  removeEvidenceIds?: string[];
  patrolSessionId?: string;
}

/** Body of DELETE /incidents/:id (withdraw). */
export interface DeleteIncidentPayload {
  expectedUpdatedAt: string;
  deletedAt: string;
  clientDeleteId: string;
  reason: IncidentDeletionReason;
  note?: string;
}
