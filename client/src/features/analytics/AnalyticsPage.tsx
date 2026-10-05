import { useEffect, useRef, useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import {
  type AnalysisCriteria,
  type AnalyticsResult,
  type ParkOption,
} from '../../../../server/src/modules/analytics/contract';
import { analyticsApi } from './api';
import {
  copyCriteria,
  createDraftCriteria,
  validateDraftCriteriaIssues,
  type CriteriaValidationIssue,
} from './criteria';
import { FeedbackPanel } from './AnalyticsFeedback';
import {
  AnalyticsResults,
  hasMeaningfulMatchingData,
} from './AnalyticsResults';
import { AnalysisCriteriaForm } from './AnalysisCriteriaForm';
import { AnalyticsOverview, AnalysisProcessing } from './AnalyticsExperience';
import './analytics.css';

type ReviewedAnalysis = {
  appliedCriteria: AnalysisCriteria;
  data: AnalyticsResult;
};

type AnalysisRequestError = { kind: 'validation' | 'system'; message: string };

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
  const [processingCategories, setProcessingCategories] = useState<
    AnalysisCriteria['categories']
  >([]);
  const [downloading, setDownloading] = useState(false);
  const [reportError, setReportError] = useState('');
  const requestId = useRef(0);
  const pendingRequest = useRef<AbortController | null>(null);
  const failedCriteria = useRef<AnalysisCriteria | null>(null);
  const processingHeading = useRef<HTMLHeadingElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!loading) return;
    // The submit action can be below the fold. Bring the real indeterminate
    // processing state into view and give keyboard users a stable destination.
    processingHeading.current?.focus({ preventScroll: true });
    processingHeading.current?.scrollIntoView?.({ block: 'start' });
  }, [loading]);

  useEffect(() => {
    if (!reviewedAnalysis) return;
    // Draft editing is allowed while processing. Do not take focus away from
    // a field the manager is still editing when the submitted snapshot returns.
    if (document.activeElement?.matches('input, select, textarea')) return;
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView?.({ block: 'start' });
  }, [reviewedAnalysis]);

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
    // Announce the submitted categories even if criteria are edited mid-request.
    setProcessingCategories(appliedSnapshot.categories);
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
  const hasMatchingData = hasMeaningfulMatchingData(data);

  return (
    <main className="page analytics-page">
      <AnalyticsOverview />

      {loading && (
        <AnalysisProcessing
          categories={processingCategories}
          headingRef={processingHeading}
        />
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
      {data && appliedCriteria && (
        <AnalyticsResults
          headingRef={resultsHeading}
          data={data}
          appliedCriteria={appliedCriteria}
          loading={loading}
          downloading={downloading}
          reportError={reportError}
          onDownload={() => void downloadReport()}
        />
      )}
      <AnalysisCriteriaForm
        criteria={draftCriteria}
        parks={parks}
        parksLoading={parksLoading}
        parksError={parksError}
        validationErrors={validationErrors}
        loading={loading}
        hasResults={!!reviewedAnalysis}
        draftChanged={!!draftChanged}
        onEdit={editCriteria}
        onSubmit={submit}
        onReset={reset}
        onRetryParks={() => setParkRetry((value) => value + 1)}
      />
    </main>
  );
}
