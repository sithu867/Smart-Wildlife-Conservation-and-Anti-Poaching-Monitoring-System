import { useEffect, useRef } from 'react';
import type {
  ReportHistory,
  StatisticalReportSummary,
} from '../../../../server/src/modules/analytics/savedReportContract';
import { CATEGORY_LABELS } from '../../../../server/src/modules/analytics/contract';
import { formatAnalysisTimestamp } from './formatting';

export function ReportHistoryCards({
  history,
  loaded,
  busy,
  onRefresh,
  onMore,
  onView,
  onExport,
  onArchive,
  writesBlocked = false,
}: {
  history: ReportHistory;
  loaded: boolean;
  busy: boolean;
  onRefresh: () => void;
  onMore: () => void;
  onView: (id: string) => void;
  onExport: (report: StatisticalReportSummary) => void;
  onArchive: (report: StatisticalReportSummary) => void;
  writesBlocked?: boolean;
}) {
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={onRefresh}
        className="button analytics-button analytics-button--secondary"
      >
        Refresh Report History
      </button>
      {loaded && !history.items.length && (
        <div className="card">
          <h3>No saved reports yet</h3>
          <p>
            Analyze conservation data, then select Generate &amp; Save Report.
            Archived reports are excluded from this history.
          </p>
        </div>
      )}
      <div className="analytics-history-grid">
        {history.items.map((report) => (
          <article
            className="card analytics-history-card"
            key={report.id}
            aria-label={report.title}
          >
            <h3>{report.title}</h3>
            <p>
              <strong>{report.park.name}</strong> ({report.park.code})
            </p>
            <p>
              Period: {report.appliedCriteria.start} to{' '}
              {report.appliedCriteria.end}
            </p>
            <p>
              {report.selectedCategories
                .map((category) => CATEGORY_LABELS[category])
                .join(', ')}
            </p>
            <p>Generated: {formatAnalysisTimestamp(report.generatedAt)}</p>
            <p>Details updated: {formatAnalysisTimestamp(report.updatedAt)}</p>
            <p>Version {report.version} | Active</p>
            <p>Report ID: {report.id}</p>
            <div className="analytics-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => onView(report.id)}
                className="button analytics-button analytics-button--secondary"
              >
                View Report
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onExport(report)}
                className="button analytics-button analytics-button--secondary"
              >
                Export PDF
              </button>
              <button
                type="button"
                disabled={busy || writesBlocked}
                onClick={() => onArchive(report)}
                className="button analytics-button analytics-button--danger"
              >
                Archive Report
              </button>
            </div>
          </article>
        ))}
      </div>
      {history.nextCursor && (
        <button
          type="button"
          disabled={busy}
          onClick={onMore}
          className="button analytics-button analytics-button--secondary"
        >
          Load More Reports
        </button>
      )}
    </>
  );
}

export function DiscardMetadataDialog({
  onStay,
  onDiscard,
}: {
  onStay: () => void;
  onDiscard: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const modal = dialog.current;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    // Match the existing archive dialog: native focus trapping and an inert
    // background keep the decision usable with a keyboard or screen reader.
    modal?.showModal();
    modal?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      modal?.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="analytics-archive-dialog"
      aria-labelledby="discard-metadata-title"
      aria-describedby="discard-metadata-description"
      onCancel={(event) => {
        event.preventDefault();
        onStay();
      }}
    >
      <h2 id="discard-metadata-title">Discard unsaved report details?</h2>
      <p id="discard-metadata-description">
        Your title and notes have unsaved changes. Stay to continue editing, or
        discard these changes to continue.
      </p>
      <div className="analytics-actions">
        <button
          type="button"
          className="button analytics-button analytics-button--secondary"
          onClick={onStay}
        >
          Stay and Continue Editing
        </button>
        <button
          type="button"
          className="button analytics-button analytics-button--danger"
          onClick={onDiscard}
        >
          Discard Changes
        </button>
      </div>
    </dialog>
  );
}

export function ArchiveReportDialog({
  report,
  busy,
  error,
  onCancel,
  onArchive,
  recoveryRequired = false,
  onRecover,
}: {
  report: StatisticalReportSummary;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onArchive: () => void;
  recoveryRequired?: boolean;
  onRecover?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const modal = dialog.current;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    // Native modal semantics supply focus trapping, Escape and an inert background.
    modal?.showModal();
    return () => {
      modal?.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="analytics-archive-dialog"
      aria-labelledby="archive-report-title"
      aria-describedby="archive-report-description"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onCancel();
      }}
    >
      <h2 id="archive-report-title">Archive Report?</h2>
      <p id="archive-report-description">
        Archive &quot;{report.title}&quot; (version {report.version}, ID{' '}
        {report.id})? It will leave active history. Its saved snapshot and
        source conservation data will be retained.
      </p>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Archiving report...</p>}
      <div className="analytics-actions">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="button analytics-button analytics-button--secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={recoveryRequired ? onRecover : onArchive}
          className="button analytics-button analytics-button--danger"
        >
          {busy
            ? 'Archiving...'
            : recoveryRequired
              ? 'Refresh Report History'
              : error
                ? 'Retry Archive Report'
                : 'Archive Report'}
        </button>
      </div>
    </dialog>
  );
}
