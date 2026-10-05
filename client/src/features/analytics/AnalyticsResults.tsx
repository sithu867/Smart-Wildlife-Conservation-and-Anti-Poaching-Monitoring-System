import {
  CATEGORY_LABELS,
  type AnalysisCriteria,
  type AnalyticsResult,
} from '../../../../server/src/modules/analytics/contract';
import { FeedbackPanel } from './AnalyticsFeedback';
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
  data: AnalyticsResult;
  appliedCriteria: AnalysisCriteria;
  loading: boolean;
  downloading: boolean;
  reportError: string;
  onDownload: () => void;
}
export function AnalyticsResults({
  data,
  appliedCriteria,
  loading,
  downloading,
  reportError,
  onDownload,
}: Props) {
  const selected = new Set(appliedCriteria.categories);
  const hasMatchingData = hasMeaningfulMatchingData(data);
  return (
    <section className="analytics-results" aria-label="Analysis results">
      <section className="card" aria-label="Applied scope">
        <h2>Applied scope</h2>
        <p>
          {data.park.name} ({data.park.code}) · {appliedCriteria.start} to{' '}
          {appliedCriteria.end} (inclusive)
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
            criteria and Analyze again.
          </p>
        </FeedbackPanel>
      ) : (
        <>
          {(selected.has('INCIDENT_STATISTICS') ||
            selected.has('INCIDENT_HOTSPOTS')) && (
            <p>
              Matching park-linked incidents: {data.matchedRecords.incidents}.
            </p>
          )}
          {selected.has('PATROL_COVERAGE') && (
            <p>
              Matching park-linked patrol sessions:{' '}
              {data.matchedRecords.patrols}. Coverage calculation is pending.
            </p>
          )}
          {selected.has('INCIDENT_STATISTICS') && (
            <IncidentStatisticsResults data={data} />
          )}
          {selected.has('INCIDENT_HOTSPOTS') && data.incidentHotspots && (
            <IncidentHotspotResults analysis={data.incidentHotspots} />
          )}
          {selected.has('HWC_TRENDS') && data.conflictTrends && (
            <ConflictTrendResults analysis={data.conflictTrends} />
          )}
        </>
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
      <ul aria-label="Scope limitations">
        {data.limitations.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
      <button
        className="button analytics-button analytics-button--secondary"
        type="button"
        disabled={loading || downloading || !hasMatchingData}
        aria-describedby={
          !hasMatchingData ? 'analytics-report-unavailable' : undefined
        }
        onClick={onDownload}
      >
        {downloading ? 'Downloading...' : 'Download report'}
      </button>
      {!hasMatchingData && (
        <p id="analytics-report-unavailable">
          Download Report is available after a successful analysis with matching
          conservation data.
        </p>
      )}
      {reportError && (
        <FeedbackPanel tone="system" title="Report could not be downloaded">
          <p>{reportError}</p>
        </FeedbackPanel>
      )}
    </section>
  );
}
