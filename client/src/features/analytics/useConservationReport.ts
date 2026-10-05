import { useEffect, useRef, useState } from 'react';
import type {
  AnalysisCriteria,
  AnalyticsResult,
} from '../../../../server/src/modules/analytics/contract';
import {
  createReportSnapshot,
  type ConservationReportSnapshot,
} from '../../../../server/src/modules/analytics/reportContract';
import { analyticsApi } from './api';

export interface ReviewedAnalysis {
  appliedCriteria: AnalysisCriteria;
  data: AnalyticsResult;
}

export function useConservationReport(
  reviewed: ReviewedAnalysis | null,
  canGenerate: boolean,
) {
  const [generatedReport, setGeneratedReport] = useState<{
    snapshot: ConservationReportSnapshot;
    reviewed: ReviewedAnalysis;
  } | null>(null);
  // Ownership hides a previous report in the very render that applies new
  // results, before the cleanup effect aborts requests and clears feedback.
  const report =
    generatedReport?.reviewed === reviewed ? generatedReport.snapshot : null;
  const [preview, setPreview] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [exportError, setExportError] = useState('');
  const [exportedFilename, setExportedFilename] = useState('');
  const pending = useRef<AbortController | null>(null);
  const attempt = useRef<ConservationReportSnapshot | null>(null);
  const revision = useRef(0);

  useEffect(() => {
    // Invalidate only when a successful analysis replaces the reviewed pair
    // (or Reset clears it). Draft changes and failed updates retain the report.
    revision.current += 1;
    pending.current?.abort();
    pending.current = null;
    attempt.current = null;
    setGeneratedReport(null);
    setPreview(false);
    setGenerating(false);
    setExporting(false);
    setGenerationError('');
    setExportError('');
    setExportedFilename('');
    return () => {
      revision.current += 1;
      pending.current?.abort();
    };
  }, [reviewed]);

  async function generate(retry = false) {
    if (!reviewed || !canGenerate || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const sequence = revision.current;
    setGenerating(true);
    setGenerationError('');
    try {
      // Capture at the click boundary, before any asynchronous work. Generation
      // retries reuse this attempt even if the manager continues editing drafts.
      const snapshot =
        retry && attempt.current
          ? attempt.current
          : createReportSnapshot(reviewed.appliedCriteria, reviewed.data);
      attempt.current = snapshot;
      const generated = await analyticsApi.generateReport(
        snapshot,
        controller.signal,
      );
      // Generation validates the capture without rewriting it. A partial or
      // changed response must not become a successful preview of other findings.
      if (JSON.stringify(generated) !== JSON.stringify(snapshot))
        throw new Error(
          'Report generation did not retain the reviewed snapshot',
        );
      if (sequence === revision.current) {
        setGeneratedReport({
          snapshot,
          reviewed,
        });
        setPreview(true);
        setExportError('');
        setExportedFilename('');
      }
    } catch {
      if (sequence === revision.current)
        setGenerationError(
          'Unable to generate the report. Your reviewed analysis is still available. Please try again.',
        );
    } finally {
      if (sequence === revision.current) {
        pending.current = null;
        setGenerating(false);
      }
    }
  }

  async function exportPdf() {
    if (!report || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const sequence = revision.current;
    setExporting(true);
    setExportError('');
    setExportedFilename('');
    try {
      const filename = await analyticsApi.exportReport(
        report,
        controller.signal,
      );
      if (sequence === revision.current) setExportedFilename(filename);
    } catch {
      // Keep the preview and report intact. Retrying only exports this snapshot;
      // it never requires another analysis request or report generation.
      if (sequence === revision.current)
        setExportError(
          'Unable to export the PDF. Your report preview is still available. Please try again.',
        );
    } finally {
      if (sequence === revision.current) {
        pending.current = null;
        setExporting(false);
      }
    }
  }

  return {
    report,
    preview: preview && !!report,
    generating,
    exporting,
    generationError,
    exportError,
    exportedFilename,
    generate,
    exportPdf,
    showPreview: () => setPreview(true),
    returnToAnalysis: () => setPreview(false),
  };
}
