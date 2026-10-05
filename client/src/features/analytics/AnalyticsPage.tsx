import { useEffect, useRef, useState, type FormEvent } from 'react';
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
  validateDraftCriteria,
} from './criteria';
import './analytics.css';

type ReviewedAnalysis = {
  appliedCriteria: AnalysisCriteria;
  data: AnalyticsResult;
};

function requestMessage(error: unknown): string {
  // Surface intentional API validation messages; other failures use a stable
  // message rather than exposing raw database or network exceptions.
  if (
    isAxiosError<{ error?: { message?: string } }>(error) &&
    error.response?.status === 400
  ) {
    return (
      error.response.data?.error?.message ||
      'Please check the analysis criteria.'
    );
  }
  return 'Unable to analyze conservation data. Please try again.';
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
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [requestError, setRequestError] = useState('');
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
    setDraftCriteria((current) => ({ ...current, [key]: value }));
    setValidationErrors([]);
  }

  async function analyze(criteria: AnalysisCriteria) {
    // This synchronous guard blocks double submits before React disables the
    // button. The sequence check protects Reset/unmount even if a transport
    // ignores cancellation and completes an older request later.
    if (pendingRequest.current) return;
    const errors = validateDraftCriteria(criteria, parks);
    setValidationErrors(errors);
    if (errors.length) return;
    const appliedSnapshot = copyCriteria(criteria);
    const controller = new AbortController();
    pendingRequest.current = controller;
    const sequence = ++requestId.current;
    setLoading(true);
    setRequestError('');
    setReportError('');
    failedCriteria.current = null;
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
    setRequestError('');
    setReportError('');
    setLoading(false);
  }

  async function downloadReport() {
    if (!reviewedAnalysis || downloading) return;
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
          <label>
            Park / Conservation Area
            <select
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
          <label>
            Start Date
            <input
              type="date"
              value={draftCriteria.start}
              onChange={(event) => editCriteria('start', event.target.value)}
            />
          </label>
          <label>
            End Date
            <input
              type="date"
              value={draftCriteria.end}
              onChange={(event) => editCriteria('end', event.target.value)}
            />
          </label>
        </div>
        <fieldset className="analytics-categories">
          <legend>Analysis Categories (select one or more)</legend>
          {ANALYSIS_CATEGORIES.map((category) => (
            <label key={category}>
              <input
                type="checkbox"
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
        </fieldset>
        <div className="analytics-filters">
          <label>
            Ranger ID
            <input
              placeholder="All rangers"
              value={draftCriteria.rangerId}
              onChange={(event) => editCriteria('rangerId', event.target.value)}
            />
          </label>
          <label>
            Incident type
            <select
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
          <label>
            Severity
            <select
              value={draftCriteria.severity}
              onChange={(event) => editCriteria('severity', event.target.value)}
            >
              <option value="">All severities</option>
              {Object.values(AlertSeverity).map((severity) => (
                <option key={severity}>{severity}</option>
              ))}
            </select>
          </label>
          <label>
            Conflict status
            <select
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
        </div>
        <p>
          End Date includes the entire selected day. Hotspots, patrol coverage,
          and conflict trends are criteria for later batches. Conflict filters
          are retained, but conflict records cannot yet be scoped to a park.
        </p>
        {parksLoading && <p role="status">Loading parks...</p>}
        {parksError && (
          <p role="alert">
            {parksError}{' '}
            <button
              type="button"
              onClick={() => setParkRetry((value) => value + 1)}
            >
              Retry loading parks
            </button>
          </p>
        )}
        {!parksLoading && !parksError && !parks.length && (
          <p role="status">
            No parks are available. Add real park data before analyzing.
          </p>
        )}
        {!!validationErrors.length && (
          <div role="alert">
            <ul>
              {validationErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
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
        <p role="alert">
          {requestError}{' '}
          <button
            type="button"
            disabled={loading}
            onClick={() =>
              failedCriteria.current && void analyze(failedCriteria.current)
            }
          >
            Retry analysis
          </button>
        </p>
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
            <p role="status">No matching conservation data</p>
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
            disabled={
              loading || downloading || data.status === 'NO_MATCHING_DATA'
            }
            onClick={() => void downloadReport()}
          >
            {downloading ? 'Downloading...' : 'Download report'}
          </button>
          {reportError && <p role="alert">{reportError}</p>}
        </section>
      )}
    </main>
  );
}
