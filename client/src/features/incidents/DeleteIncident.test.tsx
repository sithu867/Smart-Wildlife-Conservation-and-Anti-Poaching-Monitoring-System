import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom';
import { IncidentHistoryPage } from './pages/IncidentHistoryPage';
import { EditIncidentPage } from './pages/EditIncidentPage';
import { incidentApi } from './api/incidentApi';
import { http } from '../../shared/api/http';
import { ApiError } from '../../shared/api/apiError';
import { IncidentDeletionReason, IncidentStatus, IncidentType, LocationSource, PatrolStatus, SyncStatus } from '../../shared/types/enums';
import type { ConservationIncident } from './types/incident';

const makeIncident = (overrides: Partial<ConservationIncident> = {}): ConservationIncident => ({
  _id: 'inc-1',
  clientIncidentId: 'client-inc-1',
  incidentType: IncidentType.SNARE,
  otherTypeDescription: null,
  description: 'Wire snare near the waterhole',
  location: { latitude: -2.1523, longitude: 34.8214, timestamp: new Date().toISOString(), source: LocationSource.GPS },
  reportedBy: 'R-101',
  rangerName: 'Ranger John',
  reportedAt: new Date().toISOString(),
  patrolSessionId: 'sess-1',
  patrolSession: { id: 'sess-1', status: PatrolStatus.ACTIVE },
  evidence: [{ evidenceId: 'evid-1', imageUrl: 'data:image/jpeg;base64,AAAA' }],
  status: IncidentStatus.REPORTED,
  syncStatus: SyncStatus.SYNCED,
  canEdit: true,
  canDelete: true,
  editLockedReason: null,
  updatedAt: '2026-10-07T10:00:00.000Z',
  ...overrides
});

const renderHistory = () =>
  render(
    <BrowserRouter>
      <IncidentHistoryPage />
    </BrowserRouter>
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Deleting from the history page', () => {
  test('requires a reason, withdraws the report, and Undo restores it', async () => {
    const incident = makeIncident();
    const listSpy = vi.spyOn(incidentApi, 'getMyIncidents').mockResolvedValue([incident]);
    const deleteSpy = vi.spyOn(incidentApi, 'deleteIncident').mockResolvedValue({ ...incident, deletedAt: new Date().toISOString() });
    const restoreSpy = vi.spyOn(incidentApi, 'restoreIncident').mockResolvedValue(incident);

    renderHistory();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Wire Snare / Trap report' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Delete "Wire Snare / Trap" report?')).toBeInTheDocument();

    // No reason chosen
    fireEvent.click(within(dialog).getByText('Delete Report'));
    expect(within(dialog).getByText('Choose why you are deleting this report')).toBeInTheDocument();

    // "Other" needs a note
    fireEvent.click(within(dialog).getByLabelText(/Other/));
    fireEvent.click(within(dialog).getByText('Delete Report'));
    expect(within(dialog).getByText('Add a short note (at least 3 characters)')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByLabelText(/Duplicate report/));
    fireEvent.click(within(dialog).getByText('Delete Report'));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteSpy).toHaveBeenCalledWith('inc-1', {
      expectedUpdatedAt: '2026-10-07T10:00:00.000Z',
      deletedAt: expect.any(String),
      clientDeleteId: expect.stringMatching(/^delete-/),
      reason: IncidentDeletionReason.DUPLICATE
    });
    expect(screen.queryByText('"Wire snare near the waterhole"')).not.toBeInTheDocument();

    const toast = screen.getByRole('status');
    expect(within(toast).getByText('"Wire Snare / Trap" report deleted')).toBeInTheDocument();
    fireEvent.click(within(toast).getByText('Undo'));

    await waitFor(() => expect(restoreSpy).toHaveBeenCalledWith('inc-1'));
    await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('"Wire snare near the waterhole"')).toBeInTheDocument();
  });

  test('a conflict explains what happened and offers to reload', async () => {
    const listSpy = vi.spyOn(incidentApi, 'getMyIncidents').mockResolvedValue([makeIncident()]);
    vi.spyOn(incidentApi, 'deleteIncident').mockRejectedValue(new ApiError('Changed elsewhere', 409, 'EDIT_CONFLICT'));

    renderHistory();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Wire Snare / Trap report' }));
    fireEvent.click(screen.getByLabelText(/Reported by mistake/));
    fireEvent.click(screen.getByText('Delete Report'));

    const popup = await screen.findByRole('alertdialog');
    expect(within(popup).getByText("We couldn't delete this report")).toBeInTheDocument();
    expect(within(popup).getByText('Changed on another device')).toBeInTheDocument();
    fireEvent.click(within(popup).getByText('Reload Reports'));
    await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(2));
  });

  test('locked reports have no Delete button', async () => {
    vi.spyOn(incidentApi, 'getMyIncidents').mockResolvedValue([
      makeIncident({ canEdit: false, canDelete: false, editLockedReason: 'PATROL_COMPLETED' })
    ]);

    renderHistory();
    await screen.findByText('🔒 Locked · Patrol completed');
    expect(screen.queryByText('🗑️ Delete')).not.toBeInTheDocument();
  });

  test('an unsynced draft is discarded from the device without a reason or Undo', async () => {
    vi.spyOn(incidentApi, 'getMyIncidents').mockResolvedValue([
      makeIncident({ _id: 'inc-local', clientIncidentId: 'inc-local', syncStatus: SyncStatus.PENDING, updatedAt: undefined })
    ]);
    const discardSpy = vi.spyOn(incidentApi, 'discardLocalDraft').mockResolvedValue();
    const deleteSpy = vi.spyOn(incidentApi, 'deleteIncident');

    renderHistory();
    fireEvent.click(await screen.findByText('🗑️ Discard Draft'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Discard this unsynced draft?')).toBeInTheDocument();
    expect(within(dialog).queryByText('Why are you deleting it?')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByText('Discard Draft'));

    await waitFor(() => expect(discardSpy).toHaveBeenCalledWith('inc-local'));
    expect(deleteSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('"Wire snare near the waterhole"')).not.toBeInTheDocument());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('Deleting from the edit page', () => {
  const renderEdit = () =>
    render(
      <MemoryRouter initialEntries={['/ranger/incidents/inc-1/edit']}>
        <Routes>
          <Route path="/ranger/incidents/:incidentId/edit" element={<EditIncidentPage />} />
          <Route path="/ranger/incidents" element={<IncidentHistoryPage />} />
        </Routes>
      </MemoryRouter>
    );

  test('withdraws the report and returns to the list with an Undo offer', async () => {
    const incident = makeIncident();
    vi.spyOn(incidentApi, 'getIncidentById').mockResolvedValue(incident);
    vi.spyOn(incidentApi, 'getMyIncidents').mockResolvedValue([]);
    const deleteSpy = vi.spyOn(incidentApi, 'deleteIncident').mockResolvedValue({ ...incident, deletedAt: new Date().toISOString() });

    renderEdit();
    await screen.findByText('Edit Incident Report');
    fireEvent.click(screen.getByText('🗑️ Delete'));
    fireEvent.click(screen.getByLabelText(/Not a real threat/));
    fireEvent.click(screen.getByText('Delete Report'));

    await screen.findByText('My Incident Reports');
    expect(deleteSpy.mock.calls[0][1].reason).toBe(IncidentDeletionReason.FALSE_ALARM);
    expect(within(screen.getByRole('status')).getByText('"Wire Snare / Trap" report deleted')).toBeInTheDocument();
  });

  test('a withdrawn report cannot be opened for editing', async () => {
    vi.spyOn(incidentApi, 'getIncidentById').mockResolvedValue(makeIncident({ deletedAt: new Date().toISOString(), canEdit: false }));

    renderEdit();
    expect(await screen.findByText('This report was deleted')).toBeInTheDocument();
  });
});

describe('incidentApi delete/restore', () => {
  test('deleteIncident sends a DELETE with the body; restoreIncident posts a fresh restore id', async () => {
    const deleteSpy = vi.spyOn(http, 'delete').mockResolvedValue({ data: { success: true, data: makeIncident({ deletedAt: 'x' }) } } as never);
    const postSpy = vi.spyOn(http, 'post').mockResolvedValue({ data: { success: true, data: makeIncident() } } as never);
    const payload = {
      expectedUpdatedAt: '2026-10-07T10:00:00.000Z',
      deletedAt: '2026-10-07T10:01:00.000Z',
      clientDeleteId: 'delete-1',
      reason: IncidentDeletionReason.DUPLICATE
    };

    await incidentApi.deleteIncident('inc-1', payload);
    expect(deleteSpy).toHaveBeenCalledWith('/incidents/inc-1', { data: payload });

    await incidentApi.restoreIncident('inc-1');
    expect(postSpy).toHaveBeenCalledWith('/incidents/inc-1/restore', {
      restoredAt: expect.any(String),
      clientRestoreId: expect.stringMatching(/^restore-/)
    });
  });

  test('deleteIncident reports OFFLINE without a connection', async () => {
    vi.spyOn(http, 'delete').mockRejectedValue(new Error('Network Error'));
    const error = await incidentApi
      .deleteIncident('inc-1', { expectedUpdatedAt: 'x', deletedAt: 'y', clientDeleteId: 'z', reason: IncidentDeletionReason.DUPLICATE })
      .catch(e => e);
    expect(error.code).toBe('OFFLINE');
  });
});
