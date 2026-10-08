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
import { SavedReports } from './SavedReports';
import { analyticsApi } from './api';
import { savedReportFixture } from './savedReportTestFixtures';
import { parks, validCriteria } from './analyticsTestFixtures';
import { validateDraftCriteriaIssues, datePresetRange } from './criteria';
import {
  formatEnumLabel,
  formatAnalysisTimestamp,
  formatReportCell,
} from './formatting';
import { installAnalyticsObservers } from './analyticsTestSetup';
import {
  FUTURE_PERIOD_MESSAGE,
  MIN_ANALYSIS_DATE,
  SUPPORTED_DATE_MESSAGE,
} from '../../../../server/src/modules/analytics/contract';
import { REPORT_METADATA_MESSAGES } from '../../../../server/src/modules/analytics/metadataValidation';
import type { SavedStatisticalReport } from '../../../../server/src/modules/analytics/savedReportContract';

installAnalyticsObservers();
const saved = savedReportFixture();

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute('open', '');
      this.querySelector<HTMLButtonElement>('button')?.focus();
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
});
beforeEach(() => {
  vi.spyOn(analyticsApi, 'listParks').mockResolvedValue(parks);
  vi.spyOn(analyticsApi, 'listReports').mockResolvedValue({
    items: [saved],
    nextCursor: null,
  });
  vi.spyOn(analyticsApi, 'getReport').mockResolvedValue(saved);
  vi.spyOn(analyticsApi, 'updateReport').mockImplementation(
    async (_id, metadata) => ({ ...saved, ...metadata }),
  );
  vi.spyOn(analyticsApi, 'regenerateReport').mockResolvedValue({
    ...saved,
    version: 2,
  });
  vi.spyOn(analyticsApi, 'archiveReport').mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function edit(page = false) {
  render(page ? <AnalyticsPage /> : <SavedReports />);
  if (page)
    fireEvent.click(screen.getByRole('button', { name: 'Saved Reports' }));
  fireEvent.click(await screen.findByRole('button', { name: 'View Report' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Edit Report Details' }),
  );
  return screen.getByLabelText('Report Title');
}
function changeTitle(value = 'Unsaved manager title') {
  fireEvent.change(screen.getByLabelText('Report Title'), {
    target: { value },
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test.each([
  ['2026-09-01', '2026-09-30', true],
  ['2026-10-07', '2026-10-07', true],
  ['2026-10-08', '2026-10-08', false],
  ['2026-10-20', '2026-10-30', false],
  ['2026-10-07', '2026-10-06', false],
  ['0000-01-01', '2026-10-07', false],
  ['malformed', '2026-10-07', false],
  [MIN_ANALYSIS_DATE, '2026-10-07', true],
])(
  'client shares authoritative date rules for %s to %s',
  (start, end, valid) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T23:59:59Z'));
    const issues = validateDraftCriteriaIssues(
      { ...validCriteria, start, end },
      parks,
    );
    expect(issues.length === 0).toBe(valid);
    if (start === '0000-01-01')
      expect(issues).toContainEqual({
        field: 'start',
        message: SUPPORTED_DATE_MESSAGE,
      });
    if (start === '2026-10-08' || start === '2026-10-20')
      expect(issues).toContainEqual({
        field: 'start',
        message: FUTURE_PERIOD_MESSAGE,
      });
  },
);

test('Last 7/30/90 Days continue to pass shared date validation', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T00:00:00Z'));
  for (const days of [7, 30, 90] as const)
    expect(
      validateDraftCriteriaIssues(
        { ...validCriteria, ...datePresetRange(days) },
        parks,
      ),
    ).toEqual([]);
});

test('recognized server date rejection stays actionable when the browser clock differs', async () => {
  vi.spyOn(analyticsApi, 'analyze').mockRejectedValueOnce({
    isAxiosError: true,
    response: {
      status: 400,
      data: { error: { message: FUTURE_PERIOD_MESSAGE } },
    },
  });
  render(<AnalyticsPage />);
  await screen.findByRole('option', { name: 'Alpha park (ALPHA)' });
  for (const [label, value] of [
    ['Park / Conservation Area', validCriteria.parkId],
    ['Start Date', validCriteria.start],
    ['End Date', validCriteria.end],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Start Date')).toHaveFocus(),
  );
  expect(screen.getByLabelText('Start Date')).toHaveAccessibleDescription(
    FUTURE_PERIOD_MESSAGE,
  );
});

test('future period feedback focuses Start Date without sending an analysis', async () => {
  const analyze = vi.spyOn(analyticsApi, 'analyze');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T23:00:00Z'));
  render(<AnalyticsPage />);
  await screen.findByRole('option', { name: 'Alpha park (ALPHA)' });
  for (const [label, value] of [
    ['Park / Conservation Area', validCriteria.parkId],
    ['Start Date', '2026-10-20'],
    ['End Date', '2026-10-30'],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
  expect(screen.getByLabelText('Start Date')).toHaveFocus();
  expect(screen.getByLabelText('Start Date')).toHaveAccessibleDescription(
    FUTURE_PERIOD_MESSAGE,
  );
  expect(analyze).not.toHaveBeenCalled();
});

test.each([
  ['Report Title', ' ', REPORT_METADATA_MESSAGES.title.required],
  ['Report Title', 'x'.repeat(201), REPORT_METADATA_MESSAGES.title.length],
  ['Report Notes', 'x'.repeat(5001), REPORT_METADATA_MESSAGES.notes.length],
])(
  'local metadata feedback beside %s preserves typed text',
  async (label, value, message) => {
    await edit();
    const input = screen.getByLabelText(label);
    fireEvent.change(input, { target: { value } });
    fireEvent.submit(screen.getByRole('form', { name: 'Edit Report Details' }));
    expect(input).toHaveValue(value);
    expect(input).toHaveFocus();
    expect(input).toHaveAccessibleDescription(message);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(analyticsApi.updateReport).not.toHaveBeenCalled();
  },
);

test.each(['title', 'notes'] as const)(
  'server %s error is safe, inline, focused and preserves both fields',
  async (field) => {
    await edit();
    changeTitle();
    fireEvent.change(screen.getByLabelText('Report Notes'), {
      target: { value: 'Unsaved notes' },
    });
    const message = REPORT_METADATA_MESSAGES[field].length;
    vi.mocked(analyticsApi.updateReport).mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          error: {
            message: 'private stack trace',
            fieldErrors: { [field]: message },
          },
        },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await screen.findByText(message);
    const input = screen.getByLabelText(
      field === 'title' ? 'Report Title' : 'Report Notes',
    );
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveAccessibleDescription(message);
    expect(screen.getByLabelText('Report Title')).toHaveValue(
      'Unsaved manager title',
    );
    expect(screen.getByLabelText('Report Notes')).toHaveValue('Unsaved notes');
    expect(document.body).not.toHaveTextContent('private stack trace');
  },
);

test('untrusted field messages are never shown', async () => {
  await edit();
  changeTitle();
  vi.mocked(analyticsApi.updateReport).mockRejectedValueOnce({
    isAxiosError: true,
    response: {
      status: 400,
      data: { error: { fieldErrors: { title: 'private database trace' } } },
    },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  expect(await screen.findByRole('alert')).not.toHaveTextContent(
    'private database trace',
  );
  expect(screen.getByLabelText('Report Title')).toHaveValue(
    'Unsaved manager title',
  );
});

test.each([
  'Cancel Edit',
  'Edit Report Details',
  'Return to Report History',
  'Back to History',
  'Analysis',
])('unchanged metadata leaves via %s without a warning', async (action) => {
  await edit(true);
  fireEvent.click(screen.getByRole('button', { name: action }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Report Title')).not.toBeInTheDocument();
});

test.each([
  'Cancel Edit',
  'Edit Report Details',
  'Return to Report History',
  'Back to History',
  'Analysis',
  'Create New Version',
  'Archive Report',
])('dirty metadata is protected when choosing %s', async (action) => {
  await edit(true);
  changeTitle();
  fireEvent.click(screen.getByRole('button', { name: action }));
  const dialog = screen.getByRole('dialog', {
    name: 'Discard unsaved report details?',
  });
  expect(
    within(dialog).getByRole('button', { name: 'Stay and Continue Editing' }),
  ).toHaveFocus();
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Stay and Continue Editing' }),
  );
  expect(screen.getByLabelText('Report Title')).toHaveValue(
    'Unsaved manager title',
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(analyticsApi.updateReport).not.toHaveBeenCalled();
  expect(analyticsApi.archiveReport).not.toHaveBeenCalled();
  expect(analyticsApi.regenerateReport).not.toHaveBeenCalled();
});

test('Escape keeps dirty edits; explicit discard closes the editor and restores persisted text', async () => {
  await edit();
  changeTitle();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel Edit' }));
  fireEvent(
    screen.getByRole('dialog'),
    new Event('cancel', { cancelable: true }),
  );
  expect(screen.getByLabelText('Report Title')).toHaveValue(
    'Unsaved manager title',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit Report Details' }));
  fireEvent.click(screen.getByRole('button', { name: 'Discard Changes' }));
  expect(screen.queryByLabelText('Report Title')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Edit Report Details' }));
  expect(screen.getByLabelText('Report Title')).toHaveValue(saved.title);
});

test('discard confirmed during view switching opens Analysis', async () => {
  await edit(true);
  changeTitle();
  fireEvent.click(screen.getByRole('button', { name: 'Analysis' }));
  fireEvent.click(screen.getByRole('button', { name: 'Discard Changes' }));
  expect(
    screen.getByRole('form', { name: 'Analysis criteria' }),
  ).toBeInTheDocument();
});

test('reverting edits and successful saves clear dirty state', async () => {
  await edit();
  changeTitle();
  changeTitle(saved.title);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel Edit' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Edit Report Details' }));
  changeTitle('Persisted title');
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await screen.findByRole('heading', { name: 'Persisted title' });
  fireEvent.click(screen.getByRole('button', { name: 'Edit Report Details' }));
  expect(screen.getByLabelText('Report Title')).toHaveValue('Persisted title');
  fireEvent.click(
    screen.getByRole('button', { name: 'Return to Report History' }),
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test.each(['metadata', 'version', 'archive'] as const)(
  'pending %s write disables view switches and duplicate submits until settlement',
  async (operation) => {
    await edit(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Edit' }));
    const pendingReport = deferred<SavedStatisticalReport>();
    const pendingArchive = deferred<void>();
    const spy =
      operation === 'metadata'
        ? vi.mocked(analyticsApi.updateReport)
        : operation === 'version'
          ? vi.mocked(analyticsApi.regenerateReport)
          : vi.mocked(analyticsApi.archiveReport);
    if (operation === 'metadata')
      vi.mocked(analyticsApi.updateReport).mockReturnValueOnce(
        pendingReport.promise,
      );
    else if (operation === 'version')
      vi.mocked(analyticsApi.regenerateReport).mockReturnValueOnce(
        pendingReport.promise,
      );
    else
      vi.mocked(analyticsApi.archiveReport).mockReturnValueOnce(
        pendingArchive.promise,
      );
    if (operation === 'metadata') {
      fireEvent.click(
        screen.getByRole('button', { name: 'Edit Report Details' }),
      );
      changeTitle();
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    } else {
      fireEvent.click(
        screen.getByRole('button', {
          name:
            operation === 'version' ? 'Create New Version' : 'Archive Report',
        }),
      );
      if (operation === 'archive')
        fireEvent.click(
          within(screen.getByRole('dialog')).getByRole('button', {
            name: 'Archive Report',
          }),
        );
    }
    const switcher = screen.getByRole('navigation', {
      name: 'Analysis and saved reports',
      hidden: true,
    });
    for (const button of within(switcher).getAllByRole('button', {
      hidden: true,
    })) {
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0].at(-1)).toBeInstanceOf(AbortSignal);
    expect((spy.mock.calls[0].at(-1) as AbortSignal).aborted).toBe(false);
    expect(
      screen.getByText(/Please wait before leaving this view/),
    ).toHaveAttribute('role', 'status');
    await act(async () => {
      if (operation === 'archive') pendingArchive.resolve();
      else pendingReport.resolve(saved);
    });
    for (const button of within(switcher).getAllByRole('button'))
      expect(button).toBeEnabled();
  },
);

test.each(['metadata', 'version'] as const)(
  'uncertain %s writes keep drafts and require refreshing history before retry',
  async (operation) => {
    await edit(true);
    if (operation === 'metadata') {
      changeTitle();
      vi.mocked(analyticsApi.updateReport).mockRejectedValueOnce(
        new Error('private network failure'),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel Edit' }));
      vi.mocked(analyticsApi.regenerateReport).mockRejectedValueOnce(
        new Error('private network failure'),
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Create New Version' }),
      );
    }
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The request may have completed. Refresh Report History before trying again.',
    );
    expect(screen.getByRole('button', { name: 'Analysis' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Create New Version' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh Report History' }),
    );
    if (operation === 'metadata') {
      expect(screen.getByLabelText('Report Title')).toHaveValue(
        'Unsaved manager title',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Discard Changes' }));
    }
    await screen.findByRole('button', { name: 'View Report' });
    expect(analyticsApi.listReports).toHaveBeenCalledTimes(2);
    expect(
      operation === 'metadata'
        ? analyticsApi.updateReport
        : analyticsApi.regenerateReport,
    ).toHaveBeenCalledTimes(1);
  },
);

test.each([
  ['ANIMAL_CARCASS', 'Animal Carcass'],
  ['IN_PROGRESS', 'In Progress'],
  ['HIGH_SEVERITY', 'High Severity'],
])('enum %s has a readable presentation', (value, label) => {
  expect(formatEnumLabel(value)).toBe(label);
});
test('timestamps use UTC without altering saved values; IDs/names and exported cells stay exact', () => {
  const iso = '2026-10-08T00:15:00+05:30';
  expect(formatAnalysisTimestamp(iso)).toBe('7 Oct 2026, 18:45:00 UTC');
  expect(formatAnalysisTimestamp('bad')).toBe('Date unavailable');
  expect(formatReportCell('IN_PROGRESS', 'Status')).toBe('In Progress');
  expect(formatReportCell('ID_WITH_UNDERSCORES', 'Route ID')).toBe(
    'ID_WITH_UNDERSCORES',
  );
  expect(formatReportCell('ANIMAL_CARCASS', 'Route name')).toBe(
    'ANIMAL_CARCASS',
  );
  expect(iso).toBe('2026-10-08T00:15:00+05:30');
});
