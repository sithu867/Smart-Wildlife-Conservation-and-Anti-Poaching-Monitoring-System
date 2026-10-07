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
  datePresetRange,
  validateDraftCriteriaIssues,
  type CriteriaValidationIssue,
  type DatePresetDays,
} from './criteria';
import { FeedbackPanel } from './AnalyticsFeedback';
import {
  AnalyticsResults,
  hasMeaningfulMatchingData,
} from './AnalyticsResults';
import { AnalysisCriteriaForm } from './AnalysisCriteriaForm';
import { AnalyticsOverview, AnalysisProcessing } from './AnalyticsExperience';
import {
  ConservationReportPreview,
  ReportGeneration,
} from './ConservationReport';
import {
  useConservationReport,
  type ReviewedAnalysis,
} from './useConservationReport';
import { matchesReviewedReportScope } from '../../../../server/src/modules/analytics/reportContract';
import './analytics.css';
import { SavedReports, type SavedReportsHandle } from './SavedReports';
import {
  FUTURE_PERIOD_MESSAGE,
  SUPPORTED_DATE_MESSAGE,
} from '../../../../server/src/modules/analytics/contract';

type AnalysisRequestError = { kind: 'validation' | 'system'; message: string };

function requestMessage(error: unknown): AnalysisRequestError {
  // Even a 400 response can come from a proxy or an unexpected backend failure.
  // Recognize only approved park/date rules; never echo arbitrary server text.
  if (
    isAxiosError<{ error?: { message?: string } }>(error) &&
    error.response?.status === 400
  ) {
    const message = error.response.data?.error?.message;
    if (message === FUTURE_PERIOD_MESSAGE || message === SUPPORTED_DATE_MESSAGE)
      return { kind: 'validation', message };
    return {
      kind: 'validation',
      message: [
        'The selected Park / Conservation Area does not exist. Please select another park.',
        'The selected park does not exist.',
      ].includes(error.response.data?.error?.message ?? '')
        ? 'The selected park does not exist. Select another Park / Conservation Area.'
        : 'Check the park, dates, categories and optional filters, then try again.',
    };
  }
  return {
    kind: 'system',
    message: 'Unable to analyze conservation data. Please try again.',
  };
}

export function AnalyticsPage() {
  const [showHistory, setShowHistory] = useState(false);
  const [savedWritePending, setSavedWritePending] = useState(false);
  const savedReports = useRef<SavedReportsHandle>(null);
  function switchView(history: boolean) {
    if (savedWritePending || history === showHistory) return;
    if (showHistory)
      savedReports.current?.requestLeave(() => setShowHistory(history));
    else setShowHistory(history);
  }
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
  const requestId = useRef(0);
  const pendingRequest = useRef<AbortController | null>(null);
  const processingHeading = useRef<HTMLHeadingElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const criteriaForm = useRef<HTMLFormElement>(null);
  const [criteriaFocusRequest, setCriteriaFocusRequest] = useState(0);

  useEffect(() => {
    if (!criteriaFocusRequest) return;
    // Wait for inline errors to render before moving focus. Refine/Reset use
    // the same destination so keyboard users can continue directly in the form.
    const target = criteriaForm.current?.querySelector<HTMLElement>('h2');
    const invalid = criteriaForm.current?.querySelector<HTMLElement>(
      'input[aria-invalid="true"], select[aria-invalid="true"]',
    );
    (invalid ?? target)?.focus({ preventScroll: true });
    (invalid ?? target)?.scrollIntoView?.({ block: 'start' });
  }, [criteriaFocusRequest]);

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

  function updateDraft(nextCriteria: AnalysisCriteria) {
    setDraftCriteria(nextCriteria);
    // Once validation is shown, recheck edits so correcting one field does not
    // hide outstanding errors elsewhere or discard the manager's draft.
    setValidationErrors((current) =>
      current.length
        ? validateDraftCriteriaIssues(nextCriteria, parks)
        : current,
    );
  }

  function editCriteria<K extends keyof AnalysisCriteria>(
    key: K,
    value: AnalysisCriteria[K],
  ) {
    updateDraft({ ...draftCriteria, [key]: value });
  }

  function applyDatePreset(days: DatePresetDays) {
    // Both dates change atomically, without touching the reviewed scope/results.
    updateDraft({ ...draftCriteria, ...datePresetRange(days) });
  }

  async function analyze(criteria: AnalysisCriteria) {
    // This synchronous guard blocks double submits before React disables the
    // button. The sequence check protects Reset/unmount even if a transport
    // ignores cancellation and completes an older request later.
    if (pendingRequest.current) return;
    if (parksLoading || parksError || !parks.length) return;
    // A new attempt replaces earlier failure feedback even if local validation
    // stops it. Keep the reviewed results and their applied scope intact.
    setRequestError(null);
    const errors = validateDraftCriteriaIssues(criteria, parks);
    setValidationErrors(errors);
    if (errors.length) {
      setCriteriaFocusRequest((value) => value + 1);
      return;
    }
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
        // A failed refresh changes feedback only. Previously reviewed data and
        // applied criteria remain paired, while the current draft stays editable.
        const failure = requestMessage(error);
        setRequestError(failure);
        // The authoritative server can cross UTC midnight or have a different
        // clock from the browser. Keep its recognized date rule actionable.
        if (failure.message === FUTURE_PERIOD_MESSAGE) {
          setValidationErrors([{ field: 'start', message: failure.message }]);
          setCriteriaFocusRequest((value) => value + 1);
        }
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
    // Reset is local UI state only; it never calls a persistence/delete API.
    setDraftCriteria(createDraftCriteria());
    setReviewedAnalysis(null);
    setValidationErrors([]);
    setRequestError(null);
    setLoading(false);
    setCriteriaFocusRequest((value) => value + 1);
  }

  const appliedCriteria = reviewedAnalysis?.appliedCriteria;
  const data = reviewedAnalysis?.data;
  const draftChanged =
    appliedCriteria &&
    JSON.stringify(draftCriteria) !== JSON.stringify(appliedCriteria);
  const hasMatchingData = hasMeaningfulMatchingData(data);
  const canGenerateReport =
    !!reviewedAnalysis &&
    hasMatchingData &&
    !loading &&
    !requestError &&
    validationErrors.length === 0 &&
    matchesReviewedReportScope(
      reviewedAnalysis.appliedCriteria,
      reviewedAnalysis.data,
    ) &&
    validateDraftCriteriaIssues(reviewedAnalysis.appliedCriteria, parks)
      .length === 0;
  const report = useConservationReport(reviewedAnalysis, canGenerateReport);

  useEffect(() => {
    if (!report.preview && report.report) {
      resultsHeading.current?.focus({ preventScroll: true });
      resultsHeading.current?.scrollIntoView?.({ block: 'start' });
    }
  }, [report.preview, report.report]);

  return (
    <main className="page analytics-page">
      <AnalyticsOverview />
      <nav
        className="analytics-actions analytics-view-switch"
        aria-label="Analysis and saved reports"
      >
        <button
          type="button"
          aria-pressed={!showHistory}
          className="button analytics-button analytics-button--secondary"
          disabled={report.generating || report.exporting || savedWritePending}
          onClick={() => switchView(false)}
        >
          Analysis
        </button>
        <button
          type="button"
          aria-pressed={showHistory}
          className="button analytics-button analytics-button--secondary"
          disabled={report.generating || report.exporting || savedWritePending}
          onClick={() => switchView(true)}
        >
          Saved Reports
        </button>
      </nav>
      {showHistory && (
        <SavedReports
          ref={savedReports}
          onWritePendingChange={setSavedWritePending}
          onChanged={report.synchronizeSavedReport}
          onArchived={report.forgetArchivedReport}
        />
      )}

      {!showHistory && !report.preview && (
        <>
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
              <p>Retry uses the criteria currently entered below.</p>
              <button
                type="button"
                disabled={
                  loading || parksLoading || !!parksError || !parks.length
                }
                // Corrections made after failure are intentional. Revalidate
                // and snapshot the current draft through the normal submit path.
                onClick={() => void analyze(draftCriteria)}
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
              draftChanged={!!draftChanged}
              onRefine={() => setCriteriaFocusRequest((value) => value + 1)}
            />
          )}
          <ReportGeneration
            canGenerate={canGenerateReport && !report.exporting}
            generating={report.generating}
            error={report.generationError}
            draftChanged={!!draftChanged}
            hasReport={!!report.report}
            onGenerate={(retry) => void report.generate(retry)}
            onPreview={report.showPreview}
          />
          <AnalysisCriteriaForm
            formRef={criteriaForm}
            criteria={draftCriteria}
            parks={parks}
            parksLoading={parksLoading}
            parksError={parksError}
            validationErrors={validationErrors}
            loading={loading}
            hasResults={!!reviewedAnalysis}
            draftChanged={!!draftChanged}
            onEdit={editCriteria}
            onDatePreset={applyDatePreset}
            onSubmit={submit}
            onReset={reset}
            onRetryParks={() => setParkRetry((value) => value + 1)}
          />
        </>
      )}
      {!showHistory && report.preview && report.report && (
        <ConservationReportPreview
          snapshot={report.report}
          exporting={report.exporting}
          error={report.exportError}
          exportedFilename={report.exportedFilename}
          onBack={report.returnToAnalysis}
          format={report.format}
          onFormatChange={report.selectFormat}
          onExport={() => void report.exportReport()}
        />
      )}
    </main>
  );
}
