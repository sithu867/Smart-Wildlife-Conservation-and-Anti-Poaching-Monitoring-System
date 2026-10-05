import { PatrolSessionModel } from '../patrols/models.js';
import { ConservationIncidentModel } from '../incidents/models.js';
import { WildlifeConflictAlertModel } from '../conflict-alerts/models.js';
import { groupBy } from './calculations.js';
import { getCriteriaAnalytics, listAnalyticsParks } from './criteriaService.js';

export type AnalyticsFilters = { start?: Date; end?: Date; rangerId?: string; incidentType?: string; incidentStatus?: string; severity?: string; conflictStatus?: string; conflictSource?: string; conflictType?: string };
const range = (field: string, filters: AnalyticsFilters) => filters.start || filters.end ? { [field]: { ...(filters.start ? { $gte: filters.start } : {}), ...(filters.end ? { $lte: filters.end } : {}) } } : {};


export const analyticsService = {
  getAnalytics: getCriteriaAnalytics,
  listParks: listAnalyticsParks,
  // Preserve the pre-existing report endpoint for legacy callers. New criteria
  // always use the park-scoped path; this method is not used by Analyze.
  async getLegacyAnalytics(filters: AnalyticsFilters = {}) {
    const [patrols, incidents, alerts] = await Promise.all([
      PatrolSessionModel.find({ ...range('startTime', filters), ...(filters.rangerId ? { rangerId: filters.rangerId } : {}) }).lean(),
      ConservationIncidentModel.find({ ...range('reportedAt', filters), ...(filters.rangerId ? { reportedBy: filters.rangerId } : {}), ...(filters.incidentType ? { incidentType: filters.incidentType } : {}), ...(filters.incidentStatus ? { status: filters.incidentStatus } : {}) }).lean(),
      WildlifeConflictAlertModel.find({ ...range('createdAt', filters), ...(filters.rangerId ? { acknowledgedBy: filters.rangerId } : {}), ...(filters.severity ? { severity: filters.severity } : {}), ...(filters.conflictStatus ? { status: filters.conflictStatus } : {}), ...(filters.conflictSource ? { source: filters.conflictSource } : {}), ...(filters.conflictType ? { alertType: filters.conflictType } : {}) }).lean()
    ]);
    const responses = alerts.flatMap(a => a.responses ?? []).filter(r => !filters.start || new Date(r.respondedAt) >= filters.start).filter(r => !filters.end || new Date(r.respondedAt) <= filters.end);
    return { generatedAt: new Date().toISOString(), filters, summary: { patrols: { total: patrols.length, completed: patrols.filter(p => p.status === 'COMPLETED').length, active: patrols.filter(p => p.status === 'ACTIVE').length }, incidents: { total: incidents.length }, conflicts: { total: alerts.length, open: alerts.filter(a => a.status !== 'RESOLVED' && a.status !== 'CANCELLED').length, resolved: alerts.filter(a => a.status === 'RESOLVED').length }, responses: { total: responses.length } }, patrols: { byStatus: groupBy(patrols as unknown as Array<Record<string, unknown>>, 'status'), byRanger: groupBy(patrols as unknown as Array<Record<string, unknown>>, 'rangerName') }, incidents: { byType: groupBy(incidents as unknown as Array<Record<string, unknown>>, 'incidentType'), byStatus: groupBy(incidents as unknown as Array<Record<string, unknown>>, 'status') }, conflicts: { bySeverity: groupBy(alerts as unknown as Array<Record<string, unknown>>, 'severity'), byStatus: groupBy(alerts as unknown as Array<Record<string, unknown>>, 'status'), bySource: groupBy(alerts as unknown as Array<Record<string, unknown>>, 'source'), byType: groupBy(alerts as unknown as Array<Record<string, unknown>>, 'alertType') }, responses: { byAction: groupBy(responses as unknown as Array<Record<string, unknown>>, 'action') } };
  }
};
