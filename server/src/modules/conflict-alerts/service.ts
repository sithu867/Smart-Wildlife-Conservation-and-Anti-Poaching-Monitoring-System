import { prisma } from '../../config/prisma.js';
import { AlertSource, ConflictAlertType, AlertSeverity, AlertStatus, SyncStatus, LocationSource } from '../../types/enums.js';
import type { AddResponseInput, CommunityReportInput, CreateAlertInput, ResolveAlertInput, SimulateCollarInput } from './validation.js';

const alertInclude = { responses: { orderBy: { respondedAt: 'asc' as const } } } as const;
function shapeAlert(alert: any): any { if (!alert) return alert; const { id, ...rest } = alert; return { _id: id, ...rest }; }
async function findAlert(alertId: string) { return prisma.wildlifeConflictAlert.findFirst({ where: { OR: [{ id: alertId }, { clientAlertId: alertId }] }, include: alertInclude }); }

export class ConflictAlertService {
  async createAlert(input: CreateAlertInput): Promise<any> {
    const createdAt = new Date();
    if (input.sourceEventId) { const existing = await prisma.wildlifeConflictAlert.findFirst({ where: { sourceEventId: input.sourceEventId }, include: alertInclude }); if (existing) return shapeAlert(existing); }
    if (input.clientAlertId) { const existing = await prisma.wildlifeConflictAlert.findFirst({ where: { clientAlertId: input.clientAlertId }, include: alertInclude }); if (existing) return shapeAlert(existing); }
    const alert = await prisma.wildlifeConflictAlert.create({ data: { clientAlertId: input.clientAlertId, sourceEventId: input.sourceEventId || `src-evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, source: input.source as any, alertType: input.alertType as any, severity: input.severity as any, status: AlertStatus.OPEN as any, location: { latitude: input.latitude, longitude: input.longitude, timestamp: createdAt.toISOString(), source: input.locationSource || LocationSource.GPS }, description: input.description, animalId: input.source === AlertSource.COLLAR ? input.animalId || 'ELEPHANT-001' : input.animalId, reporterName: input.source === AlertSource.COMMUNITY_REPORT ? input.reporterName || 'Community Member' : input.reporterName, syncStatus: SyncStatus.SYNCED as any }, include: alertInclude });
    return shapeAlert(alert);
  }

  async simulateCollarEvent(input: SimulateCollarInput): Promise<any> { return this.createAlert({ sourceEventId: input.sourceEventId || `collar-evt-${input.animalId}-${input.latitude.toFixed(4)}-${input.longitude.toFixed(4)}`, source: AlertSource.COLLAR, alertType: input.alertType || ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY, severity: input.severity || AlertSeverity.HIGH, latitude: input.latitude, longitude: input.longitude, description: input.description || `Collar detection alert for tracked animal ${input.animalId} near high-risk boundary.`, animalId: input.animalId, locationSource: LocationSource.GPS }); }
  async submitCommunityReport(input: CommunityReportInput): Promise<any> { return this.createAlert({ sourceEventId: input.sourceEventId || `comm-rpt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, source: AlertSource.COMMUNITY_REPORT, alertType: input.reportType, severity: input.severity || AlertSeverity.MEDIUM, latitude: input.latitude, longitude: input.longitude, description: input.description, reporterName: input.reporterName || 'Community Member', locationSource: LocationSource.MANUAL }); }

  async getAlerts(filters?: { status?: string; severity?: string; alertType?: string }): Promise<any[]> {
    const alerts = await prisma.wildlifeConflictAlert.findMany({ where: { status: filters?.status as any, severity: filters?.severity as any, alertType: filters?.alertType as any }, include: alertInclude, orderBy: { createdAt: 'desc' } });
    return alerts.map(shapeAlert);
  }
  async getAlertById(alertId: string): Promise<any> { const alert = await findAlert(alertId); if (!alert) throw new Error('Wildlife conflict alert not found.'); return shapeAlert(alert); }

  async acknowledgeAlert(rangerId: string, rangerName: string, alertId: string, clientAcknowledgementId?: string): Promise<any> {
    const alert = await findAlert(alertId); if (!alert) throw new Error('Wildlife conflict alert not found.');
    if (clientAcknowledgementId && alert.clientAcknowledgementId === clientAcknowledgementId) return shapeAlert(alert);
    if (alert.status === AlertStatus.RESOLVED) throw new Error('Resolved alert cannot be acknowledged.');
    if (alert.status !== AlertStatus.OPEN) throw new Error(`Invalid state transition: ${alert.status} alert cannot be acknowledged.`);
    const updated = await prisma.wildlifeConflictAlert.update({ where: { id: alert.id }, data: { status: AlertStatus.ACKNOWLEDGED as any, acknowledgedBy: rangerId, clientAcknowledgementId, acknowledgedName: rangerName, acknowledgedAt: new Date() }, include: alertInclude });
    return shapeAlert(updated);
  }

  async addResponse(rangerId: string, rangerName: string, alertId: string, input: AddResponseInput): Promise<any> {
    const alert = await findAlert(alertId); if (!alert) throw new Error('Wildlife conflict alert not found.');
    if (input.clientResponseId && alert.responses.some((r: any) => r.clientResponseId === input.clientResponseId)) return shapeAlert(alert);
    if (alert.status === AlertStatus.RESOLVED) throw new Error('Invalid state transition: Resolved alert cannot accept new responses.');
    if (alert.status !== AlertStatus.ACKNOWLEDGED && alert.status !== AlertStatus.RESPONDING) throw new Error('Invalid state transition: Alert must be acknowledged before recording response.');
    const respondedAt = new Date();
    const updated = await prisma.wildlifeConflictAlert.update({ where: { id: alert.id }, data: { status: (input.markResolved ? AlertStatus.RESOLVED : AlertStatus.RESPONDING) as any, resolvedBy: input.markResolved ? rangerId : undefined, resolvedName: input.markResolved ? rangerName : undefined, resolvedAt: input.markResolved ? respondedAt : undefined, resolutionNotes: input.markResolved ? input.resolutionNotes || input.notes : undefined, responses: { create: { responseId: `resp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, clientResponseId: input.clientResponseId, responderId: rangerId, responderName: rangerName, action: input.action as any, notes: input.notes, respondedAt, outcome: input.outcome } } }, include: alertInclude });
    return shapeAlert(updated);
  }

  async resolveAlert(rangerId: string, rangerName: string, alertId: string, input: ResolveAlertInput): Promise<any> {
    const alert = await findAlert(alertId); if (!alert) throw new Error('Wildlife conflict alert not found.');
    if (input.clientActionId && alert.clientResolutionId === input.clientActionId) return shapeAlert(alert);
    if (alert.status === AlertStatus.RESOLVED) throw new Error('Invalid state transition: Alert is already resolved.');
    if (alert.status !== AlertStatus.RESPONDING) throw new Error(`Invalid state transition: ${alert.status} alert cannot be resolved.`);
    const updated = await prisma.wildlifeConflictAlert.update({ where: { id: alert.id }, data: { status: AlertStatus.RESOLVED as any, resolvedBy: rangerId, clientResolutionId: input.clientActionId, resolvedName: rangerName, resolvedAt: new Date(), resolutionNotes: input.resolutionNotes }, include: alertInclude });
    return shapeAlert(updated);
  }
}

export const conflictAlertService = new ConflictAlertService();
