import { IncidentType, IncidentStatus, SyncStatus, LocationSource } from '../../../shared/types/enums';

export { IncidentType, IncidentStatus, SyncStatus, LocationSource };

export interface IncidentEvidence {
  evidenceId?: string;
  imageUrl: string;
  capturedAt?: string;
  fileSize?: number;
  mimeType?: string;
}

export interface ConservationIncident {
  _id: string;
  clientIncidentId?: string;
  parkId?: string | null;
  incidentType: IncidentType;
  otherTypeDescription?: string;
  description: string;
  location: {
    latitude: number;
    longitude: number;
    timestamp: string;
    source: LocationSource;
    accuracy?: number;
  };
  reportedBy: string;
  rangerName: string;
  reportedAt: string;
  patrolSession?: string | { _id: string; patrolRoute?: { name: string } };
  evidence: IncidentEvidence[];
  status: IncidentStatus;
  syncStatus: SyncStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateIncidentPayload {
  clientIncidentId?: string;
  parkId?: string;
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
