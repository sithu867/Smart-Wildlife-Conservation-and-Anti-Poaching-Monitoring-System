import { createDraftCriteria, copyCriteria } from './criteria';
import {
  HOTSPOT_GRID_DEGREES,
  HOTSPOT_MIN_INCIDENTS,
  HWC_SCOPE_NOTICE,
  type ParkOption,
  type AnalysisCriteria,
  type AnalyticsResult,
} from '../../../../server/src/modules/analytics/contract';

export const parks: ParkOption[] = [
  { id: '67a000000000000000000001', name: 'Alpha park', code: 'ALPHA' },
  { id: '67a000000000000000000002', name: 'Beta park', code: 'BETA' },
];
export const validCriteria: AnalysisCriteria = {
  ...createDraftCriteria(),
  parkId: parks[0].id,
  start: '2026-09-01',
  end: '2026-09-30',
};
export function result(
  criteria = validCriteria,
  status: AnalyticsResult['status'] = 'DATA',
): AnalyticsResult {
  const count = status === 'DATA' ? 2 : 0;
  return {
    filters: copyCriteria(criteria),
    park: parks.find((park) => park.id === criteria.parkId) ?? parks[0],
    generatedAt: '2026-10-05T06:00:00.000Z',
    status,
    matchedRecords: {
      incidents: criteria.categories.some(
        (category) =>
          category === 'INCIDENT_STATISTICS' ||
          category === 'INCIDENT_HOTSPOTS',
      )
        ? count
        : 0,
      patrols: 0,
      ...(criteria.categories.includes('HWC_TRENDS')
        ? { conflicts: count, responses: count ? 1 : 0 }
        : {}),
    },
    categoryAvailability: criteria.categories.map((category) => ({
      category,
      status:
        category === 'PATROL_COVERAGE'
          ? 'NOT_IMPLEMENTED'
          : category === 'HWC_TRENDS'
            ? 'AVAILABLE_UNSCOPED'
            : 'AVAILABLE',
    })),
    limitations: ['Unlinked incidents are excluded.'],
    summary: {
      incidents: { total: count },
      patrols: { total: 0, completed: 0, active: 0 },
      conflicts: { total: 0, open: 0, resolved: 0 },
      responses: { total: 0 },
    },
    incidents: {
      byType: count ? [{ name: 'SNARE', count }] : [],
      byStatus: [],
    },
    patrols: { byStatus: [], byRanger: [] },
    conflicts: { bySeverity: [], byStatus: [], bySource: [], byType: [] },
    responses: { byAction: [] },
    ...(criteria.categories.includes('INCIDENT_STATISTICS')
      ? {
          incidentStatistics: {
            total: count,
            byType: count ? [{ name: 'SNARE', count }] : [],
            byStatus: count
              ? [
                  { name: 'REPORTED', count: 1 },
                  { name: 'RESOLVED', count: 1 },
                ]
              : [],
            overTime: {
              bucket: 'DAY' as const,
              points: [
                { date: criteria.start, count: count ? 1 : 0 },
                { date: criteria.end, count: count ? 1 : 0 },
              ],
            },
          },
        }
      : {}),
    ...(criteria.categories.includes('INCIDENT_HOTSPOTS')
      ? {
          incidentHotspots: {
            gridSizeDegrees: HOTSPOT_GRID_DEGREES,
            minimumIncidents: HOTSPOT_MIN_INCIDENTS,
            validIncidentCount: count,
            excludedCoordinateCount: 0,
            isolatedIncidentCount: 0,
            hotspots: count
              ? [
                  {
                    cellId: '-216:3482',
                    latitude: -2.152,
                    longitude: 34.822,
                    incidentCount: count,
                    rank: 1,
                    concentration: 'LOW' as const,
                    byType: [{ name: 'SNARE', count }],
                  },
                ]
              : [],
          },
        }
      : {}),
    ...(criteria.categories.includes('HWC_TRENDS')
      ? {
          conflictTrends: {
            scope: 'ALL_PARKS_UNASSIGNED' as const,
            scopeNotice: HWC_SCOPE_NOTICE,
            totalAlerts: count,
            totalResponses: count ? 1 : 0,
            alertsOverTime: {
              bucket: 'DAY' as const,
              points: [
                { date: criteria.start, count: count ? 1 : 0 },
                { date: criteria.end, count: count ? 1 : 0 },
              ],
            },
            responsesOverTime: {
              bucket: 'DAY' as const,
              points: [
                { date: criteria.start, count: count ? 1 : 0 },
                { date: criteria.end, count: 0 },
              ],
            },
            bySeverity: count
              ? [
                  { name: 'HIGH', count: 1 },
                  { name: 'LOW', count: 1 },
                ]
              : [],
            byStatus: count
              ? [
                  { name: 'OPEN', count: 1 },
                  { name: 'RESOLVED', count: 1 },
                ]
              : [],
            bySource: count
              ? [
                  { name: 'COLLAR', count: 1 },
                  { name: 'COMMUNITY_REPORT', count: 1 },
                ]
              : [],
            byType: count
              ? [
                  { name: 'CROP_RAID', count: 1 },
                  { name: 'OTHER', count: 1 },
                ]
              : [],
            responsesByAction: count
              ? [{ name: 'INVESTIGATED_AREA', count: 1 }]
              : [],
          },
        }
      : {}),
  };
}
