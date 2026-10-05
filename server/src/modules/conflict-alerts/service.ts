import mongoose from 'mongoose';
import { WildlifeConflictAlertModel, type IWildlifeConflictAlert, type IConflictResponse } from './models.js';
import {
  AlertSource,
  ConflictAlertType,
  AlertSeverity,
  AlertStatus,
  ResponseAction,
  SyncStatus,
  LocationSource
} from '../../types/enums.js';
import type {
  CreateAlertInput,
  SimulateCollarInput,
  CommunityReportInput,
  AddResponseInput,
  ResolveAlertInput
} from './validation.js';

const memoryAlertsStore = new Map<string, any>();

export class ConflictAlertService {
  /**
   * Helper to format alert payload for output
   */
  private formatAlert(alert: any): any {
    return alert;
  }

  /**
   * Create a new conflict alert (Direct / Simulated / API)
   */
  async createAlert(input: CreateAlertInput): Promise<any> {
    const {
      clientAlertId,
      sourceEventId,
      source,
      alertType,
      severity,
      latitude,
      longitude,
      description,
      animalId,
      reporterName,
      locationSource
    } = input;

    const createdAt = new Date();

    if (mongoose.connection.readyState !== 1) {
      // Memory fallback for tests
      if (sourceEventId) {
        const existing = Array.from(memoryAlertsStore.values()).find(a => a.sourceEventId === sourceEventId);
        if (existing) return existing;
      }
      if (clientAlertId) {
        const existing = Array.from(memoryAlertsStore.values()).find(a => a.clientAlertId === clientAlertId);
        if (existing) return existing;
      }

      const id = `67c${Date.now().toString(16).padStart(21, '0')}`;
      const alert = {
        _id: id,
        clientAlertId,
        sourceEventId: sourceEventId || `src-evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        source,
        alertType,
        severity,
        status: AlertStatus.OPEN,
        location: {
          latitude,
          longitude,
          timestamp: createdAt,
          source: locationSource || LocationSource.GPS
        },
        description,
        animalId: source === AlertSource.COLLAR ? animalId || 'ELEPHANT-001' : animalId,
        reporterName: source === AlertSource.COMMUNITY_REPORT ? reporterName || 'Community Member' : reporterName,
        acknowledgedBy: null,
        acknowledgedName: null,
        acknowledgedAt: null,
        resolvedBy: null,
        resolvedName: null,
        resolvedAt: null,
        resolutionNotes: null,
        responses: [],
        syncStatus: SyncStatus.SYNCED,
        createdAt,
        updatedAt: createdAt
      };

      memoryAlertsStore.set(id, alert);
      return alert;
    }

    // Deduplication check
    if (sourceEventId) {
      const existing = await WildlifeConflictAlertModel.findOne({ sourceEventId });
      if (existing) return existing;
    }
    if (clientAlertId) {
      const existing = await WildlifeConflictAlertModel.findOne({ clientAlertId });
      if (existing) return existing;
    }

    const alert = await WildlifeConflictAlertModel.create({
      clientAlertId,
      sourceEventId: sourceEventId || `src-evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      source,
      alertType,
      severity,
      status: AlertStatus.OPEN,
      location: {
        latitude,
        longitude,
        timestamp: createdAt,
        source: locationSource || LocationSource.GPS
      },
      description,
      animalId: source === AlertSource.COLLAR ? animalId || 'ELEPHANT-001' : animalId,
      reporterName: source === AlertSource.COMMUNITY_REPORT ? reporterName || 'Community Member' : reporterName,
      responses: [],
      syncStatus: SyncStatus.SYNCED
    });

    return alert;
  }

  /**
   * Collar Simulator: Deterministic alert generation for wildlife collar events
   */
  async simulateCollarEvent(input: SimulateCollarInput): Promise<any> {
    const { animalId, latitude, longitude, alertType, severity, description, sourceEventId } = input;
    const generatedSourceEventId = sourceEventId || `collar-evt-${animalId}-${latitude.toFixed(4)}-${longitude.toFixed(4)}`;

    return this.createAlert({
      sourceEventId: generatedSourceEventId,
      source: AlertSource.COLLAR,
      alertType: alertType || ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY,
      severity: severity || AlertSeverity.HIGH,
      latitude,
      longitude,
      description: description || `Collar detection alert for tracked animal ${animalId} near high-risk boundary.`,
      animalId,
      locationSource: LocationSource.GPS
    });
  }

  /**
   * Community Report Input: Generate conflict alert from community report
   */
  async submitCommunityReport(input: CommunityReportInput): Promise<any> {
    const { reporterName, latitude, longitude, reportType, description, severity, sourceEventId } = input;
    const generatedSourceEventId = sourceEventId || `comm-rpt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    return this.createAlert({
      sourceEventId: generatedSourceEventId,
      source: AlertSource.COMMUNITY_REPORT,
      alertType: reportType,
      severity: severity || AlertSeverity.MEDIUM,
      latitude,
      longitude,
      description,
      reporterName: reporterName || 'Community Member',
      locationSource: LocationSource.MANUAL
    });
  }

  /**
   * Get all conflict alerts with optional filtering
   */
  async getAlerts(filters?: { status?: string; severity?: string; alertType?: string }): Promise<any[]> {
    if (mongoose.connection.readyState !== 1) {
      let list = Array.from(memoryAlertsStore.values());
      if (filters?.status) list = list.filter(a => a.status === filters.status);
      if (filters?.severity) list = list.filter(a => a.severity === filters.severity);
      if (filters?.alertType) list = list.filter(a => a.alertType === filters.alertType);

      return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    const query: any = {};
    if (filters?.status) query.status = filters.status;
    if (filters?.severity) query.severity = filters.severity;
    if (filters?.alertType) query.alertType = filters.alertType;

    return WildlifeConflictAlertModel.find(query).sort({ createdAt: -1 });
  }

  /**
   * Get alert by ID
   */
  async getAlertById(alertId: string): Promise<any> {
    if (mongoose.connection.readyState !== 1) {
      const alert = memoryAlertsStore.get(alertId);
      if (!alert) throw new Error('Wildlife conflict alert not found.');
      return alert;
    }

    let alert: any = null;
    if (mongoose.isValidObjectId(alertId)) {
      alert = await WildlifeConflictAlertModel.findById(alertId);
    }
    if (!alert) {
      alert = await WildlifeConflictAlertModel.findOne({ clientAlertId: alertId });
    }
    if (!alert) throw new Error('Wildlife conflict alert not found.');
    return alert;
  }

  /**
   * Acknowledge alert (OPEN -> ACKNOWLEDGED)
   */
  async acknowledgeAlert(rangerId: string, rangerName: string, alertId: string, clientAcknowledgementId?: string): Promise<any> {
    const acknowledgedAt = new Date();

    if (mongoose.connection.readyState !== 1) {
      const alert = memoryAlertsStore.get(alertId);
      if (!alert) throw new Error('Wildlife conflict alert not found.');

      if (clientAcknowledgementId && alert.clientAcknowledgementId === clientAcknowledgementId) return alert;
      if (alert.status === AlertStatus.RESOLVED) throw new Error('Resolved alert cannot be acknowledged.');
      if (alert.status !== AlertStatus.OPEN) throw new Error(`Invalid state transition: ${alert.status} alert cannot be acknowledged.`);

      // Record acknowledgement
      alert.status = AlertStatus.ACKNOWLEDGED;
      alert.acknowledgedBy = rangerId;
      alert.clientAcknowledgementId = clientAcknowledgementId;
      alert.acknowledgedName = rangerName;
      alert.acknowledgedAt = acknowledgedAt;
      alert.updatedAt = acknowledgedAt;

      memoryAlertsStore.set(alertId, alert);
      return alert;
    }

    let alert: any = null;
    if (mongoose.isValidObjectId(alertId)) {
      alert = await WildlifeConflictAlertModel.findById(alertId);
    }
    if (!alert) {
      alert = await WildlifeConflictAlertModel.findOne({ clientAlertId: alertId });
    }
    if (!alert) throw new Error('Wildlife conflict alert not found.');

    if (clientAcknowledgementId && alert.clientAcknowledgementId === clientAcknowledgementId) return alert;
    if (alert.status === AlertStatus.RESOLVED) throw new Error('Resolved alert cannot be acknowledged.');
    if (alert.status !== AlertStatus.OPEN) throw new Error(`Invalid state transition: ${alert.status} alert cannot be acknowledged.`);

    alert.status = AlertStatus.ACKNOWLEDGED;
    alert.acknowledgedBy = rangerId;
    alert.clientAcknowledgementId = clientAcknowledgementId;
    alert.acknowledgedName = rangerName;
    alert.acknowledgedAt = acknowledgedAt;
    await alert.save();

    return alert;
  }

  /**
   * Record a response action (ACKNOWLEDGED -> RESPONDING, or RESPONDING -> RESPONDING/RESOLVED)
   */
  async addResponse(rangerId: string, rangerName: string, alertId: string, input: AddResponseInput): Promise<any> {
    const { action, notes, outcome, markResolved, resolutionNotes, clientResponseId } = input;
    const respondedAt = new Date();

    const newResponse: IConflictResponse = {
      responseId: `resp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      clientResponseId,
      responderId: rangerId,
      responderName: rangerName,
      action,
      notes,
      respondedAt,
      outcome
    };

    if (mongoose.connection.readyState !== 1) {
      const alert = memoryAlertsStore.get(alertId);
      if (!alert) throw new Error('Wildlife conflict alert not found.');

      if (clientResponseId) {
        const existing = alert.responses.find((response: IConflictResponse) => response.clientResponseId === clientResponseId);
        if (existing) return alert;
      }
      if (alert.status === AlertStatus.RESOLVED) {
        throw new Error('Invalid state transition: Resolved alert cannot accept new responses.');
      }
      if (alert.status !== AlertStatus.ACKNOWLEDGED && alert.status !== AlertStatus.RESPONDING) {
        // Must acknowledge first
        throw new Error('Invalid state transition: Alert must be acknowledged before recording response.');
      }

      alert.responses.push(newResponse);

      if (markResolved) {
        alert.status = AlertStatus.RESOLVED;
        alert.resolvedBy = rangerId;
        alert.resolvedName = rangerName;
        alert.resolvedAt = respondedAt;
        alert.resolutionNotes = resolutionNotes || notes;
      } else {
        alert.status = AlertStatus.RESPONDING;
      }
      alert.updatedAt = respondedAt;

      memoryAlertsStore.set(alertId, alert);
      return alert;
    }

    let alert: any = null;
    if (mongoose.isValidObjectId(alertId)) {
      alert = await WildlifeConflictAlertModel.findById(alertId);
    }
    if (!alert) {
      alert = await WildlifeConflictAlertModel.findOne({ clientAlertId: alertId });
    }
    if (!alert) throw new Error('Wildlife conflict alert not found.');

    if (clientResponseId) {
      const existing = alert.responses.find((response: IConflictResponse) => response.clientResponseId === clientResponseId);
      if (existing) return alert;
    }
    if (alert.status === AlertStatus.RESOLVED) {
      throw new Error('Invalid state transition: Resolved alert cannot accept new responses.');
    }
    if (alert.status !== AlertStatus.ACKNOWLEDGED && alert.status !== AlertStatus.RESPONDING) {
      throw new Error('Invalid state transition: Alert must be acknowledged before recording response.');
    }

    alert.responses.push(newResponse);

    if (markResolved) {
      alert.status = AlertStatus.RESOLVED;
      alert.resolvedBy = rangerId;
      alert.resolvedName = rangerName;
      alert.resolvedAt = respondedAt;
      alert.resolutionNotes = resolutionNotes || notes;
    } else {
      alert.status = AlertStatus.RESPONDING;
    }

    await alert.save();
    return alert;
  }

  /**
   * Resolve an alert (RESPONDING or ACKNOWLEDGED -> RESOLVED)
   */
  async resolveAlert(rangerId: string, rangerName: string, alertId: string, input: ResolveAlertInput): Promise<any> {
    const { resolutionNotes, outcome } = input;
    const resolvedAt = new Date();

    if (mongoose.connection.readyState !== 1) {
      const alert = memoryAlertsStore.get(alertId);
      if (!alert) throw new Error('Wildlife conflict alert not found.');

      if (input.clientActionId && alert.clientResolutionId === input.clientActionId) return alert;

      if (alert.status === AlertStatus.RESOLVED) {
        throw new Error('Invalid state transition: Alert is already resolved.');
      }

      if (alert.status !== AlertStatus.RESPONDING) {
        throw new Error(`Invalid state transition: ${alert.status} alert cannot be resolved.`);
      }

      alert.status = AlertStatus.RESOLVED;
      alert.resolvedBy = rangerId;
      alert.clientResolutionId = input.clientActionId;
      alert.resolvedName = rangerName;
      alert.resolvedAt = resolvedAt;
      alert.resolutionNotes = resolutionNotes;
      alert.updatedAt = resolvedAt;

      memoryAlertsStore.set(alertId, alert);
      return alert;
    }

    let alert: any = null;
    if (mongoose.isValidObjectId(alertId)) {
      alert = await WildlifeConflictAlertModel.findById(alertId);
    }
    if (!alert) {
      alert = await WildlifeConflictAlertModel.findOne({ clientAlertId: alertId });
    }
    if (!alert) throw new Error('Wildlife conflict alert not found.');

    if (input.clientActionId && alert.clientResolutionId === input.clientActionId) return alert;

    if (alert.status === AlertStatus.RESOLVED) {
      throw new Error('Invalid state transition: Alert is already resolved.');
    }

    if (alert.status !== AlertStatus.RESPONDING) throw new Error(`Invalid state transition: ${alert.status} alert cannot be resolved.`);

    alert.status = AlertStatus.RESOLVED;
    alert.resolvedBy = rangerId;
    alert.clientResolutionId = input.clientActionId;
    alert.resolvedName = rangerName;
    alert.resolvedAt = resolvedAt;
    alert.resolutionNotes = resolutionNotes;
    await alert.save();

    return alert;
  }
}

export const conflictAlertService = new ConflictAlertService();
