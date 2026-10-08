import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnalyticsResult } from '../../../../server/src/modules/analytics/contract';
import { AnalyticsPage } from './AnalyticsPage';
import { AnalyticsResults } from './AnalyticsResults';
import { analyticsApi } from './api';
import { datePresetRange, type DatePresetDays } from './criteria';
import { parks, result, validCriteria } from './analyticsTestFixtures';
import { installAnalyticsObservers } from './analyticsTestSetup';
import { http } from '../../shared/api/http';

installAnalyticsObservers();

beforeEach(() => {
  vi.spyOn(analyticsApi, 'listParks').mockResolvedValue(parks);
  vi.spyOn(analyticsApi, 'analyze').mockImplementation(async (criteria) =>
    result(criteria),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function fillCriteria() {
  await screen.findByRole('option', { name: 'Alpha park (ALPHA)' });
  for (const [label, value] of [
    ['Park / Conservation Area', validCriteria.parkId],
    ['Start Date', validCriteria.start],
    ['End Date', validCriteria.end],
  ]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}
async function reviewedAnalysis() {
  await fillCriteria();
  fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
  return screen.findByRole('region', { name: 'Applied scope' });
}

test.each<[DatePresetDays, string]>([
  [7, '2026-10-01'],
  [30, '2026-09-08'],
  [90, '2026-07-10'],
])('Last %i Days includes exactly N UTC days', (days, start) => {
  expect(datePresetRange(days, new Date('2026-10-07T20:00:00.000Z'))).toEqual({
    start,
    end: '2026-10-07',
  });
});

test.each([
  ['2026-01-02T00:15:00+05:30', '2025-12-26', '2026-01-01'],
  ['2024-03-01T01:00:00Z', '2024-02-24', '2024-03-01'],
  ['2026-03-09T01:00:00-07:00', '2026-03-03', '2026-03-09'],
])(
  'presets handle timezone, year/leap-day and DST boundaries: %s',
  (now, start, end) => {
    expect(datePresetRange(7, new Date(now))).toEqual({ start, end });
  },
);

test('presets edit only the draft; custom dates remain editable and apply after Update succeeds', async () => {
  render(<AnalyticsPage />);
  const scope = await reviewedAnalysis();
  // Fake only Date so asynchronous React/testing-library scheduling stays real.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
  for (const days of [7, 30, 90] as const) {
    fireEvent.click(screen.getByRole('button', { name: `Last ${days} Days` }));
    const range = datePresetRange(days);
    expect(screen.getByLabelText('Start Date')).toHaveValue(range.start);
    expect(screen.getByLabelText('End Date')).toHaveValue(range.end);
    expect(scope).toHaveTextContent(validCriteria.end);
    expect(scope).toHaveTextContent('Draft changes are not applied');
    expect(analyticsApi.analyze).toHaveBeenCalledTimes(1);
  }
  fireEvent.change(screen.getByLabelText('Start Date'), {
    target: { value: '2026-10-06' },
  });
  fireEvent.change(screen.getByLabelText('End Date'), {
    target: { value: '2026-10-08' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Update Analysis' }));
  await waitFor(() =>
    expect(scope).toHaveTextContent('2026-10-06 to 2026-10-08'),
  );
  expect(scope).not.toHaveTextContent('Draft changes are not applied');
});

test('inactive filters explain their category and retain values when reselected', async () => {
  render(<AnalyticsPage />);
  await fillCriteria();
  expect(screen.getByLabelText('Severity')).toBeDisabled();
  expect(screen.getByLabelText('Conflict status')).toBeDisabled();
  expect(screen.getByLabelText('Incident type')).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Incident type'), {
    target: { value: 'SNARE' },
  });
  fireEvent.click(screen.getByLabelText('Incident Statistics'));
  fireEvent.click(screen.getByLabelText('Human-Wildlife Conflict Trends'));
  expect(screen.getByLabelText('Severity')).toBeEnabled();
  expect(screen.getByLabelText('Incident type')).toBeDisabled();
  expect(screen.getByLabelText('Incident type')).toHaveValue('SNARE');
  fireEvent.change(screen.getByLabelText('Severity'), {
    target: { value: 'HIGH' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
  const scope = await screen.findByRole('region', { name: 'Applied scope' });
  expect(scope).toHaveTextContent('Severity: High');
  expect(scope).not.toHaveTextContent('Incident type: Snare');
  fireEvent.click(screen.getByLabelText('Incident Statistics'));
  expect(screen.getByLabelText('Incident type')).toBeEnabled();
  expect(screen.getByLabelText('Incident type')).toHaveValue('SNARE');
});

test('keyboard Refine, validation and Reset have usable focus destinations', async () => {
  const user = userEvent.setup();
  render(<AnalyticsPage />);
  await reviewedAnalysis();
  const refine = screen.getByRole('link', { name: 'Refine Analysis' });
  refine.focus();
  await user.keyboard('{Enter}');
  expect(
    screen.getByRole('heading', { name: 'Refine Analysis' }),
  ).toHaveFocus();
  await user.tab();
  expect(screen.getByLabelText('Park / Conservation Area')).toHaveFocus();
  fireEvent.change(screen.getByLabelText('Start Date'), {
    target: { value: '' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Update Analysis' }));
  expect(screen.getByLabelText('Start Date')).toHaveFocus();
  expect(screen.getByLabelText('Start Date')).toBeRequired();
  expect(screen.getByLabelText('Start Date')).toHaveAccessibleDescription(
    'Enter a valid Start Date.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(
    screen.getByRole('heading', { name: 'Select Analysis Criteria' }),
  ).toHaveFocus();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('region', { name: 'Applied scope' }),
  ).not.toBeInTheDocument();
});

test('standalone failure retries the current draft once; processing is announced and prevents duplicates', async () => {
  vi.mocked(analyticsApi.analyze).mockRejectedValueOnce(
    new Error('Prisma connection secret'),
  );
  render(<AnalyticsPage />);
  await fillCriteria();
  fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
  const error = await screen.findByRole('alert', {
    name: 'Analysis could not be completed',
  });
  expect(error).toHaveTextContent('Retry uses the criteria currently entered');
  expect(error).not.toHaveTextContent('Prisma');
  expect(
    screen.queryByRole('region', { name: 'Applied scope' }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('End Date'), {
    target: { value: '2026-10-07' },
  });
  let resolve!: (value: AnalyticsResult) => void;
  vi.mocked(analyticsApi.analyze).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry analysis' }));
  fireEvent.submit(screen.getByRole('form', { name: 'Analysis criteria' }));
  expect(analyticsApi.analyze).toHaveBeenCalledTimes(2);
  expect(
    screen.getByRole('status', { name: 'Analyzing Conservation Data' }),
  ).toHaveAttribute('aria-live', 'polite');
  const criteria = vi.mocked(analyticsApi.analyze).mock.calls[1][0];
  await act(async () => resolve(result(criteria)));
  expect(
    screen.getByRole('region', { name: 'Applied scope' }),
  ).toHaveTextContent('2026-10-07');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('Retry revalidates an invalid corrected draft without requesting data or losing reviewed results', async () => {
  render(<AnalyticsPage />);
  const scope = await reviewedAnalysis();
  vi.mocked(analyticsApi.analyze).mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Update Analysis' }));
  await screen.findByRole('alert');
  fireEvent.change(screen.getByLabelText('End Date'), {
    target: { value: '' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Retry analysis' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Enter a valid End Date.',
  );
  expect(scope).toHaveTextContent(validCriteria.end);
  expect(analyticsApi.analyze).toHaveBeenCalledTimes(2);
});

test('unexpected validation response text is never exposed', async () => {
  vi.mocked(analyticsApi.analyze).mockRejectedValueOnce({
    isAxiosError: true,
    response: {
      status: 400,
      data: {
        error: { message: 'ZodError Prisma postgres://private STACK TRACE' },
      },
    },
  });
  render(<AnalyticsPage />);
  await fillCriteria();
  fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
  const error = await screen.findByRole('alert');
  expect(error).toHaveTextContent(
    'Check the park, dates, categories and optional filters',
  );
  expect(error).not.toHaveTextContent(/ZodError|Prisma|postgres|STACK/);
});

test('Reset clears filters, errors and results without write/delete requests', async () => {
  const writes = [
    vi.spyOn(http, 'post'),
    vi.spyOn(http, 'put'),
    vi.spyOn(http, 'patch'),
    vi.spyOn(http, 'delete'),
  ];
  render(<AnalyticsPage />);
  await reviewedAnalysis();
  fireEvent.change(screen.getByLabelText('Ranger ID'), {
    target: { value: 'R-101' },
  });
  vi.mocked(analyticsApi.analyze).mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Update Analysis' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(screen.getByLabelText('Ranger ID')).toHaveValue('');
  expect(screen.getByLabelText('End Date')).toHaveValue('');
  expect(screen.getByLabelText('Incident Statistics')).toBeChecked();
  expect(
    screen.queryByRole('region', { name: 'Analysis results' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  for (const write of writes) expect(write).not.toHaveBeenCalled();
});

test('a late rejected request cannot replace newer successful results with an error', async () => {
  let reject!: (reason: Error) => void;
  vi.mocked(analyticsApi.analyze).mockReturnValueOnce(
    new Promise((_resolve, fail) => {
      reject = fail;
    }),
  );
  render(<AnalyticsPage />);
  await fillCriteria();
  fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  const scope = await reviewedAnalysis();
  await act(async () => reject(new Error('late failure')));
  expect(scope).toHaveTextContent('Alpha park');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Update Analysis' })).toBeEnabled();
});

test('park recovery prevents duplicate retry and retains current draft while loading', async () => {
  vi.mocked(analyticsApi.listParks).mockRejectedValueOnce(
    new Error('database secret'),
  );
  render(<AnalyticsPage />);
  await screen.findByRole('alert', { name: 'Parks could not be loaded' });
  fireEvent.change(screen.getByLabelText('Start Date'), {
    target: { value: validCriteria.start },
  });
  let resolve!: (value: typeof parks) => void;
  vi.mocked(analyticsApi.listParks).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading parks' }));
  expect(
    screen.queryByRole('button', { name: 'Retry loading parks' }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Analyze' })).toBeDisabled();
  fireEvent.submit(screen.getByRole('form', { name: 'Analysis criteria' }));
  expect(analyticsApi.analyze).not.toHaveBeenCalled();
  await act(async () => resolve(parks));
  expect(screen.getByLabelText('Start Date')).toHaveValue(validCriteria.start);
  expect(analyticsApi.listParks).toHaveBeenCalledTimes(2);
});

test('shared park metadata lookup does not send a manager role header', async () => {
  vi.mocked(analyticsApi.listParks).mockRestore();
  const get = vi
    .spyOn(http, 'get')
    .mockResolvedValue({ data: { success: true, data: parks } });
  const controller = new AbortController();
  await analyticsApi.listParks(controller.signal);
  expect(get).toHaveBeenCalledWith('/parks', { signal: controller.signal });
});

test('empty findings offer refinement choices while zero HWC remains informational', () => {
  const data = result(
    { ...validCriteria, categories: ['HWC_TRENDS'] },
    'NO_MATCHING_DATA',
  );
  render(<AnalyticsResults data={data} appliedCriteria={data.filters} />);
  expect(
    screen.getByRole('status', { name: 'No matching conservation data' }),
  ).toHaveTextContent(
    'park, a wider period, fewer filters or different categories',
  );
  const trends = screen.getByRole('region', {
    name: 'Human-Wildlife Conflict Trends results',
  });
  expect(trends).toHaveTextContent('Total alerts: 0; Total responses: 0');
  expect(trends).toHaveTextContent('Only park-assigned alerts');
  expect(
    within(trends).queryByRole('region', { name: 'Conflict location map' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('chart data fallback exposes exact counts and a keyboard-scrollable viewport', async () => {
  const user = userEvent.setup();
  const data = result();
  render(<AnalyticsResults data={data} appliedCriteria={data.filters} />);
  await user.click(screen.getByText('View incidents over time data'));
  const viewport = screen.getByRole('region', {
    name: 'Incidents Over Time data table',
  });
  expect(viewport).toHaveAttribute('tabindex', '0');
  viewport.focus();
  expect(viewport).toHaveFocus();
  expect(
    within(viewport).getByRole('table', { name: 'Incidents Over Time data' }),
  ).toHaveTextContent('2026-09-01');
});
