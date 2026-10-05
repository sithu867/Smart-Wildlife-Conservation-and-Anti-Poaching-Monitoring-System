import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { parks, validCriteria, result } from './analyticsTestFixtures';
import { installAnalyticsObservers } from './analyticsTestSetup';
installAnalyticsObservers();
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
    expect(
      screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
    ).toBeEnabled(),
  );
}
async function analyzeValidCriteria() {
  await enterValidCriteria();
  fireEvent.click(
    screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
  );
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
    fireEvent.click(
      screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
    );
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
    fireEvent.click(
      screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Select at least one analysis category.',
    );
    expect(analyticsApi.analyze).not.toHaveBeenCalled();
  });
  test('validates missing park/dates and reversed dates in the frontend', async () => {
    render(<AnalyticsPage />);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
    );
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
    fireEvent.click(
      screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Start Date must be on or before End Date.',
    );
    expect(analyticsApi.analyze).not.toHaveBeenCalled();
  });
  test('validation banner and inline descriptions stay visible until the invalid fields are corrected', async () => {
    render(<AnalyticsPage />);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
      ).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText('Ranger ID'), {
      target: { value: 'R-102' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
    );
    const banner = screen.getByRole('alert', {
      name: 'Check the analysis criteria',
    });
    expect(banner).toHaveClass('analytics-feedback--validation');
    const park = screen.getByLabelText('Park / Conservation Area');
    const start = screen.getByLabelText('Start Date');
    const end = screen.getByLabelText('End Date');
    expect(park).toHaveAttribute('aria-invalid', 'true');
    expect(park).toHaveAccessibleDescription(
      'Select a valid Park / Conservation Area.',
    );
    expect(start).toHaveAccessibleDescription('Enter a valid Start Date.');
    expect(end).toHaveAccessibleDescription('Enter a valid End Date.');
    fireEvent.change(start, { target: { value: validCriteria.start } });
    expect(start).toHaveAttribute('aria-invalid', 'false');
    expect(start).not.toHaveAttribute('aria-describedby');
    expect(end).toHaveAttribute('aria-invalid', 'true');
    expect(banner).toHaveTextContent('Enter a valid End Date.');
    expect(banner).not.toHaveTextContent('Enter a valid Start Date.');
    expect(screen.getByLabelText('Ranger ID')).toHaveValue('R-102');
    expect(start).toHaveValue(validCriteria.start);
    expect(analyticsApi.analyze).not.toHaveBeenCalled();
  });
  test('category and date-range errors describe the affected controls and clear after correction', async () => {
    render(<AnalyticsPage />);
    await enterValidCriteria();
    fireEvent.click(screen.getByLabelText('Incident Statistics'));
    fireEvent.change(screen.getByLabelText('End Date'), {
      target: { value: '2026-08-31' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
    );
    const categories = screen.getByRole('group', {
      name: 'Analysis Categories (select one or more)',
    });
    expect(categories).toHaveAttribute('aria-invalid', 'true');
    expect(categories).toHaveAccessibleDescription(
      'Select at least one analysis category.',
    );
    expect(
      screen.getByLabelText('Incident Statistics'),
    ).toHaveAccessibleDescription('Select at least one analysis category.');
    expect(screen.getByLabelText('End Date')).toHaveAccessibleDescription(
      'Start Date must be on or before End Date.',
    );
    fireEvent.click(screen.getByLabelText('Incident Statistics'));
    expect(categories).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Start Date must be on or before End Date.',
    );
    fireEvent.change(screen.getByLabelText('End Date'), {
      target: { value: validCriteria.end },
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('End Date')).toHaveAttribute(
      'aria-invalid',
      'false',
    );
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
    fireEvent.click(
      screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
    );
    await waitFor(() => expect(scope).toHaveTextContent('Beta park'));
    expect(scope).toHaveTextContent('2026-10-05');
    expect(scope).toHaveTextContent('Patrol Coverage');
    expect(scope).toHaveTextContent('R-102');
    expect(screen.queryByText(/Criteria have changed/)).not.toBeInTheDocument();
  });
  test('shows no matching data without fake statistics and permits refinement', async () => {
    const generateReport = vi
      .spyOn(analyticsApi, 'generateReport')
      .mockImplementation(async (snapshot) => snapshot);
    vi.mocked(analyticsApi.analyze).mockResolvedValueOnce(
      result(validCriteria, 'NO_MATCHING_DATA'),
    );
    render(<AnalyticsPage />);
    await analyzeValidCriteria();
    expect(
      screen.getByText('No matching conservation data'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('status', { name: 'No matching conservation data' }),
    ).toHaveClass('analytics-feedback--info');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const generateButton = screen.getByRole('button', {
      name: 'Generate Report',
    });
    expect(generateButton).toHaveAccessibleDescription(
      'Generate Report is available after a successful analysis with matching conservation data.',
    );
    fireEvent.click(generateButton);
    expect(generateReport).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('heading', { name: 'Incidents by type' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Generate Report' }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('End Date'), {
      target: { value: '2026-10-05' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
    );
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
    fireEvent.click(
      screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
    );
    expect(screen.getByRole('button', { name: 'Analyzing...' })).toBeDisabled();
    expect(screen.getByText(/Analyzing Conservation Data/)).toBeInTheDocument();
    fireEvent.submit(screen.getByRole('form', { name: 'Analysis criteria' }));
    expect(analyticsApi.analyze).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Start Date')).toHaveValue(
      validCriteria.start,
    );
    await act(async () => pending.resolve(result()));
    expect(
      screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
    ).toBeEnabled();
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
    fireEvent.click(
      screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to analyze conservation data',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('internal secret');
    expect(
      screen.getByRole('alert', { name: 'Analysis could not be completed' }),
    ).toHaveClass('analytics-feedback--system');
    expect(scope).toHaveTextContent('2026-09-30');
    fireEvent.change(screen.getByLabelText('End Date'), {
      target: { value: '2026-10-05' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry analysis' }));
    await waitFor(() => expect(scope).toHaveTextContent('2026-10-04'));
    expect(screen.getByLabelText('End Date')).toHaveValue('2026-10-05');
    expect(screen.getByText(/Criteria have changed/)).toBeInTheDocument();
  });
  test('a new invalid attempt replaces old API feedback without clearing reviewed results', async () => {
    render(<AnalyticsPage />);
    const scope = await analyzeValidCriteria();
    vi.mocked(analyticsApi.analyze).mockRejectedValueOnce(
      new Error('Network failure'),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
    );
    await screen.findByRole('alert', {
      name: 'Analysis could not be completed',
    });
    fireEvent.change(screen.getByLabelText('End Date'), {
      target: { value: '' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(
      screen.getByRole('alert', { name: 'Check the analysis criteria' }),
    ).toHaveTextContent('Enter a valid End Date.');
    expect(scope).toHaveTextContent('2026-09-30');
    expect(analyticsApi.analyze).toHaveBeenCalledTimes(2);
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
    fireEvent.click(
      screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The selected park does not exist.',
    );
    expect(
      screen.getByRole('alert', { name: 'Check the analysis criteria' }),
    ).toHaveClass('analytics-feedback--validation');
    expect(
      screen.queryByText('No matching conservation data'),
    ).not.toBeInTheDocument();
  });
  test('Reset clears criteria/results and a late response cannot replace a newer analysis', async () => {
    const older = deferred<AnalyticsResult>();
    vi.mocked(analyticsApi.analyze).mockReturnValueOnce(older.promise);
    render(<AnalyticsPage />);
    await enterValidCriteria();
    fireEvent.click(
      screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
    );
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
    fireEvent.click(
      screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
    );
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
    fireEvent.click(
      screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
    );
    screen.getByLabelText('End Date').focus();
    fireEvent.change(screen.getByLabelText('End Date'), {
      target: { value: '2026-10-05' },
    });
    await act(async () => pending.resolve(result()));
    expect(
      screen.getByRole('region', { name: 'Applied scope' }),
    ).toHaveTextContent('2026-09-30');
    expect(screen.getByLabelText('End Date')).toHaveValue('2026-10-05');
    expect(screen.getByLabelText('End Date')).toHaveFocus();
  });
  test('Generate Report requires meaningful matching records even for a DATA response', async () => {
    const generateReport = vi
      .spyOn(analyticsApi, 'generateReport')
      .mockImplementation(async (snapshot) => snapshot);
    vi.mocked(analyticsApi.analyze).mockResolvedValueOnce({
      ...result(),
      matchedRecords: { incidents: 0, patrols: 0 },
    });
    render(<AnalyticsPage />);
    await analyzeValidCriteria();
    const button = screen.getByRole('button', { name: 'Generate Report' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(generateReport).not.toHaveBeenCalled();
  });
  test('report generation uses applied criteria after draft edits', async () => {
    vi.spyOn(analyticsApi, 'generateReport').mockImplementation(
      async (snapshot) => snapshot,
    );
    render(<AnalyticsPage />);
    await analyzeValidCriteria();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Generate Report' }),
    ).toBeEnabled();
    fireEvent.change(screen.getByLabelText('End Date'), {
      target: { value: '2026-10-05' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Report' }));
    await waitFor(() =>
      expect(analyticsApi.generateReport).toHaveBeenCalledWith(
        expect.objectContaining({
          appliedCriteria: validCriteria,
          analyticsResult: result(),
        }),
        expect.any(AbortSignal),
      ),
    );
  });
  test('Patrol Coverage displays computed route results', async () => {
    render(<AnalyticsPage />);
    await enterValidCriteria();
    fireEvent.click(screen.getByLabelText('Patrol Coverage'));
    fireEvent.click(
      screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
    );
    const results = await screen.findByRole('region', {
      name: 'Analysis results',
    });
    expect(
      within(results).getByRole('region', { name: 'Patrol Coverage results' }),
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
    expect(
      screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
    ).toBeEnabled();
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
    expect(
      screen.getByRole('button', { name: /^(Analyze|Update Analysis)$/ }),
    ).toBeDisabled();
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
