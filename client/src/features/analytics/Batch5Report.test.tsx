import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from '@testing-library/react';
import { SavedReports } from './SavedReports';
import { ConservationReportPreview } from './ConservationReport';
import { useConservationReport } from './useConservationReport';
import { analyticsApi } from './api';
import { http } from '../../shared/api/http';
import { savedReportFixture } from './savedReportTestFixtures';
import { result, validCriteria } from './analyticsTestFixtures';
import { installAnalyticsObservers } from './analyticsTestSetup';
import { hasMeaningfulMatchingData } from './AnalyticsResults';
import {
  REPORT_CONTENT_TYPES,
  type ReportExportFormat,
} from '../../../../server/src/modules/analytics/reportContract';

installAnalyticsObservers();
const saved = savedReportFixture({
  ...validCriteria,
  categories: ['INCIDENT_STATISTICS'],
  incidentType: 'SNARE',
  rangerId: 'R-101',
});
const labels = { pdf: 'PDF', csv: 'CSV', xlsx: 'Excel' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.spyOn(analyticsApi, 'listReports').mockResolvedValue({
    items: [saved],
    nextCursor: null,
  });
  vi.spyOn(analyticsApi, 'getReport').mockResolvedValue(saved);
  vi.spyOn(analyticsApi, 'generateReport').mockResolvedValue(saved);
  vi.spyOn(analyticsApi, 'exportReport').mockImplementation(
    async (_report, _signal, format = 'pdf') =>
      `conservation-report-alpha-2026-10-07.${format}`,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('saved preview shows identity, inclusive UTC scope, meaningful filters, executive summary and only persisted selected sections', () => {
  const analyze = vi.spyOn(analyticsApi, 'analyze');
  render(
    <ConservationReportPreview
      snapshot={saved}
      exporting={false}
      error=""
      exportedFilename=""
      onBack={() => {}}
      onExport={() => {}}
    />,
  );
  const preview = screen.getByRole('region', { name: 'Report Preview' });
  for (const text of [
    'Alpha park (ALPHA)',
    saved.id,
    'Version: 1',
    'End Date: 2026-09-30 (inclusive, UTC)',
    'Ranger ID: R-101',
    'Incident type: SNARE',
    'Total incidents: 2',
  ])
    expect(preview).toHaveTextContent(text);
  expect(
    within(preview).getByRole('region', { name: 'Executive Summary' }),
  ).toHaveTextContent('Total incidents: 2');
  expect(
    within(preview).getByRole('region', {
      name: 'Incident Statistics report section',
    }),
  ).toBeInTheDocument();
  expect(
    within(preview).queryByRole('heading', { name: 'Patrol Coverage' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('img', { name: 'Incidents Over Time chart' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('table', { name: 'Incidents by type' }),
  ).toHaveTextContent('SNARE2');
  expect(screen.getByRole('radio', { name: 'PDF' })).toBeChecked();
  expect(analyze).not.toHaveBeenCalled();
});

test.each(['pdf', 'csv', 'xlsx'] as const)(
  'reopened saved %s export failure preserves preview/format and Retry exports by the same ID',
  async (format) => {
    const analyze = vi.spyOn(analyticsApi, 'analyze');
    const pending = deferred<string>();
    vi.mocked(analyticsApi.exportReport).mockReturnValueOnce(pending.promise);
    render(<SavedReports />);
    fireEvent.click(await screen.findByRole('button', { name: 'View Report' }));
    const preview = await screen.findByRole('region', {
      name: 'Report Preview',
    });
    const radio = screen.getByRole('radio', {
      name: format === 'xlsx' ? 'Excel (.xlsx)' : labels[format],
    });
    fireEvent.click(radio);
    fireEvent.click(
      screen.getByRole('button', { name: `Export ${labels[format]}` }),
    );
    const loading = screen.getByRole('button', {
      name: `Exporting ${labels[format]}...`,
    });
    expect(loading).toBeDisabled();
    expect(radio).toBeDisabled();
    fireEvent.click(loading);
    expect(analyticsApi.exportReport).toHaveBeenCalledTimes(1);
    await act(async () =>
      pending.reject(new Error('private implementation failure')),
    );
    expect(
      screen.getByRole('alert', { name: `${labels[format]} export failed` }),
    ).toHaveTextContent(
      `${labels[format]} export could not be completed. The saved report is still available.`,
    );
    expect(preview).toHaveTextContent('Total incidents: 2');
    expect(radio).toBeChecked();
    expect(radio).toBeEnabled();
    fireEvent.click(
      screen.getByRole('button', { name: `Retry Export ${labels[format]}` }),
    );
    await screen.findByText(
      new RegExp(`${labels[format]} exported successfully`),
    );
    expect(analyticsApi.exportReport).toHaveBeenLastCalledWith(
      saved,
      expect.any(AbortSignal),
      format,
    );
    expect(analyticsApi.exportReport).toHaveBeenCalledTimes(2);
    expect(analyze).not.toHaveBeenCalled();
    expect(analyticsApi.generateReport).not.toHaveBeenCalled();
  },
);

test('another format can be chosen after failure without losing the saved report', async () => {
  vi.mocked(analyticsApi.exportReport).mockRejectedValueOnce(
    new Error('network'),
  );
  render(<SavedReports />);
  fireEvent.click(await screen.findByRole('button', { name: 'View Report' }));
  await screen.findByRole('region', { name: 'Report Preview' });
  fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
  await screen.findByRole('alert', { name: 'PDF export failed' });
  fireEvent.click(screen.getByRole('radio', { name: 'Excel (.xlsx)' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Export Excel' }));
  await screen.findByText(/Excel exported successfully/);
  expect(
    screen.getByRole('region', { name: 'Report Preview' }),
  ).toHaveTextContent(saved.id);
});

test('generated Excel retry preserves saved evidence, blocks same-tick duplicates, and ignores late responses after Reset', async () => {
  const reviewed = {
    appliedCriteria: saved.appliedCriteria as typeof validCriteria,
    data: result(saved.appliedCriteria as typeof validCriteria),
  };
  const { result: state, rerender } = renderHook(
    ({ review }) => useConservationReport(review, true),
    { initialProps: { review: reviewed as typeof reviewed | null } },
  );
  await act(async () => state.current.generate());
  act(() => state.current.selectFormat('xlsx'));
  const failed = deferred<string>();
  vi.mocked(analyticsApi.exportReport).mockReturnValueOnce(failed.promise);
  let task!: Promise<void>;
  act(() => {
    task = state.current.exportReport();
    void state.current.exportReport();
  });
  expect(analyticsApi.exportReport).toHaveBeenCalledTimes(1);
  await act(async () => {
    failed.reject(new Error('network'));
    await task;
  });
  expect(state.current.report?.id).toBe(saved.id);
  expect(state.current.format).toBe('xlsx');
  expect(state.current.exportError).toContain(
    'Excel export could not be completed',
  );
  const late = deferred<string>();
  vi.mocked(analyticsApi.exportReport).mockReturnValueOnce(late.promise);
  act(() => {
    task = state.current.exportReport();
  });
  const signal = vi.mocked(analyticsApi.exportReport).mock.calls[1][1];
  rerender({ review: null });
  expect(signal.aborted).toBe(true);
  await act(async () => {
    late.resolve('late.xlsx');
    await task;
  });
  expect(state.current.report).toBeNull();
  expect(state.current.exportedFilename).toBe('');
});

test('eligibility allows registered neglected routes while unrelated totals cannot authorize an empty selected category', () => {
  const data = result({ ...validCriteria, categories: ['PATROL_COVERAGE'] });
  data.matchedRecords.patrols = 0;
  expect(hasMeaningfulMatchingData(data)).toBe(true);
  data.patrolCoverage!.totalRoutes = 0;
  data.patrolCoverage!.routes = [];
  data.matchedRecords.incidents = 99;
  expect(hasMeaningfulMatchingData(data)).toBe(false);
});

test.each(['pdf', 'csv', 'xlsx'] as const)(
  '%s API validates file response before download/success and sends no findings',
  async (format) => {
    vi.mocked(analyticsApi.exportReport).mockRestore();
    const get = vi.spyOn(http, 'get').mockResolvedValueOnce({
      data: new Blob(['invalid'], { type: 'application/json' }),
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const signal = new AbortController().signal;
    await expect(
      analyticsApi.exportReport(saved, signal, format),
    ).rejects.toThrow('Invalid or cancelled export response');
    expect(click).not.toHaveBeenCalled();
    const createUrl = vi.fn(() => 'blob:report');
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = createUrl;
        static revokeObjectURL = vi.fn();
      },
    );
    get.mockResolvedValueOnce({
      data: new Blob(['saved-content'], { type: REPORT_CONTENT_TYPES[format] }),
      headers: {
        'content-disposition': `attachment; filename="conservation-report-issued-2026-10-07.${format}"`,
      },
    });
    expect(await analyticsApi.exportReport(saved, signal, format)).toBe(
      `conservation-report-issued-2026-10-07.${format}`,
    );
    expect(click).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenLastCalledWith(
      format === 'pdf'
        ? `/analytics/reports/${saved.id}/pdf`
        : `/analytics/reports/${saved.id}/export`,
      expect.objectContaining({
        signal,
        responseType: 'blob',
        ...(format === 'pdf' ? {} : { params: { format } }),
      }),
    );
  },
);

test('API rejects invalid format/ID before making a request', async () => {
  vi.mocked(analyticsApi.exportReport).mockRestore();
  const get = vi.spyOn(http, 'get');
  const signal = new AbortController().signal;
  await expect(
    analyticsApi.exportReport(saved, signal, 'html' as ReportExportFormat),
  ).rejects.toThrow('Invalid report ID or export format');
  await expect(
    analyticsApi.exportReport({ ...saved, id: '../private' }, signal),
  ).rejects.toThrow('Invalid report ID or export format');
  expect(get).not.toHaveBeenCalled();
});
