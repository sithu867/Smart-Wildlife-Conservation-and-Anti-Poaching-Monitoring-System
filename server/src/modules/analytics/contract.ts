// This dependency-free UC-D contract is also imported by the client. Keeping it
// here lets both builds share identifiers without changing either build layout.
export const ANALYSIS_CATEGORIES = [
  'INCIDENT_STATISTICS',
  'INCIDENT_HOTSPOTS',
  'PATROL_COVERAGE',
  'HWC_TRENDS',
] as const;

export type AnalysisCategory = (typeof ANALYSIS_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<AnalysisCategory, string> = {
  INCIDENT_STATISTICS: 'Incident Statistics',
  INCIDENT_HOTSPOTS: 'Incident Hotspots',
  PATROL_COVERAGE: 'Patrol Coverage',
  HWC_TRENDS: 'Human-Wildlife Conflict Trends',
};

export interface AnalysisCriteria {
  parkId: string;
  start: string;
  end: string;
  categories: AnalysisCategory[];
  rangerId?: string;
  incidentType?: string;
  incidentStatus?: string;
  severity?: string;
  conflictStatus?: string;
  conflictSource?: string;
  conflictType?: string;
}

export interface ParkOption {
  id: string;
  name: string;
  code: string;
}
export interface AnalyticsGroup {
  name: string;
  count: number;
}
export interface AnalyticsResult {
  generatedAt: string;
  filters: AnalysisCriteria;
  park: ParkOption;
  status: 'DATA' | 'NO_MATCHING_DATA';
  matchedRecords: { incidents: number; patrols: number };
  categoryAvailability: Array<{
    category: AnalysisCategory;
    status: 'AVAILABLE' | 'NOT_IMPLEMENTED' | 'UNAVAILABLE_PARK_ASSOCIATION';
  }>;
  limitations: string[];
  summary: {
    patrols: { total: number; completed: number; active: number };
    incidents: { total: number };
    conflicts: { total: number; open: number; resolved: number };
    responses: { total: number };
  };
  incidents: { byType: AnalyticsGroup[]; byStatus: AnalyticsGroup[] };
  patrols: { byStatus: AnalyticsGroup[]; byRanger: AnalyticsGroup[] };
  conflicts: {
    bySeverity: AnalyticsGroup[];
    byStatus: AnalyticsGroup[];
    bySource: AnalyticsGroup[];
    byType: AnalyticsGroup[];
  };
  responses: { byAction: AnalyticsGroup[] };
}

export function isValidAnalysisDate(value: string): boolean {
  // Date.parse alone normalizes impossible dates such as February 30.
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
