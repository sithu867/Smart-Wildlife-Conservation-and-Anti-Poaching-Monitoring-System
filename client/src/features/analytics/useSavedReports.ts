import { useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import type {
  ReportHistory,
  SavedStatisticalReport,
  StatisticalReportSummary,
} from '../../../../server/src/modules/analytics/savedReportContract';
import { analyticsApi } from './api';

function failureMessage(error: unknown) {
  if (isAxiosError(error)) {
    if (error.response?.status === 404)
      return 'Saved report not found. Return to history and refresh.';
    if (error.response?.status === 410)
      return 'This report has been archived. Return to history and refresh.';
    if (error.response?.status === 409)
      return 'A newer version already exists. Open it in history to regenerate again.';
    if (error.response?.status === 400)
      return 'Check the report details and criteria. A report requires matching conservation data.';
  }
  return 'Unable to complete the report request. Please try again. After an interrupted save or regeneration, refresh history before retrying.';
}

export function useSavedReports(
  onChanged?: (report: SavedStatisticalReport) => void,
  onArchived?: (id: string) => void,
) {
  const [history, setHistory] = useState<ReportHistory>({
    items: [],
    nextCursor: null,
  });
  const [detail, setDetail] = useState<SavedStatisticalReport | null>(null);
  const [editing, setEditing] = useState(false);
  const [archiveTarget, setArchiveTarget] =
    useState<StatisticalReportSummary | null>(null);
  const [busy, setBusy] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [exportedFilename, setExportedFilename] = useState('');
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const pending = useRef<AbortController | null>(null);

  async function run<T>(
    name: string,
    request: (signal: AbortSignal) => Promise<T>,
    success: (value: T) => void,
    again: () => void,
  ) {
    // A ref blocks a second click synchronously, before React disables controls.
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(name);
    setError('');
    setRetry(null);
    setNotice('');
    try {
      const value = await request(controller.signal);
      if (!controller.signal.aborted) success(value);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(failureMessage(cause));
        setRetry(() => again);
      }
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        setBusy('');
      }
    }
  }
  function load(cursor?: string) {
    void run(
      'Loading reports',
      (signal) => analyticsApi.listReports(signal, cursor),
      (page) => {
        setHistory((current) => ({
          items: cursor ? [...current.items, ...page.items] : page.items,
          nextCursor: page.nextCursor,
        }));
        setLoaded(true);
      },
      () => load(cursor),
    );
  }
  useEffect(() => {
    load();
    return () => {
      pending.current?.abort();
      pending.current = null;
    };
    // Initial history fetch; subsequent refreshes are explicit manager actions.
  }, []);

  function open(id: string) {
    void run(
      'Loading report',
      (signal) => analyticsApi.getReport(id, signal),
      (report) => {
        setDetail(report);
        setEditing(false);
        setExportedFilename('');
      },
      () => open(id),
    );
  }
  function exportPdf(report: StatisticalReportSummary) {
    void run(
      'Exporting PDF',
      (signal) => analyticsApi.exportReport(report, signal),
      (filename) => {
        setExportedFilename(filename);
        setNotice(`Report exported successfully: ${filename}`);
      },
      () => exportPdf(report),
    );
  }
  function saveMetadata(title: string, notes: string) {
    if (!detail) return;
    void run(
      'Saving changes',
      (signal) =>
        analyticsApi.updateReport(
          detail.id,
          { title, notes: notes || null },
          signal,
        ),
      (report) => {
        // UPDATE changes displayed metadata only; returned findings remain the saved snapshot.
        setDetail(report);
        setEditing(false);
        setNotice('Report details saved. Analytical findings are unchanged.');
        onChanged?.(report);
        setHistory((current) => ({
          ...current,
          items: current.items.map((item) =>
            item.id === report.id ? report : item,
          ),
        }));
      },
      () => saveMetadata(title, notes),
    );
  }
  function regenerate() {
    if (!detail) return;
    void run(
      'Creating new version',
      (signal) => analyticsApi.regenerateReport(detail.id, signal),
      (report) => {
        setDetail(report);
        setEditing(false);
        setExportedFilename('');
        setHistory((current) => ({
          ...current,
          items: [report, ...current.items],
        }));
        setNotice(
          'New version saved with a new Report ID. The previous snapshot remains unchanged.',
        );
      },
      regenerate,
    );
  }
  function archive() {
    if (!archiveTarget) return;
    void run(
      'Archiving report',
      (signal) => analyticsApi.archiveReport(archiveTarget.id, signal),
      () => {
        // DELETE is an archive of this report only, after explicit in-app confirmation.
        onArchived?.(archiveTarget.id);
        setHistory((current) => ({
          ...current,
          items: current.items.filter((item) => item.id !== archiveTarget.id),
        }));
        if (detail?.id === archiveTarget.id) {
          setDetail(null);
          setEditing(false);
        }
        setArchiveTarget(null);
        setNotice(
          'Report archived. Conservation source records are unchanged.',
        );
      },
      archive,
    );
  }
  function back() {
    setDetail(null);
    setEditing(false);
    setError('');
    setRetry(null);
    setExportedFilename('');
  }
  return {
    history,
    detail,
    editing,
    archiveTarget,
    busy,
    loaded,
    error,
    notice,
    exportedFilename,
    retry,
    load,
    open,
    exportPdf,
    saveMetadata,
    regenerate,
    archive,
    back,
    edit: () => setEditing((value) => !value),
    cancelEdit: () => setEditing(false),
    confirmArchive: (report: StatisticalReportSummary) => {
      setError('');
      setRetry(null);
      setArchiveTarget(report);
    },
    cancelArchive: () => {
      setArchiveTarget(null);
      setError('');
      setRetry(null);
    },
  };
}
