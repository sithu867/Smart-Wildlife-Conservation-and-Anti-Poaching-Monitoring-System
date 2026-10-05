import { PatrolSessionModel } from '../patrols/models.js';
import { ConservationIncidentModel } from '../incidents/models.js';
import { WildlifeConflictAlertModel } from '../conflict-alerts/models.js';

export type AnalyticsFilters = { start?: Date; end?: Date; rangerId?: string; incidentType?: string; incidentStatus?: string; severity?: string; conflictStatus?: string; conflictSource?: string; conflictType?: string };
const range = (field: string, filters: AnalyticsFilters) => filters.start || filters.end ? { [field]: { ...(filters.start ? { $gte: filters.start } : {}), ...(filters.end ? { $lte: filters.end } : {}) } } : {};
const group = (rows: Array<Record<string, unknown>>, key: string) => Object.entries(rows.reduce<Record<string, number>>((a, r) => { const k = String(r[key] ?? 'UNKNOWN'); a[k] = (a[k] ?? 0) + 1; return a; }, {})).map(([name, count]) => ({ name, count }));

export const analyticsService = {
  async getAnalytics(filters: AnalyticsFilters = {}) {
    const [patrols, incidents, alerts] = await Promise.all([
      PatrolSessionModel.find({ ...range('startTime', filters), ...(filters.rangerId ? { rangerId: filters.rangerId } : {}) }).lean(),
      ConservationIncidentModel.find({ ...range('reportedAt', filters), ...(filters.rangerId ? { reportedBy: filters.rangerId } : {}), ...(filters.incidentType ? { incidentType: filters.incidentType } : {}), ...(filters.incidentStatus ? { status: filters.incidentStatus } : {}) }).lean(),
      WildlifeConflictAlertModel.find({ ...range('createdAt', filters), ...(filters.rangerId ? { acknowledgedBy: filters.rangerId } : {}), ...(filters.severity ? { severity: filters.severity } : {}), ...(filters.conflictStatus ? { status: filters.conflictStatus } : {}), ...(filters.conflictSource ? { source: filters.conflictSource } : {}), ...(filters.conflictType ? { alertType: filters.conflictType } : {}) }).lean()
    ]);
    const responses = alerts.flatMap(a => a.responses ?? []).filter(r => !filters.start || new Date(r.respondedAt) >= filters.start).filter(r => !filters.end || new Date(r.respondedAt) <= filters.end);
    return { generatedAt: new Date().toISOString(), filters, summary: { patrols: { total: patrols.length, completed: patrols.filter(p => p.status === 'COMPLETED').length, active: patrols.filter(p => p.status === 'ACTIVE').length }, incidents: { total: incidents.length }, conflicts: { total: alerts.length, open: alerts.filter(a => a.status !== 'RESOLVED' && a.status !== 'CANCELLED').length, resolved: alerts.filter(a => a.status === 'RESOLVED').length }, responses: { total: responses.length } }, patrols: { byStatus: group(patrols as unknown as Array<Record<string, unknown>>, 'status'), byRanger: group(patrols as unknown as Array<Record<string, unknown>>, 'rangerName') }, incidents: { byType: group(incidents as unknown as Array<Record<string, unknown>>, 'incidentType'), byStatus: group(incidents as unknown as Array<Record<string, unknown>>, 'status') }, conflicts: { bySeverity: group(alerts as unknown as Array<Record<string, unknown>>, 'severity'), byStatus: group(alerts as unknown as Array<Record<string, unknown>>, 'status'), bySource: group(alerts as unknown as Array<Record<string, unknown>>, 'source'), byType: group(alerts as unknown as Array<Record<string, unknown>>, 'alertType') }, responses: { byAction: group(responses as unknown as Array<Record<string, unknown>>, 'action') } };
  }
};
