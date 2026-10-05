import type { Model, Types } from 'mongoose';
import {
  ParkModel,
  PatrolRouteModel,
  PatrolSessionModel,
  type IPark,
  type IPatrolRoute,
  type IPatrolSession,
} from '../patrols/models.js';
import {
  ConservationIncidentModel,
  type IConservationIncident,
} from '../incidents/models.js';
import type {
  AnalysisCriteria,
  AnalyticsGroup,
  AnalyticsResult,
  ParkOption,
} from './contract.js';
import { analysisCriteriaSchema, analysisDateRange } from './validation.js';

// Existing model exports include Mongoose's untyped model cache. Narrow them
// locally so UC-D queries are typed without modifying other use cases.
const parks = ParkModel as Model<IPark>;
const routes = PatrolRouteModel as Model<IPatrolRoute>;
const sessions = PatrolSessionModel as Model<IPatrolSession>;
const incidents = ConservationIncidentModel as Model<IConservationIncident>;

export class AnalyticsCriteriaError extends Error {}

function parkOption(
  park: Pick<IPark, 'name' | 'code'> & { _id: Types.ObjectId },
): ParkOption {
  return { id: String(park._id), name: park.name, code: park.code };
}

export async function listAnalyticsParks(): Promise<ParkOption[]> {
  // Read only: never call the patrol service's seeding or demo fallback.
  const records = await parks
    .find({})
    .select('name code')
    .sort({ name: 1 })
    .lean();
  return records.map(parkOption);
}

function groupBy<T>(rows: T[], key: keyof T): AnalyticsGroup[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = String(row[key] ?? 'UNKNOWN');
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count }));
}

export async function getCriteriaAnalytics(
  input: AnalysisCriteria,
): Promise<AnalyticsResult> {
  // Validate here too, so non-HTTP callers cannot bypass the contract.
  const criteria = analysisCriteriaSchema.parse(input);
  const park = await parks.findById(criteria.parkId).select('name code').lean();
  if (!park)
    throw new AnalyticsCriteriaError(
      'The selected Park / Conservation Area does not exist. Please select another park.',
    );

  const selected = new Set(criteria.categories);
  const wantsIncidents =
    selected.has('INCIDENT_STATISTICS') || selected.has('INCIDENT_HOTSPOTS');
  const wantsPatrols = selected.has('PATROL_COVERAGE');
  const { start, end } = analysisDateRange(criteria);

  const parkRoutes =
    wantsIncidents || wantsPatrols
      ? await routes.find({ park: park._id }).select('_id').lean()
      : [];
  const routeIds = parkRoutes.map((route) => route._id);

  // UC-A copies assignment.patrolRoute into session.patrolRoute when starting
  // a session. This existing direct link is sufficient: Park -> Route -> Session.
  // Do not guess park membership from a ranger, coordinates, or route proximity.
  const scopedSessions = wantsIncidents
    ? await sessions
        .find({ patrolRoute: { $in: routeIds } })
        .select('_id')
        .lean()
    : [];

  const [incidentRows, patrolRows] = await Promise.all([
    wantsIncidents
      ? incidents
          .find({
            patrolSession: {
              $in: scopedSessions.map((session) => session._id),
            },
            // Session dates must not exclude an incident reported within this range.
            reportedAt: { $gte: start, $lte: end },
            ...(criteria.rangerId ? { reportedBy: criteria.rangerId } : {}),
            ...(criteria.incidentType
              ? { incidentType: criteria.incidentType }
              : {}),
            ...(criteria.incidentStatus
              ? { status: criteria.incidentStatus }
              : {}),
          })
          .lean()
      : [],
    wantsPatrols
      ? sessions
          .find({
            patrolRoute: { $in: routeIds },
            startTime: { $gte: start, $lte: end },
            ...(criteria.rangerId ? { rangerId: criteria.rangerId } : {}),
          })
          .lean()
      : [],
  ]);

  const limitations = [
    'Incidents without a valid patrol-session-to-park link are excluded from park-scoped analysis.',
  ];
  if (selected.has('HWC_TRENDS'))
    limitations.push(
      'Conflict alerts cannot currently be associated reliably with a park: alerts have no park reference and parks have no boundary geometry. Conflict records are excluded; conflict trends are unavailable.',
    );
  if (
    selected.has('INCIDENT_HOTSPOTS') ||
    wantsPatrols ||
    selected.has('HWC_TRENDS')
  )
    limitations.push(
      'Batch 1 establishes category criteria only. Hotspot, patrol coverage, and conflict trend calculations are pending later batches.',
    );

  // Only the existing incident statistics are calculated. Matching source
  // records for future categories do not imply their algorithms have run.
  const statistics = selected.has('INCIDENT_STATISTICS') ? incidentRows : [];
  return {
    generatedAt: new Date().toISOString(),
    filters: criteria,
    park: parkOption(park),
    status:
      incidentRows.length || patrolRows.length ? 'DATA' : 'NO_MATCHING_DATA',
    matchedRecords: {
      incidents: incidentRows.length,
      patrols: patrolRows.length,
    },
    categoryAvailability: criteria.categories.map((category) => ({
      category,
      status:
        category === 'INCIDENT_STATISTICS'
          ? 'AVAILABLE'
          : category === 'HWC_TRENDS'
            ? 'UNAVAILABLE_PARK_ASSOCIATION'
            : 'NOT_IMPLEMENTED',
    })),
    limitations,
    summary: {
      patrols: {
        total: patrolRows.length,
        completed: patrolRows.filter((row) => row.status === 'COMPLETED')
          .length,
        active: patrolRows.filter((row) => row.status === 'ACTIVE').length,
      },
      incidents: { total: statistics.length },
      conflicts: { total: 0, open: 0, resolved: 0 },
      responses: { total: 0 },
    },
    incidents: {
      byType: groupBy(statistics, 'incidentType'),
      byStatus: groupBy(statistics, 'status'),
    },
    patrols: {
      byStatus: groupBy(patrolRows, 'status'),
      byRanger: groupBy(patrolRows, 'rangerName'),
    },
    conflicts: { bySeverity: [], byStatus: [], bySource: [], byType: [] },
    responses: { byAction: [] },
  };
}
