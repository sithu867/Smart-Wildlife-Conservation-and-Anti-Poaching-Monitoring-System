import { useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import type {
  ReportHistory,
  SavedStatisticalReport,
  StatisticalReportSummary,
} from '../../../../server/src/modules/analytics/savedReportContract';
import { analyticsApi } from './api';
import {
  REPORT_FORMAT_LABELS,
  type ReportExportFormat,
} from '../../../../server/src/modules/analytics/reportContract';
import {
  safeMetadataErrors,
  type ReportMetadataErrors,
} from '../../../../server/src/modules/analytics/metadataValidation';

const WRITE_OPERATIONS = new Set([
  'Saving changes',
  'Creating new version',
  'Archiving report',
]);

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
  onWritePendingChange?: (pending: boolean) => void,
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
  const [format, setFormat] = useState<ReportExportFormat>('pdf');
  const [exportError, setExportError] = useState('');
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const pending = useRef<AbortController | null>(null);
  const metadataDirty = useRef(false);
  const [metadataErrors, setMetadataErrors] = useState<ReportMetadataErrors>(
    {},
  );
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const writeUncertain = useRef(false);

  function requestLeave(action: () => void) {
    if (pending.current) return;
    if (metadataDirty.current) setDiscardAction(() => action);
    else action();
  }
  function clearEdits() {
    metadataDirty.current = false;
    setMetadataErrors({});
    setEditing(false);
  }

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
    const writing = WRITE_OPERATIONS.has(name);
    if (writing && writeUncertain.current) {
      pending.current = null;
      return;
    }
    // Aborting transport does not roll back a committed server write. Keep UC-D
    // view navigation disabled until its outcome is known, including failures.
    if (writing) onWritePendingChange?.(true);
    setBusy(name);
    setError('');
    setRetry(null);
    setNotice('');
    setExportError('');
    setMetadataErrors({});
    try {
      const value = await request(controller.signal);
      if (!controller.signal.aborted) success(value);
    } catch (cause) {
      if (!controller.signal.aborted) {
        if (name.startsWith('Exporting ')) {
          // A failed download changes feedback only. Keep the saved preview and
          // selected format so retry never needs Analyze or Generate again.
          setExportError(
            `${name.replace('Exporting ', '')} export could not be completed. The saved report is still available. ${failureMessage(cause)}`,
          );
        } else {
          const fields =
            name === 'Saving changes' &&
            isAxiosError<{ error?: { fieldErrors?: unknown } }>(cause) &&
            cause.response?.status === 400
              ? safeMetadataErrors(cause.response.data?.error?.fieldErrors)
              : {};
          setMetadataErrors(fields);
          const uncertain =
            writing &&
            (!isAxiosError(cause) ||
              !cause.response ||
              cause.response.status >= 500);
          // A lost response can follow a successful commit. Do not offer a blind
          // duplicate write as recovery or suggest the original was rolled back.
          setError(
            Object.keys(fields).length
              ? ''
              : uncertain
                ? 'The request may have completed. Refresh Report History before trying again.'
                : failureMessage(cause),
          );
          if (uncertain) {
            writeUncertain.current = true;
            setRecoveryRequired(true);
            setRetry(() => recover);
            return;
          }
        }
        setRetry(() => again);
      }
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        setBusy('');
        if (writing) onWritePendingChange?.(false);
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
        // Only a fresh first page can reconcile a possibly committed new version;
        // loading older pages must not unlock another write against stale history.
        if (!cursor) {
          writeUncertain.current = false;
          setRecoveryRequired(false);
        }
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
        clearEdits();
        setExportedFilename('');
      },
      () => open(id),
    );
  }
  function exportReport(report: StatisticalReportSummary, selected = format) {
    if (pending.current) return;
    setExportedFilename('');
    void run(
      `Exporting ${REPORT_FORMAT_LABELS[selected]}`,
      (signal) => analyticsApi.exportReport(report, signal, selected),
      (filename) => {
        setExportedFilename(filename);
        setNotice(
          `${REPORT_FORMAT_LABELS[selected]} report exported successfully: ${filename}`,
        );
      },
      () => exportReport(report, selected),
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
        clearEdits();
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
        clearEdits();
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
          clearEdits();
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
    if (pending.current) return;
    setDetail(null);
    clearEdits();
    setError('');
    setRetry(null);
    setExportedFilename('');
    setExportError('');
    setNotice('');
  }
  function recover() {
    requestLeave(() => {
      setArchiveTarget(null);
      back();
      load();
    });
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
    metadataErrors,
    recoveryRequired,
    recover,
    setMetadataDirty: (dirty: boolean) => {
      metadataDirty.current = dirty;
    },
    requestLeave,
    discardPending: !!discardAction,
    stayEditing: () => setDiscardAction(null),
    discardEdits: () => {
      const action = discardAction;
      setDiscardAction(null);
      clearEdits();
      action?.();
    },
    load,
    open,
    exportReport,
    exportPdf: (report: StatisticalReportSummary) =>
      exportReport(report, 'pdf'),
    format,
    exportError,
    selectFormat: (value: ReportExportFormat) => {
      if (pending.current) return;
      setFormat(value);
      setExportError('');
      setRetry(null);
      setExportedFilename('');
      setNotice('');
    },
    saveMetadata,
    regenerate: () => requestLeave(regenerate),
    archive,
    back: () => requestLeave(back),
    edit: () =>
      requestLeave(() => {
        setMetadataErrors({});
        setEditing(!editing);
      }),
    cancelEdit: () => requestLeave(clearEdits),
    confirmArchive: (report: StatisticalReportSummary) => {
      requestLeave(() => {
        clearEdits();
        setError('');
        setRetry(null);
        setArchiveTarget(report);
      });
    },
    cancelArchive: () => {
      setArchiveTarget(null);
      setError('');
      setRetry(null);
    },
  };
}
