import { useMemo } from 'react';
import {
  CATEGORY_LABELS,
  type AnalyticsResult,
} from '../../../../server/src/modules/analytics/contract';
import {
  buildReportDocument,
  type ConservationReportSnapshot,
} from '../../../../server/src/modules/analytics/reportContract';
import { buildReportTables } from '../../../../server/src/modules/analytics/reportTables';
import { TimeSeriesChart } from './AnalyticsCharts';
import { HotspotMap } from './HotspotMap';
import { PatrolCoverageMap } from './PatrolCoverageMap';
import { ConflictLocationResults } from './ConflictLocationResults';
import { formatReportCell, REPORT_PRESENTATION } from './formatting';

export function ReportSections({
  snapshot,
}: {
  snapshot: ConservationReportSnapshot;
}) {
  // Existing visual components expect mutable arrays. Detach a presentation copy
  // of persisted evidence; never fetch current records or alter the snapshot.
  const data = useMemo(
    () =>
      JSON.parse(JSON.stringify(snapshot.analyticsResult)) as AnalyticsResult,
    [snapshot],
  );
  const sections = useMemo(
    () => buildReportTables(snapshot).filter((section) => section.category),
    [snapshot],
  );
  const narrative = useMemo(
    () => buildReportDocument(snapshot, REPORT_PRESENTATION).sections,
    [snapshot],
  );
  return (
    <>
      {sections.map((section) => (
        <section
          key={section.category}
          aria-label={`${CATEGORY_LABELS[section.category!]} report section`}
        >
          <h3>{CATEGORY_LABELS[section.category!]}</h3>
          <details>
            <summary>Read stored findings</summary>
            <ul>
              {narrative
                .find(
                  (item) => item.title === CATEGORY_LABELS[section.category!],
                )
                ?.lines.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
            </ul>
          </details>
          <div className="analytics-report-visuals">
            {section.category === 'INCIDENT_STATISTICS' &&
              data.incidentStatistics && (
                <TimeSeriesChart
                  title="Incidents Over Time"
                  series={data.incidentStatistics.overTime}
                />
              )}
            {section.category === 'INCIDENT_HOTSPOTS' &&
              !!data.incidentHotspots?.hotspots.length && (
                <HotspotMap hotspots={data.incidentHotspots.hotspots} />
              )}
            {section.category === 'PATROL_COVERAGE' &&
              !!data.patrolCoverage?.routes.length && (
                <PatrolCoverageMap routes={data.patrolCoverage.routes} />
              )}
            {section.category === 'HWC_TRENDS' && data.conflictTrends && (
              <>
                <TimeSeriesChart
                  title="Conflict Alerts Over Time"
                  series={data.conflictTrends.alertsOverTime}
                />
                <TimeSeriesChart
                  title="Conflict Responses Over Time"
                  series={data.conflictTrends.responsesOverTime}
                />
                <ConflictLocationResults
                  analysis={data.conflictTrends.locations}
                />
              </>
            )}
          </div>
          {section.tables.map((table) => (
            <div
              key={table.title}
              className="analytics-table-scroll"
              role="region"
              tabIndex={0}
              aria-label={`${table.title} saved report table`}
            >
              <table>
                <caption>{table.title}</caption>
                <thead>
                  <tr>
                    {table.columns.map((column) => (
                      <th key={column} scope="col">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.length ? (
                    table.rows.map((row, index) => (
                      <tr key={index}>
                        {row.map((value, column) =>
                          column === 0 ? (
                            <th key={column} scope="row">
                              {formatReportCell(value, table.columns[column])}
                            </th>
                          ) : (
                            <td key={column}>
                              {formatReportCell(value, table.columns[column])}
                            </td>
                          ),
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={table.columns.length}>
                        No matching records in this saved section.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
