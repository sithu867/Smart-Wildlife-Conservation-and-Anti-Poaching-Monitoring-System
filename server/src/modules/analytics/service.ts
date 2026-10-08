import type { z } from 'zod';
import type { analysisFilterSchemas } from './validation.js';
import { prisma } from '../../config/prisma.js';
import { groupBy } from './calculations.js';
import { getCriteriaAnalytics, listAnalyticsParks } from './criteriaService.js';

export type AnalyticsFilters = z.infer<
  z.ZodObject<typeof analysisFilterSchemas>
> & { start?: Date; end?: Date };
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
      prisma.conservationIncident.findMany({
        where: {
          deletedAt: null,
          ...dateFilter('reportedAt'),
          reportedBy: filters.rangerId,
          incidentType: filters.incidentType,
          status: filters.incidentStatus,
        },
      }),
    ]);
    const responses = alerts
      .flatMap((a) => a.responses)
      .filter(
        (r) =>
          (!filters.start || r.respondedAt >= filters.start) &&
          (!filters.end || r.respondedAt <= filters.end),
      );
    return {
      generatedAt: new Date().toISOString(),
      filters,
      summary: {
        patrols: {
          total: patrols.length,
          completed: patrols.filter((p) => p.status === 'COMPLETED').length,
          active: patrols.filter((p) => p.status === 'ACTIVE').length,
        },
        incidents: { total: incidents.length },
        conflicts: {
          total: alerts.length,
          open: alerts.filter(
            (a) => a.status !== 'RESOLVED' && a.status !== 'CANCELLED',
          ).length,
          resolved: alerts.filter((a) => a.status === 'RESOLVED').length,
        },
        responses: { total: responses.length },
      },
      patrols: {
        byStatus: groupBy(patrols, 'status'),
        byRanger: groupBy(patrols, 'rangerName'),
      },
      incidents: {
        byType: groupBy(incidents, 'incidentType'),
        byStatus: groupBy(incidents, 'status'),
      },
      conflicts: {
        bySeverity: groupBy(alerts, 'severity'),
        byStatus: groupBy(alerts, 'status'),
        bySource: groupBy(alerts, 'source'),
        byType: groupBy(alerts, 'alertType'),
      },
      responses: { byAction: groupBy(responses, 'action') },
    };
  },
};
