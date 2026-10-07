import { useEffect, useRef } from 'react';
import { ConservationReportPreview } from './ConservationReport';
import { ReportMetadataForm } from './ReportMetadataForm';
import { ArchiveReportDialog, ReportHistoryCards } from './SavedReportViews';
import { useSavedReports } from './useSavedReports';
import type { SavedStatisticalReport } from '../../../../server/src/modules/analytics/savedReportContract';

export function SavedReports({
  onChanged,
  onArchived,
}: {
  onChanged?: (report: SavedStatisticalReport) => void;
  onArchived?: (id: string) => void;
}) {
  const reports = useSavedReports(onChanged, onArchived);
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
      {reports.busy && <p role="status">{reports.busy}...</p>}
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
            Retry report request
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
                disabled={!!reports.busy}
                onClick={reports.regenerate}
                className="button analytics-button analytics-button--primary"
              >
                Create New Version
              </button>
              <button
                type="button"
                disabled={!!reports.busy}
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
              onSave={reports.saveMetadata}
              onCancel={reports.cancelEdit}
            />
          )}
          <ConservationReportPreview
            snapshot={reports.detail}
            exporting={reports.busy === 'Exporting PDF'}
            error=""
            exportedFilename={reports.exportedFilename}
            onBack={reports.back}
            backLabel="Back to History"
            onExport={() => reports.exportPdf(reports.detail!)}
          />
        </>
      )}
      {reports.archiveTarget && (
        <ArchiveReportDialog
          report={reports.archiveTarget}
          busy={!!reports.busy}
          error={reports.error}
          onCancel={reports.cancelArchive}
          onArchive={reports.archive}
        />
      )}
    </section>
  );
}
