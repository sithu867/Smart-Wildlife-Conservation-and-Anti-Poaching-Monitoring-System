import type { Ref } from 'react';
import {
  CATEGORY_LABELS,
  type AnalysisCriteria,
  type AnalyticsResult,
} from '../../../../server/src/modules/analytics/contract';
import { FeedbackPanel } from './AnalyticsFeedback';
import { PatrolCoverageResults } from './PatrolCoverageResults';
import {
  IncidentStatisticsResults,
  IncidentHotspotResults,
  ConflictTrendResults,
} from './CategoryResults';

export function hasMeaningfulMatchingData(
  data: AnalyticsResult | undefined,
): boolean {
  return (
    data?.status === 'DATA' &&
    (data.matchedRecords.incidents > 0 ||
      data.matchedRecords.patrols > 0 ||
      (data.matchedRecords.conflicts ?? 0) > 0 ||
      (data.matchedRecords.responses ?? 0) > 0)
  );
}

interface Props {
  headingRef?: Ref<HTMLHeadingElement>;
  data: AnalyticsResult;
  appliedCriteria: AnalysisCriteria;
}
export function AnalyticsResults({ headingRef, data, appliedCriteria }: Props) {
  const selected = new Set(appliedCriteria.categories);
  return (
    <section className="analytics-results" aria-label="Analysis results">
      <section
        className="card analytics-applied-scope"
        aria-label="Applied scope"
      >
        <p className="eyebrow">Reviewed findings</p>
        <h2 ref={headingRef} tabIndex={-1}>
          Conservation Analysis Results
        </h2>
        <a className="analytics-refine-link" href="#analytics-criteria">
          Refine Analysis
        </a>
        <h3>Applied scope</h3>
        <p>
          Park: {data.park.name} ({data.park.code}) · Period:{' '}
          {appliedCriteria.start} to {appliedCriteria.end} (inclusive)
        </p>
        <p>
          {appliedCriteria.categories
            .map((category) => CATEGORY_LABELS[category])
            .join(', ')}
        </p>
        {(
          ['rangerId', 'incidentType', 'severity', 'conflictStatus'] as const
        ).map(
          (key) =>
            appliedCriteria[key] && (
              <p key={key}>
                {
                  {
                    rangerId: 'Ranger ID',
                    incidentType: 'Incident type',
                    severity: 'Severity',
                    conflictStatus: 'Conflict status',
                  }[key]
                }
                : {appliedCriteria[key]}
              </p>
            ),
        )}
        {selected.has('HWC_TRENDS') && (
          <p className="analytics-scope-notice">
            The selected park applies to incident and patrol source data only.
            Conflict trends cover all parks / unassigned records; they are not
            park scoped.
          </p>
        )}
        <p>Analyzed at {data.generatedAt}</p>
      </section>
      {data.status === 'NO_MATCHING_DATA' ? (
        <FeedbackPanel tone="info" title="No matching conservation data">
          <p>
            Analysis completed successfully, but no records matched the applied
            criteria within the scope of the selected categories. Refine the
            criteria and select Update Analysis.
          </p>
        </FeedbackPanel>
      ) : (
        <div className="analytics-result-grid">
          {(selected.has('INCIDENT_STATISTICS') ||
            selected.has('INCIDENT_HOTSPOTS')) && (
            <p className="analytics-results-total">
              Matching park-linked incidents: {data.matchedRecords.incidents}.
            </p>
          )}
          {selected.has('INCIDENT_STATISTICS') && (
            <IncidentStatisticsResults data={data} />
          )}
          {selected.has('INCIDENT_HOTSPOTS') && data.incidentHotspots && (
            <IncidentHotspotResults analysis={data.incidentHotspots} />
          )}
          {selected.has('PATROL_COVERAGE') && data.patrolCoverage && (
            <PatrolCoverageResults analysis={data.patrolCoverage} />
          )}
          {selected.has('HWC_TRENDS') && data.conflictTrends && (
            <ConflictTrendResults analysis={data.conflictTrends} />
          )}
        </div>
      )}
      <ul>
        {data.categoryAvailability
          .filter(
            (item) =>
              item.status === 'NOT_IMPLEMENTED' ||
              item.status === 'UNAVAILABLE_PARK_ASSOCIATION',
          )
          .map((item) => (
            <li key={item.category}>
              {CATEGORY_LABELS[item.category]}:{' '}
              {item.status === 'UNAVAILABLE_PARK_ASSOCIATION'
                ? 'unavailable for park-scoped data.'
                : 'calculation pending a later batch.'}
            </li>
          ))}
      </ul>
      {data.status === 'NO_MATCHING_DATA' &&
        selected.has('PATROL_COVERAGE') &&
        data.patrolCoverage && (
          <PatrolCoverageResults analysis={data.patrolCoverage} />
        )}
      <details className="analytics-method">
        <summary>Data scope and limitations</summary>
        <ul aria-label="Scope limitations">
          {data.limitations.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
