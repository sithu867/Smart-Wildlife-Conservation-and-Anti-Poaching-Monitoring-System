import { useEffect, useRef } from 'react';
import {
  buildReportDocument,
  type ConservationReportSnapshot,
} from '../../../../server/src/modules/analytics/reportContract';
import { FeedbackPanel } from './AnalyticsFeedback';

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
        matching conservation data.
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
}: {
  snapshot: ConservationReportSnapshot;
  exporting: boolean;
  error: string;
  exportedFilename: string;
  onBack: () => void;
  onExport: () => void;
  backLabel?: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView?.({ block: 'start' });
  }, [snapshot]);
  const report = buildReportDocument(snapshot);
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
        export PDF.
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
        {report.sections.map((section) => (
          <section
            key={section.title}
            aria-label={`${section.title} report section`}
          >
            <h3>{section.title}</h3>
            {lines(section.lines)}
          </section>
        ))}
        {!!report.limitations.length && (
          <section aria-label="Report limitations">
            <h3>Data Scope and Limitations</h3>
            {lines(report.limitations)}
          </section>
        )}
      </article>
      <div className="card analytics-report-export" aria-busy={exporting}>
        <h3>Export Report</h3>
        <p>Export this reviewed report as PDF.</p>
        <div className="analytics-actions">
          <button
            type="button"
            className="button analytics-button analytics-button--secondary"
            onClick={onBack}
          >
            {backLabel}
          </button>
          <button
            type="button"
            className="button analytics-button analytics-button--primary"
            disabled={exporting}
            onClick={onExport}
          >
            {exporting ? 'Exporting PDF...' : 'Export PDF'}
          </button>
        </div>
        {exporting && (
          <p role="status">Exporting your retained report as PDF...</p>
        )}
        {exportedFilename && (
          <p className="analytics-report-success" role="status">
            Report exported successfully. <strong>{exportedFilename}</strong>
          </p>
        )}
        {error && (
          <FeedbackPanel tone="system" title="PDF export failed">
            <p>{error}</p>
            <button type="button" disabled={exporting} onClick={onExport}>
              Retry Export
            </button>
          </FeedbackPanel>
        )}
      </div>
    </section>
  );
}
