import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { ConservationReportPreview } from './ConservationReport';
import { ReportMetadataForm } from './ReportMetadataForm';
import {
  ArchiveReportDialog,
  DiscardMetadataDialog,
  ReportHistoryCards,
} from './SavedReportViews';
import { useSavedReports } from './useSavedReports';
import type { SavedStatisticalReport } from '../../../../server/src/modules/analytics/savedReportContract';

export interface SavedReportsHandle {
  requestLeave: (action: () => void) => void;
}

export function SavedReports({
  onChanged,
  onArchived,
  onWritePendingChange,
  ref,
}: {
  onChanged?: (report: SavedStatisticalReport) => void;
  onArchived?: (id: string) => void;
  onWritePendingChange?: (pending: boolean) => void;
  ref?: Ref<SavedReportsHandle>;
}) {
  const reports = useSavedReports(onChanged, onArchived, onWritePendingChange);
  useImperativeHandle(ref, () => ({ requestLeave: reports.requestLeave }));
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!reports.detail) heading.current?.focus();
  }, [reports.detail]);
  useEffect(() => {
    if (reports.notice.startsWith('Report archived.')) heading.current?.focus();
  }, [reports.notice]);
  return (
    <section
      className="analytics-saved-reports"
      aria-label="Saved Reports"
      aria-busy={!!reports.busy}
    >
      <h2 ref={heading} tabIndex={-1}>
        Report History
      </h2>
      <p>
        Saved reports retain server-issued findings. Editing report details
        changes only title and notes.
      </p>
      {reports.busy && (
        <p role="status">
          {reports.busy}... Please wait before leaving this view.
        </p>
      )}
      {reports.recoveryRequired && (
        <p role="status">
          Refresh Report History before starting another saved-report write.
        </p>
      )}
      {reports.notice && (
        <p role="status" className="analytics-report-success">
          {reports.notice}
        </p>
      )}
      {reports.error && !reports.archiveTarget && (
        <div role="alert">
          <p>{reports.error}</p>
          <button
            type="button"
            disabled={!!reports.busy}
            onClick={() => reports.retry?.()}
            className="button analytics-button analytics-button--secondary"
          >
            {reports.recoveryRequired
              ? 'Refresh Report History'
              : 'Retry report request'}
          </button>
        </div>
      )}
      {reports.exportError && !reports.detail && (
        <div role="alert">
          <p>{reports.exportError}</p>
          <button
            type="button"
            disabled={!!reports.busy}
            onClick={() => reports.retry?.()}
          >
            Retry Export PDF
          </button>
        </div>
      )}
      {!reports.detail && (
        <ReportHistoryCards
          history={reports.history}
          loaded={reports.loaded}
          busy={!!reports.busy}
          onRefresh={() => reports.load()}
          onMore={() => reports.load(reports.history.nextCursor ?? undefined)}
          onView={reports.open}
          onExport={reports.exportPdf}
          onArchive={reports.confirmArchive}
          writesBlocked={reports.recoveryRequired}
        />
      )}
      {reports.detail && (
        <>
          <div className="card analytics-saved-actions">
            <p>
              Report ID: {reports.detail.id} | Version {reports.detail.version}{' '}
              | Active
            </p>
            <p>
              Creator:{' '}
              {reports.detail.creatorId ??
                'Not recorded - individual manager identity is unavailable'}
            </p>
            <div className="analytics-actions">
              <button
                type="button"
                disabled={!!reports.busy}
                onClick={reports.back}
                className="button analytics-button analytics-button--secondary"
              >
                Return to Report History
              </button>
              <button
                type="button"
                disabled={!!reports.busy}
                onClick={reports.edit}
                className="button analytics-button analytics-button--secondary"
              >
                Edit Report Details
              </button>
              <button
                type="button"
                disabled={!!reports.busy || reports.recoveryRequired}
                onClick={reports.regenerate}
                className="button analytics-button analytics-button--primary"
              >
                Create New Version
              </button>
              <button
                type="button"
                disabled={!!reports.busy || reports.recoveryRequired}
                onClick={() => reports.confirmArchive(reports.detail!)}
                className="button analytics-button analytics-button--danger"
              >
                Archive Report
              </button>
            </div>
            <p>
              Create New Version recalculates current data using this report's
              saved criteria. To change criteria, return to Analysis and
              generate a separate report.
            </p>
          </div>
          {reports.editing && (
            <ReportMetadataForm
              report={reports.detail}
              busy={!!reports.busy}
              saveBlocked={reports.recoveryRequired}
              onSave={reports.saveMetadata}
              onCancel={reports.cancelEdit}
              onDirtyChange={reports.setMetadataDirty}
              serverErrors={reports.metadataErrors}
            />
          )}
          <ConservationReportPreview
            snapshot={reports.detail}
            exporting={reports.busy.startsWith('Exporting ')}
            disabled={!!reports.busy && !reports.busy.startsWith('Exporting ')}
            error={reports.exportError}
            exportedFilename={reports.exportedFilename}
            onBack={reports.back}
            backLabel="Back to History"
            format={reports.format}
            onFormatChange={reports.selectFormat}
            onExport={() => reports.exportReport(reports.detail!)}
          />
        </>
      )}
      {reports.discardPending && (
        <DiscardMetadataDialog
          onStay={reports.stayEditing}
          onDiscard={reports.discardEdits}
        />
      )}
      {reports.archiveTarget && (
        <ArchiveReportDialog
          report={reports.archiveTarget}
          busy={!!reports.busy}
          error={reports.error}
          onCancel={reports.cancelArchive}
          onArchive={reports.archive}
          recoveryRequired={reports.recoveryRequired}
          onRecover={reports.recover}
        />
      )}
    </section>
  );
}
