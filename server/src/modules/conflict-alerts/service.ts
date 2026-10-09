import { prisma } from '../../config/prisma.js';
import { validateOptionalPark } from '../shared/parkScope.js';
import { AppError } from '../shared/appError.js';
import { AlertSource, ConflictAlertType, AlertSeverity, AlertStatus, SyncStatus, LocationSource } from '../../types/enums.js';
import type { AddResponseInput, CommunityReportInput, CreateAlertInput, ResolveAlertInput, SimulateCollarInput } from './validation.js';

const alertInclude = { responses: { where: { isDeleted: false }, orderBy: { respondedAt: 'asc' as const } } } as const;
function shapeAlert(alert: any): any { if (!alert) return alert; const { id, ...rest } = alert; return { _id: id, ...rest }; }
async function findAlert(alertId: string, includeDeleted = false) { return prisma.wildlifeConflictAlert.findFirst({ where: { OR: [{ id: alertId }, { clientAlertId: alertId }], ...(includeDeleted ? {} : { isDeleted: false }) }, include: alertInclude }); }
// A lifecycle action that does not fit the alert's current status is a client conflict (409), not a server fault.
const invalidTransition = (message: string) => new AppError(409, 'INVALID_STATE_TRANSITION', message);
async function audit(data: { alertId: string; responseId?: string; action: string; performedBy: string; performedName?: string; oldValue?: unknown; newValue?: unknown; reason?: string }) {
  await prisma.conflictAuditEntry.create({ data: { ...data, oldValue: data.oldValue as any, newValue: data.newValue as any } });
}

export interface RiskZone {
  id: string;
  name: string;
  type: string;
  centerLat: number;
  centerLon: number;
  radiusKm: number;
  highRisk: boolean;
}

// Configured high-risk zones across the conservation park/reserve
export const CONFIG_RISK_ZONES: RiskZone[] = [
  {
    id: 'rz-001',
    name: 'Northern Community Buffer Zone',
    type: 'BUFFER_ZONE',
    centerLat: -2.1523,
    centerLon: 34.8214,
    radiusKm: 5.0,
    highRisk: true
  },
  {
    id: 'rz-002',
    name: 'Ol-Donyo Village & Agricultural Perimeter',
    type: 'COMMUNITY_BOUNDARY',
    centerLat: -2.1890,
    centerLon: 34.8410,
    radiusKm: 3.5,
    highRisk: true
  },
  {
    id: 'rz-003',
    name: 'Southern Livestock Boma Fence',
    type: 'LIVESTOCK_FENCE',
    centerLat: -2.1234,
    centerLon: 34.7890,
    radiusKm: 4.0,
    highRisk: true
  }
];

const ACTIVE_ALERT_LIMIT = 5;

function calculateHaversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findMatchingRiskZone(lat: number, lon: number): { zone: RiskZone; distanceKm: number } | null {
  for (const zone of CONFIG_RISK_ZONES) {
    const dist = calculateHaversineDistanceKm(lat, lon, zone.centerLat, zone.centerLon);
    if (dist <= zone.radiusKm) {
      return { zone, distanceKm: dist };
    }
  }
  return null;
}

function calculateSeverityFromRiskZone(distanceKm: number, zoneRadiusKm: number): AlertSeverity {
  const ratio = distanceKm / zoneRadiusKm;
  if (ratio <= 0.3) return AlertSeverity.CRITICAL;
  if (ratio <= 0.6) return AlertSeverity.HIGH;
  if (ratio <= 0.9) return AlertSeverity.MEDIUM;
  return AlertSeverity.LOW;
}

export class ConflictAlertService {
  private notifyResponders(alert: any): void {
    console.log(`[UC03 NOTIFICATION DISPATCH] Alert ${alert._id} (${alert.severity} ${alert.alertType}) created. Responders notified.`);
  }

  async createAlert(input: CreateAlertInput): Promise<any> {
    const createdAt = new Date();
    if (input.sourceEventId) {
      const existing = await prisma.wildlifeConflictAlert.findFirst({
        where: { sourceEventId: input.sourceEventId },
        include: alertInclude
      });
      if (existing) return shapeAlert(existing);
    }
    if (input.clientAlertId) {
      const existing = await prisma.wildlifeConflictAlert.findFirst({
        where: { clientAlertId: input.clientAlertId },
        include: alertInclude
      });
      if (existing) return shapeAlert(existing);
    }

    // Risk zones and animal IDs do not reference parks. Retain explicit source
    // context only; legacy callers stay unassigned rather than being guessed.
    await validateOptionalPark(input.parkId);
    const alert = await prisma.wildlifeConflictAlert.create({
      data: {
        parkId: input.parkId,
        clientAlertId: input.clientAlertId,
        sourceEventId: input.sourceEventId || `src-evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        source: input.source as any,
        alertType: input.alertType as any,
        severity: input.severity as any,
        status: AlertStatus.OPEN as any,
        location: {
          latitude: input.latitude,
          longitude: input.longitude,
          timestamp: createdAt.toISOString(),
          source: input.locationSource || LocationSource.GPS
        },
        description: input.description,
        animalId: input.source === AlertSource.COLLAR ? input.animalId || 'ELEPHANT-001' : input.animalId,
        reporterName: input.source === AlertSource.COMMUNITY_REPORT ? input.reporterName || 'Community Member' : input.reporterName,
        syncStatus: SyncStatus.SYNCED as any
      },
      include: alertInclude
    });

    const shaped = shapeAlert(alert);
    await audit({ alertId: alert.id, action: 'CREATE', performedBy: 'SYSTEM', performedName: 'Alert ingestion', newValue: shaped });
    // The alert is already persisted; a notification failure must not make the caller believe it was not created.
    try {
      this.notifyResponders(shaped);
    } catch (error) {
      console.error(`[UC03 NOTIFICATION FAILURE] Alert ${shaped._id} was saved but responders could not be notified.`, error);
    }
    return shaped;
  }

  async simulateCollarEvent(input: SimulateCollarInput): Promise<any> {
    const riskZoneResult = findMatchingRiskZone(input.latitude, input.longitude);

    // If outside high-risk zone: store collar telemetry data, do NOT create alert
    if (!riskZoneResult) {
      console.log(`[UC03 COLLAR TELEMETRY] Animal ${input.animalId} location (${input.latitude}, ${input.longitude}) is outside all high-risk zones. Storing telemetry data; no alert created.`);
      return {
        alertCreated: false,
        telemetrySaved: true,
        animalId: input.animalId,
        location: { latitude: input.latitude, longitude: input.longitude, timestamp: new Date() },
        message: `Collar reading for tracked animal ${input.animalId} recorded successfully. Animal is outside configured high-risk zones; no alert generated.`
      };
    }

    // Inside high-risk zone: determine severity dynamically based on proximity if not explicitly passed
    const calculatedSeverity = input.severity || calculateSeverityFromRiskZone(riskZoneResult.distanceKm, riskZoneResult.zone.radiusKm);
    const alertType = input.alertType || ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY;
    const description = input.description || `Collar breach alert for tracked animal ${input.animalId} inside ${riskZoneResult.zone.name} (${riskZoneResult.distanceKm.toFixed(2)} km from zone core).`;

    const alert = await this.createAlert({
      parkId: input.parkId,
      // Preserve upstream event identities and old unassigned simulator keys.
      // New explicit park contexts need distinct generated keys, otherwise an
      // old unassigned event at these coordinates would swallow the assignment.
      sourceEventId: input.sourceEventId || `collar-evt-${input.parkId ? `${input.parkId}-` : ''}${input.animalId}-${input.latitude.toFixed(4)}-${input.longitude.toFixed(4)}`,
      source: AlertSource.COLLAR,
      alertType,
      severity: calculatedSeverity,
      latitude: input.latitude,
      longitude: input.longitude,
      description,
      animalId: input.animalId,
      locationSource: LocationSource.GPS
    });

    return {
      alertCreated: true,
      telemetrySaved: true,
      riskZone: riskZoneResult.zone.name,
      distanceKm: riskZoneResult.distanceKm,
      ...alert
    };
  }

  async submitCommunityReport(input: CommunityReportInput): Promise<any> {
    let severity = input.severity;
    if (!severity) {
      if (input.reportType === ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY || input.reportType === ConflictAlertType.LIVESTOCK_THREAT) {
        severity = AlertSeverity.HIGH;
      } else if (input.reportType === ConflictAlertType.CROP_RAID) {
        severity = AlertSeverity.MEDIUM;
      } else {
        severity = AlertSeverity.LOW;
      }
    }

    return this.createAlert({
      parkId: input.parkId,
      sourceEventId: input.sourceEventId || `comm-rpt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      source: AlertSource.COMMUNITY_REPORT,
      alertType: input.reportType,
      severity,
      latitude: input.latitude,
      longitude: input.longitude,
      description: input.description,
      reporterName: input.reporterName || 'Community Member',
      locationSource: LocationSource.MANUAL
    });
  }

  async getAlerts(filters?: { status?: string; severity?: string; alertType?: string; includeDeleted?: boolean }): Promise<any[]> {
    const baseWhere = {
      severity: filters?.severity as any,
      alertType: filters?.alertType as any,
      isDeleted: filters?.includeDeleted ? undefined : false
    };
    const activeStatuses = [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED, AlertStatus.RESPONDING] as any[];
    const requestedStatus = filters?.status as any;
    const activeRequested = !requestedStatus || activeStatuses.includes(requestedStatus);
    const activeAlerts = activeRequested
      ? await prisma.wildlifeConflictAlert.findMany({
          where: { ...baseWhere, status: requestedStatus || { in: activeStatuses } },
          include: alertInclude,
          orderBy: { createdAt: 'desc' },
          take: ACTIVE_ALERT_LIMIT
        })
      : [];
    const historicalAlerts = !requestedStatus || !activeRequested
      ? await prisma.wildlifeConflictAlert.findMany({
          where: { ...baseWhere, status: requestedStatus || { in: [AlertStatus.RESOLVED, AlertStatus.CANCELLED] } },
          include: alertInclude,
          orderBy: { createdAt: 'desc' }
        })
      : [];
    const alerts = [...activeAlerts, ...historicalAlerts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return alerts.map(shapeAlert);
  }

  async getAlertById(alertId: string, includeDeleted = false): Promise<any> {
    const alert = await findAlert(alertId, includeDeleted);
    if (!alert) throw new Error('Wildlife conflict alert not found.');
    return shapeAlert(alert);
  }

  async acknowledgeAlert(rangerId: string, rangerName: string, alertId: string, clientAcknowledgementId?: string): Promise<any> {
    const alert = await findAlert(alertId);
    if (!alert) throw new Error('Wildlife conflict alert not found.');
    if (clientAcknowledgementId && alert.clientAcknowledgementId === clientAcknowledgementId) return shapeAlert(alert);
    if (alert.status === AlertStatus.RESOLVED) throw invalidTransition('Resolved alert cannot be acknowledged.');
    if (alert.status !== AlertStatus.OPEN) throw invalidTransition(`Invalid state transition: ${alert.status} alert cannot be acknowledged.`);
    const updated = await prisma.wildlifeConflictAlert.update({
      where: { id: alert.id },
      data: {
        status: AlertStatus.ACKNOWLEDGED as any,
        acknowledgedBy: rangerId,
        clientAcknowledgementId,
        acknowledgedName: rangerName,
        acknowledgedAt: new Date()
      },
      include: alertInclude
    });
    await audit({ alertId: alert.id, action: 'ACKNOWLEDGE', performedBy: rangerId, performedName: rangerName, oldValue: { status: alert.status }, newValue: { status: AlertStatus.ACKNOWLEDGED } });
    return shapeAlert(updated);
  }

  async addResponse(rangerId: string, rangerName: string, alertId: string, input: AddResponseInput): Promise<any> {
    const alert = await findAlert(alertId);
    if (!alert) throw new Error('Wildlife conflict alert not found.');
    if (input.clientResponseId && alert.responses.some((r: any) => r.clientResponseId === input.clientResponseId)) return shapeAlert(alert);
    if (alert.status === AlertStatus.RESOLVED) throw invalidTransition('Invalid state transition: Resolved alert cannot accept new responses.');
    if (alert.status !== AlertStatus.ACKNOWLEDGED && alert.status !== AlertStatus.RESPONDING) throw invalidTransition('Invalid state transition: Alert must be acknowledged before recording response.');
    const respondedAt = new Date();
    const updated = await prisma.wildlifeConflictAlert.update({
      where: { id: alert.id },
      data: {
        status: (input.markResolved ? AlertStatus.RESOLVED : AlertStatus.RESPONDING) as any,
        resolvedBy: input.markResolved ? rangerId : undefined,
        resolvedName: input.markResolved ? rangerName : undefined,
        resolvedAt: input.markResolved ? respondedAt : undefined,
        resolutionNotes: input.markResolved ? input.resolutionNotes || input.notes : undefined,
        responses: {
          create: {
            responseId: `resp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            clientResponseId: input.clientResponseId,
            responderId: rangerId,
            responderName: rangerName,
            action: input.action as any,
            notes: input.notes,
            respondedAt,
            outcome: input.outcome
          }
        }
      },
      include: alertInclude
    });
    const createdResponse = updated.responses[updated.responses.length - 1];
    await audit({ alertId: alert.id, responseId: createdResponse?.id, action: 'ADD_RESPONSE', performedBy: rangerId, performedName: rangerName, newValue: input });
    if (input.markResolved) await audit({ alertId: alert.id, action: 'RESOLVE', performedBy: rangerId, performedName: rangerName, oldValue: { status: alert.status }, newValue: { status: AlertStatus.RESOLVED }, reason: input.resolutionNotes });
    return shapeAlert(updated);
  }

  async resolveAlert(rangerId: string, rangerName: string, alertId: string, input: ResolveAlertInput): Promise<any> {
    const alert = await findAlert(alertId);
    if (!alert) throw new Error('Wildlife conflict alert not found.');
    if (input.clientActionId && alert.clientResolutionId === input.clientActionId) return shapeAlert(alert);
    if (alert.status === AlertStatus.RESOLVED) throw invalidTransition('Invalid state transition: Alert is already resolved.');
    if (alert.status !== AlertStatus.RESPONDING) throw invalidTransition(`Invalid state transition: ${alert.status} alert cannot be resolved.`);
    const updated = await prisma.wildlifeConflictAlert.update({
      where: { id: alert.id },
      data: {
        status: AlertStatus.RESOLVED as any,
        resolvedBy: rangerId,
        clientResolutionId: input.clientActionId,
        resolvedName: rangerName,
        resolvedAt: new Date(),
        resolutionNotes: input.resolutionNotes
      },
      include: alertInclude
    });
    await audit({ alertId: alert.id, action: 'RESOLVE', performedBy: rangerId, performedName: rangerName, oldValue: { status: alert.status }, newValue: { status: AlertStatus.RESOLVED }, reason: input.resolutionNotes });
    return shapeAlert(updated);
  }

  async updateAlert(rangerId: string, rangerName: string, alertId: string, input: any): Promise<any> {
    const alert = await findAlert(alertId); if (!alert) throw new Error('Wildlife conflict alert not found.');
    if ([AlertStatus.RESOLVED, AlertStatus.CANCELLED].includes(alert.status as any)) throw new Error(`Unauthorized: ${alert.status} alerts are read-only.`);
    const oldValue = { alertType: alert.alertType, description: alert.description, severity: alert.severity, location: alert.location, animalId: alert.animalId, reporterName: alert.reporterName };
    const location = input.latitude !== undefined || input.longitude !== undefined || input.locationSource !== undefined ? { ...(alert.location as any), latitude: input.latitude ?? (alert.location as any).latitude, longitude: input.longitude ?? (alert.location as any).longitude, source: input.locationSource ?? (alert.location as any).source } : undefined;
    const updated = await prisma.wildlifeConflictAlert.update({ where: { id: alert.id }, data: { alertType: input.alertType, description: input.description, severity: input.severity, location: location as any, animalId: input.animalId, reporterName: input.reporterName }, include: alertInclude });
    await audit({ alertId: alert.id, action: 'UPDATE', performedBy: rangerId, performedName: rangerName, oldValue, newValue: input }); return shapeAlert(updated);
  }

  async deleteAlert(rangerId: string, rangerName: string, alertId: string, reason?: string): Promise<any> {
    const alert = await findAlert(alertId); if (!alert) throw new Error('Wildlife conflict alert not found.');
    const updated = await prisma.wildlifeConflictAlert.update({ where: { id: alert.id }, data: { isDeleted: true, deletedAt: new Date(), deletedBy: rangerId, deletionReason: reason || 'Deleted by ranger' }, include: alertInclude });
    await audit({ alertId: alert.id, action: 'DELETE', performedBy: rangerId, performedName: rangerName, reason, oldValue: { isDeleted: false }, newValue: { isDeleted: true } }); return shapeAlert(updated);
  }

  async cancelAlert(rangerId: string, rangerName: string, alertId: string, reason: string): Promise<any> {
    const alert = await findAlert(alertId); if (!alert) throw new Error('Wildlife conflict alert not found.');
    if (![AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED, AlertStatus.RESPONDING].includes(alert.status as any)) throw invalidTransition(`Invalid state transition: ${alert.status} alert cannot be cancelled.`);
    const updated = await prisma.wildlifeConflictAlert.update({ where: { id: alert.id }, data: { status: AlertStatus.CANCELLED as any }, include: alertInclude });
    await audit({ alertId: alert.id, action: 'CANCEL', performedBy: rangerId, performedName: rangerName, reason, oldValue: { status: alert.status }, newValue: { status: AlertStatus.CANCELLED } }); return shapeAlert(updated);
  }

  async getResponses(alertId: string): Promise<any[]> { const alert = await findAlert(alertId); if (!alert) throw new Error('Wildlife conflict alert not found.'); return alert.responses; }
  async updateResponse(rangerId: string, rangerName: string, alertId: string, responseId: string, input: any): Promise<any> {
    const alert = await findAlert(alertId); if (!alert) throw new Error('Wildlife conflict alert not found.');
    if ([AlertStatus.RESOLVED, AlertStatus.CANCELLED].includes(alert.status as any)) throw new Error(`Unauthorized: ${alert.status} alerts are read-only.`);
    const response = await prisma.conflictResponse.findFirst({ where: { alertId: alert.id, isDeleted: false, OR: [{ id: responseId }, { responseId }] } }); if (!response) throw new Error('Conflict response not found.');
    if (response.responderId !== rangerId) throw new Error('Unauthorized: only the original responder can update this response.');
    const updated = await prisma.conflictResponse.update({ where: { id: response.id }, data: { action: input.action, notes: input.notes, outcome: input.outcome } });
    await audit({ alertId: alert.id, responseId: response.id, action: 'UPDATE_RESPONSE', performedBy: rangerId, performedName: rangerName, oldValue: response, newValue: input }); return shapeAlert(await findAlert(alert.id));
  }
  async deleteResponse(rangerId: string, rangerName: string, alertId: string, responseId: string, reason?: string): Promise<any> {
    const alert = await findAlert(alertId); if (!alert) throw new Error('Wildlife conflict alert not found.');
    if ([AlertStatus.RESOLVED, AlertStatus.CANCELLED].includes(alert.status as any)) throw new Error(`Unauthorized: ${alert.status} alerts are read-only.`);
    const response = await prisma.conflictResponse.findFirst({ where: { alertId: alert.id, isDeleted: false, OR: [{ id: responseId }, { responseId }] } }); if (!response) throw new Error('Conflict response not found.');
    if (response.responderId !== rangerId) throw new Error('Unauthorized: only the original responder can delete this response.');
    await prisma.conflictResponse.update({ where: { id: response.id }, data: { isDeleted: true, deletedAt: new Date(), deletedBy: rangerId, deletionReason: reason } });
    await audit({ alertId: alert.id, responseId: response.id, action: 'DELETE_RESPONSE', performedBy: rangerId, performedName: rangerName, reason }); return shapeAlert(await findAlert(alert.id));
  }
  async getHistory(alertId: string): Promise<any[]> { const alert = await findAlert(alertId, true); if (!alert) throw new Error('Wildlife conflict alert not found.'); return prisma.conflictAuditEntry.findMany({ where: { alertId: alert.id }, orderBy: { timestamp: 'asc' } }); }
}

export const conflictAlertService = new ConflictAlertService();

