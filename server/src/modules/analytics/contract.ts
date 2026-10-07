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
export type TimeBucket = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
export interface AnalyticsTimeSeries {
  bucket: TimeBucket;
  points: Array<{ date: string; count: number }>;
}
export interface IncidentStatisticsAnalysis {
  total: number;
  byType: AnalyticsGroup[];
  byStatus: AnalyticsGroup[];
  overTime: AnalyticsTimeSeries;
}
export const HOTSPOT_GRID_DEGREES = 0.01;
export const HOTSPOT_MIN_INCIDENTS = 2;
export const HOTSPOT_CONCENTRATION_THRESHOLDS = {
  medium: 5,
  high: 10,
} as const;
export interface IncidentHotspot {
  cellId: string;
  latitude: number;
  longitude: number;
  incidentCount: number;
  rank: number;
  concentration: 'LOW' | 'MEDIUM' | 'HIGH';
  byType: AnalyticsGroup[];
}
export interface IncidentHotspotAnalysis {
  gridSizeDegrees: number;
  minimumIncidents: number;
  validIncidentCount: number;
  excludedCoordinateCount: number;
  isolatedIncidentCount: number;
  hotspots: IncidentHotspot[];
}
export const HWC_SCOPE_NOTICE =
  'Conflict trends use alerts assigned to the selected park. Legacy/unassigned alerts and their responses are excluded; coordinates are never used to guess a park.';
export interface ConflictLocationAnalysis {
  gridSizeDegrees: number;
  validAlertCount: number;
  excludedCoordinateCount: number;
  locations: Array<{
    cellId: string;
    rank: number;
    latitude: number;
    longitude: number;
    alertCount: number;
    bySeverity: AnalyticsGroup[];
    byType: AnalyticsGroup[];
  }>;
}
export interface ConflictTrendAnalysis {
  scope: 'SELECTED_PARK';
  scopeNotice: string;
  locations: ConflictLocationAnalysis;
  totalAlerts: number;
  alertsOverTime: AnalyticsTimeSeries;
  bySeverity: AnalyticsGroup[];
  byStatus: AnalyticsGroup[];
  bySource: AnalyticsGroup[];
  byType: AnalyticsGroup[];
  totalResponses: number;
  responsesByAction: AnalyticsGroup[];
  responsesOverTime: AnalyticsTimeSeries;
}
export const PATROL_COVERAGE_STATUSES = [
  'COVERED',
  'LIMITED_ACTIVITY',
  'NEGLECTED',
] as const;
export type PatrolCoverageStatus = (typeof PATROL_COVERAGE_STATUSES)[number];
export const PATROL_COVERAGE_LABELS: Record<PatrolCoverageStatus, string> = {
  COVERED: 'Covered',
  LIMITED_ACTIVITY: 'Limited activity',
  NEGLECTED: 'Neglected',
};
export interface PatrolRouteCoverage {
  routeId: string;
  routeName: string;
  status: PatrolCoverageStatus;
  sessionCount: number;
  completedSessionCount: number;
  waypointCount: number;
  lastPatrolDate: string | null;
  geometry: { type: 'LineString'; coordinates: [number, number][] } | null;
}
export interface PatrolCoverageAnalysis {
  totalRoutes: number;
  coveredRoutes: number;
  limitedActivityRoutes: number;
  neglectedRoutes: number;
  coveragePercentage: number;
  patrolSessionCount: number;
  completedPatrolCount: number;
  excludedSessionCount: number;
  missingGeometryRouteCount: number;
  routes: PatrolRouteCoverage[];
}
export interface AnalyticsResult {
  generatedAt: string;
  filters: AnalysisCriteria;
  park: ParkOption;
  status: 'DATA' | 'NO_MATCHING_DATA';
  matchedRecords: {
    incidents: number;
    patrols: number;
    conflicts?: number;
    responses?: number;
  };
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
  // Additive category sections are omitted entirely when not selected. Legacy
  // summary/grouping fields remain compatible with the existing basic PDF.
  incidentStatistics?: IncidentStatisticsAnalysis;
  incidentHotspots?: IncidentHotspotAnalysis;
  conflictTrends?: ConflictTrendAnalysis;
  patrolCoverage?: PatrolCoverageAnalysis;
}

// No domain-specific historical cutoff exists. Support the full four-digit
// civil calendar from year 1; year 0 is not a supported conservation date.
export const MIN_ANALYSIS_DATE = '0001-01-01';
export const SUPPORTED_DATE_MESSAGE = `Choose a supported date on or after ${MIN_ANALYSIS_DATE}.`;
export const FUTURE_PERIOD_MESSAGE =
  'The selected period is entirely in the future. Choose a period that includes today or an earlier date.';

export function isValidAnalysisDate(value: string): boolean {
  // Date.parse alone normalizes impossible dates such as February 30.
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= MIN_ANALYSIS_DATE &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

export function includesElapsedAnalysisDay(
  start: string,
  now = new Date(),
): boolean {
  // Compare UTC calendar dates, not local midnights. Today remains valid even
  // before its last records arrive; future-only routes cannot be called neglected.
  return !isValidAnalysisDate(start) || start <= now.toISOString().slice(0, 10);
}

export function isValidAnalysisId(value: string): boolean {
  // Park.id uses Prisma cuid(), not cuid2(), UUIDs or the former ObjectIDs.
  // Existence is checked separately against the central database before analysis.
  return /^c[a-z0-9]{24}$/.test(value);
}

export function isAnalysisDateRangeOrdered(
  start: string,
  end: string,
): boolean {
  // Individual date errors take priority over comparison of malformed strings.
  return (
    !isValidAnalysisDate(start) || !isValidAnalysisDate(end) || start <= end
  );
}

export const OPTIONAL_ANALYSIS_FILTERS = [
  'rangerId',
  'incidentType',
  'incidentStatus',
  'severity',
  'conflictStatus',
  'conflictSource',
  'conflictType',
] as const;

export function normalizeAnalysisControls(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  // Only empty optional form controls mean "all". Required fields and malformed
  // values must reach validation instead of being silently discarded.
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, entry]) =>
        !OPTIONAL_ANALYSIS_FILTERS.some((field) => field === key) ||
        (entry !== '' && entry !== undefined),
    ),
  );
}
