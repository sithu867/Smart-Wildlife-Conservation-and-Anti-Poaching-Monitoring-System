import { useConservationReport } from './useConservationReport';
import { savedReportFixture } from './savedReportTestFixtures';
import type { SavedStatisticalReport } from '../../../../server/src/modules/analytics/savedReportContract';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { AnalyticsPage } from './AnalyticsPage';
import { ConservationReportPreview } from './ConservationReport';
import { analyticsApi } from './api';
import { http } from '../../shared/api/http';
import { parks, result, validCriteria } from './analyticsTestFixtures';
import { installAnalyticsObservers } from './analyticsTestSetup';
import {
  createReportSnapshot,
  reportFilename,
  type ConservationReportSnapshot,
} from '../../../../server/src/modules/analytics/reportContract';
import {
  CATEGORY_LABELS,
  type AnalysisCategory,
} from '../../../../server/src/modules/analytics/contract';

installAnalyticsObservers();
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
async function analyze(
  categories: AnalysisCategory[] = ['INCIDENT_STATISTICS'],
) {
  await screen.findByRole('option', { name: 'Alpha park (ALPHA)' });
  fireEvent.change(screen.getByLabelText('Park / Conservation Area'), {
    target: { value: parks[0].id },
  });
  fireEvent.change(screen.getByLabelText('Start Date'), {
    target: { value: validCriteria.start },
  });
  fireEvent.change(screen.getByLabelText('End Date'), {
    target: { value: validCriteria.end },
  });
  for (const category of Object.keys(CATEGORY_LABELS) as AnalysisCategory[]) {
    const checkbox = screen.getByLabelText(
      CATEGORY_LABELS[category],
    ) as HTMLInputElement;
    if (checkbox.checked !== categories.includes(category))
      fireEvent.click(checkbox);
  }
  fireEvent.click(
    screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
  );
  await screen.findByRole('region', { name: 'Applied scope' });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Generate & Save Report' }),
    ).toBeEnabled(),
  );
}
async function generate() {
  fireEvent.click(
    screen.getByRole('button', { name: 'Generate & Save Report' }),
  );
  return screen.findByRole('region', { name: 'Report Preview' });
}
beforeEach(() => {
  vi.spyOn(analyticsApi, 'listParks').mockResolvedValue(parks);
  vi.spyOn(analyticsApi, 'analyze').mockImplementation(async (criteria) =>
    result(criteria),
  );
  vi.spyOn(analyticsApi, 'generateReport').mockImplementation(async (input) =>
    savedReportFixture(input.criteria),
  );
  vi.spyOn(analyticsApi, 'exportReport').mockResolvedValue(
    'conservation-report-alpha-2026-10-05.pdf',
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('UC-D Batch 4 snapshot lifecycle', () => {
  test('an incomplete generation response preserves analysis and offers retry', async () => {
    vi.mocked(analyticsApi.generateReport).mockResolvedValueOnce(
      {} as SavedStatisticalReport,
    );
    render(<AnalyticsPage />);
    await analyze();
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate & Save Report' }),
    );
    await screen.findByRole('alert', { name: 'Report generation failed' });
    expect(
      screen.getByRole('region', { name: 'Applied scope' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Report Preview' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retry Generate & Save Report' }),
    ).toBeEnabled();
  });
  test('generation previews the server-issued saved findings when source data changed after Analyze', async () => {
    const serverReport = savedReportFixture({
      ...validCriteria,
      categories: ['INCIDENT_STATISTICS'],
    });
    const generated = structuredClone(serverReport);
    Object.assign(generated.analyticsResult.incidentStatistics!, { total: 9 });
    vi.mocked(analyticsApi.generateReport).mockResolvedValueOnce(generated);
    render(<AnalyticsPage />);
    await analyze();
    const preview = await generate();
    expect(preview).toHaveTextContent('Total incidents: 9');
    expect(preview).toHaveTextContent(serverReport.id);
    const submitted = vi.mocked(analyticsApi.generateReport).mock.calls[0][0];
    expect(Object.keys(submitted)).toEqual(['criteria']);
    expect(submitted).not.toHaveProperty('analyticsResult');
  });
  test('generation starts disabled and cannot export without a generated report', async () => {
    render(<AnalyticsPage />);
    expect(
      screen.getByRole('button', { name: 'Generate & Save Report' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Export PDF' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate & Save Report' }),
    );
    expect(analyticsApi.generateReport).not.toHaveBeenCalled();
    await screen.findByRole('option', { name: 'Alpha park (ALPHA)' });
  });
  test('draft edits do not change scope, selected categories or retained values', async () => {
    render(<AnalyticsPage />);
    await analyze();
    fireEvent.change(screen.getByLabelText('Park / Conservation Area'), {
      target: { value: parks[1].id },
    });
    fireEvent.change(screen.getByLabelText('End Date'), {
      target: { value: '2026-10-05' },
    });
    fireEvent.change(screen.getByLabelText('Ranger ID'), {
      target: { value: 'R-NEW' },
    });
    fireEvent.click(screen.getByLabelText('Patrol Coverage'));
    expect(
      screen.getByText(/The report will use the reviewed applied analysis/),
    ).toBeInTheDocument();
    const preview = await generate();
    expect(preview).toHaveTextContent('Alpha park (ALPHA)');
    expect(preview).toHaveTextContent('Period: 2026-09-01 to 2026-09-30');
    expect(preview).not.toHaveTextContent('Beta park');
    expect(preview).not.toHaveTextContent('R-NEW');
    expect(
      within(preview).queryByRole('heading', { name: 'Patrol Coverage' }),
    ).not.toBeInTheDocument();
    const captured = vi.mocked(analyticsApi.generateReport).mock.calls[0][0];
    expect(captured.criteria.categories).toEqual(['INCIDENT_STATISTICS']);
    expect(captured).not.toHaveProperty('analyticsResult');
    fireEvent.click(screen.getByRole('button', { name: 'Return to Analysis' }));
    expect(screen.getByLabelText('End Date')).toHaveValue('2026-10-05');
    expect(
      screen.getByRole('region', { name: 'Applied scope' }),
    ).toHaveTextContent('Alpha park');
    fireEvent.click(
      screen.getByRole('button', { name: 'View Generated Report' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    await screen.findByText(/PDF exported successfully/);
    expect(analyticsApi.exportReport).toHaveBeenCalledWith(
      expect.objectContaining({
        id: savedReportFixture().id,
        appliedCriteria: captured.criteria,
      }),
      expect.any(AbortSignal),
      'pdf',
    );
    expect(analyticsApi.analyze).toHaveBeenCalledTimes(1);
  });
  test('generating state prevents duplicate requests; failure preserves analysis and retry uses its captured attempt', async () => {
    const pending = deferred<SavedStatisticalReport>();
    vi.mocked(analyticsApi.generateReport).mockReturnValueOnce(pending.promise);
    render(<AnalyticsPage />);
    await analyze();
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate & Save Report' }),
    );
    expect(
      screen.getByRole('button', { name: 'Generating & Saving Report...' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Generating & Saving Report...' }),
    );
    expect(analyticsApi.generateReport).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('region', { name: 'Applied scope' }),
    ).toBeInTheDocument();
    await act(async () => pending.reject(new Error('secret internal details')));
    expect(
      screen.getByRole('alert', { name: 'Report generation failed' }),
    ).not.toHaveTextContent('secret');
    expect(
      screen.queryByRole('region', { name: 'Report Preview' }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('End Date'), {
      target: { value: '2026-10-05' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry Generate & Save Report' }),
    );
    await screen.findByRole('region', { name: 'Report Preview' });
    const calls = vi.mocked(analyticsApi.generateReport).mock.calls;
    expect(calls[1][0]).toBe(calls[0][0]);
    expect(analyticsApi.analyze).toHaveBeenCalledTimes(1);
  });
  test('export loading/failure preserves preview and retry exports the same snapshot without regeneration', async () => {
    const pending = deferred<string>();
    vi.mocked(analyticsApi.exportReport).mockReturnValueOnce(pending.promise);
    render(<AnalyticsPage />);
    await analyze();
    const preview = await generate();
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(
      screen.getByRole('button', { name: 'Exporting PDF...' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Exporting PDF...' }));
    expect(analyticsApi.exportReport).toHaveBeenCalledTimes(1);
    await act(async () => pending.reject(new Error('secret export details')));
    expect(
      screen.getByRole('alert', { name: 'PDF export failed' }),
    ).toHaveTextContent('Your saved report preview is still available');
    expect(preview).toHaveTextContent('Total incidents: 2');
    fireEvent.click(screen.getByRole('button', { name: 'Retry Export PDF' }));
    const success = await screen.findByText(/PDF exported successfully/);
    expect(success).toHaveAttribute('role', 'status');
    expect(success).toHaveTextContent(
      'conservation-report-alpha-2026-10-05.pdf',
    );
    const calls = vi.mocked(analyticsApi.exportReport).mock.calls;
    expect(calls[1][0]).toBe(calls[0][0]);
    expect(analyticsApi.generateReport).toHaveBeenCalledTimes(1);
    expect(analyticsApi.analyze).toHaveBeenCalledTimes(1);
  });
  test('failed updates retain the report and disable generation; successful updates invalidate it', async () => {
    render(<AnalyticsPage />);
    await analyze();
    await generate();
    fireEvent.click(screen.getByRole('button', { name: 'Return to Analysis' }));
    fireEvent.change(screen.getByLabelText('End Date'), {
      target: { value: '2026-10-05' },
    });
    expect(
      screen.getByRole('button', { name: 'View Generated Report' }),
    ).toBeEnabled();
    vi.mocked(analyticsApi.analyze).mockRejectedValueOnce(new Error('failure'));
    fireEvent.click(screen.getByRole('button', { name: 'Update Analysis' }));
    await screen.findByRole('alert', {
      name: 'Analysis could not be completed',
    });
    expect(
      screen.getByRole('button', { name: 'Generate & Save Report' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'View Generated Report' }),
    );
    expect(
      screen.getByRole('region', { name: 'Report Preview' }),
    ).toHaveTextContent('Period: 2026-09-01 to 2026-09-30');
    fireEvent.click(screen.getByRole('button', { name: 'Return to Analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry analysis' }));
    await waitFor(() =>
      expect(
        screen.getByRole('region', { name: 'Applied scope' }),
      ).toHaveTextContent('Period: 2026-09-01 to 2026-10-05'),
    );
    expect(
      screen.queryByRole('button', { name: 'View Generated Report' }),
    ).not.toBeInTheDocument();
    await generate();
    expect(
      screen.getByRole('region', { name: 'Report Preview' }),
    ).toHaveTextContent('Period: 2026-09-01 to 2026-10-05');
  });
  test('late generation cannot resurrect a report after Reset', async () => {
    const pending = deferred<SavedStatisticalReport>();
    vi.mocked(analyticsApi.generateReport).mockReturnValueOnce(pending.promise);
    render(<AnalyticsPage />);
    await analyze();
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate & Save Report' }),
    );
    const [snapshot, signal] = vi.mocked(analyticsApi.generateReport).mock
      .calls[0];
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(signal.aborted).toBe(true);
    await act(async () =>
      pending.resolve(savedReportFixture(snapshot.criteria)),
    );
    expect(
      screen.queryByRole('region', { name: 'Report Preview' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Generate & Save Report' }),
    ).toBeDisabled();
  });
  test('validation failure blocks generation while keeping the applied analysis', async () => {
    render(<AnalyticsPage />);
    await analyze();
    fireEvent.change(screen.getByLabelText('End Date'), {
      target: { value: '2026-08-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update Analysis' }));
    expect(
      screen.getByRole('button', { name: 'Generate & Save Report' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('region', { name: 'Applied scope' }),
    ).toHaveTextContent('2026-09-30');
  });
  test('results with a different criteria scope cannot enable generation', async () => {
    vi.mocked(analyticsApi.analyze).mockResolvedValueOnce({
      ...result(),
      filters: { ...validCriteria, end: '2026-10-01' },
    });
    render(<AnalyticsPage />);
    await screen.findByRole('option', { name: 'Alpha park (ALPHA)' });
    fireEvent.change(screen.getByLabelText('Park / Conservation Area'), {
      target: { value: parks[0].id },
    });
    fireEvent.change(screen.getByLabelText('Start Date'), {
      target: { value: validCriteria.start },
    });
    fireEvent.change(screen.getByLabelText('End Date'), {
      target: { value: validCriteria.end },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    await screen.findByRole('region', { name: 'Applied scope' });
    expect(
      screen.getByRole('button', { name: 'Generate & Save Report' }),
    ).toBeDisabled();
    expect(analyticsApi.generateReport).not.toHaveBeenCalled();
  });
  test('native calendars expose accessible range hints, preserve date strings and use whole-field activation', async () => {
    render(<AnalyticsPage />);
    await analyze();
    const start = screen.getByLabelText('Start Date');
    const end = screen.getByLabelText('End Date');
    expect(start).toHaveAttribute('type', 'date');
    expect(end).toHaveAttribute('type', 'date');
    expect(start).toHaveAttribute('max', validCriteria.end);
    expect(end).toHaveAttribute('min', validCriteria.start);
    const showPicker = vi.fn();
    Object.defineProperty(start, 'showPicker', { value: showPicker });
    fireEvent.click(start);
    expect(showPicker).toHaveBeenCalledTimes(1);
    vi.mocked(analyticsApi.analyze).mockImplementationOnce(async (criteria) => {
      const data = result(criteria);
      data.incidentStatistics!.overTime.points = [
        { date: criteria.start, count: 2 },
      ];
      return data;
    });
    fireEvent.change(end, { target: { value: validCriteria.start } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Analysis' }));
    await waitFor(() =>
      expect(analyticsApi.analyze).toHaveBeenLastCalledWith(
        expect.objectContaining({
          start: validCriteria.start,
          end: validCriteria.start,
        }),
        expect.any(AbortSignal),
      ),
    );
  });
});

describe('saved report cache consistency', () => {
  test('metadata updates synchronize the generated preview and archive removes its cached actions', async () => {
    const reviewed = { appliedCriteria: validCriteria, data: result() };
    const hook = renderHook(() => useConservationReport(reviewed, true));
    await act(async () => hook.result.current.generate());
    expect(hook.result.current.report?.id).toBe(savedReportFixture().id);
    act(() =>
      hook.result.current.synchronizeSavedReport({
        ...savedReportFixture(),
        title: 'Updated in history',
      }),
    );
    expect(hook.result.current.report?.title).toBe('Updated in history');
    expect(
      hook.result.current.report?.analyticsResult.incidentStatistics?.total,
    ).toBe(2);
    act(() =>
      hook.result.current.forgetArchivedReport(savedReportFixture().id),
    );
    expect(hook.result.current.report).toBeNull();
    expect(hook.result.current.preview).toBe(false);
  });
});

describe('selected report content and shared document rendering', () => {
  test.each([
    [
      'INCIDENT_STATISTICS',
      ['Total incidents: 2', 'SNARE: 2', 'REPORTED: 1', 'Incidents over time'],
    ],
    [
      'INCIDENT_HOTSPOTS',
      [
        'Hotspot count: 1',
        'Rank 1: -2.15200, 34.82200',
        'LOW concentration',
        '2 incidents',
      ],
    ],
    [
      'PATROL_COVERAGE',
      [
        'Coverage percentage: 33.3%',
        'Total routes: 3',
        'Covered routes: 1',
        'Limited-activity routes: 1',
        'Neglected routes: 1',
        'Forest route: Neglected',
      ],
    ],
    [
      'HWC_TRENDS',
      [
        'Total alerts: 2',
        'Total responses: 1',
        'Alerts by severity',
        'Responses by action',
        'Conflict trends use alerts assigned to the selected park',
      ],
    ],
  ] as const)(
    '%s preview includes reviewed values and excludes other category sections',
    (category, findings) => {
      const criteria = { ...validCriteria, categories: [category] };
      render(
        <ConservationReportPreview
          snapshot={createReportSnapshot(criteria, result(criteria))}
          exporting={false}
          error=""
          exportedFilename=""
          onBack={vi.fn()}
          onExport={vi.fn()}
        />,
      );
      const preview = screen.getByRole('region', { name: 'Report Preview' });
      findings.forEach((finding) => expect(preview).toHaveTextContent(finding));
      for (const other of Object.keys(CATEGORY_LABELS) as AnalysisCategory[]) {
        if (other !== category)
          expect(
            within(preview).queryByRole('heading', {
              name: CATEGORY_LABELS[other],
            }),
          ).not.toBeInTheDocument();
      }
      expect(
        screen.getByRole('heading', {
          name: 'Statistical Conservation Report',
        }),
      ).toHaveFocus();
      expect(screen.getByRole('article')).toHaveClass('analytics-report-paper');
      expect(preview).toHaveClass('analytics-report-preview');
    },
  );
  test('snapshot deeply detaches original result objects', () => {
    const criteria = {
      ...validCriteria,
      categories: ['INCIDENT_STATISTICS'] as AnalysisCategory[],
    };
    const original = result(criteria);
    const snapshot = createReportSnapshot(criteria, original);
    criteria.categories.push('HWC_TRENDS');
    original.incidentStatistics!.byType[0].count = 999;
    expect(snapshot.selectedCategories).toEqual(['INCIDENT_STATISTICS']);
    expect(snapshot.analyticsResult.incidentStatistics!.byType[0].count).toBe(
      2,
    );
  });
  test('API submits only criteria and exports saved PDF by ID', async () => {
    vi.mocked(analyticsApi.generateReport).mockRestore();
    vi.mocked(analyticsApi.exportReport).mockRestore();
    const snapshot = savedReportFixture();
    const post = vi
      .spyOn(http, 'post')
      .mockResolvedValueOnce({ data: { success: true, data: snapshot } });
    const get = vi.spyOn(http, 'get').mockResolvedValueOnce({
      data: new Blob(['%PDF-1.4\n'], { type: 'application/pdf' }),
    });
    const createUrl = vi.fn(() => 'blob:report');
    const revokeUrl = vi.fn();
    // jsdom lacks Blob URL downloads; mock only this browser boundary.
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeUrl,
    });
    vi.useFakeTimers();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe(reportFilename(snapshot));
        expect(this.href).toBe('blob:report');
      });
    const signal = new AbortController().signal;
    expect(
      await analyticsApi.generateReport({ criteria: validCriteria }, signal),
    ).toEqual(snapshot);
    expect(await analyticsApi.exportReport(snapshot, signal)).toBe(
      reportFilename(snapshot),
    );
    expect(post).toHaveBeenNthCalledWith(
      1,
      '/analytics/reports',
      { criteria: validCriteria },
      expect.objectContaining({ signal }),
    );
    expect(get).toHaveBeenCalledWith(
      `/analytics/reports/${snapshot.id}/pdf`,
      expect.objectContaining({ signal, responseType: 'blob' }),
    );
    expect(post).toHaveBeenCalledTimes(1);
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull();
    vi.runAllTimers();
    expect(revokeUrl).toHaveBeenCalledWith('blob:report');
    vi.useRealTimers();
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });
});
