import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IncidentDeletionReason, IncidentStatus, IncidentType, LocationSource, PatrolStatus, SyncStatus } from '../../../shared/types/enums';
import type { ConservationIncident, IncidentEvidence } from '../types/incident';
import type { NewEvidencePhoto } from '../utils/incidentEdit';
import { DeleteIncidentDialog } from './DeleteIncidentDialog';
import { EvidenceEditor } from './EvidenceEditor';
import { PhotoCapture } from './PhotoCapture';
import { UndoToast } from './UndoToast';

// UC-B components: photo manager, photo capture, delete confirmation and the Undo toast.
const saved = (n: number): IncidentEvidence[] => Array.from({ length: n }, (_, i) => ({ evidenceId: `evid-${i + 1}`, imageUrl: `data:image/jpeg;base64,${i}` }));
const newPhoto = (key: string): NewEvidencePhoto => ({ key, imageUrl: 'data:image/png;base64,AAAA', capturedAt: '2026-10-08T12:00:00.000Z' });
const chooseFile = (input: HTMLElement, file: File) => fireEvent.change(input, { target: { files: [file] } });

describe('EvidenceEditor', () => {
  const handlers = () => ({ onToggleRemove: vi.fn(), onAddPhoto: vi.fn(), onRemoveNewPhoto: vi.fn() });

  test('counts kept and new photos, and lets the ranger mark a saved photo for removal', async () => {
    const actions = handlers();
    render(<EvidenceEditor existing={saved(2)} removedIds={[]} newPhotos={[newPhoto('n1')]} {...actions} />);

    expect(screen.getByText('3 of 5 photos')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo 2' }));
    expect(actions.onToggleRemove).toHaveBeenCalledWith('evid-2');
  });

  test('a photo marked for removal is labelled and can be restored', async () => {
    const actions = handlers();
    render(<EvidenceEditor existing={saved(2)} removedIds={['evid-1']} newPhotos={[]} {...actions} />);

    expect(screen.getByText('1 of 5 photos')).toBeInTheDocument();
    expect(screen.getByText('Will be removed')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo remove photo 1' }));
    expect(actions.onToggleRemove).toHaveBeenCalledWith('evid-1');
  });

  test('a new photo can be discarded before saving', async () => {
    const actions = handlers();
    render(<EvidenceEditor existing={saved(1)} removedIds={[]} newPhotos={[newPhoto('n1')]} {...actions} />);

    expect(screen.getByText('New')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Discard new photo 1' }));
    expect(actions.onRemoveNewPhoto).toHaveBeenCalledWith('n1');
  });

  test('adds a valid photo chosen from the camera or files', async () => {
    const actions = handlers();
    render(<EvidenceEditor existing={saved(1)} removedIds={[]} newPhotos={[]} {...actions} />);

    chooseFile(screen.getByTestId('evidence-file-input'), new File(['png'], 'scene.png', { type: 'image/png' }));

    await waitFor(() => expect(actions.onAddPhoto).toHaveBeenCalledWith({ dataUrl: expect.stringMatching(/^data:image\/png;base64,/), size: 3, mimeType: 'image/png' }));
  });

  test('explains why an unsupported file was not added', async () => {
    const actions = handlers();
    render(<EvidenceEditor existing={saved(1)} removedIds={[]} newPhotos={[]} {...actions} />);

    chooseFile(screen.getByTestId('evidence-file-input'), new File(['gif'], 'scene.gif', { type: 'image/gif' }));

    expect(await screen.findByText('Invalid file type: photo evidence must be a JPEG, PNG or WebP image.')).toBeInTheDocument();
    expect(actions.onAddPhoto).not.toHaveBeenCalled();
  });

  test('offers Add Photo only while fewer than 5 photos remain, and shows a form error', () => {
    const { rerender } = render(<EvidenceEditor existing={saved(4)} removedIds={[]} newPhotos={[]} {...handlers()} />);
    expect(screen.getByRole('button', { name: /Add Photo/ })).toBeInTheDocument();

    rerender(<EvidenceEditor existing={saved(4)} removedIds={[]} newPhotos={[newPhoto('n1')]} {...handlers()} error="Too many photos" />);
    expect(screen.queryByRole('button', { name: /Add Photo/ })).not.toBeInTheDocument();
    expect(screen.getByText('Too many photos')).toBeInTheDocument();
  });
});

describe('PhotoCapture', () => {
  test('rejects an unsupported file with a message and keeps the capture button', async () => {
    const onPhotoCaptured = vi.fn();
    const { container } = render(<PhotoCapture onPhotoCaptured={onPhotoCaptured} onPhotoCleared={vi.fn()} />);

    chooseFile(container.querySelector('input[type="file"]')!, new File(['pdf'], 'scan.pdf', { type: 'application/pdf' }));

    expect(await screen.findByText('Invalid file type: photo evidence must be a JPEG, PNG or WebP image.')).toBeInTheDocument();
    expect(onPhotoCaptured).not.toHaveBeenCalled();
    expect(screen.getByText('Capture Field Photograph')).toBeInTheDocument();
  });
});

describe('DeleteIncidentDialog', () => {
  const incident: ConservationIncident = {
    _id: 'inc-1',
    incidentType: IncidentType.SNARE,
    description: 'Wire snare',
    location: { latitude: 6.4, longitude: 80.9, timestamp: '2026-10-08T12:00:00.000Z', source: LocationSource.GPS, placeName: 'Pannipitiya, Sri Lanka' },
    reportedBy: 'R-101',
    rangerName: 'Ranger John',
    reportedAt: '2026-10-08T12:00:00.000Z',
    patrolSession: { _id: 'sess-1', status: PatrolStatus.ACTIVE, patrolRoute: { name: 'Northern Fence Patrol' } } as ConservationIncident['patrolSession'],
    evidence: [],
    status: IncidentStatus.REPORTED,
    syncStatus: SyncStatus.SYNCED
  };

  test('shows which report is affected, including its place and patrol', () => {
    render(<DeleteIncidentDialog incident={incident} mode="withdraw" isWorking={false} onCancel={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Delete "Wire Snare / Trap" report?' })).toBeInTheDocument();
    expect(screen.getByText(/Pannipitiya, Sri Lanka · Patrol: Northern Fence Patrol/)).toBeInTheDocument();
  });

  test('"Other" needs a short note before the report is deleted', async () => {
    const onConfirm = vi.fn();
    render(<DeleteIncidentDialog incident={incident} mode="withdraw" isWorking={false} onCancel={vi.fn()} onConfirm={onConfirm} />);

    await userEvent.click(screen.getByLabelText(/^Other/));
    await userEvent.type(screen.getByPlaceholderText('Why should this report be removed?'), 'ab');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Report' }));
    expect(screen.getByText('Add a short note (at least 3 characters)')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    await userEvent.type(screen.getByPlaceholderText('Why should this report be removed?'), 'c park  ');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Report' }));
    expect(onConfirm).toHaveBeenCalledWith(IncidentDeletionReason.OTHER, 'abc park');
  });

  test('Escape keeps the report unless a delete is already in progress', () => {
    const onCancel = vi.fn();
    const { rerender } = render(<DeleteIncidentDialog incident={incident} mode="withdraw" isWorking={false} onCancel={onCancel} onConfirm={vi.fn()} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(<DeleteIncidentDialog incident={incident} mode="withdraw" isWorking onCancel={onCancel} onConfirm={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Deleting...' })).toBeDisabled();
  });

  test('discarding an unsynced draft needs no reason and warns it cannot be recovered', async () => {
    const onConfirm = vi.fn();
    render(<DeleteIncidentDialog incident={incident} mode="discard" isWorking={false} onCancel={vi.fn()} onConfirm={onConfirm} />);

    expect(screen.getByText(/never reached the server/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Discard Draft' }));
    expect(onConfirm).toHaveBeenCalledWith();
  });
});

describe('UndoToast', () => {
  afterEach(() => vi.useRealTimers());

  test('dismisses itself after 10 seconds', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<UndoToast message='"Wire Snare / Trap" report deleted' onUndo={vi.fn()} onDismiss={onDismiss} />);

    act(() => vi.advanceTimersByTime(9999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('Undo restores the report and does not expire while restoring', async () => {
    vi.useFakeTimers();
    let finishUndo: () => void = () => undefined;
    const onUndo = vi.fn(() => new Promise<void>(resolve => (finishUndo = resolve)));
    const onDismiss = vi.fn();
    render(<UndoToast message="Report deleted" onUndo={onUndo} onDismiss={onDismiss} durationMs={1000} />);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: 'Restoring...' })).toBeDisabled();
    act(() => vi.advanceTimersByTime(5000));
    expect(onDismiss).not.toHaveBeenCalled();

    await act(async () => finishUndo());
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  test('the close button dismisses it immediately', async () => {
    const onDismiss = vi.fn();
    render(<UndoToast message="Report deleted" onUndo={vi.fn()} onDismiss={onDismiss} />);

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
