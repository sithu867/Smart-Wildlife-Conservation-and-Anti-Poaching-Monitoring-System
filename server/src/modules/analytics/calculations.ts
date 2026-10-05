import type {
  AnalyticsGroup,
  ConflictTrendAnalysis,
  IncidentStatisticsAnalysis,
} from './contract.js';
import { HWC_SCOPE_NOTICE } from './contract.js';
import { buildTimeSeries } from './timeSeries.js';

export function groupBy<T>(rows: T[], key: keyof T): AnalyticsGroup[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = String(row[key] ?? 'UNKNOWN');
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

interface IncidentRecord {
  incidentType: string;
  status: string;
  reportedAt: Date | string;
}
interface ConflictRecord {
  severity: string;
  status: string;
  source: string;
  alertType: string;
  createdAt: Date | string;
}
export interface ResponseRecord {
  action: string;
  respondedAt: Date | string;
}

export function calculateIncidentStatistics(
  rows: IncidentRecord[],
  start: Date,
  end: Date,
): IncidentStatisticsAnalysis {
  return {
    total: rows.length,
    byType: groupBy(rows, 'incidentType'),
    byStatus: groupBy(rows, 'status'),
    overTime: buildTimeSeries(
      rows.map((row) => row.reportedAt),
      start,
      end,
    ),
  };
}

export function calculateConflictTrends(
  alerts: ConflictRecord[],
  responses: ResponseRecord[],
  start: Date,
  end: Date,
): ConflictTrendAnalysis {
  return {
    scope: 'ALL_PARKS_UNASSIGNED',
    scopeNotice: HWC_SCOPE_NOTICE,
    totalAlerts: alerts.length,
    alertsOverTime: buildTimeSeries(
      alerts.map((row) => row.createdAt),
      start,
      end,
    ),
    bySeverity: groupBy(alerts, 'severity'),
    byStatus: groupBy(alerts, 'status'),
    bySource: groupBy(alerts, 'source'),
    byType: groupBy(alerts, 'alertType'),
    totalResponses: responses.length,
    responsesByAction: groupBy(responses, 'action'),
    responsesOverTime: buildTimeSeries(
      responses.map((row) => row.respondedAt),
      start,
      end,
    ),
  };
}
