import { useMemo } from 'react';
import { HOTSPOT_CONCENTRATION_THRESHOLDS } from '../../../../server/src/modules/analytics/contract';
import type {
  AnalyticsResult,
  IncidentHotspotAnalysis,
  ConflictTrendAnalysis,
} from '../../../../server/src/modules/analytics/contract';
import { BreakdownTable, TimeSeriesChart } from './AnalyticsCharts';
import { HotspotMap, isDisplayableHotspot } from './HotspotMap';

export function IncidentStatisticsResults({ data }: { data: AnalyticsResult }) {
  const stats = data.incidentStatistics;
  const total = stats?.total ?? data.summary.incidents.total;
  return (
    <section
      className="card analytics-category"
      aria-label="Incident Statistics results"
    >
      <h2>Incident Statistics</h2>
      {total ? (
        <>
          <p>
            Total incidents:{' '}
            <strong className="analytics-count">{total}</strong>
          </p>
          <div className="analytics-breakdowns">
            <BreakdownTable
              title="Incidents by type"
              rows={stats?.byType ?? data.incidents.byType}
            />
            <BreakdownTable
              title="Incidents by status"
              rows={stats?.byStatus ?? data.incidents.byStatus}
            />
          </div>
          {stats && (
            <TimeSeriesChart
              title="Incidents Over Time"
              series={stats.overTime}
            />
          )}
        </>
      ) : (
        <p>No incidents match the applied criteria.</p>
      )}
    </section>
  );
}

export function IncidentHotspotResults({
  analysis,
}: {
  analysis: IncidentHotspotAnalysis;
}) {
  const points = useMemo(
    () => analysis.hotspots.filter(isDisplayableHotspot),
    [analysis.hotspots],
  );
  return (
    <section
      className="card analytics-category"
      aria-label="Incident Hotspots results"
    >
      <h2>Incident Hotspots</h2>
      <p>
        {analysis.gridSizeDegrees}° cells; at least {analysis.minimumIncidents}{' '}
        incidents per cell. Nearby incidents on opposite cell boundaries may
        remain separate. Concentration levels reflect counts, not predicted
        risk.
      </p>
      {points.length ? (
        <>
          <p>
            Larger circles mean more incidents. Blue: 2–4, amber: 5–9, red: 10
            or more incidents.
          </p>
          <HotspotMap hotspots={points} />
          <ol
            className="analytics-hotspot-list"
            aria-label="Ranked incident hotspots"
          >
            {points.map((point) => (
              <li key={point.cellId}>
                <strong>
                  Rank {point.rank}: {point.incidentCount} incidents
                </strong>{' '}
                — {point.concentration.toLowerCase()} concentration
                <p>
                  Latitude {point.latitude.toFixed(6)}, longitude{' '}
                  {point.longitude.toFixed(6)}
                </p>
                <p>
                  Types:{' '}
                  {point.byType
                    .map((type) => `${type.name}: ${type.count}`)
                    .join(', ')}
                </p>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p>
          {analysis.validIncidentCount
            ? 'No incident cells meet the minimum hotspot concentration.'
            : 'No incidents with valid coordinates were found for hotspot analysis.'}
        </p>
      )}
      {!!analysis.excludedCoordinateCount && (
        <p>
          {analysis.excludedCoordinateCount} incident records were excluded
          because coordinates were missing or invalid.
        </p>
      )}
      {!!analysis.isolatedIncidentCount && (
        <p>
          {analysis.isolatedIncidentCount} valid incidents fall below the
          minimum count per cell.
        </p>
      )}
    </section>
  );
}

export function ConflictTrendResults({
  analysis,
}: {
  analysis: ConflictTrendAnalysis;
}) {
  return (
    <section
      className="card analytics-category"
      aria-label="Human-Wildlife Conflict Trends results"
    >
      <h2>Human-Wildlife Conflict Trends</h2>
      <p className="analytics-scope-notice">{analysis.scopeNotice}</p>
      {analysis.totalAlerts || analysis.totalResponses ? (
        <>
          <p>
            Alert severity and status breakdowns use the current saved values,
            not a reconstruction of past alert state.
          </p>
          <p>
            Total alerts:{' '}
            <strong className="analytics-count">{analysis.totalAlerts}</strong>{' '}
            · Total responses:{' '}
            <strong className="analytics-count">
              {analysis.totalResponses}
            </strong>
          </p>
          {analysis.totalAlerts ? (
            <>
              <TimeSeriesChart
                title="Conflict Alerts Over Time"
                series={analysis.alertsOverTime}
              />
              <div className="analytics-breakdowns">
                <BreakdownTable
                  title="Alerts by severity"
                  rows={analysis.bySeverity}
                />
                <BreakdownTable
                  title="Alerts by status"
                  rows={analysis.byStatus}
                />
                <BreakdownTable
                  title="Alerts by source"
                  rows={analysis.bySource}
                />
                <BreakdownTable title="Alerts by type" rows={analysis.byType} />
              </div>
            </>
          ) : (
            <p>No conflict alerts were created during the applied period.</p>
          )}
          <p>
            Responses use their response date and may belong to alerts created
            before this period. Conflict Ranger ID filters the acknowledging
            ranger on the alert.
          </p>
          {analysis.totalResponses ? (
            <>
              <TimeSeriesChart
                title="Conflict Responses Over Time"
                series={analysis.responsesOverTime}
              />
              <BreakdownTable
                title="Responses by action"
                rows={analysis.responsesByAction}
              />
            </>
          ) : (
            <p>No conflict responses match the applied criteria.</p>
          )}
        </>
      ) : (
        <p>
          No conflict alerts or responses match the applied criteria across all
          parks / unassigned records.
        </p>
      )}
    </section>
  );
}
