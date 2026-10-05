import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { AnalyticsPage } from './AnalyticsPage';
import { analyticsApi } from './api';
import {
  copyCriteria,
  createDraftCriteria,
  validateDraftCriteria,
} from './criteria';
import { http } from '../../shared/api/http';
import type {
  AnalysisCriteria,
  AnalyticsResult,
  ParkOption,
} from '../../../../server/src/modules/analytics/contract';

const parks: ParkOption[] = [
  { id: '67a000000000000000000001', name: 'Alpha park', code: 'ALPHA' },
  { id: '67a000000000000000000002', name: 'Beta park', code: 'BETA' },
];
const validCriteria: AnalysisCriteria = {
  ...createDraftCriteria(),
  parkId: parks[0].id,
  start: '2026-09-01',
  end: '2026-09-30',
};
function result(
  criteria = validCriteria,
  status: AnalyticsResult['status'] = 'DATA',
): AnalyticsResult {
  const count = status === 'DATA' ? 2 : 0;
  return {
    filters: copyCriteria(criteria),
    park: parks.find((park) => park.id === criteria.parkId) ?? parks[0],
    generatedAt: '2026-10-05T06:00:00.000Z',
    status,
    matchedRecords: { incidents: count, patrols: 0 },
    categoryAvailability: criteria.categories.map((category) => ({
      category,
      status:
        category === 'INCIDENT_STATISTICS' ? 'AVAILABLE' : 'NOT_IMPLEMENTED',
    })),
    limitations: ['Unlinked incidents are excluded.'],
    summary: {
      incidents: { total: count },
      patrols: { total: 0, completed: 0, active: 0 },
      conflicts: { total: 0, open: 0, resolved: 0 },
      responses: { total: 0 },
    },
    incidents: {
      byType: count ? [{ name: 'SNARE', count }] : [],
      byStatus: [],
    },
    patrols: { byStatus: [], byRanger: [] },
    conflicts: { bySeverity: [], byStatus: [], bySource: [], byType: [] },
    responses: { byAction: [] },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function enterValidCriteria() {
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
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Analyze' })).toBeEnabled(),
  );
}
async function analyzeValidCriteria() {
  await enterValidCriteria();
  fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
  return screen.findByRole('region', { name: 'Applied scope' });
}

beforeEach(() => {
  vi.spyOn(analyticsApi, 'listParks').mockResolvedValue(parks);
  vi.spyOn(analyticsApi, 'analyze').mockImplementation(async (criteria) =>
    result(criteria),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('UC-D criteria and Analyze workflow', () => {
  test('renders real park options, date controls, optional filters and four categories', async () => {
    render(<AnalyticsPage />);
    await enterValidCriteria();
    expect(
      screen.getByRole('option', { name: 'Beta park (BETA)' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    expect(screen.getByLabelText('Incident Statistics')).toBeChecked();
    expect(screen.getByLabelText('Incident Hotspots')).not.toBeChecked();
    expect(screen.getByLabelText('Patrol Coverage')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Human-Wildlife Conflict Trends'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Ranger ID')).toBeInTheDocument();
    expect(analyticsApi.analyze).not.toHaveBeenCalled();
  });
  test('park selection and multiple categories reach Analyze', async () => {
    render(<AnalyticsPage />);
    await enterValidCriteria();
    fireEvent.change(screen.getByLabelText('Park / Conservation Area'), {
      target: { value: parks[1].id },
    });
    fireEvent.click(screen.getByLabelText('Patrol Coverage'));
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    await screen.findByRole('region', { name: 'Applied scope' });
    expect(analyticsApi.analyze).toHaveBeenCalledWith(
      {
        ...validCriteria,
        parkId: parks[1].id,
        categories: ['INCIDENT_STATISTICS', 'PATROL_COVERAGE'],
      },
      expect.any(AbortSignal),
    );
  });
  test('requires at least one category before requesting data', async () => {
    render(<AnalyticsPage />);
    await enterValidCriteria();
    fireEvent.click(screen.getByLabelText('Incident Statistics'));
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Select at least one analysis category.',
    );
    expect(analyticsApi.analyze).not.toHaveBeenCalled();
  });
  test('validates missing park/dates and reversed dates in the frontend', async () => {
    render(<AnalyticsPage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Analyze' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Select a valid Park');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a valid Start Date',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a valid End Date',
    );
    await enterValidCriteria();
    fireEvent.change(screen.getByLabelText('Start Date'), {
      target: { value: '2026-10-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Start Date must be on or before End Date.',
    );
    expect(analyticsApi.analyze).not.toHaveBeenCalled();
  });
  test('draft park/date/category/filter edits preserve applied criteria until re-analysis succeeds', async () => {
    render(<AnalyticsPage />);
    const scope = await analyzeValidCriteria();
    fireEvent.change(screen.getByLabelText('Park / Conservation Area'), {
      target: { value: parks[1].id },
    });
    fireEvent.change(screen.getByLabelText('End Date'), {
      target: { value: '2026-10-05' },
    });
    fireEvent.change(screen.getByLabelText('Ranger ID'), {
      target: { value: 'R-102' },
    });
    fireEvent.click(screen.getByLabelText('Patrol Coverage'));
    expect(scope).toHaveTextContent('Alpha park');
    expect(scope).toHaveTextContent('2026-09-30');
    expect(scope).not.toHaveTextContent('Patrol Coverage');
    expect(scope).not.toHaveTextContent('R-102');
    expect(analyticsApi.analyze).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Criteria have changed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    await waitFor(() => expect(scope).toHaveTextContent('Beta park'));
    expect(scope).toHaveTextContent('2026-10-05');
    expect(scope).toHaveTextContent('Patrol Coverage');
    expect(scope).toHaveTextContent('R-102');
    expect(screen.queryByText(/Criteria have changed/)).not.toBeInTheDocument();
  });
  test('shows no matching data without fake statistics and permits refinement', async () => {
    vi.mocked(analyticsApi.analyze).mockResolvedValueOnce(
      result(validCriteria, 'NO_MATCHING_DATA'),
    );
    render(<AnalyticsPage />);
    await analyzeValidCriteria();
    expect(
      screen.getByText('No matching conservation data'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Incidents by type' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Download report' }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('End Date'), {
      target: { value: '2026-10-05' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    await screen.findByRole('heading', { name: 'Incidents by type' });
    expect(
      screen.queryByText('No matching conservation data'),
    ).not.toBeInTheDocument();
  });
  test('preserves entered values, shows processing and prevents duplicate requests', async () => {
    const pending = deferred<AnalyticsResult>();
    vi.mocked(analyticsApi.analyze).mockReturnValueOnce(pending.promise);
    render(<AnalyticsPage />);
    await enterValidCriteria();
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    expect(screen.getByRole('button', { name: 'Analyzing...' })).toBeDisabled();
    expect(screen.getByText(/Analyzing conservation data/)).toBeInTheDocument();
    fireEvent.submit(screen.getByRole('form', { name: 'Analysis criteria' }));
    expect(analyticsApi.analyze).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Start Date')).toHaveValue(
      validCriteria.start,
    );
    await act(async () => pending.resolve(result()));
    expect(screen.getByRole('button', { name: 'Analyze' })).toBeEnabled();
  });
  test('a failed re-analysis keeps previous results; Retry retries its snapshot even after draft changes', async () => {
    render(<AnalyticsPage />);
    const scope = await analyzeValidCriteria();
    vi.mocked(analyticsApi.analyze).mockRejectedValueOnce(
      new Error('internal secret'),
    );
    fireEvent.change(screen.getByLabelText('End Date'), {
      target: { value: '2026-10-04' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to analyze conservation data',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('internal secret');
    expect(scope).toHaveTextContent('2026-09-30');
    fireEvent.change(screen.getByLabelText('End Date'), {
      target: { value: '2026-10-05' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry analysis' }));
    await waitFor(() => expect(scope).toHaveTextContent('2026-10-04'));
    expect(screen.getByLabelText('End Date')).toHaveValue('2026-10-05');
    expect(screen.getByText(/Criteria have changed/)).toBeInTheDocument();
  });
  test('shows backend validation messages without treating failures as no-data', async () => {
    vi.mocked(analyticsApi.analyze).mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: { error: { message: 'The selected park does not exist.' } },
      },
    });
    render(<AnalyticsPage />);
    await enterValidCriteria();
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The selected park does not exist.',
    );
    expect(
      screen.queryByText('No matching conservation data'),
    ).not.toBeInTheDocument();
  });
  test('Reset clears criteria/results and a late response cannot replace a newer analysis', async () => {
    const older = deferred<AnalyticsResult>();
    vi.mocked(analyticsApi.analyze).mockReturnValueOnce(older.promise);
    render(<AnalyticsPage />);
    await enterValidCriteria();
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    const signal = vi.mocked(analyticsApi.analyze).mock.calls[0][1];
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(signal.aborted).toBe(true);
    expect(screen.getByLabelText('Park / Conservation Area')).toHaveValue('');
    expect(screen.getByLabelText('Start Date')).toHaveValue('');
    expect(screen.getByLabelText('Incident Statistics')).toBeChecked();
    await enterValidCriteria();
    fireEvent.change(screen.getByLabelText('Park / Conservation Area'), {
      target: { value: parks[1].id },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    const scope = await screen.findByRole('region', { name: 'Applied scope' });
    expect(scope).toHaveTextContent('Beta park');
    await act(async () => older.resolve(result()));
    expect(scope).toHaveTextContent('Beta park');
    expect(scope).not.toHaveTextContent('Alpha park');
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(
      screen.queryByRole('region', { name: 'Applied scope' }),
    ).not.toBeInTheDocument();
  });
  test('edits made during processing stay draft while results use the submitted snapshot', async () => {
    const pending = deferred<AnalyticsResult>();
    vi.mocked(analyticsApi.analyze).mockReturnValueOnce(pending.promise);
    render(<AnalyticsPage />);
    await enterValidCriteria();
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    fireEvent.change(screen.getByLabelText('End Date'), {
      target: { value: '2026-10-05' },
    });
    await act(async () => pending.resolve(result()));
    expect(
      screen.getByRole('region', { name: 'Applied scope' }),
    ).toHaveTextContent('2026-09-30');
    expect(screen.getByLabelText('End Date')).toHaveValue('2026-10-05');
  });
  test('existing report download uses applied criteria after draft edits', async () => {
    vi.spyOn(analyticsApi, 'downloadExistingReport').mockResolvedValue();
    render(<AnalyticsPage />);
    await analyzeValidCriteria();
    fireEvent.change(screen.getByLabelText('End Date'), {
      target: { value: '2026-10-05' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Download report' }));
    await waitFor(() =>
      expect(analyticsApi.downloadExistingReport).toHaveBeenCalledWith(
        validCriteria,
      ),
    );
  });
  test('future categories display a pending calculation message', async () => {
    render(<AnalyticsPage />);
    await enterValidCriteria();
    fireEvent.click(screen.getByLabelText('Incident Hotspots'));
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    const results = await screen.findByRole('region', {
      name: 'Analysis results',
    });
    expect(
      within(results).getByText(/Incident Hotspots: calculation pending/),
    ).toBeInTheDocument();
  });
});

describe('park loading and recovery', () => {
  test('keeps criteria available during park loading, then allows retry on failure', async () => {
    const pending = deferred<ParkOption[]>();
    vi.mocked(analyticsApi.listParks).mockReturnValueOnce(pending.promise);
    render(<AnalyticsPage />);
    expect(screen.getByText('Loading parks...')).toBeInTheDocument();
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument();
    await act(async () => pending.resolve(parks));
    expect(screen.getByRole('button', { name: 'Analyze' })).toBeEnabled();
  });
  test('recovers from a park-list API failure without losing draft values', async () => {
    vi.mocked(analyticsApi.listParks).mockRejectedValueOnce(
      new Error('failed'),
    );
    render(<AnalyticsPage />);
    await screen.findByRole('alert');
    fireEvent.change(screen.getByLabelText('Start Date'), {
      target: { value: validCriteria.start },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry loading parks' }),
    );
    await screen.findByRole('option', { name: 'Alpha park (ALPHA)' });
    expect(screen.getByLabelText('Start Date')).toHaveValue(
      validCriteria.start,
    );
  });
  test('does not create hardcoded parks when no real records exist', async () => {
    vi.mocked(analyticsApi.listParks).mockResolvedValueOnce([]);
    render(<AnalyticsPage />);
    await screen.findByText(/No parks are available/);
    expect(screen.getByRole('button', { name: 'Analyze' })).toBeDisabled();
    expect(
      screen.getAllByRole('option', { name: 'Select a park' }),
    ).toHaveLength(1);
    expect(analyticsApi.analyze).not.toHaveBeenCalled();
  });
});

describe('criteria validation and API serialization', () => {
  test('rejects impossible dates and unsupported categories in frontend validation', () => {
    expect(
      validateDraftCriteria({ ...validCriteria, start: '2026-02-30' }, parks),
    ).toContain('Enter a valid Start Date.');
    // Deliberately malformed runtime input still has to be rejected by validation.
    const malformed = {
      ...validCriteria,
      categories: ['UNKNOWN'],
    } as unknown as AnalysisCriteria;
    expect(validateDraftCriteria(malformed, parks)).toContain(
      'Unsupported analysis category.',
    );
    const malformedShape = {
      ...validCriteria,
      categories: { selected: 'INCIDENT_STATISTICS' },
    } as unknown as AnalysisCriteria;
    expect(validateDraftCriteria(malformedShape, parks)).toEqual([
      'Malformed analysis criteria. Please check the criteria and try again.',
    ]);
  });
  test('copying criteria isolates the category array', () => {
    const draft = copyCriteria(validCriteria);
    const applied = copyCriteria(draft);
    draft.categories.push('PATROL_COVERAGE');
    expect(applied.categories).toEqual(['INCIDENT_STATISTICS']);
  });
  test('API sends a bracket-encoded category array, real park and unchanged calendar dates', async () => {
    // Restore the page-level mock to exercise the API adapter itself.
    vi.mocked(analyticsApi.analyze).mockRestore();
    const get = vi
      .spyOn(http, 'get')
      .mockResolvedValueOnce({ data: { success: true, data: result() } });
    const controller = new AbortController();
    await analyticsApi.analyze(validCriteria, controller.signal);
    expect(get).toHaveBeenCalledWith(
      '/analytics',
      expect.objectContaining({
        params: {
          parkId: parks[0].id,
          start: validCriteria.start,
          end: validCriteria.end,
          categories: ['INCIDENT_STATISTICS'],
        },
        paramsSerializer: { indexes: false },
        signal: controller.signal,
        headers: { 'x-user-role': 'MANAGER' },
      }),
    );
  });
});
