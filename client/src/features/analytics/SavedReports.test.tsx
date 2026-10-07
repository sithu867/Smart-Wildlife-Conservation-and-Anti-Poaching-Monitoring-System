import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { SavedReports } from './SavedReports';
import { analyticsApi } from './api';
import { savedReportFixture } from './savedReportTestFixtures';
import type { SavedStatisticalReport } from '../../../../server/src/modules/analytics/savedReportContract';

const saved = savedReportFixture();
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
async function history() {
  render(<SavedReports />);
  return screen.findByRole('article');
}
async function detail() {
  await history();
  fireEvent.click(screen.getByRole('button', { name: 'View Report' }));
  return screen.findByRole('region', { name: 'Report Preview' });
}
beforeAll(() => {
  // jsdom lacks native dialog methods. Real browsers supply modal focus trapping.
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
  vi.spyOn(analyticsApi, 'listReports').mockResolvedValue({
    items: [saved],
    nextCursor: null,
  });
  vi.spyOn(analyticsApi, 'getReport').mockResolvedValue(saved);
  vi.spyOn(analyticsApi, 'updateReport').mockImplementation(
    async (_id, metadata) => ({
      ...saved,
      ...metadata,
      notes: metadata.notes ?? null,
    }),
  );
  vi.spyOn(analyticsApi, 'archiveReport').mockResolvedValue(undefined);
  vi.spyOn(analyticsApi, 'regenerateReport').mockResolvedValue({
    ...saved,
    id: 'c67a000000000000000000051',
    parentReportId: saved.id,
    version: 2,
  });
  vi.spyOn(analyticsApi, 'exportReport').mockResolvedValue('saved-report.pdf');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
afterAll(() => {
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

test('history loading, empty state, safe database error and Retry', async () => {
  const pending = deferred<{
    items: SavedStatisticalReport[];
    nextCursor: null;
  }>();
  vi.mocked(analyticsApi.listReports)
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce({ items: [], nextCursor: null });
  render(<SavedReports />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading reports');
  await act(async () => pending.reject(new Error('SQL secret')));
  expect(screen.getByRole('alert')).not.toHaveTextContent('SQL');
  fireEvent.click(screen.getByRole('button', { name: 'Retry report request' }));
  await screen.findByRole('heading', { name: 'No saved reports yet' });
  expect(analyticsApi.listReports).toHaveBeenCalledTimes(2);
});
test('history displays scope, categories, dates, version and accessible actions', async () => {
  const card = await history();
  expect(card).toHaveTextContent('Alpha park');
  expect(card).toHaveTextContent('2026-09-01 to 2026-09-30');
  expect(card).toHaveTextContent('Version 1');
  expect(card).toHaveTextContent(saved.id);
  for (const name of ['View Report', 'Export PDF', 'Archive Report'])
    expect(within(card).getByRole('button', { name })).toBeEnabled();
});
test('detail uses saved findings, filters, notes, limitations and ID, without Analyze', async () => {
  const analyze = vi.spyOn(analyticsApi, 'analyze');
  const preview = await detail();
  expect(preview).toHaveTextContent('Total incidents: 2');
  expect(preview).toHaveTextContent(`Saved Report ID: ${saved.id}`);
  expect(analyticsApi.getReport).toHaveBeenCalledWith(
    saved.id,
    expect.any(AbortSignal),
  );
  expect(analyze).not.toHaveBeenCalled();
});
test('missing detail shows safe feedback and can retry', async () => {
  vi.mocked(analyticsApi.getReport).mockRejectedValueOnce({
    isAxiosError: true,
    response: { status: 404 },
  });
  await history();
  fireEvent.click(screen.getByRole('button', { name: 'View Report' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Saved report not found',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry report request' }));
  await screen.findByRole('region', { name: 'Report Preview' });
});
test('edit safely saves metadata and prevents duplicate submissions while preserving findings', async () => {
  const preview = await detail();
  fireEvent.click(screen.getByRole('button', { name: 'Edit Report Details' }));
  fireEvent.change(screen.getByLabelText('Report Title'), {
    target: { value: 'Manager review' },
  });
  fireEvent.change(screen.getByLabelText('Report Notes'), {
    target: { value: 'Keep this original evidence' },
  });
  const pending = deferred<SavedStatisticalReport>();
  vi.mocked(analyticsApi.updateReport).mockReturnValueOnce(pending.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  const button = screen.getByRole('button', { name: 'Saving Changes...' });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(analyticsApi.updateReport).toHaveBeenCalledTimes(1);
  expect(analyticsApi.updateReport).toHaveBeenCalledWith(
    saved.id,
    { title: 'Manager review', notes: 'Keep this original evidence' },
    expect.any(AbortSignal),
  );
  await act(async () =>
    pending.resolve({
      ...saved,
      title: 'Manager review',
      notes: 'Keep this original evidence',
    }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Manager review' }),
  ).toBeInTheDocument();
  expect(preview).toHaveTextContent('Total incidents: 2');
  expect(preview).toHaveTextContent('Keep this original evidence');
  expect(
    screen.getByText(
      'Report details saved. Analytical findings are unchanged.',
    ),
  ).toHaveAttribute('role', 'status');
});
test('edit validation blocks whitespace title, supports cancel, and safely retries database failure', async () => {
  await detail();
  fireEvent.click(screen.getByRole('button', { name: 'Edit Report Details' }));
  fireEvent.change(screen.getByLabelText('Report Title'), {
    target: { value: '  ' },
  });
  fireEvent.submit(screen.getByRole('form', { name: 'Edit Report Details' }));
  expect(screen.getByRole('alert')).toHaveTextContent('1-200');
  expect(analyticsApi.updateReport).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Report Title'), {
    target: { value: 'Retry title' },
  });
  vi.mocked(analyticsApi.updateReport).mockRejectedValueOnce(
    new Error('Prisma secret'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  expect(await screen.findByRole('alert')).not.toHaveTextContent('Prisma');
  expect(screen.getByLabelText('Report Title')).toHaveValue('Retry title');
  fireEvent.click(screen.getByRole('button', { name: 'Retry report request' }));
  await screen.findByRole('heading', { name: 'Retry title' });
  fireEvent.click(screen.getByRole('button', { name: 'Edit Report Details' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel Edit' }));
  expect(screen.queryByLabelText('Report Title')).not.toBeInTheDocument();
});
test('archive requires an identified modal confirmation; Cancel performs no write', async () => {
  await history();
  fireEvent.click(screen.getByRole('button', { name: 'Archive Report' }));
  const dialog = screen.getByRole('dialog', { name: 'Archive Report?' });
  expect(dialog).toHaveTextContent(saved.title);
  expect(dialog).toHaveTextContent(saved.id);
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  expect(analyticsApi.archiveReport).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(analyticsApi.archiveReport).not.toHaveBeenCalled();
});
test('confirmed archive prevents double submission and removes active history', async () => {
  const pending = deferred<void>();
  vi.mocked(analyticsApi.archiveReport).mockReturnValueOnce(pending.promise);
  await history();
  fireEvent.click(screen.getByRole('button', { name: 'Archive Report' }));
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Archive Report',
    }),
  );
  const button = within(screen.getByRole('dialog')).getByRole('button', {
    name: 'Archiving...',
  });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(analyticsApi.archiveReport).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve());
  await screen.findByRole('heading', { name: 'No saved reports yet' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    screen.getByText(/Report archived. Conservation source records/),
  ).toHaveAttribute('role', 'status');
});
test('archive failure retains the modal and permits safe retry', async () => {
  vi.mocked(analyticsApi.archiveReport).mockRejectedValueOnce(
    new Error('secret'),
  );
  await history();
  fireEvent.click(screen.getByRole('button', { name: 'Archive Report' }));
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Archive Report',
    }),
  );
  expect(await screen.findByRole('alert')).not.toHaveTextContent('secret');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry Archive Report' }));
  await screen.findByRole('heading', { name: 'No saved reports yet' });
});
test('regeneration creates a new ID/version and keeps the original in history; duplicate clicks are blocked', async () => {
  await detail();
  const pending = deferred<SavedStatisticalReport>();
  vi.mocked(analyticsApi.regenerateReport).mockReturnValueOnce(pending.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Create New Version' }));
  const button = screen.getByRole('button', { name: 'Create New Version' });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(analyticsApi.regenerateReport).toHaveBeenCalledTimes(1);
  await act(async () =>
    pending.resolve({
      ...saved,
      id: 'c67a000000000000000000051',
      version: 2,
      parentReportId: saved.id,
    }),
  );
  await screen.findByText(/New version saved with a new Report ID/);
  fireEvent.click(
    screen.getByRole('button', { name: 'Return to Report History' }),
  );
  const cards = screen.getAllByRole('article');
  expect(cards).toHaveLength(2);
  expect(cards[0]).toHaveTextContent('Version 2');
  expect(cards[1]).toHaveTextContent('Version 1');
});
test('regeneration conflicts retain original preview and direct manager to newest history version', async () => {
  await detail();
  vi.mocked(analyticsApi.regenerateReport).mockRejectedValueOnce({
    isAxiosError: true,
    response: { status: 409 },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create New Version' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'newer version already exists',
  );
  expect(
    screen.getByRole('region', { name: 'Report Preview' }),
  ).toHaveTextContent(`Saved Report ID: ${saved.id}`);
});
test('saved PDF failure offers retry by saved ID, without regeneration', async () => {
  await detail();
  vi.mocked(analyticsApi.exportReport).mockRejectedValueOnce(
    new Error('secret'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
  expect(await screen.findByRole('alert')).not.toHaveTextContent('secret');
  fireEvent.click(screen.getByRole('button', { name: 'Retry report request' }));
  await waitFor(() =>
    expect(analyticsApi.exportReport).toHaveBeenCalledTimes(2),
  );
  expect(analyticsApi.exportReport).toHaveBeenLastCalledWith(
    saved,
    expect.any(AbortSignal),
  );
  expect(analyticsApi.regenerateReport).not.toHaveBeenCalled();
});
test('pagination appends older reports and unmount cancels pending reads', async () => {
  vi.mocked(analyticsApi.listReports)
    .mockResolvedValueOnce({ items: [saved], nextCursor: saved.id })
    .mockResolvedValueOnce({
      items: [{ ...saved, id: 'c67a000000000000000000052' }],
      nextCursor: null,
    });
  await history();
  fireEvent.click(screen.getByRole('button', { name: 'Load More Reports' }));
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
  expect(analyticsApi.listReports).toHaveBeenLastCalledWith(
    expect.any(AbortSignal),
    saved.id,
  );
  const pending = deferred<{
    items: SavedStatisticalReport[];
    nextCursor: null;
  }>();
  vi.mocked(analyticsApi.listReports).mockReturnValueOnce(pending.promise);
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh Report History' }),
  );
  const signal = vi.mocked(analyticsApi.listReports).mock.calls.at(-1)![0];
  cleanup();
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve({ items: [], nextCursor: null }));
});
