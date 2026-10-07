import {
  AlertSource,
  ConflictAlertType,
  AlertSeverity,
  AlertStatus,
  ResponseAction,
  LocationSource,
  SyncStatus
} from '../../../shared/types/enums';

export interface ConflictResponse {
  responseId: string;
  clientResponseId?: string;
  responderId: string;
  responderName: string;
  action: ResponseAction;
  notes: string;
  respondedAt: string;
  outcome?: string;
}

export interface WildlifeConflictAlert {
  parkId?: string | null;
  _id: string;
  clientAlertId?: string;
  sourceEventId?: string;
  source: AlertSource;
  alertType: ConflictAlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  location: {
    latitude: number;
    longitude: number;
    timestamp: string;
    source: LocationSource;
    accuracy?: number;
  };
  description: string;
  animalId?: string;
  reporterName?: string;
  acknowledgedBy?: string;
  clientAcknowledgementId?: string;
  acknowledgedName?: string;
  acknowledgedAt?: string;
  resolvedBy?: string;
  clientResolutionId?: string;
  resolvedName?: string;
  resolvedAt?: string;
  resolutionNotes?: string;
  responses: ConflictResponse[];
  syncStatus?: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SimulateCollarInput {
  parkId?: string;
  animalId: string;
  latitude: number;
  longitude: number;
  alertType?: ConflictAlertType;
  severity?: AlertSeverity;
  description?: string;
}

export interface CommunityReportInput {
  parkId?: string;
  reporterName?: string;
  latitude: number;
  longitude: number;
  reportType: ConflictAlertType;
  description: string;
  severity?: AlertSeverity;
}

export interface AddResponseInput {
  action: ResponseAction;
  notes: string;
  outcome?: string;
  markResolved?: boolean;
  resolutionNotes?: string;
}

export interface ResolveAlertInput {
  resolutionNotes: string;
  outcome?: string;
}
