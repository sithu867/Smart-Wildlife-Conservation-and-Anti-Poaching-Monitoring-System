import { useEffect, useRef } from 'react';
import {
  buildReportDocument,
  type ConservationReportSnapshot,
} from '../../../../server/src/modules/analytics/reportContract';
import { FeedbackPanel } from './AnalyticsFeedback';
import {
  REPORT_EXPORT_FORMATS,
  REPORT_FORMAT_LABELS,
  type ReportExportFormat,
} from '../../../../server/src/modules/analytics/reportContract';
import { ReportSections } from './ReportSections';
import { REPORT_PRESENTATION } from './formatting';

export function ReportGeneration({
  canGenerate,
  generating,
  error,
  draftChanged,
  hasReport,
  onGenerate,
  onPreview,
}: {
  canGenerate: boolean;
  generating: boolean;
  error: string;
  draftChanged: boolean;
  hasReport: boolean;
  onGenerate: (retry?: boolean) => void;
  onPreview: () => void;
}) {
  return (
    <section
      className="card analytics-report-actions"
      aria-label="Report generation"
      aria-busy={generating}
    >
      <h2>Generate a Conservation Report</h2>
      <p id="analytics-report-eligibility">
        Generate &amp; Save Report is available after a successful analysis with
        meaningful findings, including registered routes with no patrol
        activity.
      </p>
      <p>
        {draftChanged
          ? 'Draft criteria have changed. The report will use the reviewed applied analysis criteria and filters.'
          : 'Generate and save a report using the applied criteria.'}
      </p>
      <p>
        The server recalculates current findings before saving. Review the saved
        preview if source data changed since Analyze.
      </p>
      <div className="analytics-actions">
        <button
          type="button"
          className="button analytics-button analytics-button--primary"
          disabled={!canGenerate || generating}
          aria-describedby="analytics-report-eligibility"
          onClick={() => onGenerate()}
        >
          {generating
            ? 'Generating & Saving Report...'
            : 'Generate & Save Report'}
        </button>
        {hasReport && (
          <button
            type="button"
            className="button analytics-button analytics-button--secondary"
            disabled={generating}
            onClick={onPreview}
          >
            View Generated Report
          </button>
        )}
      </div>
      {generating && (
        <p role="status">
          Generating Statistical Conservation Report from your reviewed
          analysis...
        </p>
      )}
      {error && (
        <FeedbackPanel tone="system" title="Report generation failed">
          <p>{error}</p>
          <button
            type="button"
            disabled={!canGenerate || generating}
            onClick={() => onGenerate(true)}
          >
            Retry Generate &amp; Save Report
          </button>
        </FeedbackPanel>
      )}
    </section>
  );
}

export function ConservationReportPreview({
  snapshot,
  exporting,
  error,
  exportedFilename,
  onBack,
  onExport,
  backLabel = 'Return to Analysis',
  format = 'pdf',
  onFormatChange,
  disabled = false,
}: {
  snapshot: ConservationReportSnapshot;
  exporting: boolean;
  error: string;
  exportedFilename: string;
  onBack: () => void;
  onExport: () => void;
  backLabel?: string;
  format?: ReportExportFormat;
  onFormatChange?: (format: ReportExportFormat) => void;
  disabled?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView?.({ block: 'start' });
  }, [snapshot]);
  const report = buildReportDocument(snapshot, REPORT_PRESENTATION);
  function lines(values: string[]) {
    return (
      <ul>
        {values.map((value, index) => (
          <li key={index}>{value}</li>
        ))}
      </ul>
    );
  }
  return (
    <section className="analytics-report-preview" aria-label="Report Preview">
      <p className="analytics-report-success" role="status">
        Saved report loaded successfully. Review the saved findings below, then
        choose PDF, CSV or Excel to export.
      </p>
      <article className="card analytics-report-paper">
        <header>
          <p className="eyebrow">Generated report · Park Manager review</p>
          <h2 tabIndex={-1} ref={heading}>
            {report.title}
          </h2>
          {report.header.map((value) => (
            <p key={value}>{value}</p>
          ))}
        </header>
        <section aria-label="Report Includes">
          <h3>Report Includes</h3>
          <ol>
            {report.includes.map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ol>
        </section>
        <section aria-label="Analysis Scope">
          <h3>Analysis Scope</h3>
          {lines(report.scope)}
        </section>
        <section
          className="analytics-report-summary"
          aria-label="Executive Summary"
        >
          <h3>Executive Summary</h3>
          {lines(report.summary)}
        </section>
        <ReportSections snapshot={snapshot} />
        {!!report.limitations.length && (
          <section aria-label="Report limitations">
            <h3>Data Scope and Limitations</h3>
            {lines(report.limitations)}
          </section>
        )}
      </article>
      <div className="card analytics-report-export" aria-busy={exporting}>
        <h3>Export Report</h3>
        <p>Export the saved findings in your preferred format.</p>
        <fieldset
          className="analytics-export-formats"
          disabled={exporting || disabled}
        >
          <legend>Export Format</legend>
          {REPORT_EXPORT_FORMATS.map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="report-export-format"
                value={value}
                checked={format === value}
                onChange={() => onFormatChange?.(value)}
              />
              {value === 'xlsx' ? 'Excel (.xlsx)' : REPORT_FORMAT_LABELS[value]}
            </label>
          ))}
        </fieldset>
        <div className="analytics-actions">
          <button
            type="button"
            className="button analytics-button analytics-button--secondary"
            onClick={onBack}
            disabled={exporting || disabled}
          >
            {backLabel}
          </button>
          <button
            type="button"
            className="button analytics-button analytics-button--primary"
            disabled={exporting || disabled}
            onClick={onExport}
          >
            {exporting
              ? `Exporting ${REPORT_FORMAT_LABELS[format]}...`
              : `Export ${REPORT_FORMAT_LABELS[format]}`}
          </button>
        </div>
        {exporting && (
          <p role="status">
            Exporting your saved report as {REPORT_FORMAT_LABELS[format]}...
          </p>
        )}
        {exportedFilename && (
          <p className="analytics-report-success" role="status">
            {
              REPORT_FORMAT_LABELS[
                exportedFilename.endsWith('.xlsx')
                  ? 'xlsx'
                  : exportedFilename.endsWith('.csv')
                    ? 'csv'
                    : 'pdf'
              ]
            }{' '}
            exported successfully. <strong>{exportedFilename}</strong>
          </p>
        )}
        {error && (
          <FeedbackPanel
            tone="system"
            title={`${REPORT_FORMAT_LABELS[format]} export failed`}
          >
            <p>{error}</p>
            <button
              type="button"
              disabled={exporting || disabled}
              onClick={onExport}
            >
              Retry Export {REPORT_FORMAT_LABELS[format]}
            </button>
          </FeedbackPanel>
        )}
      </div>
    </section>
  );
}
