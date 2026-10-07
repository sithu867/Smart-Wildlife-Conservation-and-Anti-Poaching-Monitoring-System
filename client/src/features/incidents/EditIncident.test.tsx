import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom';
import { EditIncidentPage } from './pages/EditIncidentPage';
import { IncidentHistoryPage } from './pages/IncidentHistoryPage';
import { ReportIncidentPage } from './pages/ReportIncidentPage';
import { incidentApi } from './api/incidentApi';
import { http } from '../../shared/api/http';
import { ApiError } from '../../shared/api/apiError';
import { geolocationService } from '../../shared/geolocation/geolocation';
import { IncidentStatus, IncidentType, LocationSource, PatrolStatus, SyncStatus } from '../../shared/types/enums';
import type { ConservationIncident } from './types/incident';
import { buildIncidentChanges, formFromIncident, validateEditForm } from './utils/incidentEdit';

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
  editLockedReason: null,
  editCount: 0,
  updatedAt: '2026-10-07T10:00:00.000Z',
  ...overrides
});

const renderEditPage = () =>
  render(
    <MemoryRouter initialEntries={['/ranger/incidents/inc-1/edit']}>
      <Routes>
        <Route path="/ranger/incidents/:incidentId/edit" element={<EditIncidentPage />} />
        <Route path="/ranger/incidents" element={<div>History screen</div>} />
      </Routes>
    </MemoryRouter>
  );

const descriptionBox = () => screen.getByLabelText(/Field Description/) as HTMLTextAreaElement;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Incident edit helpers', () => {
  test('buildIncidentChanges returns nothing when the form is unchanged', () => {
    const incident = makeIncident();
    const { changes, summary } = buildIncidentChanges(incident, formFromIncident(incident));
    expect(changes).toEqual({});
    expect(summary).toHaveLength(0);
  });

  test('buildIncidentChanges sends only changed fields and trims text', () => {
    const incident = makeIncident();
    const form = {
      ...formFromIncident(incident),
      incidentType: IncidentType.OTHER,
      otherDescription: '  Fence breach ',
      description: '  Updated note  ',
      location: { latitude: -2.153, longitude: 34.8214, source: LocationSource.MANUAL },
      removedEvidenceIds: ['evid-1'],
      newPhotos: [{ key: 'n1', imageUrl: 'data:image/png;base64,BBBB', mimeType: 'image/png', capturedAt: '2026-10-07T10:05:00.000Z' }]
    };
    const { changes, summary } = buildIncidentChanges(incident, form);

    expect(changes).toEqual({
      incidentType: IncidentType.OTHER,
      otherTypeDescription: 'Fence breach',
      description: 'Updated note',
      location: { latitude: -2.153, longitude: 34.8214, source: LocationSource.MANUAL },
      removeEvidenceIds: ['evid-1'],
      addEvidence: [{ imageUrl: 'data:image/png;base64,BBBB', mimeType: 'image/png', capturedAt: '2026-10-07T10:05:00.000Z', fileSize: undefined }]
    });
    expect(summary.map(item => item.label)).toEqual(['Incident type', 'Threat name', 'Description', 'Location', 'Photos']);
    expect(summary.find(item => item.key === 'location')?.detail).toMatch(/^Moved \d+ m \(MANUAL\)$/);
  });

  test('validateEditForm requires an "Other" name and at least one photo', () => {
    const incident = makeIncident();
    const form = { ...formFromIncident(incident), incidentType: IncidentType.OTHER, otherDescription: ' ', removedEvidenceIds: ['evid-1'] };
    const titles = validateEditForm(incident, form).map(issue => issue.title);
    expect(titles).toEqual(['Describe the "Other" threat', 'At least one photo must remain']);
  });
});

describe('EditIncidentPage', () => {
  test('prefills the report and saves only the changed description', async () => {
    const incident = makeIncident();
    vi.spyOn(incidentApi, 'getIncidentById').mockResolvedValue(incident);
    const updateSpy = vi
      .spyOn(incidentApi, 'updateIncident')
      .mockImplementation(async (_id, payload) => ({ ...incident, description: payload.description!, editCount: 1 }));

    renderEditPage();
    await screen.findByText('Edit Incident Report');
    expect(descriptionBox().value).toBe('Wire snare near the waterhole');
    expect(screen.getByText(/until the patrol is completed/)).toBeInTheDocument();

    fireEvent.change(descriptionBox(), { target: { value: 'Two wire snares near the waterhole' } });
    fireEvent.click(screen.getByText(/Review Changes/));

    const review = screen.getByRole('list', { name: 'Changes to save' });
    expect(within(review).getByText('Description')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Confirm & Save'));

    await screen.findByText('Changes Saved');
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [id, payload] = updateSpy.mock.calls[0];
    expect(id).toBe('inc-1');
    expect(payload).toEqual({
      description: 'Two wire snares near the waterhole',
      expectedUpdatedAt: '2026-10-07T10:00:00.000Z',
      editedAt: expect.any(String),
      clientEditId: expect.stringMatching(/^edit-/)
    });
  });

  test('shows a "no changes" popup when nothing was edited', async () => {
    vi.spyOn(incidentApi, 'getIncidentById').mockResolvedValue(makeIncident());
    const updateSpy = vi.spyOn(incidentApi, 'updateIncident');

    renderEditPage();
    await screen.findByText('Edit Incident Report');
    fireEvent.click(screen.getByText(/Review Changes/));

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText("You haven't changed anything yet")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText('Keep Editing'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  test('blocks removing the last photo', async () => {
    vi.spyOn(incidentApi, 'getIncidentById').mockResolvedValue(makeIncident());

    renderEditPage();
    await screen.findByText('Edit Incident Report');
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));
    expect(screen.getByText('Will be removed')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Review Changes/));

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('At least one photo must remain')).toBeInTheDocument();

    // Undo restores the photo and clears the inline hint
    fireEvent.click(within(dialog).getByText('Close'));
    fireEvent.click(screen.getByRole('button', { name: 'Undo remove photo 1' }));
    expect(screen.queryByText('At least one photo must remain')).not.toBeInTheDocument();
  });

  test('shows a lock screen when the patrol has been completed', async () => {
    vi.spyOn(incidentApi, 'getIncidentById').mockResolvedValue(
      makeIncident({ canEdit: false, editLockedReason: 'PATROL_COMPLETED', patrolSession: { id: 'sess-1', status: PatrolStatus.COMPLETED } })
    );

    renderEditPage();
    expect(await screen.findByText('This report can no longer be edited')).toBeInTheDocument();
    expect(screen.getByText(/patrol this report belongs to has been completed/)).toBeInTheDocument();
    expect(screen.queryByText(/Review Changes/)).not.toBeInTheDocument();
  });

  test('on an edit conflict, "Keep My Changes" re-applies the edit on top of the latest version', async () => {
    const original = makeIncident();
    const latest = makeIncident({ description: 'Edited on another device', updatedAt: '2026-10-07T10:30:00.000Z', editCount: 1 });
    vi.spyOn(incidentApi, 'getIncidentById').mockResolvedValueOnce(original).mockResolvedValueOnce(latest);
    const updateSpy = vi
      .spyOn(incidentApi, 'updateIncident')
      .mockRejectedValueOnce(new ApiError('This report was changed on another device.', 409, 'EDIT_CONFLICT'))
      .mockImplementationOnce(async (_id, payload) => ({ ...latest, description: payload.description!, editCount: 2 }));

    renderEditPage();
    await screen.findByText('Edit Incident Report');
    fireEvent.change(descriptionBox(), { target: { value: 'My field correction' } });
    fireEvent.click(screen.getByText(/Review Changes/));
    fireEvent.click(screen.getByText('Confirm & Save'));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('This report changed while you were editing')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText('Keep My Changes'));

    await screen.findByText('Review Your Changes');
    expect(descriptionBox().value).toBe('My field correction');
    fireEvent.click(screen.getByText('Confirm & Save'));

    await screen.findByText('Changes Saved');
    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(updateSpy.mock.calls[1][1].expectedUpdatedAt).toBe('2026-10-07T10:30:00.000Z');
    // A different edit attempt after reloading gets a fresh idempotency key
    expect(updateSpy.mock.calls[1][1].clientEditId).not.toBe(updateSpy.mock.calls[0][1].clientEditId);
  });

  test('"See Latest" discards local changes and loads the newer version', async () => {
    const latest = makeIncident({ description: 'Edited on another device', updatedAt: '2026-10-07T10:30:00.000Z' });
    vi.spyOn(incidentApi, 'getIncidentById').mockResolvedValueOnce(makeIncident()).mockResolvedValueOnce(latest);
    vi.spyOn(incidentApi, 'updateIncident').mockRejectedValueOnce(new ApiError('Conflict', 409, 'EDIT_CONFLICT'));

    renderEditPage();
    await screen.findByText('Edit Incident Report');
    fireEvent.change(descriptionBox(), { target: { value: 'My field correction' } });
    fireEvent.click(screen.getByText(/Review Changes/));
    fireEvent.click(screen.getByText('Confirm & Save'));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByText('See Latest'));

    await screen.findByText(/Loaded the latest version/);
    expect(descriptionBox().value).toBe('Edited on another device');
  });

  test('a server lock while saving explains why and offers a way back', async () => {
    vi.spyOn(incidentApi, 'getIncidentById').mockResolvedValue(makeIncident());
    vi.spyOn(incidentApi, 'updateIncident').mockRejectedValueOnce(
      new ApiError('This report is locked because its patrol has been completed.', 409, 'INCIDENT_LOCKED', { reason: 'PATROL_COMPLETED' })
    );

    renderEditPage();
    await screen.findByText('Edit Incident Report');
    fireEvent.change(descriptionBox(), { target: { value: 'Late correction' } });
    fireEvent.click(screen.getByText(/Review Changes/));
    fireEvent.click(screen.getByText('Confirm & Save'));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('This report is locked')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText('Back to My Reports'));
    expect(await screen.findByText('History screen')).toBeInTheDocument();
  });
});

describe('IncidentHistoryPage edit controls', () => {
  test('shows Edit only for editable reports and a lock badge otherwise', async () => {
    vi.spyOn(incidentApi, 'getMyIncidents').mockResolvedValue([
      makeIncident({ _id: 'inc-open', clientIncidentId: 'c-open', description: 'Open report' }),
      makeIncident({
        _id: 'inc-locked',
        clientIncidentId: 'c-locked',
        description: 'Locked report',
        canEdit: false,
        editLockedReason: 'PATROL_COMPLETED',
        editCount: 2,
        lastEditedAt: new Date().toISOString()
      })
    ]);

    render(
      <BrowserRouter>
        <IncidentHistoryPage />
      </BrowserRouter>
    );

    await screen.findByText('"Open report"');
    expect(screen.getAllByText('✏️ Edit Report')).toHaveLength(1);
    expect(screen.getByText('🔒 Locked · Patrol completed')).toBeInTheDocument();
    expect(screen.getByText(/Edited 2×/)).toBeInTheDocument();
  });
});

describe('incidentApi.updateIncident', () => {
  test('sends a PATCH and maps server error codes to ApiError', async () => {
    const patchSpy = vi.spyOn(http, 'patch').mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 409, data: { success: false, error: { message: 'Changed elsewhere', code: 'EDIT_CONFLICT' } } }
    });
    const payload = { expectedUpdatedAt: '2026-10-07T10:00:00.000Z', editedAt: '2026-10-07T10:01:00.000Z', clientEditId: 'edit-1', description: 'New text' };

    const error = await incidentApi.updateIncident('inc-1', payload).catch(e => e);
    expect(patchSpy).toHaveBeenCalledWith('/incidents/inc-1', payload);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('EDIT_CONFLICT');
    expect(error.status).toBe(409);
  });

  test('reports OFFLINE when there is no connection', async () => {
    vi.spyOn(http, 'patch').mockRejectedValueOnce(new Error('Network Error'));
    const error = await incidentApi
      .updateIncident('inc-1', { expectedUpdatedAt: 'x', editedAt: 'y', clientEditId: 'z', description: 'abc' })
      .catch(e => e);
    expect(error.code).toBe('OFFLINE');
  });
});

describe('ReportIncidentPage "Other" rule', () => {
  test('requires a name for an "Other" threat before review', async () => {
    vi.spyOn(geolocationService, 'getCurrentLocation').mockResolvedValue({ latitude: -2.15, longitude: 34.82, timestamp: Date.now() });

    render(
      <BrowserRouter>
        <ReportIncidentPage />
      </BrowserRouter>
    );
    await screen.findByText(/Location Ready/);
    fireEvent.click(screen.getByText('Other Threat'));
    fireEvent.click(screen.getByText('Review Incident Details →'));

    const dialog = screen.getByRole('alertdialog');
    await waitFor(() => expect(within(dialog).getByText('Describe the "Other" threat')).toBeInTheDocument());
    expect(within(dialog).getByText('Describe Threat')).toBeInTheDocument();
  });
});
