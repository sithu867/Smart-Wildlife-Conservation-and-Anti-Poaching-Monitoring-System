import mongoose, { Schema, Document } from 'mongoose';
import { IncidentType, IncidentStatus, SyncStatus, LocationSource } from '../../types/enums.js';

export interface IIncidentEvidence {
  evidenceId: string;
  imageUrl: string;
  capturedAt: Date;
  fileSize?: number;
  mimeType?: string;
}

const IncidentEvidenceSchema = new Schema<IIncidentEvidence>({
  evidenceId: { type: String, required: true },
  imageUrl: { type: String, required: true },
  capturedAt: { type: Date, default: Date.now },
  fileSize: { type: Number },
  mimeType: { type: String, default: 'image/jpeg' }
});

export interface IConservationIncident extends Document {
  clientIncidentId?: string;
  incidentType: IncidentType;
  otherTypeDescription?: string;
  description: string;
  location: {
    latitude: number;
    longitude: number;
    timestamp: Date;
    source: LocationSource;
    accuracy?: number;
  };
  reportedBy: string; // rangerId
  rangerName: string;
  reportedAt: Date;
  patrolSession?: mongoose.Types.ObjectId;
  evidence: IIncidentEvidence[];
  status: IncidentStatus;
  syncStatus: SyncStatus;
  createdAt: Date;
  updatedAt: Date;
}

const ConservationIncidentSchema = new Schema<IConservationIncident>(
  {
    clientIncidentId: { type: String, index: true, sparse: true },
    incidentType: { type: String, enum: Object.values(IncidentType), required: true, index: true },
    otherTypeDescription: { type: String },
    description: { type: String, required: true },
    location: {
      latitude: { type: Number, required: true, min: -90, max: 90 },
      longitude: { type: Number, required: true, min: -180, max: 180 },
      timestamp: { type: Date, required: true, default: Date.now },
      source: { type: String, enum: Object.values(LocationSource), default: LocationSource.GPS },
      accuracy: { type: Number }
    },
    reportedBy: { type: String, required: true, index: true },
    rangerName: { type: String, required: true },
    reportedAt: { type: Date, required: true, default: Date.now },
    patrolSession: { type: Schema.Types.ObjectId, ref: 'PatrolSession', required: false, index: true },
    evidence: [IncidentEvidenceSchema],
    status: { type: String, enum: Object.values(IncidentStatus), default: IncidentStatus.REPORTED, index: true },
    syncStatus: { type: String, enum: Object.values(SyncStatus), default: SyncStatus.SYNCED }
  },
  { timestamps: true }
);

export const ConservationIncidentModel =
  mongoose.models.ConservationIncident ||
  mongoose.model<IConservationIncident>('ConservationIncident', ConservationIncidentSchema);
