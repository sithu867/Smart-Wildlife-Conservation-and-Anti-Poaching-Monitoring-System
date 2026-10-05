import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { isAxiosError } from 'axios';
import {
  ANALYSIS_CATEGORIES,
  CATEGORY_LABELS,
  type AnalysisCriteria,
  type AnalyticsResult,
  type ParkOption,
} from '../../../../server/src/modules/analytics/contract';
import {
  AlertSeverity,
  AlertStatus,
  IncidentType,
} from '../../shared/types/enums';
import { analyticsApi } from './api';
import {
  copyCriteria,
  createDraftCriteria,
  validateDraftCriteriaIssues,
  type CriteriaValidationIssue,
} from './criteria';
import './analytics.css';

type ReviewedAnalysis = {
  appliedCriteria: AnalysisCriteria;
  data: AnalyticsResult;
};

type AnalysisRequestError = { kind: 'validation' | 'system'; message: string };

function FeedbackPanel({
  tone,
  title,
  children,
}: {
  tone: 'validation' | 'system' | 'info';
  title: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <div
      className={`analytics-feedback analytics-feedback--${tone}`}
      role={tone === 'info' ? 'status' : 'alert'}
      aria-labelledby={titleId}
    >
      <h3 id={titleId}>{title}</h3>
      {children}
    </div>
  );
}

function requestMessage(error: unknown): AnalysisRequestError {
  // Surface intentional API validation messages; other failures use a stable
  // message rather than exposing raw database or network exceptions.
  if (
    isAxiosError<{ error?: { message?: string } }>(error) &&
    error.response?.status === 400
  ) {
    return {
      kind: 'validation',
      message:
        error.response.data?.error?.message ||
        'Please check the analysis criteria.',
    };
  }
  return {
    kind: 'system',
    message: 'Unable to analyze conservation data. Please try again.',
  };
}

export function AnalyticsPage() {
  const [draftCriteria, setDraftCriteria] = useState(createDraftCriteria);
  // Criteria and results commit together. Draft edits or failed requests cannot
  // relabel existing results with criteria that did not produce them.
  const [reviewedAnalysis, setReviewedAnalysis] =
    useState<ReviewedAnalysis | null>(null);
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [parksLoading, setParksLoading] = useState(true);
  const [parksError, setParksError] = useState('');
  const [parkRetry, setParkRetry] = useState(0);
  const [validationErrors, setValidationErrors] = useState<
    CriteriaValidationIssue[]
  >([]);
  const [requestError, setRequestError] = useState<AnalysisRequestError | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [reportError, setReportError] = useState('');
  const requestId = useRef(0);
  const pendingRequest = useRef<AbortController | null>(null);
  const failedCriteria = useRef<AnalysisCriteria | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setParksLoading(true);
    setParksError('');
    analyticsApi
      .listParks(controller.signal)
      .then((records) => {
        if (!controller.signal.aborted) setParks(records);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setParksError('Unable to load parks. Please try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setParksLoading(false);
      });
    return () => controller.abort();
  }, [parkRetry]);

  useEffect(
    () => () => {
      requestId.current += 1;
      pendingRequest.current?.abort();
    },
    [],
  );

  function editCriteria<K extends keyof AnalysisCriteria>(
    key: K,
    value: AnalysisCriteria[K],
  ) {
    const nextCriteria = { ...draftCriteria, [key]: value };
    setDraftCriteria(nextCriteria);
    // Once validation is shown, recheck edits so correcting one field does not
    // hide outstanding errors elsewhere or discard the manager's draft.
    setValidationErrors((current) =>
      current.length
        ? validateDraftCriteriaIssues(nextCriteria, parks)
        : current,
    );
  }

  async function analyze(criteria: AnalysisCriteria) {
    // This synchronous guard blocks double submits before React disables the
    // button. The sequence check protects Reset/unmount even if a transport
    // ignores cancellation and completes an older request later.
    if (pendingRequest.current) return;
    // A new attempt replaces earlier failure feedback even if local validation
    // stops it. Keep the reviewed results and their applied scope intact.
    setRequestError(null);
    setReportError('');
    failedCriteria.current = null;
    const errors = validateDraftCriteriaIssues(criteria, parks);
    setValidationErrors(errors);
    if (errors.length) return;
    const appliedSnapshot = copyCriteria(criteria);
    const controller = new AbortController();
    pendingRequest.current = controller;
    const sequence = ++requestId.current;
    setLoading(true);
    try {
      const data = await analyticsApi.analyze(
        appliedSnapshot,
        controller.signal,
      );
      if (sequence === requestId.current)
        setReviewedAnalysis({ appliedCriteria: appliedSnapshot, data });
    } catch (error) {
      if (sequence === requestId.current) {
        failedCriteria.current = appliedSnapshot;
        setRequestError(requestMessage(error));
      }
    } finally {
      if (sequence === requestId.current) {
        pendingRequest.current = null;
        setLoading(false);
      }
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void analyze(draftCriteria);
  }

  function reset() {
    requestId.current += 1;
    pendingRequest.current?.abort();
    pendingRequest.current = null;
    failedCriteria.current = null;
    setDraftCriteria(createDraftCriteria());
    setReviewedAnalysis(null);
    setValidationErrors([]);
    setRequestError(null);
    setReportError('');
    setLoading(false);
  }

  async function downloadReport() {
    // Guard the handler too, so an empty result cannot trigger a download even
    // if the button's disabled state is bypassed. Use reviewed data, not draft.
    if (!reviewedAnalysis || !hasMatchingData || loading || downloading) return;
    setDownloading(true);
    setReportError('');
    try {
      await analyticsApi.downloadExistingReport(
        copyCriteria(reviewedAnalysis.appliedCriteria),
      );
    } catch {
      setReportError('Unable to download the report. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  const appliedCriteria = reviewedAnalysis?.appliedCriteria;
  const data = reviewedAnalysis?.data;
  const draftChanged =
    appliedCriteria &&
    JSON.stringify(draftCriteria) !== JSON.stringify(appliedCriteria);
  const hasStatistics = appliedCriteria?.categories.includes(
    'INCIDENT_STATISTICS',
  );

  const hasMatchingData =
    data?.status === 'DATA' &&
    (data.matchedRecords.incidents > 0 || data.matchedRecords.patrols > 0);

  function fieldAccessibility(field: keyof AnalysisCriteria) {
    const invalid = validationErrors.some((issue) => issue.field === field);
    return {
      'aria-invalid': invalid,
      'aria-describedby': invalid ? `analytics-error-${field}` : undefined,
    };
  }

  function fieldFeedback(field: keyof AnalysisCriteria) {
    const messages = validationErrors
      .filter((issue) => issue.field === field)
      .map((issue) => issue.message);
    return messages.length ? (
      <p className="analytics-field-error" id={`analytics-error-${field}`}>
        {messages.join(' ')}
      </p>
    ) : null;
  }

  return (
    <main className="page">
      <p className="eyebrow">Park manager</p>
      <h1>Conservation Analytics</h1>
      <p>Select criteria, then Analyze to review conservation data.</p>
      <form
        className="card analytics-criteria"
        onSubmit={submit}
        noValidate
        aria-label="Analysis criteria"
      >
        <div className="analytics-filters">
          <div className="analytics-field">
            <label>
              Park / Conservation Area
              <select
                {...fieldAccessibility('parkId')}
                value={draftCriteria.parkId}
                onChange={(event) => editCriteria('parkId', event.target.value)}
                disabled={parksLoading || !!parksError}
              >
                <option value="">Select a park</option>
                {parks.map((park) => (
                  <option key={park.id} value={park.id}>
                    {park.name} ({park.code})
                  </option>
                ))}
              </select>
            </label>
            {fieldFeedback('parkId')}
          </div>
          <div className="analytics-field">
            <label>
              Start Date
              <input
                type="date"
                {...fieldAccessibility('start')}
                value={draftCriteria.start}
                onChange={(event) => editCriteria('start', event.target.value)}
              />
            </label>
            {fieldFeedback('start')}
          </div>
          <div className="analytics-field">
            <label>
              End Date
              <input
                type="date"
                {...fieldAccessibility('end')}
                value={draftCriteria.end}
                onChange={(event) => editCriteria('end', event.target.value)}
              />
            </label>
            {fieldFeedback('end')}
          </div>
        </div>
        <fieldset
          className="analytics-categories"
          {...fieldAccessibility('categories')}
        >
          <legend>Analysis Categories (select one or more)</legend>
          {ANALYSIS_CATEGORIES.map((category) => (
            <label key={category}>
              <input
                type="checkbox"
                {...fieldAccessibility('categories')}
                checked={draftCriteria.categories.includes(category)}
                onChange={(event) =>
                  editCriteria(
                    'categories',
                    event.target.checked
                      ? [...draftCriteria.categories, category]
                      : draftCriteria.categories.filter(
                          (value) => value !== category,
                        ),
                  )
                }
              />
              {CATEGORY_LABELS[category]}
            </label>
          ))}
          {fieldFeedback('categories')}
        </fieldset>
        <div className="analytics-filters">
          <div className="analytics-field">
            <label>
              Ranger ID
              <input
                placeholder="All rangers"
                {...fieldAccessibility('rangerId')}
                value={draftCriteria.rangerId}
                onChange={(event) =>
                  editCriteria('rangerId', event.target.value)
                }
              />
            </label>
            {fieldFeedback('rangerId')}
          </div>
          <div className="analytics-field">
            <label>
              Incident type
              <select
                {...fieldAccessibility('incidentType')}
                value={draftCriteria.incidentType}
                onChange={(event) =>
                  editCriteria('incidentType', event.target.value)
                }
              >
                <option value="">All types</option>
                {Object.values(IncidentType).map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            {fieldFeedback('incidentType')}
          </div>
          <div className="analytics-field">
            <label>
              Severity
              <select
                {...fieldAccessibility('severity')}
                value={draftCriteria.severity}
                onChange={(event) =>
                  editCriteria('severity', event.target.value)
                }
              >
                <option value="">All severities</option>
                {Object.values(AlertSeverity).map((severity) => (
                  <option key={severity}>{severity}</option>
                ))}
              </select>
            </label>
            {fieldFeedback('severity')}
          </div>
          <div className="analytics-field">
            <label>
              Conflict status
              <select
                {...fieldAccessibility('conflictStatus')}
                value={draftCriteria.conflictStatus}
                onChange={(event) =>
                  editCriteria('conflictStatus', event.target.value)
                }
              >
                <option value="">All statuses</option>
                {Object.values(AlertStatus).map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            {fieldFeedback('conflictStatus')}
          </div>
        </div>
        <p>
          End Date includes the entire selected day. Hotspots, patrol coverage,
          and conflict trends are criteria for later batches. Conflict filters
          are retained, but conflict records cannot yet be scoped to a park.
        </p>
        {parksLoading && <p role="status">Loading parks...</p>}
        {parksError && (
          <FeedbackPanel tone="system" title="Parks could not be loaded">
            <p>{parksError}</p>
            <button
              type="button"
              onClick={() => setParkRetry((value) => value + 1)}
            >
              Retry loading parks
            </button>
          </FeedbackPanel>
        )}
        {!parksLoading && !parksError && !parks.length && (
          <p role="status">
            No parks are available. Add real park data before analyzing.
          </p>
        )}
        {!!validationErrors.length && (
          <FeedbackPanel tone="validation" title="Check the analysis criteria">
            <p>Correct the highlighted fields, then select Analyze.</p>
            <ul>
              {validationErrors.map((issue) => (
                <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          </FeedbackPanel>
        )}
        <div className="analytics-actions">
          <button
            className="button"
            type="submit"
            disabled={loading || parksLoading || !!parksError || !parks.length}
          >
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
          <button className="button" type="button" onClick={reset}>
            Reset
          </button>
        </div>
      </form>
      {loading && (
        <p role="status">
          Analyzing conservation data. Your entered criteria are preserved.
        </p>
      )}
      {requestError && (
        <FeedbackPanel
          tone={requestError.kind}
          title={
            requestError.kind === 'validation'
              ? 'Check the analysis criteria'
              : 'Analysis could not be completed'
          }
        >
          <p>{requestError.message}</p>
          <button
            type="button"
            disabled={loading}
            onClick={() =>
              failedCriteria.current && void analyze(failedCriteria.current)
            }
          >
            Retry analysis
          </button>
        </FeedbackPanel>
      )}
      {draftChanged && (
        <p>
          Criteria have changed. Analyze again to update the displayed results.
        </p>
      )}
      {data && appliedCriteria && (
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
            {appliedCriteria.rangerId && (
              <p>Ranger ID: {appliedCriteria.rangerId}</p>
            )}
            {appliedCriteria.incidentType && (
              <p>Incident type: {appliedCriteria.incidentType}</p>
            )}
            {appliedCriteria.severity && (
              <p>Severity: {appliedCriteria.severity}</p>
            )}
            {appliedCriteria.conflictStatus && (
              <p>Conflict status: {appliedCriteria.conflictStatus}</p>
            )}
            <p>Analyzed at {data.generatedAt}</p>
          </section>
          {data.status === 'NO_MATCHING_DATA' ? (
            <FeedbackPanel tone="info" title="No matching conservation data">
              <p>
                Analysis completed successfully, but no park-linked records
                matched the applied criteria. Refine the criteria and Analyze
                again.
              </p>
            </FeedbackPanel>
          ) : (
            <>
              <p>
                Matching park-linked records: {data.matchedRecords.incidents}{' '}
                incidents, {data.matchedRecords.patrols} patrol sessions.
              </p>
              {hasStatistics && (
                <>
                  <section className="analytics-grid">
                    <article className="card">
                      <small>Incidents</small>
                      <strong>{data.summary.incidents.total}</strong>
                    </article>
                  </section>
                  <section className="card">
                    <h2>Incidents by type</h2>
                    {data.incidents.byType.length ? (
                      <ul>
                        {data.incidents.byType.map((row) => (
                          <li key={row.name}>
                            {row.name}: {row.count}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No incidents match the applied criteria.</p>
                    )}
                  </section>
                </>
              )}
            </>
          )}
          <ul>
            {data.categoryAvailability
              .filter((item) => item.status !== 'AVAILABLE')
              .map((item) => (
                <li key={item.category}>
                  {CATEGORY_LABELS[item.category]}:{' '}
                  {item.status === 'UNAVAILABLE_PARK_ASSOCIATION'
                    ? 'unavailable for park-scoped data; calculation pending.'
                    : 'calculation pending a later batch.'}
                </li>
              ))}
          </ul>
          <ul aria-label="Scope limitations">
            {data.limitations.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
          {/* Retain the existing PDF download using reviewed criteria. No new report
          preview, history, or export format is added in Batch 1. */}
          <button
            className="button"
            type="button"
            disabled={loading || downloading || !hasMatchingData}
            aria-describedby={
              !hasMatchingData ? 'analytics-report-unavailable' : undefined
            }
            onClick={() => void downloadReport()}
          >
            {downloading ? 'Downloading...' : 'Download report'}
          </button>
          {!hasMatchingData && (
            <p id="analytics-report-unavailable">
              Download Report is available after a successful analysis with
              matching conservation data.
            </p>
          )}
          {reportError && (
            <FeedbackPanel tone="system" title="Report could not be downloaded">
              <p>{reportError}</p>
            </FeedbackPanel>
          )}
        </section>
      )}
    </main>
  );
}
