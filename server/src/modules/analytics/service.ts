import { prisma } from '../../config/prisma.js';
import { groupBy } from './calculations.js';
import { getCriteriaAnalytics, listAnalyticsParks } from './criteriaService.js';

export type AnalyticsFilters = { start?: Date; end?: Date; rangerId?: string; incidentType?: string; incidentStatus?: string; severity?: string; conflictStatus?: string; conflictSource?: string; conflictType?: string };

export const analyticsService = {
  getAnalytics: getCriteriaAnalytics,
  listParks: listAnalyticsParks,
  async getLegacyAnalytics(filters: AnalyticsFilters = {}) {
    const dateFilter = (field: 'startTime' | 'reportedAt' | 'createdAt') => ({
      ...(filters.start || filters.end
        ? {
            [field]: {
              ...(filters.start ? { gte: filters.start } : {}),
              ...(filters.end ? { lte: filters.end } : {}),
            },
          }
        : {}),
    });
    const [patrols, incidents, alerts] = await Promise.all([
      prisma.patrolSession.findMany({ where: { ...dateFilter('startTime'), rangerId: filters.rangerId }, include: { waypoints: true } }),
      prisma.conservationIncident.findMany({ where: { deletedAt: null, ...dateFilter('reportedAt'), reportedBy: filters.rangerId, incidentType: filters.incidentType as any, status: filters.incidentStatus as any } }),
      prisma.wildlifeConflictAlert.findMany({ where: { ...dateFilter('createdAt'), acknowledgedBy: filters.rangerId, severity: filters.severity as any, status: filters.conflictStatus as any, source: filters.conflictSource as any, alertType: filters.conflictType as any }, include: { responses: true } })
    ]);
    const responses = alerts.flatMap((a: any) => a.responses).filter((r: any) => (!filters.start || r.respondedAt >= filters.start) && (!filters.end || r.respondedAt <= filters.end));
    return {
      generatedAt: new Date().toISOString(),
      filters,
      summary: {
        patrols: {
          total: patrols.length,
          completed: patrols.filter((p: any) => p.status === 'COMPLETED').length,
          active: patrols.filter((p: any) => p.status === 'ACTIVE').length,
        },
        incidents: { total: incidents.length },
        conflicts: {
          total: alerts.length,
          open: alerts.filter((a: any) => a.status !== 'RESOLVED' && a.status !== 'CANCELLED').length,
          resolved: alerts.filter((a: any) => a.status === 'RESOLVED').length,
        },
        responses: { total: responses.length },
      },
      patrols: {
        byStatus: groupBy(patrols as any, 'status'),
        byRanger: groupBy(patrols as any, 'rangerName'),
      },
      incidents: {
        byType: groupBy(incidents as any, 'incidentType'),
        byStatus: groupBy(incidents as any, 'status'),
      },
      conflicts: {
        bySeverity: groupBy(alerts as any, 'severity'),
        byStatus: groupBy(alerts as any, 'status'),
        bySource: groupBy(alerts as any, 'source'),
        byType: groupBy(alerts as any, 'alertType'),
      },
      responses: { byAction: groupBy(responses as any, 'action') },
    };
  },
};
