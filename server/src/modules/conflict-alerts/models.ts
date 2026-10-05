import mongoose, { Schema, Document } from 'mongoose';
import {
  AlertSource,
  ConflictAlertType,
  AlertSeverity,
  AlertStatus,
  ResponseAction,
  SyncStatus,
  LocationSource
} from '../../types/enums.js';

export interface IConflictResponse {
  responseId: string;
  clientResponseId?: string;
  responderId: string;
  responderName: string;
  action: ResponseAction;
  notes: string;
  respondedAt: Date;
  outcome?: string;
}

const ConflictResponseSchema = new Schema<IConflictResponse>({
  responseId: { type: String, required: true },
  clientResponseId: { type: String, sparse: true },
  responderId: { type: String, required: true },
  responderName: { type: String, required: true },
  action: { type: String, enum: Object.values(ResponseAction), required: true },
  notes: { type: String, required: true },
  respondedAt: { type: Date, default: Date.now },
  outcome: { type: String }
});

export interface IWildlifeConflictAlert extends Document {
  clientAlertId?: string;
  sourceEventId?: string;
  source: AlertSource;
  alertType: ConflictAlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  location: {
    latitude: number;
    longitude: number;
    timestamp: Date;
    source: LocationSource;
    accuracy?: number;
  };
  description: string;
  animalId?: string;
  reporterName?: string;
  acknowledgedBy?: string;
  clientAcknowledgementId?: string;
  acknowledgedName?: string;
  acknowledgedAt?: Date;
  resolvedBy?: string;
  clientResolutionId?: string;
  resolvedName?: string;
  resolvedAt?: Date;
  resolutionNotes?: string;
  responses: IConflictResponse[];
  syncStatus: SyncStatus;
  createdAt: Date;
  updatedAt: Date;
}

const WildlifeConflictAlertSchema = new Schema<IWildlifeConflictAlert>(
  {
    clientAlertId: { type: String, index: true, sparse: true },
    sourceEventId: { type: String, index: true, sparse: true },
    source: { type: String, enum: Object.values(AlertSource), required: true, index: true },
    alertType: { type: String, enum: Object.values(ConflictAlertType), required: true, index: true },
    severity: { type: String, enum: Object.values(AlertSeverity), required: true, index: true },
    status: { type: String, enum: Object.values(AlertStatus), default: AlertStatus.OPEN, index: true },
    location: {
      latitude: { type: Number, required: true, min: -90, max: 90 },
      longitude: { type: Number, required: true, min: -180, max: 180 },
      timestamp: { type: Date, required: true, default: Date.now },
      source: { type: String, enum: Object.values(LocationSource), default: LocationSource.GPS },
      accuracy: { type: Number }
    },
    description: { type: String, required: true },
    animalId: { type: String },
    reporterName: { type: String },
    acknowledgedBy: { type: String },
    clientAcknowledgementId: { type: String, sparse: true },
    acknowledgedName: { type: String },
    acknowledgedAt: { type: Date },
    resolvedBy: { type: String },
    clientResolutionId: { type: String, sparse: true },
    resolvedName: { type: String },
    resolvedAt: { type: Date },
    resolutionNotes: { type: String },
    responses: [ConflictResponseSchema],
    syncStatus: { type: String, enum: Object.values(SyncStatus), default: SyncStatus.SYNCED }
  },
  { timestamps: true }
);

WildlifeConflictAlertSchema.index({ status: 1, severity: 1, createdAt: -1 });

export const WildlifeConflictAlertModel =
  mongoose.models.WildlifeConflictAlert ||
  mongoose.model<IWildlifeConflictAlert>('WildlifeConflictAlert', WildlifeConflictAlertSchema);
